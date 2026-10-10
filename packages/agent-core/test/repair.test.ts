import {
  ProjectError,
  type GeneratedFileManifest,
  type ModSpec,
  type SerializedProjectError,
} from "@project/domain";
import type { LlmJsonRequest, LlmJsonResponse, LlmProvider } from "@project/llm";
import { describe, expect, it } from "vitest";

import { buildRepairSystemPrompt, repairFactorioManifest } from "../src/index.js";

class SequenceProvider implements LlmProvider {
  readonly requests: LlmJsonRequest[] = [];
  private index = 0;

  constructor(private readonly responses: readonly (LlmJsonResponse | Error)[]) {}

  async generateJson(request: LlmJsonRequest): Promise<LlmJsonResponse> {
    this.requests.push(request);
    const response = this.responses[this.index];
    this.index += 1;
    if (!response) throw new Error("No fake response configured");
    if (response instanceof Error) throw response;
    return response;
  }
}

function response(value: unknown, inputTokens = 30, outputTokens = 15): LlmJsonResponse {
  return {
    value,
    provider: "fake-repair",
    model: "fake-model",
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCostUsd: 0.002,
    },
    durationMs: 7,
  };
}

const spec: ModSpec = {
  title: "Faster steel furnace",
  slug: "faster-steel-furnace",
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

const priorManifest: GeneratedFileManifest = {
  files: [
    {
      path: "info.json",
      role: "metadata",
      content: '{"name":"faster-steel-furnace"}\n',
    },
    {
      path: "data.lua",
      role: "data_stage",
      content: 'error("broken generated lua")\n',
    },
  ],
};

const loadFailure: SerializedProjectError = {
  code: "factorio_load_failed",
  stage: "validation",
  message: "data.lua:1: broken generated lua",
  retryable: false,
};

const semanticFailure: SerializedProjectError = {
  code: "semantic_assertion_failed",
  stage: "validation",
  message: "expected=4 actual=2",
  retryable: false,
};

const fixedLua = [
  "do",
  '  local prototype = data.raw["furnace"]["steel-furnace"]',
  "  prototype[\"crafting_speed\"] = prototype[\"crafting_speed\"] * 2",
  "end",
  "",
].join("\n");

describe("Repair prompt contract", () => {
  it("pins Repair to the accepted capability and data.lua-only output", () => {
    const prompt = buildRepairSystemPrompt(spec);
    expect(prompt).toContain("prototype_property");
    expect(prompt).toContain("ModSpec is immutable");
    expect(prompt).toContain("data.lua only");
    expect(prompt).toContain("cannot add files");
    expect(prompt).toContain("semantic assertions");
  });
});

describe("repairFactorioManifest", () => {
  it("replaces only data.lua and succeeds after validation", async () => {
    const provider = new SequenceProvider([response({ dataLua: fixedLua })]);
    const result = await repairFactorioManifest({
      provider,
      spec,
      priorManifest,
      failure: loadFailure,
      validateCandidate: async ({ manifest, attempt }) => {
        expect(attempt).toBe(1);
        expect(manifest.files.find((file) => file.path === "info.json")?.content).toBe(
          priorManifest.files[0]?.content,
        );
        expect(manifest.files.find((file) => file.path === "data.lua")?.content).toBe(fixedLua);
        return { ok: true as const };
      },
    });

    expect(result.status).toBe("repaired");
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({
      outcome: "validated",
      provider: "fake-repair",
      model: "fake-model",
    });
    expect(result.usage.totalTokens).toBe(45);
  });

  it("uses the failed candidate and normalized semantic error for the second bounded attempt", async () => {
    const firstLua = 'data.raw["furnace"]["steel-furnace"].crafting_speed = 2\n';
    const provider = new SequenceProvider([
      response({ dataLua: firstLua }, 20, 8),
      response({ dataLua: fixedLua }, 25, 9),
    ]);
    let validations = 0;

    const result = await repairFactorioManifest({
      provider,
      spec,
      priorManifest,
      failure: loadFailure,
      validateCandidate: async ({ manifest }) => {
        validations += 1;
        if (validations === 1) {
          expect(manifest.files.find((file) => file.path === "data.lua")?.content).toBe(firstLua);
          throw new ProjectError({
            code: "semantic_assertion_failed",
            stage: "validation",
            message: semanticFailure.message,
          });
        }
        expect(manifest.files.find((file) => file.path === "data.lua")?.content).toBe(fixedLua);
        return "validated";
      },
    });

    expect(result.status).toBe("repaired");
    expect(result.attempts.map((attempt) => attempt.outcome)).toEqual([
      "validation_failed",
      "validated",
    ]);
    expect(result.usage).toMatchObject({ inputTokens: 45, outputTokens: 17, totalTokens: 62 });
    expect(provider.requests).toHaveLength(2);
    const secondRequest = provider.requests[1];
    expect(secondRequest?.messages.some((message) => message.content.includes(firstLua))).toBe(true);
    expect(
      secondRequest?.messages.some((message) => message.content.includes("semantic_assertion_failed")),
    ).toBe(true);
  });

  it("rejects scope-expanding structured output and allows one corrected response", async () => {
    const provider = new SequenceProvider([
      response({ dataLua: fixedLua, infoJson: "changed" }),
      response({ dataLua: fixedLua }),
    ]);

    const result = await repairFactorioManifest({
      provider,
      spec,
      priorManifest,
      failure: loadFailure,
      validateCandidate: async () => ({ ok: true }),
    });

    expect(result.status).toBe("repaired");
    expect(result.attempts.map((attempt) => attempt.outcome)).toEqual([
      "candidate_rejected",
      "validated",
    ]);
    expect(provider.requests[1]?.messages.at(-1)?.content).toContain("only {\"dataLua\": string}");
  });

  it("terminates deterministically after two repairable validation failures", async () => {
    const provider = new SequenceProvider([
      response({ dataLua: "-- attempt one\n" }),
      response({ dataLua: "-- attempt two\n" }),
    ]);

    const result = await repairFactorioManifest({
      provider,
      spec,
      priorManifest,
      failure: loadFailure,
      validateCandidate: async () => {
        throw new ProjectError({
          code: "factorio_load_failed",
          stage: "validation",
          message: "still broken",
        });
      },
    });

    expect(result).toMatchObject({
      status: "failed",
      terminalReason: "attempts_exhausted",
      error: { code: "factorio_load_failed", message: "still broken" },
    });
    expect(result.attempts).toHaveLength(2);
    expect(provider.requests).toHaveLength(2);
    expect(result.manifest.files.find((file) => file.path === "data.lua")?.content).toBe(
      "-- attempt two\n",
    );
  });

  it("does not send non-repairable failures to the model", async () => {
    const provider = new SequenceProvider([response({ dataLua: fixedLua })]);
    await expect(
      repairFactorioManifest({
        provider,
        spec,
        priorManifest,
        failure: {
          code: "packaging_error",
          stage: "packaging",
          message: "disk full",
          retryable: false,
        },
        validateCandidate: async () => ({ ok: true }),
      }),
    ).rejects.toMatchObject({ code: "input_error", stage: "input" });
    expect(provider.requests).toHaveLength(0);
  });

  it("stops immediately when candidate validation fails for infrastructure reasons", async () => {
    const provider = new SequenceProvider([response({ dataLua: fixedLua }), response({ dataLua: fixedLua })]);
    await expect(
      repairFactorioManifest({
        provider,
        spec,
        priorManifest,
        failure: loadFailure,
        validateCandidate: async () => {
          throw new ProjectError({
            code: "process_error",
            stage: "process",
            message: "Factorio process unavailable",
            retryable: true,
          });
        },
      }),
    ).rejects.toMatchObject({ code: "process_error", stage: "process" });
    expect(provider.requests).toHaveLength(1);
  });

  it("hard-caps repair attempts at two", async () => {
    const provider = new SequenceProvider([response({ dataLua: fixedLua })]);
    await expect(
      repairFactorioManifest({
        provider,
        spec,
        priorManifest,
        failure: loadFailure,
        maxAttempts: 3,
        validateCandidate: async () => ({ ok: true }),
      }),
    ).rejects.toMatchObject({ code: "input_error", stage: "input" });
    expect(provider.requests).toHaveLength(0);
  });
});
