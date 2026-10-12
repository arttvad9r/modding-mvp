import { createServicePostgresClient } from "./db.js";
import { DEFAULT_OPS_THRESHOLDS, evaluateOpsStatus, readOpsSnapshot } from "./ops-status.js";

/** Exit codes: 0 ok, 2 alert (thresholds breached), 1 the check itself failed. */
const ALERT_EXIT_CODE = 2;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function number(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${name} must be a number ${min}..${max}`);
  return value;
}

async function main(): Promise<void> {
  const thresholds = {
    maxQueuedAgeMs: number("OPS_MAX_QUEUED_AGE_MS", DEFAULT_OPS_THRESHOLDS.maxQueuedAgeMs, 60_000, 86_400_000),
    maxRunningHeartbeatAgeMs: number(
      "OPS_MAX_RUNNING_HEARTBEAT_AGE_MS",
      DEFAULT_OPS_THRESHOLDS.maxRunningHeartbeatAgeMs,
      60_000,
      86_400_000,
    ),
    maxFailedRatio: number("OPS_MAX_FAILED_RATIO", DEFAULT_OPS_THRESHOLDS.maxFailedRatio, 0, 1),
    minFailedRatioSample: number("OPS_MIN_FAILED_RATIO_SAMPLE", DEFAULT_OPS_THRESHOLDS.minFailedRatioSample, 1, 10_000),
  };
  const windowMs = number("OPS_WINDOW_MS", 60 * 60_000, 60_000, 7 * 86_400_000);
  const client = createServicePostgresClient({ connectionString: required("DATABASE_URL") });
  try {
    const status = evaluateOpsStatus(await readOpsSnapshot(client.db, { windowMs }), thresholds);
    process.stdout.write(`${JSON.stringify(status)}\n`);
    if (status.status === "alert") process.exitCode = ALERT_EXIT_CODE;
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    status: "ERROR",
    message: error instanceof Error ? error.message : String(error),
  })}\n`);
  process.exitCode = 1;
});
