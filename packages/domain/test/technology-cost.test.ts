import { describe, expect, it } from "vitest";

import { ModSpecSchema, TechnologyCostModSpecSchema } from "../src/index.js";

const validSpec = {
  title: "More expensive automation",
  slug: "more-expensive-automation",
  target: { game: "factorio", channel: "stable", versionLine: "2.0" },
  capability: "technology_cost",
  changes: [
    {
      type: "technology_cost",
      technologyName: "automation",
      operation: { type: "multiply", factor: 2 },
    },
  ],
  assertions: [
    {
      type: "technology_cost_matches",
      technologyName: "automation",
      expectation: { type: "multiply", factor: 2 },
    },
  ],
} as const;

describe("technology_cost ModSpec", () => {
  it("accepts a valid technology cost capability", () => {
    expect(TechnologyCostModSpecSchema.parse(validSpec)).toEqual(validSpec);
    expect(ModSpecSchema.parse(validSpec)).toEqual(validSpec);
  });

  it("requires the assertion to match the requested operation", () => {
    const mismatched = {
      ...validSpec,
      assertions: [
        {
          ...validSpec.assertions[0],
          expectation: { type: "set", value: 20 },
        },
      ],
    };
    expect(TechnologyCostModSpecSchema.safeParse(mismatched).success).toBe(false);
  });

  it("rejects duplicate mutations of one technology", () => {
    const duplicated = {
      ...validSpec,
      changes: [validSpec.changes[0], validSpec.changes[0]],
      assertions: [validSpec.assertions[0], validSpec.assertions[0]],
    };
    expect(TechnologyCostModSpecSchema.safeParse(duplicated).success).toBe(false);
  });
});
