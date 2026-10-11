import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type {
  ModSpec,
  PrototypePropertyModSpec,
  RecipeIngredientModSpec,
  ScalarOperation,
} from "@project/domain";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { buildValidatedFactorioArtifact } from "../src/index.js";

interface PrototypeFixture {
  readonly name: string;
  readonly prototypeName: "stone-furnace" | "steel-furnace" | "electric-furnace";
  readonly operation: ScalarOperation;
}

interface RecipeFixture {
  readonly name: string;
  readonly recipeName: "iron-gear-wheel" | "transport-belt" | "electronic-circuit" | "pipe";
  readonly ingredientName: "iron-plate" | "iron-gear-wheel" | "copper-cable";
  readonly operation: ScalarOperation;
}

const prototypeFixtures: readonly PrototypeFixture[] = [
  { name: "steel-double", prototypeName: "steel-furnace", operation: { type: "multiply", factor: 2 } },
  { name: "stone-double", prototypeName: "stone-furnace", operation: { type: "multiply", factor: 2 } },
  { name: "electric-one-half", prototypeName: "electric-furnace", operation: { type: "multiply", factor: 1.5 } },
  { name: "steel-set-three", prototypeName: "steel-furnace", operation: { type: "set", value: 3 } },
  { name: "stone-set-half", prototypeName: "stone-furnace", operation: { type: "set", value: 0.5 } },
];

const recipeFixtures: readonly RecipeFixture[] = [
  { name: "gear-cheaper", recipeName: "iron-gear-wheel", ingredientName: "iron-plate", operation: { type: "set", value: 1 } },
  { name: "gear-expensive", recipeName: "iron-gear-wheel", ingredientName: "iron-plate", operation: { type: "multiply", factor: 2 } },
  { name: "belt-more-iron", recipeName: "transport-belt", ingredientName: "iron-plate", operation: { type: "set", value: 2 } },
  { name: "circuit-less-cable", recipeName: "electronic-circuit", ingredientName: "copper-cable", operation: { type: "set", value: 2 } },
  { name: "pipe-double-iron", recipeName: "pipe", ingredientName: "iron-plate", operation: { type: "multiply", factor: 2 } },
];

function makePrototypeSpec(fixture: PrototypeFixture): PrototypePropertyModSpec {
  return {
    title: `Integration ${fixture.name}`,
    slug: `integration-${fixture.name}`,
    target: { game: "factorio", channel: "stable", versionLine: "2.0" },
    capability: "prototype_property",
    changes: [
      {
        type: "prototype_property",
        prototypeType: "furnace",
        prototypeName: fixture.prototypeName,
        property: "crafting_speed",
        operation: fixture.operation,
      },
    ],
    assertions: [
      {
        type: "prototype_property_matches",
        prototypeType: "furnace",
        prototypeName: fixture.prototypeName,
        property: "crafting_speed",
        expectation: fixture.operation,
      },
    ],
  };
}

function makeRecipeSpec(fixture: RecipeFixture): RecipeIngredientModSpec {
  return {
    title: `Integration ${fixture.name}`,
    slug: `integration-${fixture.name}`,
    target: { game: "factorio", channel: "stable", versionLine: "2.0" },
    capability: "recipe_ingredient",
    changes: [
      {
        type: "recipe_ingredient",
        recipeName: fixture.recipeName,
        ingredientType: "item",
        ingredientName: fixture.ingredientName,
        operation: fixture.operation,
      },
    ],
    assertions: [
      {
        type: "recipe_ingredient_matches",
        recipeName: fixture.recipeName,
        ingredientType: "item",
        ingredientName: fixture.ingredientName,
        expectation: fixture.operation,
      },
    ],
  };
}

const fixtures: readonly { name: string; spec: ModSpec }[] = [
  ...prototypeFixtures.map((fixture) => ({ name: fixture.name, spec: makePrototypeSpec(fixture) })),
  ...recipeFixtures.map((fixture) => ({ name: fixture.name, spec: makeRecipeSpec(fixture) })),
];

