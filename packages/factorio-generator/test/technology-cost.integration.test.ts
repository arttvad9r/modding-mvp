import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ScalarOperation, TechnologyCostModSpec } from "@project/domain";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { buildValidatedFactorioArtifact } from "../src/index.js";

interface Fixture {
  readonly name: string;
  readonly technologyName:
    | "automation"
    | "automation-2"
    | "logistics"
    | "steel-processing"
    | "logistic-science-pack";
  readonly operation: ScalarOperation;
}

const fixtures: readonly Fixture[] = [
  { name: "automation-double", technologyName: "automation", operation: { type: "multiply", factor: 2 } },
  { name: "automation-two-set", technologyName: "automation-2", operation: { type: "set", value: 20 } },
  { name: "logistics-double", technologyName: "logistics", operation: { type: "multiply", factor: 2 } },
  { name: "steel-processing-double", technologyName: "steel-processing", operation: { type: "multiply", factor: 2 } },
  { name: "logistic-science-set", technologyName: "logistic-science-pack", operation: { type: "set", value: 50 } },
];

function makeSpec(fixture: Fixture): TechnologyCostModSpec {
  return {
    title: `Integration ${fixture.name}`,
    slug: `integration-${fixture.name}`,
    target: { game: "factorio", channel: "stable", versionLine: "2.0" },
    capability: "technology_cost",
    changes: [
      {
        type: "technology_cost",
        technologyName: fixture.technologyName,
        operation: fixture.operation,
      },
    ],
    assertions: [
      {
        type: "technology_cost_matches",
        technologyName: fixture.technologyName,
        expectation: fixture.operation,
      },
    ],
  };
}

describe("technology_cost validated ZIP", () => {
  it(
    "builds five technology artifacts through real Factorio",
    async () => {
      const outputDirectory = await mkdtemp(path.join(tmpdir(), "factorio-tech-output-"));

      try {
        for (const fixture of fixtures) {
          const result = await buildValidatedFactorioArtifact({
            spec: makeSpec(fixture),
            outputDirectory,
          });

          expect(result.validation.ok, `${fixture.name}: ${result.validation.summary ?? "unknown failure"}`).toBe(true);
          expect(result.validation.errorType).toBeNull();

          const entries = Object.keys(unzipSync(await readFile(result.zipPath))).sort();
          expect(entries).toEqual([
            `${result.directoryName}/data.lua`,
            `${result.directoryName}/info.json`,
          ]);
        }
      } finally {
        await rm(outputDirectory, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
