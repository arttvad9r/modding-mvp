import type { ModSpec } from "@project/domain";
import { describe, expect, it } from "vitest";

import { generateFactorioMod } from "../src/index.js";

function makeSpec(
  operation: ModSpec["changes"][number]["operation"] = {
    type: "multiply",
    factor: 2,
  },
): ModSpec {
  return {
    title: "Faster steel furnaces",
    slug: "faster-steel-furnaces",
    target: { game: "factorio", channel: "stable", versionLine: "2.0" },
    capability: "prototype_property",
    changes: [
      {
        type: "prototype_property",
        prototypeType: "furnace",
        prototypeName: "steel-furnace",
        property: "crafting_speed",
        operation,
      },
    ],
    assertions: [
      {
        type: "prototype_property_matches",
        prototypeType: "furnace",
        prototypeName: "steel-furnace",
        property: "crafting_speed",
        expectation: operation,
      },
    ],
  };
}

function generatedContent(path: string, spec = makeSpec()): string {
  const file = generateFactorioMod(spec).manifest.files.find((entry) => entry.path === path);
  if (!file) throw new Error(`Missing generated file: ${path}`);
  return file.content;
}

const expectedInfo = `{
  "name": "faster-steel-furnaces",
  "version": "0.1.0",
  "title": "Faster steel furnaces",
  "author": "Generated mod",
  "factorio_version": "2.0",
  "dependencies": [
    "base >= 2.0"
  ]
}\n`;

const expectedMultiplyLua = `do
  local prototype = data.raw["furnace"] and data.raw["furnace"]["steel-furnace"]
  assert(prototype, "Missing prototype furnace.steel-furnace")
  assert(type(prototype["crafting_speed"]) == "number", "Expected numeric property furnace.steel-furnace.crafting_speed")
  prototype["crafting_speed"] = prototype["crafting_speed"] * 2
end
`;

const expectedMultiplyAssertionLua = `do
  local prototype = data.raw["furnace"] and data.raw["furnace"]["steel-furnace"]
  local actual = prototype and prototype["crafting_speed"] or nil
  local expected = 4
  local tolerance = 1e-9 * math.max(1, math.abs(expected))
  if type(actual) ~= "number" or math.abs(actual - expected) > tolerance then
    error("__PROJECT_SEMANTIC_ASSERTION__|furnace.steel-furnace.crafting_speed|expected=4|actual=" .. tostring(actual), 0)
  end
end
`;

describe("generateFactorioMod", () => {
  it("generates a deterministic bounded manifest plus separate semantic assertions", () => {
    const generated = generateFactorioMod(makeSpec());

    expect(generated).toEqual({
      name: "faster-steel-furnaces",
      version: "0.1.0",
      directoryName: "faster-steel-furnaces_0.1.0",
      manifest: {
        files: [
          { path: "info.json", content: expectedInfo, role: "metadata" },
          { path: "data.lua", content: expectedMultiplyLua, role: "data_stage" },
        ],
      },
      semanticAssertionLua: expectedMultiplyAssertionLua,
    });
  });

  it("renders set operations and derives an absolute semantic expectation", () => {
    const spec = makeSpec({ type: "set", value: 4 });
    const generated = generateFactorioMod(spec);
    const dataLua = generatedContent("data.lua", spec);

    expect(dataLua).toContain('prototype["crafting_speed"] = 4');
    expect(dataLua).not.toContain('prototype["crafting_speed"] * 4');
    expect(generated.semanticAssertionLua).toContain("local expected = 4");
  });

  it("rejects unsupported prototype addresses before generating files", () => {
    const spec = makeSpec();
    const firstChange = spec.changes[0]!;
    const firstAssertion = spec.assertions[0]!;
    spec.changes[0] = { ...firstChange, prototypeType: "assembling-machine" };
    spec.assertions[0] = { ...firstAssertion, prototypeType: "assembling-machine" };

    expect(() => generateFactorioMod(spec)).toThrow(
      "Unsupported prototype property: assembling-machine.steel-furnace.crafting_speed",
    );
  });

  it("rejects unknown furnace names because multiply needs a known baseline", () => {
    const spec = makeSpec();
    const firstChange = spec.changes[0]!;
    const firstAssertion = spec.assertions[0]!;
    spec.changes[0] = { ...firstChange, prototypeName: "mystery-furnace" };
    spec.assertions[0] = { ...firstAssertion, prototypeName: "mystery-furnace" };

    expect(() => generateFactorioMod(spec)).toThrow(
      "Unsupported prototype property: furnace.mystery-furnace.crafting_speed",
    );
  });

  it("validates the ModSpec boundary before rendering Lua", () => {
    const invalid = { ...makeSpec(), slug: "../../unsafe" } as ModSpec;
    expect(() => generateFactorioMod(invalid)).toThrow();
  });

  it("preserves change and assertion order deterministically", () => {
    const spec = makeSpec();
    const firstChange = spec.changes[0]!;
    const firstAssertion = spec.assertions[0]!;
    spec.changes.push({ ...firstChange, prototypeName: "stone-furnace" });
    spec.assertions.push({ ...firstAssertion, prototypeName: "stone-furnace" });

    const generated = generateFactorioMod(spec);
    const dataLua = generatedContent("data.lua", spec);
    expect(dataLua.indexOf("steel-furnace")).toBeLessThan(dataLua.indexOf("stone-furnace"));
    expect(generated.semanticAssertionLua.indexOf("steel-furnace")).toBeLessThan(
      generated.semanticAssertionLua.indexOf("stone-furnace"),
    );
    expect(generateFactorioMod(spec)).toEqual(generated);
  });
});
