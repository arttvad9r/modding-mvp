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
