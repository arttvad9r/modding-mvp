import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { TechnologyPrerequisiteModSpec } from "@project/domain";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { buildValidatedFactorioArtifact } from "../src/index.js";

interface Fixture {
  readonly name: string;
  readonly technologyName: string;
  readonly prerequisiteName: string;
  readonly operation: "add" | "remove";
}

const fixtures: readonly Fixture[] = [
  { name: "automation-two-remove-steel", technologyName: "automation-2", prerequisiteName: "steel-processing", operation: "remove" },
  { name: "logistics-two-remove-logistics", technologyName: "logistics-2", prerequisiteName: "logistics", operation: "remove" },
  { name: "advanced-material-remove-logistic-science", technologyName: "advanced-material-processing", prerequisiteName: "logistic-science-pack", operation: "remove" },
  { name: "automation-two-add-logistics", technologyName: "automation-2", prerequisiteName: "logistics", operation: "add" },
  { name: "advanced-material-add-logistics", technologyName: "advanced-material-processing", prerequisiteName: "logistics", operation: "add" },
];

function makeSpec(fixture: Fixture): TechnologyPrerequisiteModSpec {
  return {
    title: `Integration ${fixture.name}`,
    slug: `integration-${fixture.name}`,
    target: { game: "factorio", channel: "stable", versionLine: "2.0" },
    capability: "technology_prerequisite",
    changes: [
      {
        type: "technology_prerequisite",
        technologyName: fixture.technologyName,
        prerequisiteName: fixture.prerequisiteName,
        operation: { type: fixture.operation },
      },
    ],
    assertions: [
      {
        type: "technology_prerequisite_matches",
        technologyName: fixture.technologyName,
        prerequisiteName: fixture.prerequisiteName,
        expectation: { type: fixture.operation },
      },
    ],
  };
}

describe("technology_prerequisite validated ZIP", () => {
  it(
    "builds five prerequisite artifacts through real Factorio",
    async () => {
      const outputDirectory = await mkdtemp(path.join(tmpdir(), "factorio-prerequisite-output-"));
      try {
        for (const fixture of fixtures) {
          const result = await buildValidatedFactorioArtifact({
            spec: makeSpec(fixture),
            outputDirectory,
          });
          expect(result.validation.ok, `${fixture.name}: ${result.validation.summary ?? "unknown failure"}`).toBe(true);
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
