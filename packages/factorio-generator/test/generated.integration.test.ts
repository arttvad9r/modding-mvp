import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ModSpec } from "@project/domain";
import { runFactorioModTest } from "@project/factorio-harness";
import { describe, expect, it } from "vitest";

import { generateFactorioMod } from "../src/index.js";

interface Fixture {
  readonly name: string;
  readonly prototypeName: "stone-furnace" | "steel-furnace" | "electric-furnace";
  readonly operation: ModSpec["changes"][number]["operation"];
}

const fixtures: readonly Fixture[] = [
  { name: "steel-double", prototypeName: "steel-furnace", operation: { type: "multiply", factor: 2 } },
  { name: "stone-double", prototypeName: "stone-furnace", operation: { type: "multiply", factor: 2 } },
  { name: "electric-half-again", prototypeName: "electric-furnace", operation: { type: "multiply", factor: 1.5 } },
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

async function materialize(spec: ModSpec, root: string): Promise<string> {
  const generated = generateFactorioMod(spec);
  const modPath = path.join(root, generated.directoryName);
  await mkdir(modPath, { recursive: true });
  await writeFile(path.join(modPath, "info.json"), generated.infoJson, "utf8");
  await writeFile(path.join(modPath, "data.lua"), generated.dataLua, "utf8");
  return modPath;
}

describe("generated Factorio mods", () => {
  it(
    "passes five deterministic ModSpec fixtures through real Factorio",
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), "factorio-generated-integration-"));

      try {
        for (const fixture of fixtures) {
          const modPath = await materialize(makeSpec(fixture), root);
          const generated = generateFactorioMod(makeSpec(fixture));
        const result = await runFactorioModTest({
          modPath,
          semanticAssertionLua: generated.semanticAssertionLua,
        });
          expect(
            result.ok,
            `${fixture.name}: ${result.summary ?? "unknown failure"}`,
          ).toBe(true);
          expect(result.errorType).toBeNull();
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
