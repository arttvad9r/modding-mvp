import {
  ProjectError,
  type ModSpec,
  type PrototypePropertyModSpec,
  RecipeIngredientModSpec,
  ScalarOperation,
} from "@project/domain";
import { describe, expect, it } from "vitest";

import { generateFactorioMod } from "../src/index.js";

function captureProjectError(run: () => unknown): ProjectError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectError);
    return error as ProjectError;
  }
  throw new Error("Expected ProjectError");
}

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

function generatedContent(path: string, spec: ModSpec): string {
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

    const error = captureProjectError(() => generateFactorioMod(spec));
    expect(error.code).toBe("unsupported_capability");
    expect(error.stage).toBe("generation");
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

    const error = captureProjectError(() =>
      generateFactorioMod(makeRecipeSpec({ type: "set", value: 0 })),
    );
    expect(error.code).toBe("generation_error");
    expect(error.stage).toBe("generation");
  });
});


describe("generateFactorioMod error taxonomy", () => {
  it("classifies invalid ModSpec shape as schema_error", () => {
    const invalid = { ...makePrototypeSpec(), slug: "../../unsafe" } as unknown as ModSpec;
    const error = captureProjectError(() => generateFactorioMod(invalid));
    expect(error.code).toBe("schema_error");
    expect(error.stage).toBe("input");
  });
});


describe("generateFactorioMod mixed bundle", () => {
  it("renders heterogeneous changes and assertions into one deterministic mod", () => {
    const spec: ModSpec = {
      title: "Fast start bundle",
      slug: "fast-start-bundle",
      target: { game: "factorio", channel: "stable", versionLine: "2.0" },
      capability: "mixed",
      changes: [
        {
          type: "prototype_property",
          prototypeType: "assembling-machine",
          prototypeName: "assembling-machine-2",
          property: "crafting_speed",
          operation: { type: "multiply", factor: 2 },
        },
        {
          type: "technology_cost",
          technologyName: "automation",
          operation: { type: "multiply", factor: 0.5 },
        },
      ],
      assertions: [
        {
          type: "prototype_property_matches",
          prototypeType: "assembling-machine",
          prototypeName: "assembling-machine-2",
          property: "crafting_speed",
          expectation: { type: "multiply", factor: 2 },
        },
        {
          type: "technology_cost_matches",
          technologyName: "automation",
          expectation: { type: "multiply", factor: 0.5 },
        },
      ],
    };

    const generated = generateFactorioMod(spec);
    const dataLua = generatedContent("data.lua", spec);
    expect(dataLua).toContain('data.raw["assembling-machine"]["assembling-machine-2"]');
    expect(dataLua).toContain('technology.unit.count = technology.unit.count * 0.5');
    expect(generated.semanticAssertionLua).toContain("assembling-machine.assembling-machine-2.crafting_speed|expected=1.5");
    expect(generated.semanticAssertionLua).toContain("technology.automation.unit.count|expected=5");
  });
});

