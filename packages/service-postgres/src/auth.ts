import { eq, sql } from "drizzle-orm";

import {
  ServiceUserSchema,
  type RateLimitConsumeInput,
  type RateLimitDecision,
  type RateLimitStore,
  type ServiceUser,
  type ServiceUserRepository,
} from "@project/service-core";

import type { ServicePostgresDb } from "./db.js";
import { rateLimitBuckets, serviceUsers, type ServiceUserRow } from "./schema.js";

function rowToUser(row: ServiceUserRow): ServiceUser {
  return ServiceUserSchema.parse({
    schemaVersion: 1,
    id: row.id,
    label: row.label,
    tokenHash: row.tokenHash,
    metricsEligible: row.metricsEligible,
    createdAt: row.createdAt.toISOString(),
    ...(row.disabledAt === null ? {} : { disabledAt: row.disabledAt.toISOString() }),
  });
}

export class PostgresServiceUserRepository implements ServiceUserRepository {
  constructor(private readonly db: ServicePostgresDb) {}

  async insert(input: ServiceUser): Promise<void> {
    const user = ServiceUserSchema.parse(input);
    await this.db.insert(serviceUsers).values({
      id: user.id,
      label: user.label,
      tokenHash: user.tokenHash,
      metricsEligible: user.metricsEligible,
      createdAt: new Date(user.createdAt),
      ...(user.disabledAt === undefined ? {} : { disabledAt: new Date(user.disabledAt) }),
    });
  }

  async findByTokenHash(tokenHash: string): Promise<ServiceUser | null> {
    const rows = await this.db
      .select()
      .from(serviceUsers)
      .where(eq(serviceUsers.tokenHash, tokenHash))
      .limit(1);
    return rows[0] === undefined ? null : rowToUser(rows[0]);
  }

  async get(id: string): Promise<ServiceUser | null> {
    const rows = await this.db.select().from(serviceUsers).where(eq(serviceUsers.id, id)).limit(1);
    return rows[0] === undefined ? null : rowToUser(rows[0]);
  }
}

const MAX_RATE_LIMIT = 100_000;
const MAX_RATE_WINDOW_MS = 24 * 60 * 60_000;

function validateRateLimit(input: RateLimitConsumeInput): {
  key: string;
  limit: number;
  windowMs: number;
  now: Date;
} {
  const key = input.key.trim();
  if (key.length < 1 || key.length > 240) throw new Error("Rate-limit key must be 1..240 characters");
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_RATE_LIMIT) {
    throw new Error(`Rate-limit limit must be an integer in range 1..${MAX_RATE_LIMIT}`);
  }
  if (!Number.isInteger(input.windowMs) || input.windowMs < 1_000 || input.windowMs > MAX_RATE_WINDOW_MS) {
    throw new Error(`Rate-limit windowMs must be an integer in range 1000..${MAX_RATE_WINDOW_MS}`);
  }
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("Rate-limit now must be a valid Date");
  return { key, limit: input.limit, windowMs: input.windowMs, now };
}

export class PostgresRateLimitStore implements RateLimitStore {
  constructor(private readonly db: ServicePostgresDb) {}

  async consume(input: RateLimitConsumeInput): Promise<RateLimitDecision> {
    const { key, limit, windowMs, now } = validateRateLimit(input);
    const windowStartMs = Math.floor(now.getTime() / windowMs) * windowMs;
    const windowStart = new Date(windowStartMs);
    const rows = await this.db
      .insert(rateLimitBuckets)
      .values({ key, windowStart, count: 1, updatedAt: now })
      .onConflictDoUpdate({
        target: [rateLimitBuckets.key, rateLimitBuckets.windowStart],
        set: {
          count: sql`${rateLimitBuckets.count} + 1`,
          updatedAt: now,
        },
      })
      .returning({ count: rateLimitBuckets.count });
    const count = rows[0]?.count;
    if (count === undefined) throw new Error("Rate-limit update returned no row");
    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetAt: new Date(windowStartMs + windowMs).toISOString(),
    };
  }
}