describe("deterministic ModSpec to validated ZIP", () => {
  it(
    "builds prototype and recipe artifacts through real Factorio",
    async () => {
      const outputDirectory = await mkdtemp(path.join(tmpdir(), "factorio-artifact-output-"));

      try {
        for (const fixture of fixtures) {
          const result = await buildValidatedFactorioArtifact({
            spec: fixture.spec,
            outputDirectory,
          });

          expect(
            result.validation.ok,
            `${fixture.name}: ${result.validation.summary ?? "unknown failure"}`,
          ).toBe(true);
          expect(result.validation.errorType).toBeNull();

          const zipBytes = await readFile(result.zipPath);
          const entries = Object.keys(unzipSync(zipBytes)).sort();
          expect(entries).toEqual([
            `${result.directoryName}/data.lua`,
            `${result.directoryName}/info.json`,
          ]);
          expect(entries.some((name) => name.includes("validator"))).toBe(false);
          expect(entries.some((name) => name.endsWith("data-final-fixes.lua"))).toBe(false);
        }
      } finally {
        await rm(outputDirectory, { recursive: true, force: true });
      }
    },
    60_000,
  );
});


describe("mixed tweak bundle through real Factorio", () => {
  it(
    "validates a multi-family fast-start bundle with expanded prototype targets",
    async () => {
      const outputDirectory = await mkdtemp(path.join(tmpdir(), "factorio-mixed-bundle-output-"));
      const spec: ModSpec = {
        title: "Fast start bundle",
        slug: "fast-start-bundle",
        target: { game: "factorio", channel: "stable", versionLine: "2.0" },
        capability: "mixed",
        changes: [
          { type: "prototype_property", prototypeType: "assembling-machine", prototypeName: "assembling-machine-2", property: "crafting_speed", operation: { type: "multiply", factor: 2 } },
          { type: "prototype_property", prototypeType: "transport-belt", prototypeName: "transport-belt", property: "speed", operation: { type: "multiply", factor: 1.5 } },
          { type: "prototype_property", prototypeType: "mining-drill", prototypeName: "electric-mining-drill", property: "mining_speed", operation: { type: "multiply", factor: 2 } },
          { type: "prototype_property", prototypeType: "lab", prototypeName: "lab", property: "researching_speed", operation: { type: "multiply", factor: 2 } },
          { type: "recipe_ingredient", recipeName: "iron-gear-wheel", ingredientType: "item", ingredientName: "iron-plate", operation: { type: "set", value: 1 } },
          { type: "technology_cost", technologyName: "automation", operation: { type: "multiply", factor: 0.5 } },
        ],
        assertions: [
          { type: "prototype_property_matches", prototypeType: "assembling-machine", prototypeName: "assembling-machine-2", property: "crafting_speed", expectation: { type: "multiply", factor: 2 } },
          { type: "prototype_property_matches", prototypeType: "transport-belt", prototypeName: "transport-belt", property: "speed", expectation: { type: "multiply", factor: 1.5 } },
          { type: "prototype_property_matches", prototypeType: "mining-drill", prototypeName: "electric-mining-drill", property: "mining_speed", expectation: { type: "multiply", factor: 2 } },
          { type: "prototype_property_matches", prototypeType: "lab", prototypeName: "lab", property: "researching_speed", expectation: { type: "multiply", factor: 2 } },
          { type: "recipe_ingredient_matches", recipeName: "iron-gear-wheel", ingredientType: "item", ingredientName: "iron-plate", expectation: { type: "set", value: 1 } },
          { type: "technology_cost_matches", technologyName: "automation", expectation: { type: "multiply", factor: 0.5 } },
        ],
      };

      try {
        const result = await buildValidatedFactorioArtifact({ spec, outputDirectory });
        expect(result.validation.ok, result.validation.summary ?? "unknown failure").toBe(true);
        expect(result.validation.errorType).toBeNull();
        const zipBytes = await readFile(result.zipPath);
        expect(Object.keys(unzipSync(zipBytes)).sort()).toEqual([
          `${result.directoryName}/data.lua`,
          `${result.directoryName}/info.json`,
        ]);
      } finally {
        await rm(outputDirectory, { recursive: true, force: true });
      }
    },
    60_000,
  );
});

