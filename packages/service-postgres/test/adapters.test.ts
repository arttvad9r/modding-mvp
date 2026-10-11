import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  GENERATION_QUEUE_NAME,
  GENERATION_QUEUE_OPTIONS,
  betaSurveyResponses,
  generations,
  rateLimitBuckets,
  serviceUsers,
} from "../src/index.js";

describe("service-postgres schema", () => {
  it("keeps generation ownership/CAS/status columns and indexes explicit", () => {
    const config = getTableConfig(generations);
    expect(config.name).toBe("generations");
    expect(config.columns.map((column) => column.name)).toEqual([
      "id",
      "user_id",
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
      "generations_user_created_idx",
    ]);
    expect(config.foreignKeys).toHaveLength(1);
    expect(config.checks.map((check) => check.name).sort()).toEqual([
      "generations_revision_nonnegative",
      "generations_status_valid",
    ]);
  });

  it("keeps beta-user token hashes and shared rate-limit buckets explicit", () => {
    const users = getTableConfig(serviceUsers);
    expect(users.columns.map((column) => column.name)).toEqual([
      "id",
      "label",
      "token_hash",
      "created_at",
      "disabled_at",
    ]);
    expect(users.indexes.map((index) => index.config.name).sort()).toEqual([
      "service_users_created_idx",
      "service_users_token_hash_uidx",
    ]);

    const limits = getTableConfig(rateLimitBuckets);
    expect(limits.columns.map((column) => column.name)).toEqual([
      "key",
      "window_start",
      "count",
      "updated_at",
    ]);
    expect(limits.primaryKeys).toHaveLength(1);
    expect(limits.checks.map((check) => check.name)).toEqual(["rate_limit_count_positive"]);
  });

  it("keeps beta willingness-to-pay survey storage explicit", () => {
    const survey = getTableConfig(betaSurveyResponses);
    expect(survey.columns.map((column) => column.name)).toEqual([
      "user_id",
      "willingness_to_pay",
      "updated_at",
    ]);
    expect(survey.primaryKeys).toHaveLength(0);
    expect(survey.foreignKeys).toHaveLength(1);
    expect(survey.indexes.map((index) => index.config.name)).toEqual(["beta_survey_updated_idx"]);
    expect(survey.checks.map((check) => check.name)).toEqual(["beta_survey_willingness_valid"]);
  });

  it("uses one stable generation queue with automatic retries disabled", () => {
    expect(GENERATION_QUEUE_NAME).toBe("factorio-generation");
    expect(GENERATION_QUEUE_OPTIONS).toEqual({
      retryLimit: 0,
      expireInSeconds: 900,
      deleteAfterSeconds: 604_800,
    });
  });
});
