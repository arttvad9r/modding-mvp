import { ModSpecSchema } from "@project/domain";
import { describe, expect, it } from "vitest";

import { diffDataRaw, findFootprintViolations, fingerprintDataRaw, modSpecFootprint } from "../src/index.js";

const base = {
  furnace: {
    "stone-furnace": { name: "stone-furnace", crafting_speed: 1, energy_usage: "90kW" },
    "steel-furnace": { name: "steel-furnace", crafting_speed: 2, energy_usage: "90kW" },
  },
  item: { "iron-plate": { name: "iron-plate", stack_size: 100 } },
  technology: { automation: { name: "automation", effects: [{ type: "unlock-recipe", recipe: "assembling-machine-1" }] } },
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

const spec = ModSpecSchema.parse({
  title: "Footprint",
  slug: "footprint",
  target: { game: "factorio", channel: "stable", versionLine: "2.0" },
  capability: "mixed",
  changes: [
    { type: "prototype_property", prototypeType: "furnace", prototypeName: "steel-furnace", property: "crafting_speed", operation: { type: "multiply", factor: 2 } },
    {
      type: "new_recipe",
      name: "cheap-gear",
      displayName: "Cheap gear",
      energyRequired: 1,
      ingredients: [{ itemName: "iron-plate", amount: 1 }],
      resultItemName: "iron-gear-wheel",
      resultAmount: 1,
      unlock: { type: "existing_technology", technologyName: "automation" },
    },
  ],
  assertions: [
    { type: "prototype_property_matches", prototypeType: "furnace", prototypeName: "steel-furnace", property: "crafting_speed", expectation: { type: "multiply", factor: 2 } },
    {
      type: "new_recipe_matches",
      name: "cheap-gear",
      displayName: "Cheap gear",
      energyRequired: 1,
      ingredients: [{ itemName: "iron-plate", amount: 1 }],
      resultItemName: "iron-gear-wheel",
      resultAmount: 1,
      unlock: { type: "existing_technology", technologyName: "automation" },
    },
  ],
});

describe("data.raw fingerprints", () => {
  it("ignores object key order and reports changed properties", () => {
    const reordered = { item: { "iron-plate": { stack_size: 100, name: "iron-plate" } }, furnace: clone(base.furnace), technology: clone(base.technology) };
    expect(diffDataRaw(fingerprintDataRaw(base), fingerprintDataRaw(reordered))).toEqual([]);

    const changed = clone(base);
    changed.furnace["stone-furnace"].crafting_speed = 100;
    expect(diffDataRaw(fingerprintDataRaw(base), fingerprintDataRaw(changed))).toEqual(["furnace/stone-furnace.crafting_speed"]);
  });
});

describe("ModSpec footprint", () => {
  it("allows exactly the generator-owned changes", () => {
    const candidate = clone(base) as Record<string, Record<string, unknown>> & typeof base;
    candidate.furnace["steel-furnace"].crafting_speed = 4;
    candidate.technology.automation.effects.push({ type: "unlock-recipe", recipe: "cheap-gear" });
    candidate.recipe = { "cheap-gear": { name: "cheap-gear" } };

    expect(findFootprintViolations(fingerprintDataRaw(base), fingerprintDataRaw(candidate), modSpecFootprint(spec))).toEqual([]);
  });

  it("reports unrequested properties, prototypes and replacements", () => {
    const candidate = clone(base) as Record<string, Record<string, unknown>> & typeof base;
    candidate.furnace["steel-furnace"].energy_usage = "1kW";
    candidate.furnace["stone-furnace"].crafting_speed = 100;
    candidate.item["iron-plate"].stack_size = 1000;
    candidate.recipe = { "cheap-gear": { name: "cheap-gear" }, "free-plates": { name: "free-plates" } };

    expect(findFootprintViolations(fingerprintDataRaw(base), fingerprintDataRaw(candidate), modSpecFootprint(spec))).toEqual([
      "furnace/steel-furnace.energy_usage",
      "furnace/stone-furnace.crafting_speed",
      "item/iron-plate.stack_size",
      "recipe/free-plates (added)",
    ]);
  });

  it("does not let a new-content change replace an existing prototype", () => {
    const withExisting = { ...clone(base), recipe: { "cheap-gear": { name: "cheap-gear", energy_required: 5 } } };
    const replaced = { ...clone(base), recipe: { "cheap-gear": { name: "cheap-gear", energy_required: 1 } } };
    expect(findFootprintViolations(fingerprintDataRaw(withExisting), fingerprintDataRaw(replaced), modSpecFootprint(spec))).toEqual([
      "recipe/cheap-gear (replaced existing prototype)",
    ]);
  });
});
