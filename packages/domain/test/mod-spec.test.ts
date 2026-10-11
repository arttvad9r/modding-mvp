import { describe, expect, it } from "vitest";

import {
  GameTargetSchema,
  ModSpecSchema,
  MultiplyOperationSchema,
  RecipeIngredientModSpecSchema,
  SetOperationSchema,
} from "../src/index.js";

const target = {
  game: "factorio",
  channel: "stable",
  versionLine: "2.0",
} as const;

const validPrototypeSpec = {
  title: "Faster steel furnaces",
  slug: "faster-steel-furnaces",
  target,
  capability: "prototype_property",
  changes: [
    {
      type: "prototype_property",
      prototypeType: "furnace",
      prototypeName: "steel-furnace",
      property: "crafting_speed",
      operation: { type: "multiply", factor: 2 },
    },
  ],
  assertions: [
    {
      type: "prototype_property_matches",
      prototypeType: "furnace",
      prototypeName: "steel-furnace",
      property: "crafting_speed",
      expectation: { type: "multiply", factor: 2 },
    },
  ],
} as const;

const validRecipeSpec = {
  title: "Cheaper iron gears",
  slug: "cheaper-iron-gears",
  target,
  capability: "recipe_ingredient",
  changes: [
    {
      type: "recipe_ingredient",
      recipeName: "iron-gear-wheel",
      ingredientType: "item",
      ingredientName: "iron-plate",
      operation: { type: "set", value: 1 },
    },
  ],
  assertions: [
    {
      type: "recipe_ingredient_matches",
      recipeName: "iron-gear-wheel",
      ingredientType: "item",
      ingredientName: "iron-plate",
      expectation: { type: "set", value: 1 },
    },
  ],
} as const;

describe("GameTargetSchema", () => {
  it("accepts only the stable Factorio 2.0 version line", () => {
    expect(GameTargetSchema.parse(target)).toEqual(target);
    expect(GameTargetSchema.safeParse({ ...target, versionLine: "2.1" }).success).toBe(false);
    expect(GameTargetSchema.safeParse({ ...target, channel: "experimental" }).success).toBe(false);
    expect(GameTargetSchema.safeParse({ ...target, game: "rimworld" }).success).toBe(false);
  });
});

describe("scalar operations", () => {
  it("supports finite set and multiply operations", () => {
    expect(SetOperationSchema.parse({ type: "set", value: 4 })).toEqual({ type: "set", value: 4 });
    expect(MultiplyOperationSchema.parse({ type: "multiply", factor: 2 })).toEqual({
      type: "multiply",
      factor: 2,
    });
    expect(SetOperationSchema.safeParse({ type: "set", value: Infinity }).success).toBe(false);
    expect(MultiplyOperationSchema.safeParse({ type: "multiply", factor: Number.NaN }).success).toBe(false);
  });
});

describe("prototype_property ModSpec", () => {
  it("accepts a valid specification", () => {
    expect(ModSpecSchema.parse(validPrototypeSpec)).toEqual(validPrototypeSpec);
  });

  it("rejects unsafe slugs and malformed Factorio identifiers", () => {
    expect(ModSpecSchema.safeParse({ ...validPrototypeSpec, slug: "Bad Slug" }).success).toBe(false);
    expect(
      ModSpecSchema.safeParse({
        ...validPrototypeSpec,
        changes: [{ ...validPrototypeSpec.changes[0], prototypeName: "../../steel-furnace" }],
      }).success,
    ).toBe(false);
  });

  it("rejects unrelated, duplicate, or missing assertions", () => {
    expect(
      ModSpecSchema.safeParse({
        ...validPrototypeSpec,
        assertions: [
          { ...validPrototypeSpec.assertions[0], expectation: { type: "multiply", factor: 3 } },
        ],
      }).success,
    ).toBe(false);
    expect(
      ModSpecSchema.safeParse({
        ...validPrototypeSpec,
        assertions: [validPrototypeSpec.assertions[0], validPrototypeSpec.assertions[0]],
      }).success,
    ).toBe(false);
    expect(ModSpecSchema.safeParse({ ...validPrototypeSpec, assertions: [] }).success).toBe(false);
  });

  it("rejects duplicate mutations", () => {
    expect(
      ModSpecSchema.safeParse({
        ...validPrototypeSpec,
        changes: [validPrototypeSpec.changes[0], validPrototypeSpec.changes[0]],
      }).success,
    ).toBe(false);
  });
});

