import { describe, expect, it } from "vitest";

import { aggregateLlmUsage } from "../src/index.js";

describe("aggregateLlmUsage", () => {
  it("aggregates explicit and inferred totals", () => {
    expect(
      aggregateLlmUsage([
        { inputTokens: 10, outputTokens: 4, estimatedCostUsd: 0.01 },
        { inputTokens: 8, outputTokens: 2, totalTokens: 12, estimatedCostUsd: 0.02 },
        undefined,
      ]),
    ).toEqual({
      inputTokens: 18,
      outputTokens: 6,
      totalTokens: 26,
      estimatedCostUsd: 0.03,
    });
  });
});
