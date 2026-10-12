import {
  serializeProjectError,
  type GeneratedFileManifest,
  type ModSpec,
  type SerializedProjectError,
} from "@project/domain";
import {
  generateFactorioMod,
  validateGeneratedFactorioMod,
  validateRepairedFactorioMod,
  type GeneratedFactorioMod,
} from "@project/factorio-generator";
import type { LlmJsonRequest, LlmJsonResponse, LlmProvider } from "@project/llm";
import { describe, expect, it } from "vitest";

import { repairFactorioManifest } from "../src/index.js";

class FixedRepairProvider implements LlmProvider {
  readonly requests: LlmJsonRequest[] = [];

  constructor(private readonly dataLua: string) {}

  async generateJson(request: LlmJsonRequest): Promise<LlmJsonResponse> {
    this.requests.push(request);
    return {
      value: { dataLua: this.dataLua },
      provider: "fake-repair",
      model: "fake-repair-model",
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      durationMs: 1,
    };
  }
}

const spec: ModSpec = {
  title: "Repair integration steel furnace",
  slug: "repair-integration-steel-furnace",
  target: { game: "factorio", channel: "stable", versionLine: "2.0" },
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
};

function replaceDataLua(
  generated: GeneratedFactorioMod,
  dataLua: string,
): GeneratedFactorioMod {
  const manifest: GeneratedFileManifest = {
    files: generated.manifest.files.map((file) =>
      file.path === "data.lua" ? { ...file, content: dataLua } : file,
    ),
  };
  return { ...generated, manifest };
}

async function captureValidationFailure(
  generated: GeneratedFactorioMod,
): Promise<SerializedProjectError> {
  try {
    await validateGeneratedFactorioMod({ generated });
  } catch (error) {
    return serializeProjectError(error);
  }
  throw new Error("Expected Factorio validation to fail");
}

describe("Repair loop against real Factorio", () => {
  it("repairs both load and semantic failures while keeping original assertions authoritative", async () => {
    const correct = generateFactorioMod(spec);
    const correctDataLua = correct.manifest.files.find((file) => file.path === "data.lua")?.content;
    if (!correctDataLua) throw new Error("Generated fixture lacks data.lua");

    const fixtures = [
      {
        expectedCode: "factorio_load_failed",
        generated: replaceDataLua(correct, 'error("synthetic repair load failure")\n'),
      },
      {
        expectedCode: "semantic_assertion_failed",
        generated: replaceDataLua(correct, "-- syntactically valid but intentionally misses requested mutation\n"),
      },
    ] as const;

    for (const fixture of fixtures) {
      const failure = await captureValidationFailure(fixture.generated);
      expect(failure.code).toBe(fixture.expectedCode);

      const provider = new FixedRepairProvider(correctDataLua);
      const result = await repairFactorioManifest({
        provider,
        spec,
        priorManifest: fixture.generated.manifest,
        failure,
        validateCandidate: async ({ spec: acceptedSpec, manifest }) =>
          validateRepairedFactorioMod({ spec: acceptedSpec, generated: { ...correct, manifest } }),
      });

      expect(result.status).toBe("repaired");
      if (result.status !== "repaired") throw new Error("Expected repaired result");
      expect(result.validation.ok).toBe(true);
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0]?.outcome).toBe("validated");
      expect(provider.requests).toHaveLength(1);
      expect(result.manifest.files.find((file) => file.path === "info.json")?.content).toBe(
        correct.manifest.files.find((file) => file.path === "info.json")?.content,
      );
    }
  }, 120_000);

  it("does not accept a repair that passes assertions but also changes unrequested prototypes", async () => {
    const correct = generateFactorioMod(spec);
    const correctDataLua = correct.manifest.files.find((file) => file.path === "data.lua")?.content;
    if (!correctDataLua) throw new Error("Generated fixture lacks data.lua");
    const broken = replaceDataLua(correct, "-- intentionally misses requested mutation\n");
    const failure = await captureValidationFailure(broken);

    const overreachingLua = `${correctDataLua}\ndata.raw["furnace"]["stone-furnace"].crafting_speed = 100\n`;
    const validatorAwareLua = `${correctDataLua}\nif not mods["zz-project-semantic-validator"] then data.raw["furnace"]["steel-furnace"].crafting_speed = 99 end\n`;
    for (const candidate of [overreachingLua, validatorAwareLua]) {
      const provider = new FixedRepairProvider(candidate);
      const result = await repairFactorioManifest({
        provider,
        spec,
        priorManifest: broken.manifest,
        failure,
        maxAttempts: 1,
        validateCandidate: async ({ spec: acceptedSpec, manifest }) =>
          validateRepairedFactorioMod({ spec: acceptedSpec, generated: { ...correct, manifest } }),
      });

      expect(result.status).toBe("failed");
      if (result.status !== "failed") throw new Error("Expected integrity failure");
      expect(result.error.code).toBe("semantic_assertion_failed");
      expect(result.attempts[0]?.outcome).toBe("validation_failed");
    }
  }, 120_000);
});
