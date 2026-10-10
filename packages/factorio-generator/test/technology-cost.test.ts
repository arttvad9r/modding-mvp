import type { ScalarOperation, TechnologyCostModSpec } from "@project/domain";
import { describe, expect, it } from "vitest";

import { generateFactorioMod } from "../src/index.js";

function makeSpec(
  operation: ScalarOperation = { type: "multiply", factor: 2 },
  technologyName = "automation",
): TechnologyCostModSpec {
  return {
    title: "Technology cost test",
    slug: "technology-cost-test",
    target: { game: "factorio", channel: "stable", versionLine: "2.0" },
    capability: "technology_cost",
    changes: [
      {
        type: "technology_cost",
        technologyName,
        operation,
      },
    ],
    assertions: [
      {
        type: "technology_cost_matches",
        technologyName,
        expectation: operation,
      },
    ],
  };
}

function dataLua(spec: TechnologyCostModSpec): string {
  const file = generateFactorioMod(spec).manifest.files.find((entry) => entry.path === "data.lua");
  if (!file) throw new Error("Missing data.lua");
  return file.content;
}

describe("technology_cost generator", () => {
  it("renders a deterministic set mutation and semantic assertion", () => {
    const spec = makeSpec({ type: "set", value: 25 });
    const generated = generateFactorioMod(spec);

    expect(dataLua(spec)).toContain('technology.unit.count = 25');
    expect(generated.semanticAssertionLua).toContain('technology.automation.unit.count|expected=25|actual=');
  });

  it("derives multiply expectations from the pinned Factorio 2.0.77 baseline", () => {
    const generated = generateFactorioMod(makeSpec({ type: "multiply", factor: 2 }));

    expect(generated.semanticAssertionLua).toContain('technology.automation.unit.count|expected=20|actual=');
  });

  it("rejects an unsupported technology before rendering files", () => {
    expect(() => generateFactorioMod(makeSpec({ type: "set", value: 10 }, "unknown-tech"))).toThrow(
      "Unsupported technology cost: unknown-tech",
    );
  });

  it("rejects non-integer or non-positive final research counts", () => {
    expect(() => generateFactorioMod(makeSpec({ type: "multiply", factor: 0.15 }))).toThrow(
      "Technology count must be a positive safe integer",
    );
    expect(() => generateFactorioMod(makeSpec({ type: "set", value: 0 }))).toThrow(
      "Technology count must be a positive safe integer",
    );
  });
});
