import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ModSpecSchema,
  ProjectError,
  type GeneratedFileManifest,
  type ModChange,
  type ModSpec,
} from "@project/domain";
import { describe, expect, it } from "vitest";

import {
  generateFactorioMod,
  validateGeneratedFactorioMod,
  validateRepairedFactorioMod,
  type GeneratedFactorioMod,
} from "../src/index.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

interface GoldenCase {
  readonly id: string;
  readonly expected: { readonly status: string; readonly capability?: ModSpec["capability"]; readonly changes?: ModChange[] };
}

function assertionFor(change: ModChange): unknown {
  const { type, ...fields } = change;
  if ("operation" in fields) {
    const { operation, ...address } = fields;
    return { type: `${type}_matches`, ...address, expectation: operation };
  }
  return { type: `${type}_matches`, ...fields };
}

async function goldenSpecs(): Promise<ModSpec[]> {
  const cases = JSON.parse(
    await readFile(path.join(repositoryRoot, "evals/planner/golden.json"), "utf8"),
  ) as GoldenCase[];
  return cases
    .filter((testCase) => testCase.expected.status === "supported")
    .map((testCase) =>
      ModSpecSchema.parse({
        title: `Integrity ${testCase.id}`,
        slug: `integrity-${testCase.id}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, ""),
        target: { game: "factorio", channel: "stable", versionLine: "2.0" },
        capability: testCase.expected.capability,
        changes: testCase.expected.changes,
        assertions: testCase.expected.changes?.map(assertionFor),
      }),
    );
}

const steelFurnaceSpec = ModSpecSchema.parse({
  title: "Integrity steel furnace",
  slug: "integrity-steel-furnace",
  target: { game: "factorio", channel: "stable", versionLine: "2.0" },
  capability: "prototype_property",
  changes: [{
    type: "prototype_property",
    prototypeType: "furnace",
    prototypeName: "steel-furnace",
    property: "crafting_speed",
    operation: { type: "multiply", factor: 2 },
  }],
  assertions: [{
    type: "prototype_property_matches",
    prototypeType: "furnace",
    prototypeName: "steel-furnace",
    property: "crafting_speed",
    expectation: { type: "multiply", factor: 2 },
  }],
});

function withDataLua(generated: GeneratedFactorioMod, append: string): GeneratedFactorioMod {
  const manifest: GeneratedFileManifest = {
    files: generated.manifest.files.map((file) =>
      file.path === "data.lua" ? { ...file, content: `${file.content}\n${append}\n` } : file,
    ),
  };
  return { ...generated, manifest };
}

async function captureFailure(promise: Promise<unknown>): Promise<ProjectError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectError);
    return error as ProjectError;
  }
  throw new Error("Expected repaired-candidate validation to fail");
}

describe("repaired candidate integrity against real Factorio", () => {
  it("accepts every deterministic golden-spec artifact without false footprint violations", async () => {
    const specs = await goldenSpecs();
    expect(specs.length).toBeGreaterThanOrEqual(30);
    for (const spec of specs) {
      const generated = generateFactorioMod(spec);
      await expect(validateRepairedFactorioMod({ spec, generated }), spec.slug).resolves.toMatchObject({ ok: true });
    }
  }, 600_000);

  it("rejects a repair that passes assertions but changes an unrequested prototype", async () => {
    const generated = withDataLua(
      generateFactorioMod(steelFurnaceSpec),
      'data.raw["furnace"]["stone-furnace"].crafting_speed = 100',
    );
    await expect(validateGeneratedFactorioMod({ generated })).resolves.toMatchObject({ ok: true });

    const failure = await captureFailure(validateRepairedFactorioMod({ spec: steelFurnaceSpec, generated }));
    expect(failure.code).toBe("semantic_assertion_failed");
    expect(failure.message).toContain("outside the accepted ModSpec");
    expect(failure.message).toContain("furnace/stone-furnace.crafting_speed");
  }, 120_000);

  it("rejects a repair that behaves differently when the companion validator is absent", async () => {
    const generated = withDataLua(
      generateFactorioMod(steelFurnaceSpec),
      'if not mods["zz-project-semantic-validator"] then data.raw["furnace"]["steel-furnace"].crafting_speed = 99 end',
    );
    await expect(validateGeneratedFactorioMod({ generated })).resolves.toMatchObject({ ok: true });

    const failure = await captureFailure(validateRepairedFactorioMod({ spec: steelFurnaceSpec, generated }));
    expect(failure.code).toBe("semantic_assertion_failed");
    expect(failure.message).toContain("semantic validator is absent");
    expect(failure.message).toContain("furnace/steel-furnace.crafting_speed");
  }, 120_000);

  it("rejects a repair that replaces an existing base-game prototype", async () => {
    const generated = withDataLua(
      generateFactorioMod(steelFurnaceSpec),
      'local copy = table.deepcopy(data.raw["item"]["iron-plate"]) copy.stack_size = 1000 data:extend({copy})',
    );
    const failure = await captureFailure(validateRepairedFactorioMod({ spec: steelFurnaceSpec, generated }));
    expect(failure.code).toBe("semantic_assertion_failed");
    expect(failure.message).toContain("item/iron-plate.stack_size");
  }, 120_000);
});
