import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { GenerationRecord } from "@project/service-core";

export const generations = pgTable(
  "generations",
  {
    id: uuid("id").primaryKey(),
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
    index("generations_updated_idx").on(table.updatedAt),
  ],
);

export type GenerationRow = typeof generations.$inferSelect;
