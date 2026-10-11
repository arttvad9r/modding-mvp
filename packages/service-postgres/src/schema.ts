import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { GenerationRecord } from "@project/service-core";

export const serviceUsers = pgTable(
  "service_users",
  {
    id: uuid("id").primaryKey(),
    label: text("label").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    disabledAt: timestamp("disabled_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("service_users_token_hash_uidx").on(table.tokenHash),
    index("service_users_created_idx").on(table.createdAt),
  ],
);

export const generations = pgTable(
  "generations",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => serviceUsers.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    status: text("status").notNull(),
    prompt: text("prompt").notNull(),
    record: jsonb("record").$type<GenerationRecord>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    check("generations_revision_nonnegative", sql`${table.revision} >= 0`),
    check(
      "generations_status_valid",
      sql`${table.status} in ('queued', 'running', 'succeeded', 'unsupported', 'failed')`,
    ),
    index("generations_status_created_idx").on(table.status, table.createdAt),
    index("generations_user_created_idx").on(table.userId, table.createdAt),
    index("generations_updated_idx").on(table.updatedAt),
  ],
);

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true, mode: "date" }).notNull(),
    count: integer("count").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.key, table.windowStart] }),
    check("rate_limit_count_positive", sql`${table.count} >= 1`),
    index("rate_limit_updated_idx").on(table.updatedAt),
  ],
);

export type GenerationRow = typeof generations.$inferSelect;
export type ServiceUserRow = typeof serviceUsers.$inferSelect;
