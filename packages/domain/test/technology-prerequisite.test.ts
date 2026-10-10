import { describe, expect, it } from "vitest";

import { ModSpecSchema, TechnologyPrerequisiteModSpecSchema } from "../src/index.js";

const validSpec = {
  title: "Simpler automation two",
  slug: "simpler-automation-two",
  target: { game: "factorio", channel: "stable", versionLine: "2.0" },
  capability: "technology_prerequisite",
  changes: [
    {
      type: "technology_prerequisite",
      technologyName: "automation-2",
      prerequisiteName: "steel-processing",
      operation: { type: "remove" },
    },
  ],
  assertions: [
    {
      type: "technology_prerequisite_matches",
      technologyName: "automation-2",
      prerequisiteName: "steel-processing",
      expectation: { type: "remove" },
    },
  ],
} as const;

describe("technology_prerequisite ModSpec", () => {
  it("accepts a valid prerequisite capability", () => {
    expect(TechnologyPrerequisiteModSpecSchema.parse(validSpec)).toEqual(validSpec);
    expect(ModSpecSchema.parse(validSpec)).toEqual(validSpec);
  });

  it("requires the assertion operation to match", () => {
    const mismatched = {
      ...validSpec,
      assertions: [
        {
          ...validSpec.assertions[0],
          expectation: { type: "add" },
        },
      ],
    };
    expect(TechnologyPrerequisiteModSpecSchema.safeParse(mismatched).success).toBe(false);
  });

  it("rejects duplicate changes to one prerequisite edge", () => {
    const duplicated = {
      ...validSpec,
      changes: [validSpec.changes[0], validSpec.changes[0]],
      assertions: [validSpec.assertions[0], validSpec.assertions[0]],
    };
    expect(TechnologyPrerequisiteModSpecSchema.safeParse(duplicated).success).toBe(false);
  });
});
