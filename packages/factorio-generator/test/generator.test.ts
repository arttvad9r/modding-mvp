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
    target: {
      game: "factorio",
      channel: "stable",
      versionLine: "2.0",
    },
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

describe("generateFactorioMod", () => {
  it("generates deterministic metadata and Lua for a supported multiply change", () => {
    const generated = generateFactorioMod(makeSpec());

    expect(generated).toEqual({
      name: "faster-steel-furnaces",
      version: "0.1.0",
      directoryName: "faster-steel-furnaces_0.1.0",
      infoJson: expectedInfo,
      dataLua: expectedMultiplyLua,
    });
  });

  it("renders set operations without reading the previous scalar value", () => {
    const generated = generateFactorioMod(makeSpec({ type: "set", value: 4 }));

    expect(generated.dataLua).toContain('prototype["crafting_speed"] = 4');
    expect(generated.dataLua).not.toContain('prototype["crafting_speed"] * 4');
  });

  it("rejects unsupported prototype/property pairs before generating files", () => {
    const spec = makeSpec();
    const firstChange = spec.changes[0]!;
    const firstAssertion = spec.assertions[0]!;

    spec.changes[0] = {
      ...firstChange,
      prototypeType: "assembling-machine",
    };
    spec.assertions[0] = {
      ...firstAssertion,
      prototypeType: "assembling-machine",
    };

    expect(() => generateFactorioMod(spec)).toThrow(
      "Unsupported prototype property: assembling-machine.crafting_speed",
    );
  });

  it("validates the ModSpec boundary before rendering Lua", () => {
    const invalid = {
      ...makeSpec(),
      slug: "../../unsafe",
    } as ModSpec;

    expect(() => generateFactorioMod(invalid)).toThrow();
  });

  it("preserves change order deterministically for multiple furnaces", () => {
    const spec = makeSpec();
    const firstChange = spec.changes[0]!;
    const firstAssertion = spec.assertions[0]!;
    const secondChange = {
      ...firstChange,
      prototypeName: "stone-furnace",
    };
    const secondAssertion = {
      ...firstAssertion,
      prototypeName: "stone-furnace",
    };
    spec.changes.push(secondChange);
    spec.assertions.push(secondAssertion);

    const generated = generateFactorioMod(spec);
    expect(generated.dataLua.indexOf("steel-furnace")).toBeLessThan(
      generated.dataLua.indexOf("stone-furnace"),
    );
    expect(generateFactorioMod(spec)).toEqual(generated);
  });
});