describe("generateFactorioMod M6A rebalance primitives", () => {
  it("renders recipe crafting time with an absolute semantic assertion", () => {
    const spec: ModSpec = {
      title: "Fast gears",
      slug: "fast-gears",
      target: { game: "factorio", channel: "stable", versionLine: "2.0" },
      capability: "recipe_crafting_time",
      changes: [{ type: "recipe_crafting_time", recipeName: "iron-gear-wheel", operation: { type: "multiply", factor: 0.5 } }],
      assertions: [{ type: "recipe_crafting_time_matches", recipeName: "iron-gear-wheel", expectation: { type: "multiply", factor: 0.5 } }],
    };
    const generated = generateFactorioMod(spec);
    expect(generatedContent("data.lua", spec)).toContain("recipe.energy_required = current * 0.5");
    expect(generated.semanticAssertionLua).toContain("recipe.iron-gear-wheel.energy_required|expected=0.25");
  });

  it("renders recipe result amount and rejects fractional item results", () => {
    const spec: ModSpec = {
      title: "More belts",
      slug: "more-belts",
      target: { game: "factorio", channel: "stable", versionLine: "2.0" },
      capability: "recipe_result",
      changes: [{ type: "recipe_result", recipeName: "transport-belt", resultType: "item", resultName: "transport-belt", operation: { type: "multiply", factor: 2 } }],
      assertions: [{ type: "recipe_result_matches", recipeName: "transport-belt", resultType: "item", resultName: "transport-belt", expectation: { type: "multiply", factor: 2 } }],
    };
    const generated = generateFactorioMod(spec);
    expect(generatedContent("data.lua", spec)).toContain("result.amount = result.amount * 2");
    expect(generated.semanticAssertionLua).toContain("recipe.transport-belt.result.item.transport-belt|expected=4");
    const invalid = {
      ...spec,
      changes: [{ ...spec.changes[0]!, operation: { type: "multiply" as const, factor: 0.75 } }],
      assertions: [{ ...spec.assertions[0]!, expectation: { type: "multiply" as const, factor: 0.75 } }],
    } as ModSpec;
    expect(() => generateFactorioMod(invalid)).toThrow("Item result amount must be an integer in range 1..65535");
  });

  it("renders item stack size and rejects non-integer stacks", () => {
    const spec: ModSpec = {
      title: "Bigger circuit stacks",
      slug: "bigger-circuit-stacks",
      target: { game: "factorio", channel: "stable", versionLine: "2.0" },
      capability: "item_stack_size",
      changes: [{ type: "item_stack_size", itemName: "electronic-circuit", operation: { type: "set", value: 500 } }],
      assertions: [{ type: "item_stack_size_matches", itemName: "electronic-circuit", expectation: { type: "set", value: 500 } }],
    };
    const generated = generateFactorioMod(spec);
    expect(generatedContent("data.lua", spec)).toContain("item.stack_size = 500");
    expect(generated.semanticAssertionLua).toContain("item.electronic-circuit.stack_size|expected=500");
    const invalid = {
      ...spec,
      changes: [{ ...spec.changes[0]!, operation: { type: "set" as const, value: 1.5 } }],
      assertions: [{ ...spec.assertions[0]!, expectation: { type: "set" as const, value: 1.5 } }],
    } as ModSpec;
    expect(() => generateFactorioMod(invalid)).toThrow("Item stack size must be an integer in range 1..65535");
  });
});


describe("generateFactorioMod new_machine", () => {
  const spec: ModSpec = {
    title: "Advanced electric furnace",
    slug: "advanced-electric-furnace",
    target: { game: "factorio", channel: "stable", versionLine: "2.0" },
    capability: "new_machine",
    changes: [{
      type: "new_machine", machineType: "furnace", basePrototypeName: "electric-furnace",
      name: "custom-advanced-electric-furnace", displayName: "Advanced Electric Furnace",
      speed: 4, energyUsageKw: 540, moduleSlots: 4, itemStackSize: 50,
      recipeCraftingTime: 5,
      recipeIngredients: [{ itemName: "steel-plate", amount: 10 }, { itemName: "advanced-circuit", amount: 5 }, { itemName: "stone-brick", amount: 10 }],
      unlock: { type: "new_technology", displayName: "Advanced Electric Furnace", prerequisites: ["advanced-material-processing-2"], scienceTier: "chemical", count: 300, time: 30 },
    }],
    assertions: [{
      type: "new_machine_matches", machineType: "furnace", basePrototypeName: "electric-furnace",
      name: "custom-advanced-electric-furnace", displayName: "Advanced Electric Furnace",
      speed: 4, energyUsageKw: 540, moduleSlots: 4, itemStackSize: 50,
      recipeCraftingTime: 5,
      recipeIngredients: [{ itemName: "steel-plate", amount: 10 }, { itemName: "advanced-circuit", amount: 5 }, { itemName: "stone-brick", amount: 10 }],
      unlock: { type: "new_technology", displayName: "Advanced Electric Furnace", prerequisites: ["advanced-material-processing-2"], scienceTier: "chemical", count: 300, time: 30 },
    }],
  };

  it("creates entity, item, recipe, and technology deterministically", () => {
    const generated = generateFactorioMod(spec);
    const lua = generatedContent("data.lua", spec);
    expect(lua).toContain('data.raw["furnace"]["electric-furnace"]');
    expect(lua).toContain('entity.name = "custom-advanced-electric-furnace"');
    expect(lua).toContain('entity.energy_usage = "540kW"');
    expect(lua).toContain('technology.name = "custom-advanced-electric-furnace-technology"');
    expect(lua).toContain('recipe="custom-advanced-electric-furnace"');
    expect(generated.semanticAssertionLua).toContain("new-machine.custom-advanced-electric-furnace.speed|expected=4");
  });

  it("rejects unreviewed recipe ingredients", () => {
    const invalid = structuredClone(spec);
    invalid.changes[0]!.recipeIngredients = [{ itemName: "uranium-ore", amount: 1 }];
    invalid.assertions[0]!.recipeIngredients = [{ itemName: "uranium-ore", amount: 1 }];
    expect(() => generateFactorioMod(invalid)).toThrow("Unsupported new machine recipe ingredient: uranium-ore");
  });
});


