import type { TechnologyPrerequisiteModSpec } from "@project/domain";
import { describe, expect, it } from "vitest";

import { generateFactorioMod } from "../src/index.js";

function makeSpec(
  technologyName = "automation-2",
  prerequisiteName = "steel-processing",
  operation: "add" | "remove" = "remove",
): TechnologyPrerequisiteModSpec {
  return {
    title: "Technology prerequisite test",
    slug: "technology-prerequisite-test",
    target: { game: "factorio", channel: "stable", versionLine: "2.0" },
    capability: "technology_prerequisite",
    changes: [
      {
        type: "technology_prerequisite",
        technologyName,
        prerequisiteName,
        operation: { type: operation },
      },
    ],
    assertions: [
      {
        type: "technology_prerequisite_matches",
        technologyName,
        prerequisiteName,
        expectation: { type: operation },
      },
    ],
  };
}

function dataLua(spec: TechnologyPrerequisiteModSpec): string {
  return generateFactorioMod(spec).manifest.files.find((file) => file.path === "data.lua")!.content;
}

describe("technology prerequisite generator", () => {
  it("removes an allow-listed existing prerequisite", () => {
    const generated = generateFactorioMod(makeSpec());
    expect(dataLua(makeSpec())).toContain("table.remove(prerequisites, index)");
    expect(generated.semanticAssertionLua).toContain("expected=false");
  });

  it("adds an allow-listed absent prerequisite", () => {
    const spec = makeSpec("automation-2", "logistics", "add");
    const generated = generateFactorioMod(spec);
    expect(dataLua(spec)).toContain('table.insert(prerequisites, "logistics")');
    expect(generated.semanticAssertionLua).toContain("expected=true");
  });

  it("rejects an operation that disagrees with the pinned baseline", () => {
    expect(() => generateFactorioMod(makeSpec("automation-2", "steel-processing", "add"))).toThrow(
      "Unsupported technology prerequisite change",
    );
  });

  it("rejects a prerequisite pair outside the allow-list", () => {
    expect(() => generateFactorioMod(makeSpec("automation-2", "military", "add"))).toThrow(
      "Unsupported technology prerequisite change",
    );
  });
});