describe("M6A high-value rebalance primitives through real Factorio", () => {
  it(
    "validates recipe crafting time, recipe result amount, and item stack size in one mixed bundle",
    async () => {
      const outputDirectory = await mkdtemp(path.join(tmpdir(), "factorio-m6a-primitives-output-"));
      const spec: ModSpec = {
        title: "Compact early-game rebalance",
        slug: "compact-early-game-rebalance",
        target: { game: "factorio", channel: "stable", versionLine: "2.0" },
        capability: "mixed",
        changes: [
          { type: "recipe_crafting_time", recipeName: "iron-gear-wheel", operation: { type: "multiply", factor: 0.5 } },
          { type: "recipe_result", recipeName: "transport-belt", resultType: "item", resultName: "transport-belt", operation: { type: "multiply", factor: 2 } },
          { type: "item_stack_size", itemName: "electronic-circuit", operation: { type: "set", value: 500 } },
        ],
        assertions: [
          { type: "recipe_crafting_time_matches", recipeName: "iron-gear-wheel", expectation: { type: "multiply", factor: 0.5 } },
          { type: "recipe_result_matches", recipeName: "transport-belt", resultType: "item", resultName: "transport-belt", expectation: { type: "multiply", factor: 2 } },
          { type: "item_stack_size_matches", itemName: "electronic-circuit", expectation: { type: "set", value: 500 } },
        ],
      };
      try {
        const result = await buildValidatedFactorioArtifact({ spec, outputDirectory });
        expect(result.validation.ok, result.validation.summary ?? "unknown failure").toBe(true);
        expect(result.validation.errorType).toBeNull();
      } finally {
        await rm(outputDirectory, { recursive: true, force: true });
      }
    },
    30_000,
  );
});


describe("M6B new content machine through real Factorio", () => {
  it("creates and semantically validates a new furnace, item, recipe, and technology", async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "factorio-new-machine-output-"));
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
    try {
      const result = await buildValidatedFactorioArtifact({ spec, outputDirectory });
      expect(result.validation.ok, result.validation.summary ?? "unknown failure").toBe(true);
      expect(result.validation.errorType).toBeNull();
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  }, 30_000);


  it("creates multiple reviewed machine types with their native speed properties", async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "factorio-new-machine-types-output-"));
    const defs = [
      { machineType: "mining-drill", basePrototypeName: "electric-mining-drill", name: "custom-precision-drill", displayName: "Precision Drill", speed: 1, energyUsageKw: 140, moduleSlots: 3, itemStackSize: 50, recipeCraftingTime: 6, recipeIngredients: [{ itemName: "electric-mining-drill", amount: 1 }, { itemName: "processing-unit", amount: 5 }], unlock: { type: "existing_technology", technologyName: "mining-productivity-1" } },
      { machineType: "lab", basePrototypeName: "lab", name: "custom-fast-lab", displayName: "Fast Lab", speed: 2, energyUsageKw: 120, moduleSlots: 2, itemStackSize: 20, recipeCraftingTime: 6, recipeIngredients: [{ itemName: "lab", amount: 1 }, { itemName: "advanced-circuit", amount: 5 }], unlock: { type: "existing_technology", technologyName: "research-speed-1" } },
      { machineType: "assembling-machine", basePrototypeName: "chemical-plant", name: "custom-rapid-chemical-plant", displayName: "Rapid Chemical Plant", speed: 2, energyUsageKw: 420, moduleSlots: 3, itemStackSize: 20, recipeCraftingTime: 8, recipeIngredients: [{ itemName: "chemical-plant", amount: 1 }, { itemName: "processing-unit", amount: 5 }], unlock: { type: "existing_technology", technologyName: "oil-processing" } },
      { machineType: "assembling-machine", basePrototypeName: "centrifuge", name: "custom-rapid-centrifuge", displayName: "Rapid Centrifuge", speed: 2, energyUsageKw: 700, moduleSlots: 2, itemStackSize: 20, recipeCraftingTime: 10, recipeIngredients: [{ itemName: "centrifuge", amount: 1 }, { itemName: "processing-unit", amount: 10 }], unlock: { type: "existing_technology", technologyName: "uranium-processing" } },
    ] as const;
    const spec = {
      title: "Advanced production machines", slug: "advanced-production-machines",
      target: { game: "factorio", channel: "stable", versionLine: "2.0" }, capability: "new_machine",
      changes: defs.map((definition) => ({ type: "new_machine" as const, ...definition })),
      assertions: defs.map((definition) => ({ type: "new_machine_matches" as const, ...definition })),
    } as unknown as ModSpec;
    try {
      const result = await buildValidatedFactorioArtifact({ spec, outputDirectory });
      expect(result.validation.ok, result.validation.summary ?? "unknown failure").toBe(true);
      expect(result.validation.errorType).toBeNull();
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  }, 30_000);

  it("creates an upgraded assembler using the base machine in its recipe and an existing technology unlock", async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "factorio-new-assembler-output-"));
    const spec: ModSpec = {
      title: "Precision assembler", slug: "precision-assembler",
      target: { game: "factorio", channel: "stable", versionLine: "2.0" }, capability: "new_machine",
      changes: [{ type: "new_machine", machineType: "assembling-machine", basePrototypeName: "assembling-machine-3", name: "custom-precision-assembler", displayName: "Precision Assembler", speed: 2.5, energyUsageKw: 500, moduleSlots: 4, itemStackSize: 50, recipeCraftingTime: 8, recipeIngredients: [{ itemName: "assembling-machine-3", amount: 1 }, { itemName: "processing-unit", amount: 10 }, { itemName: "electric-engine-unit", amount: 5 }], unlock: { type: "existing_technology", technologyName: "production-science-pack" } }],
      assertions: [{ type: "new_machine_matches", machineType: "assembling-machine", basePrototypeName: "assembling-machine-3", name: "custom-precision-assembler", displayName: "Precision Assembler", speed: 2.5, energyUsageKw: 500, moduleSlots: 4, itemStackSize: 50, recipeCraftingTime: 8, recipeIngredients: [{ itemName: "assembling-machine-3", amount: 1 }, { itemName: "processing-unit", amount: 10 }, { itemName: "electric-engine-unit", amount: 5 }], unlock: { type: "existing_technology", technologyName: "production-science-pack" } }],
    };
    try {
      const result = await buildValidatedFactorioArtifact({ spec, outputDirectory });
      expect(result.validation.ok, result.validation.summary ?? "unknown failure").toBe(true);
      expect(result.validation.errorType).toBeNull();
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  }, 30_000);
});


