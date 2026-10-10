import { describe, expect, it } from "vitest";

import {
  factorioCapabilityRegistry,
  getFactorioCapability,
  listFactorioCapabilities,
  listSupportedPrototypeProperties,
  listSupportedRecipeIngredients,
  listSupportedTechnologyCosts,
  listSupportedTechnologyPrerequisites,
} from "../src/index.js";

const expectedIds = [
  "prototype_property",
  "recipe_ingredient",
  "technology_cost",
  "technology_prerequisite",
] as const;

describe("Factorio capability registry", () => {
  it("exposes exactly the implemented ModSpec capability families", () => {
    expect(Object.keys(factorioCapabilityRegistry).sort()).toEqual([...expectedIds].sort());
    expect(listFactorioCapabilities()).toHaveLength(expectedIds.length);
  });

  it("describes the pinned target policy for every capability", () => {
    for (const capability of listFactorioCapabilities()) {
      expect(capability.target).toEqual({
        game: "factorio",
        channel: "stable",
        versionLine: "2.0",
        validatedRuntime: "2.0.77",
      });
      expect(capability.operations.length).toBeGreaterThan(0);
      expect(capability.promptExamples.length).toBeGreaterThan(0);
      expect(capability.constraints.length).toBeGreaterThan(0);
    }
  });

  it("derives registry targets from the same allow-lists used by generation", () => {
    expect(getFactorioCapability("prototype_property").targets).toHaveLength(
      listSupportedPrototypeProperties().length,
    );
    expect(getFactorioCapability("recipe_ingredient").targets).toHaveLength(
      listSupportedRecipeIngredients().length,
    );
    expect(getFactorioCapability("technology_cost").targets).toHaveLength(
      listSupportedTechnologyCosts().length,
    );
    expect(getFactorioCapability("technology_prerequisite").targets).toHaveLength(
      listSupportedTechnologyPrerequisites().length,
    );
  });

  it("publishes only the reviewed operation for each prerequisite edge", () => {
    const capability = getFactorioCapability("technology_prerequisite");
    for (const target of capability.targets) {
      if (target.kind !== "technology_prerequisite") continue;
      expect(capability.operations).toContain(target.allowedOperation);
      expect(target.basePresent).toBe(target.allowedOperation === "remove");
    }
  });
});