describe("generateFactorioMod new_recipe", () => {
  const spec: ModSpec = {
    title: "Steel gears recipe", slug: "steel-gears-recipe",
    target: { game: "factorio", channel: "stable", versionLine: "2.0" }, capability: "new_recipe",
    changes: [{ type: "new_recipe", name: "custom-steel-gears", displayName: "Steel Gears", energyRequired: 1, ingredients: [{ itemName: "steel-plate", amount: 1 }], resultItemName: "iron-gear-wheel", resultAmount: 5, unlock: { type: "existing_technology", technologyName: "steel-processing" } }],
    assertions: [{ type: "new_recipe_matches", name: "custom-steel-gears", displayName: "Steel Gears", energyRequired: 1, ingredients: [{ itemName: "steel-plate", amount: 1 }], resultItemName: "iron-gear-wheel", resultAmount: 5, unlock: { type: "existing_technology", technologyName: "steel-processing" } }],
  };

  it("creates an alternative recipe and unlock effect deterministically", () => {
    const lua = generatedContent("data.lua", spec);
    expect(lua).toContain('name = "custom-steel-gears"');
    expect(lua).toContain('name="iron-gear-wheel", amount=5');
    expect(lua).toContain('data.raw["technology"]["steel-processing"]');
    expect(generateFactorioMod(spec).semanticAssertionLua).toContain("new-recipe.custom-steel-gears.result.iron-gear-wheel|expected=5");
  });

  it("rejects an unreviewed result item", () => {
    const invalid = structuredClone(spec);
    invalid.changes[0]!.resultItemName = "uranium-ore";
    invalid.assertions[0]!.resultItemName = "uranium-ore";
    expect(() => generateFactorioMod(invalid)).toThrow("Unsupported new recipe result item: uranium-ore");
  });
});


describe("generateFactorioMod new_item", () => {
  const spec: ModSpec = {
    title: "Reinforced plate", slug: "reinforced-plate",
    target: { game: "factorio", channel: "stable", versionLine: "2.0" }, capability: "new_item",
    changes: [{ type: "new_item", baseItemName: "steel-plate", name: "custom-reinforced-plate", displayName: "Reinforced Plate", stackSize: 100, recipeCraftingTime: 2, recipeIngredients: [{ itemName: "steel-plate", amount: 2 }, { itemName: "plastic-bar", amount: 5 }], recipeResultAmount: 1, unlock: { type: "existing_technology", technologyName: "advanced-material-processing-2" } }],
    assertions: [{ type: "new_item_matches", baseItemName: "steel-plate", name: "custom-reinforced-plate", displayName: "Reinforced Plate", stackSize: 100, recipeCraftingTime: 2, recipeIngredients: [{ itemName: "steel-plate", amount: 2 }, { itemName: "plastic-bar", amount: 5 }], recipeResultAmount: 1, unlock: { type: "existing_technology", technologyName: "advanced-material-processing-2" } }],
  };
  it("creates a cloned item, its recipe, and unlock", () => {
    const generated = generateFactorioMod(spec);
    const lua = generatedContent("data.lua", spec);
    expect(lua).toContain('data.raw["item"]["steel-plate"]');
    expect(lua).toContain('item.name = "custom-reinforced-plate"');
    expect(lua).toContain('name="custom-reinforced-plate", amount=1');
    expect(generated.semanticAssertionLua).toContain("new-item.custom-reinforced-plate.stack_size|expected=100");
  });
});
