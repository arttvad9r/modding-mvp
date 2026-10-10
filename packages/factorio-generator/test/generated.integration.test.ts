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