describe("M6B new alternative recipe through real Factorio", () => {
  it("creates and semantically validates an alternative recipe and technology unlock", async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "factorio-new-recipe-output-"));
    const spec: ModSpec = {
      title: "Steel gears recipe", slug: "steel-gears-recipe",
      target: { game: "factorio", channel: "stable", versionLine: "2.0" }, capability: "new_recipe",
      changes: [{ type: "new_recipe", name: "custom-steel-gears", displayName: "Steel Gears", energyRequired: 1, ingredients: [{ itemName: "steel-plate", amount: 1 }], resultItemName: "iron-gear-wheel", resultAmount: 5, unlock: { type: "existing_technology", technologyName: "steel-processing" } }],
      assertions: [{ type: "new_recipe_matches", name: "custom-steel-gears", displayName: "Steel Gears", energyRequired: 1, ingredients: [{ itemName: "steel-plate", amount: 1 }], resultItemName: "iron-gear-wheel", resultAmount: 5, unlock: { type: "existing_technology", technologyName: "steel-processing" } }],
    };
    try {
      const result = await buildValidatedFactorioArtifact({ spec, outputDirectory });
      expect(result.validation.ok, result.validation.summary ?? "unknown failure").toBe(true);
      expect(result.validation.errorType).toBeNull();
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  }, 30_000);

  it("creates a new technology for an alternative recipe and validates its research definition", async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "factorio-new-recipe-tech-output-"));
    const spec: ModSpec = {
      title: "Compact processing units", slug: "compact-processing-units",
      target: { game: "factorio", channel: "stable", versionLine: "2.0" }, capability: "new_recipe",
      changes: [{ type: "new_recipe", name: "custom-compact-processing-units", displayName: "Compact Processing Units", energyRequired: 5, ingredients: [{ itemName: "advanced-circuit", amount: 5 }, { itemName: "electronic-circuit", amount: 10 }], resultItemName: "processing-unit", resultAmount: 2, unlock: { type: "new_technology", displayName: "Compact Processing", prerequisites: ["production-science-pack"], scienceTier: "production", count: 200, time: 30 } }],
      assertions: [{ type: "new_recipe_matches", name: "custom-compact-processing-units", displayName: "Compact Processing Units", energyRequired: 5, ingredients: [{ itemName: "advanced-circuit", amount: 5 }, { itemName: "electronic-circuit", amount: 10 }], resultItemName: "processing-unit", resultAmount: 2, unlock: { type: "new_technology", displayName: "Compact Processing", prerequisites: ["production-science-pack"], scienceTier: "production", count: 200, time: 30 } }],
    };
    try {
      const result = await buildValidatedFactorioArtifact({ spec, outputDirectory });
      expect(result.validation.ok, result.validation.summary ?? "unknown failure").toBe(true);
      expect(result.validation.errorType).toBeNull();
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  }, 30_000);
});


