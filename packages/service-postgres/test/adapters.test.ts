import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { GENERATION_QUEUE_NAME, generations } from "../src/index.js";

describe("service-postgres schema", () => {
  it("keeps generation CAS/status columns and indexes explicit", () => {
    const config = getTableConfig(generations);
    expect(config.name).toBe("generations");
    expect(config.columns.map((column) => column.name)).toEqual([
      "id",
      "revision",
      "status",
      "prompt",
      "record",
      "created_at",
      "updated_at",
    ]);
    expect(config.indexes.map((index) => index.config.name).sort()).toEqual([
      "generations_status_created_idx",
      "generations_updated_idx",
    ]);
    expect(config.checks.map((check) => check.name).sort()).toEqual([
      "generations_revision_nonnegative",
      "generations_status_valid",
    ]);
  });

  it("uses one stable generation queue name", () => {
    expect(GENERATION_QUEUE_NAME).toBe("factorio-generation");
  });
});
