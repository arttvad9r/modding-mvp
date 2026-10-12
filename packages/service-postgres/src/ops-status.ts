import { gte, inArray, or, sql } from "drizzle-orm";

import type { ServicePostgresDb } from "./db.js";
import { generations } from "./schema.js";

export interface OpsSnapshot {
  readonly queued: number;
  readonly oldestQueuedAgeMs: number | null;
  readonly running: number;
  /** Age of the oldest running heartbeat (`updated_at`); a dead worker stops refreshing it. */
  readonly oldestRunningHeartbeatAgeMs: number | null;
  readonly window: {
    readonly ms: number;
    readonly succeeded: number;
    readonly failed: number;
    readonly unsupported: number;
  };
}

export interface OpsThresholds {
  readonly maxQueuedAgeMs: number;
  readonly maxRunningHeartbeatAgeMs: number;
  /** `failed / (succeeded + failed)` in the window; unsupported is an expected product outcome. */
  readonly maxFailedRatio: number;
  /** Do not judge the failure ratio on fewer terminal outcomes than this. */
  readonly minFailedRatioSample: number;
}

export const DEFAULT_OPS_THRESHOLDS: OpsThresholds = {
  maxQueuedAgeMs: 15 * 60_000,
  maxRunningHeartbeatAgeMs: 10 * 60_000,
  maxFailedRatio: 0.5,
  minFailedRatioSample: 4,
};

export type OpsAlertCode = "queue_stalled" | "running_heartbeat_stale" | "failure_ratio_high";

export interface OpsStatus {
  readonly status: "ok" | "alert";
  readonly alerts: readonly OpsAlertCode[];
  readonly snapshot: OpsSnapshot;
}

export function evaluateOpsStatus(snapshot: OpsSnapshot, thresholds: OpsThresholds = DEFAULT_OPS_THRESHOLDS): OpsStatus {
  const alerts: OpsAlertCode[] = [];
  if (snapshot.oldestQueuedAgeMs !== null && snapshot.oldestQueuedAgeMs > thresholds.maxQueuedAgeMs) {
    alerts.push("queue_stalled");
  }
  if (
    snapshot.oldestRunningHeartbeatAgeMs !== null
    && snapshot.oldestRunningHeartbeatAgeMs > thresholds.maxRunningHeartbeatAgeMs
  ) {
    alerts.push("running_heartbeat_stale");
  }
  const judged = snapshot.window.succeeded + snapshot.window.failed;
  if (judged >= thresholds.minFailedRatioSample && snapshot.window.failed / judged > thresholds.maxFailedRatio) {
    alerts.push("failure_ratio_high");
  }
  return { status: alerts.length === 0 ? "ok" : "alert", alerts, snapshot };
}

export async function readOpsSnapshot(
  db: ServicePostgresDb,
  options: { readonly windowMs: number; readonly now?: Date },
): Promise<OpsSnapshot> {
  const now = (options.now ?? new Date()).toISOString();
  const since = new Date(Date.parse(now) - options.windowMs);
  const ageMs = (column: typeof generations.createdAt | typeof generations.updatedAt, status: string) =>
    sql<number | null>`(extract(epoch from (${now}::timestamptz - min(${column}) filter (where ${generations.status} = ${status}))) * 1000)::float8`;
  const countWhere = (status: string, recentOnly: boolean) =>
    recentOnly
      ? sql<number>`(count(*) filter (where ${generations.status} = ${status} and ${generations.updatedAt} >= ${since}))::int`
      : sql<number>`(count(*) filter (where ${generations.status} = ${status}))::int`;

  const [row] = await db
    .select({
      queued: countWhere("queued", false),
      oldestQueuedAgeMs: ageMs(generations.createdAt, "queued"),
      running: countWhere("running", false),
      oldestRunningHeartbeatAgeMs: ageMs(generations.updatedAt, "running"),
      succeeded: countWhere("succeeded", true),
      failed: countWhere("failed", true),
      unsupported: countWhere("unsupported", true),
    })
    .from(generations)
    .where(or(inArray(generations.status, ["queued", "running"]), gte(generations.updatedAt, since)));

  return {
    queued: row?.queued ?? 0,
    oldestQueuedAgeMs: row?.oldestQueuedAgeMs ?? null,
    running: row?.running ?? 0,
    oldestRunningHeartbeatAgeMs: row?.oldestRunningHeartbeatAgeMs ?? null,
    window: {
      ms: options.windowMs,
      succeeded: row?.succeeded ?? 0,
      failed: row?.failed ?? 0,
      unsupported: row?.unsupported ?? 0,
    },
  };
}