describe("M6B new intermediate item through real Factorio", () => {
  it("creates a custom material with a new research definition", async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "factorio-new-item-tech-output-"));
    const spec: ModSpec = {
      title: "Reinforced plate research", slug: "reinforced-plate-research",
      target: { game: "factorio", channel: "stable", versionLine: "2.0" }, capability: "new_item",
      changes: [{ type: "new_item", baseItemName: "steel-plate", name: "custom-reinforced-plate", displayName: "Reinforced Plate", stackSize: 100, recipeCraftingTime: 2, recipeIngredients: [{ itemName: "steel-plate", amount: 2 }, { itemName: "plastic-bar", amount: 5 }], recipeResultAmount: 1, unlock: { type: "new_technology", displayName: "Reinforced Materials", prerequisites: ["advanced-material-processing-2"], scienceTier: "chemical", count: 150, time: 30 } }],
      assertions: [{ type: "new_item_matches", baseItemName: "steel-plate", name: "custom-reinforced-plate", displayName: "Reinforced Plate", stackSize: 100, recipeCraftingTime: 2, recipeIngredients: [{ itemName: "steel-plate", amount: 2 }, { itemName: "plastic-bar", amount: 5 }], recipeResultAmount: 1, unlock: { type: "new_technology", displayName: "Reinforced Materials", prerequisites: ["advanced-material-processing-2"], scienceTier: "chemical", count: 150, time: 30 } }],
    };
    try {
      const result = await buildValidatedFactorioArtifact({ spec, outputDirectory });
      expect(result.validation.ok, result.validation.summary ?? "unknown failure").toBe(true);
      expect(result.validation.errorType).toBeNull();
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("M6B custom material alternative recipe through real Factorio", () => {
  it("uses a same-bundle custom material in a new alternative recipe", async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "factorio-custom-item-recipe-output-"));
    const spec: ModSpec = {
      title: "Reinforced gear progression", slug: "reinforced-gear-progression",
      target: { game: "factorio", channel: "stable", versionLine: "2.0" }, capability: "mixed",
      changes: [
        { type: "new_item", baseItemName: "steel-plate", name: "custom-reinforced-plate", displayName: "Reinforced Plate", stackSize: 100, recipeCraftingTime: 2, recipeIngredients: [{ itemName: "steel-plate", amount: 2 }, { itemName: "plastic-bar", amount: 5 }], recipeResultAmount: 1, unlock: { type: "existing_technology", technologyName: "advanced-material-processing-2" } },
        { type: "new_recipe", name: "custom-reinforced-gears", displayName: "Reinforced Gears", energyRequired: 1, ingredients: [{ itemName: "custom-reinforced-plate", amount: 1 }], resultItemName: "iron-gear-wheel", resultAmount: 5, unlock: { type: "existing_technology", technologyName: "advanced-material-processing-2" } },
      ],
      assertions: [
        { type: "new_item_matches", baseItemName: "steel-plate", name: "custom-reinforced-plate", displayName: "Reinforced Plate", stackSize: 100, recipeCraftingTime: 2, recipeIngredients: [{ itemName: "steel-plate", amount: 2 }, { itemName: "plastic-bar", amount: 5 }], recipeResultAmount: 1, unlock: { type: "existing_technology", technologyName: "advanced-material-processing-2" } },
        { type: "new_recipe_matches", name: "custom-reinforced-gears", displayName: "Reinforced Gears", energyRequired: 1, ingredients: [{ itemName: "custom-reinforced-plate", amount: 1 }], resultItemName: "iron-gear-wheel", resultAmount: 5, unlock: { type: "existing_technology", technologyName: "advanced-material-processing-2" } },
      ],
    };
    try {
      const result = await buildValidatedFactorioArtifact({ spec, outputDirectory });
      expect(result.validation.ok, result.validation.summary ?? "unknown failure").toBe(true);
      expect(result.validation.errorType).toBeNull();
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("M6B custom material content tree through real Factorio", () => {
  it("creates a new intermediate item and uses it in a new machine recipe", async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "factorio-content-tree-output-"));
    const spec: ModSpec = {
      title: "Reinforced furnace progression", slug: "reinforced-furnace-progression",
      target: { game: "factorio", channel: "stable", versionLine: "2.0" }, capability: "mixed",
      changes: [
        { type: "new_item", baseItemName: "steel-plate", name: "custom-reinforced-plate", displayName: "Reinforced Plate", stackSize: 100, recipeCraftingTime: 2, recipeIngredients: [{ itemName: "steel-plate", amount: 2 }, { itemName: "plastic-bar", amount: 5 }], recipeResultAmount: 1, unlock: { type: "existing_technology", technologyName: "advanced-material-processing-2" } },
        { type: "new_machine", machineType: "furnace", basePrototypeName: "electric-furnace", name: "custom-reinforced-furnace", displayName: "Reinforced Furnace", speed: 4, energyUsageKw: 500, moduleSlots: 4, itemStackSize: 50, recipeCraftingTime: 6, recipeIngredients: [{ itemName: "electric-furnace", amount: 1 }, { itemName: "custom-reinforced-plate", amount: 10 }, { itemName: "processing-unit", amount: 5 }], unlock: { type: "existing_technology", technologyName: "advanced-material-processing-2" } },
      ],
      assertions: [
        { type: "new_item_matches", baseItemName: "steel-plate", name: "custom-reinforced-plate", displayName: "Reinforced Plate", stackSize: 100, recipeCraftingTime: 2, recipeIngredients: [{ itemName: "steel-plate", amount: 2 }, { itemName: "plastic-bar", amount: 5 }], recipeResultAmount: 1, unlock: { type: "existing_technology", technologyName: "advanced-material-processing-2" } },
        { type: "new_machine_matches", machineType: "furnace", basePrototypeName: "electric-furnace", name: "custom-reinforced-furnace", displayName: "Reinforced Furnace", speed: 4, energyUsageKw: 500, moduleSlots: 4, itemStackSize: 50, recipeCraftingTime: 6, recipeIngredients: [{ itemName: "electric-furnace", amount: 1 }, { itemName: "custom-reinforced-plate", amount: 10 }, { itemName: "processing-unit", amount: 5 }], unlock: { type: "existing_technology", technologyName: "advanced-material-processing-2" } },
      ],
    };
    try {
      const result = await buildValidatedFactorioArtifact({ spec, outputDirectory });
      expect(result.validation.ok, result.validation.summary ?? "unknown failure").toBe(true);
      expect(result.validation.errorType).toBeNull();
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  }, 30_000);

  it("creates a new intermediate item and uses it in a new alternative recipe", async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "factorio-content-recipe-tree-output-"));
    const spec: ModSpec = {
      title: "Reinforced gear progression", slug: "reinforced-gear-progression",
      target: { game: "factorio", channel: "stable", versionLine: "2.0" }, capability: "mixed",
      changes: [
        { type: "new_item", baseItemName: "steel-plate", name: "custom-reinforced-plate", displayName: "Reinforced Plate", stackSize: 100, recipeCraftingTime: 2, recipeIngredients: [{ itemName: "steel-plate", amount: 2 }, { itemName: "plastic-bar", amount: 5 }], recipeResultAmount: 1, unlock: { type: "existing_technology", technologyName: "advanced-material-processing-2" } },
        { type: "new_recipe", name: "custom-reinforced-gears", displayName: "Reinforced Gears", energyRequired: 2, ingredients: [{ itemName: "custom-reinforced-plate", amount: 1 }, { itemName: "iron-gear-wheel", amount: 2 }], resultItemName: "iron-gear-wheel", resultAmount: 6, unlock: { type: "existing_technology", technologyName: "advanced-material-processing-2" } },
      ],
      assertions: [
        { type: "new_item_matches", baseItemName: "steel-plate", name: "custom-reinforced-plate", displayName: "Reinforced Plate", stackSize: 100, recipeCraftingTime: 2, recipeIngredients: [{ itemName: "steel-plate", amount: 2 }, { itemName: "plastic-bar", amount: 5 }], recipeResultAmount: 1, unlock: { type: "existing_technology", technologyName: "advanced-material-processing-2" } },
        { type: "new_recipe_matches", name: "custom-reinforced-gears", displayName: "Reinforced Gears", energyRequired: 2, ingredients: [{ itemName: "custom-reinforced-plate", amount: 1 }, { itemName: "iron-gear-wheel", amount: 2 }], resultItemName: "iron-gear-wheel", resultAmount: 6, unlock: { type: "existing_technology", technologyName: "advanced-material-processing-2" } },
      ],
    };
    try {
      const result = await buildValidatedFactorioArtifact({ spec, outputDirectory });
      expect(result.validation.ok, result.validation.summary ?? "unknown failure").toBe(true);
      expect(result.validation.errorType).toBeNull();
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  }, 30_000);

});
