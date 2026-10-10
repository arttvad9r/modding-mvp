import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ModSpec } from "@project/domain";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { buildValidatedFactorioArtifact } from "../src/index.js";

interface Fixture {
  readonly name: string;
  readonly prototypeName: "stone-furnace" | "steel-furnace" | "electric-furnace";
  readonly operation: ModSpec["changes"][number]["operation"];
}

const fixtures: readonly Fixture[] = [
  { name: "steel-double", prototypeName: "steel-furnace", operation: { type: "multiply", factor: 2 } },
  { name: "stone-double", prototypeName: "stone-furnace", operation: { type: "multiply", factor: 2 } },
  { name: "electric-one-half", prototypeName: "electric-furnace", operation: { type: "multiply", factor: 1.5 } },
  { name: "steel-set-three", prototypeName: "steel-furnace", operation: { type: "set", value: 3 } },
  { name: "stone-set-half", prototypeName: "stone-furnace", operation: { type: "set", value: 0.5 } },
];

function makeSpec(fixture: Fixture): ModSpec {
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

describe("deterministic ModSpec to validated ZIP", () => {
  it(
    "builds five installable artifacts through real Factorio",
    async () => {
      const outputDirectory = await mkdtemp(path.join(tmpdir(), "factorio-artifact-output-"));

      try {
        for (const fixture of fixtures) {
          const result = await buildValidatedFactorioArtifact({
            spec: makeSpec(fixture),
            outputDirectory,
          });

          expect(result.validation.ok, `${fixture.name}: ${result.validation.summary ?? "unknown failure"}`).toBe(true);
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
    30_000,
  );
});