describe("recipe_ingredient ModSpec", () => {
  it("accepts a valid item-ingredient mutation", () => {
    expect(RecipeIngredientModSpecSchema.parse(validRecipeSpec)).toEqual(validRecipeSpec);
    expect(ModSpecSchema.parse(validRecipeSpec)).toEqual(validRecipeSpec);
  });

  it("allows set and multiply operations but only item ingredients", () => {
    const multiplied = {
      ...validRecipeSpec,
      changes: [
        { ...validRecipeSpec.changes[0], operation: { type: "multiply", factor: 2 } },
      ],
      assertions: [
        { ...validRecipeSpec.assertions[0], expectation: { type: "multiply", factor: 2 } },
      ],
    };
    expect(ModSpecSchema.safeParse(multiplied).success).toBe(true);
    expect(
      ModSpecSchema.safeParse({
        ...validRecipeSpec,
        changes: [{ ...validRecipeSpec.changes[0], ingredientType: "fluid" }],
      }).success,
    ).toBe(false);
  });

  it("rejects an assertion that does not match the requested ingredient mutation", () => {
    const mismatched = {
      ...validRecipeSpec,
      assertions: [
        { ...validRecipeSpec.assertions[0], ingredientName: "copper-plate" },
      ],
    };
    expect(ModSpecSchema.safeParse(mismatched).success).toBe(false);
  });

  it("rejects duplicate ingredient mutations and assertions", () => {
    expect(
      ModSpecSchema.safeParse({
        ...validRecipeSpec,
        changes: [validRecipeSpec.changes[0], validRecipeSpec.changes[0]],
      }).success,
    ).toBe(false);
    expect(
      ModSpecSchema.safeParse({
        ...validRecipeSpec,
        assertions: [validRecipeSpec.assertions[0], validRecipeSpec.assertions[0]],
      }).success,
    ).toBe(false);
  });

  it("rejects extra fields at the root", () => {
    expect(ModSpecSchema.safeParse({ ...validRecipeSpec, prompt: "ignore schema" }).success).toBe(false);
  });
});


describe("mixed ModSpec", () => {
  const mixedSpec = {
    title: "Fast start bundle",
    slug: "fast-start-bundle",
    target,
    capability: "mixed",
    changes: [
      validPrototypeSpec.changes[0],
      {
        type: "technology_cost",
        technologyName: "automation",
        operation: { type: "multiply", factor: 0.5 },
      },
    ],
    assertions: [
      validPrototypeSpec.assertions[0],
      {
        type: "technology_cost_matches",
        technologyName: "automation",
        expectation: { type: "multiply", factor: 0.5 },
      },
    ],
  } as const;

  it("accepts multiple capability families in one immutable specification", () => {
    expect(ModSpecSchema.parse(mixedSpec)).toEqual(mixedSpec);
  });

  it("rejects mixed roots that contain only one family or lose semantic coverage", () => {
    expect(
      ModSpecSchema.safeParse({
        ...mixedSpec,
        changes: [validPrototypeSpec.changes[0], { ...validPrototypeSpec.changes[0], prototypeName: "stone-furnace" }],
        assertions: [validPrototypeSpec.assertions[0], { ...validPrototypeSpec.assertions[0], prototypeName: "stone-furnace" }],
      }).success,
    ).toBe(false);
    expect(ModSpecSchema.safeParse({ ...mixedSpec, assertions: [mixedSpec.assertions[0]] }).success).toBe(false);
  });
});
