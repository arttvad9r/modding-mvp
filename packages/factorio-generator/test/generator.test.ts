import type {
  PrototypePropertyModSpec,
  RecipeIngredientModSpec,
  ScalarOperation,
} from "@project/domain";
import { describe, expect, it } from "vitest";

import { generateFactorioMod } from "../src/index.js";

function makePrototypeSpec(
  operation: ScalarOperation = { type: "multiply", factor: 2 },
): PrototypePropertyModSpec {
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

function makeRecipeSpec(
  operation: ScalarOperation = { type: "set", value: 1 },
): RecipeIngredientModSpec {
  return {
    title: "Cheaper iron gears",
    slug: "cheaper-iron-gears",
    target: { game: "factorio", channel: "stable", versionLine: "2.0" },
    capability: "recipe_ingredient",
    changes: [
      {
        type: "recipe_ingredient",
        recipeName: "iron-gear-wheel",
        ingredientType: "item",
        ingredientName: "iron-plate",
        operation,
      },
    ],
    assertions: [
      {
        type: "recipe_ingredient_matches",
        recipeName: "iron-gear-wheel",
        ingredientType: "item",
        ingredientName: "iron-plate",
        expectation: operation,
      },
    ],
  };
}

function generatedContent(path: string, spec: PrototypePropertyModSpec | RecipeIngredientModSpec): string {
  const file = generateFactorioMod(spec).manifest.files.find((entry) => entry.path === path);
  if (!file) throw new Error(`Missing generated file: ${path}`);
  return file.content;
}

const expectedMultiplyLua = `do
  local prototype = data.raw["furnace"] and data.raw["furnace"]["steel-furnace"]
  assert(prototype, "Missing prototype furnace.steel-furnace")
  assert(type(prototype["crafting_speed"]) == "number", "Expected numeric property furnace.steel-furnace.crafting_speed")
  prototype["crafting_speed"] = prototype["crafting_speed"] * 2
end
`;

const expectedRecipeLua = `do
  local recipe = data.raw["recipe"] and data.raw["recipe"]["iron-gear-wheel"]
  assert(recipe, "Missing recipe iron-gear-wheel")
  local ingredient = nil
  for _, candidate in ipairs(recipe.ingredients or {}) do
    if candidate.type == "item" and candidate.name == "iron-plate" then
      ingredient = candidate
      break
    end
  end
  assert(ingredient, "Missing ingredient item.iron-plate in recipe iron-gear-wheel")
  assert(type(ingredient.amount) == "number", "Expected numeric ingredient amount iron-gear-wheel.item.iron-plate")
  ingredient.amount = 1
end
`;

describe("generateFactorioMod prototype_property", () => {
  it("generates deterministic mutation and semantic assertion Lua", () => {
    const generated = generateFactorioMod(makePrototypeSpec());
    expect(generatedContent("data.lua", makePrototypeSpec())).toBe(expectedMultiplyLua);
    expect(generated.semanticAssertionLua).toContain(
      "__PROJECT_SEMANTIC_ASSERTION__|furnace.steel-furnace.crafting_speed|expected=4|actual=",
    );
  });

  it("renders set operations and derives an absolute semantic expectation", () => {
    const spec = makePrototypeSpec({ type: "set", value: 4 });
    const generated = generateFactorioMod(spec);
    const dataLua = generatedContent("data.lua", spec);
    expect(dataLua).toContain('prototype["crafting_speed"] = 4');
    expect(generated.semanticAssertionLua).toContain("local expected = 4");
  });

  it("rejects unsupported prototype addresses", () => {
    const spec = makePrototypeSpec();
    spec.changes[0] = { ...spec.changes[0]!, prototypeType: "assembling-machine" };
    spec.assertions[0] = { ...spec.assertions[0]!, prototypeType: "assembling-machine" };
    expect(() => generateFactorioMod(spec)).toThrow(
      "Unsupported prototype property: assembling-machine.steel-furnace.crafting_speed",
    );
  });

  it("preserves deterministic ordering for multiple changes", () => {
    const spec = makePrototypeSpec();
    spec.changes.push({ ...spec.changes[0]!, prototypeName: "stone-furnace" });
    spec.assertions.push({ ...spec.assertions[0]!, prototypeName: "stone-furnace" });
    const dataLua = generatedContent("data.lua", spec);
    expect(dataLua.indexOf("steel-furnace")).toBeLessThan(dataLua.indexOf("stone-furnace"));
  });
});

describe("generateFactorioMod recipe_ingredient", () => {
  it("generates deterministic item ingredient mutation and semantic assertion Lua", () => {
    const spec = makeRecipeSpec();
    const generated = generateFactorioMod(spec);
    expect(generatedContent("data.lua", spec)).toBe(expectedRecipeLua);
    expect(generated.semanticAssertionLua).toContain(
      "__PROJECT_SEMANTIC_ASSERTION__|recipe.iron-gear-wheel.ingredient.item.iron-plate|expected=1|actual=",
    );
  });

  it("supports multiply when the resulting item amount is an integer", () => {
    const spec = makeRecipeSpec({ type: "multiply", factor: 2 });
    const generated = generateFactorioMod(spec);
    expect(generatedContent("data.lua", spec)).toContain("ingredient.amount = ingredient.amount * 2");
    expect(generated.semanticAssertionLua).toContain("local expected = 4");
  });

  it("rejects unsupported recipe/ingredient addresses", () => {
    const spec = makeRecipeSpec();
    spec.changes[0] = { ...spec.changes[0]!, recipeName: "unknown-recipe" };
    spec.assertions[0] = { ...spec.assertions[0]!, recipeName: "unknown-recipe" };
    expect(() => generateFactorioMod(spec)).toThrow(
      "Unsupported recipe ingredient: unknown-recipe.item.iron-plate",
    );
  });

  it("rejects invalid uint16 item amounts before Factorio execution", () => {
    expect(() => generateFactorioMod(makeRecipeSpec({ type: "set", value: 0 }))).toThrow(
      "Item ingredient amount must be an integer in range 1..65535",
    );
    expect(() => generateFactorioMod(makeRecipeSpec({ type: "set", value: 1.5 }))).toThrow(
      "Item ingredient amount must be an integer in range 1..65535",
    );
    expect(() => generateFactorioMod(makeRecipeSpec({ type: "multiply", factor: 0.75 }))).toThrow(
      "Item ingredient amount must be an integer in range 1..65535",
    );
  });
});
