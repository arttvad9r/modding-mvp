import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { ProjectError } from "@project/domain";
import type { LlmJsonRequest, LlmJsonResponse, LlmProvider } from "@project/llm";
import { afterEach, describe, expect, it } from "vitest";

import { runLocalFactorioGeneration } from "../src/index.js";

class SequenceProvider implements LlmProvider {
  readonly requests: LlmJsonRequest[] = [];
  private index = 0;

  constructor(private readonly responses: readonly LlmJsonResponse[]) {}

  async generateJson(request: LlmJsonRequest): Promise<LlmJsonResponse> {
    this.requests.push(request);
    const response = this.responses[this.index++];
    if (!response) throw new Error("No fake response configured");
    return response;
  }
}

function response(value: unknown, inputTokens = 20, outputTokens = 10): LlmJsonResponse {
  return {
    value,
    provider: "fake",
    model: "fake-model",
    usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, estimatedCostUsd: 0.003 },
    durationMs: 5,
  };
}

function plannerDraft() {
  return {
    status: "supported",
    title: "Faster steel furnace",
    slug: "faster-steel-furnace",
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
  } as const;
}

const tempDirectories: string[] = [];

async function tempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "pipeline-test-"));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("runLocalFactorioGeneration", () => {
  it("plans, validates, packages, persists telemetry, and emits bounded progress", async () => {
    const root = await tempDirectory();
    const provider = new SequenceProvider([response(plannerDraft(), 100, 25)]);
    const events: string[] = [];

    const result = await runLocalFactorioGeneration(
      {
        provider,
        prompt: "Make steel furnaces twice as fast",
        outputDirectory: path.join(root, "dist"),
        runDirectory: path.join(root, "runs"),
        onProgress: (event) => events.push(event.stage),
      },
      {
        generationId: () => "generation-direct-success",
        validate: async () => ({ ok: true, durationMs: 123 }),
      },
    );

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("expected success");
    expect(events).toEqual(["planning", "generating", "validating", "packaging", "complete"]);
    expect(result.telemetry.usage).toMatchObject({ inputTokens: 100, outputTokens: 25, totalTokens: 125, estimatedCostUsd: 0.003 });
    expect(result.telemetry.validation).toMatchObject({ initialStatus: "passed", repaired: false, finalDurationMs: 123 });
    expect(result.zipPath).toMatch(/faster-steel-furnace_0\.1\.0\.zip$/);
    expect((await readFile(result.zipPath)).byteLength).toBeGreaterThan(0);

    const report = JSON.parse(await readFile(result.reportPath, "utf8"));
    expect(report).toMatchObject({
      schemaVersion: 1,
      generationId: "generation-direct-success",
      result: { status: "success", reportPath: result.reportPath },
    });
  });

  it("returns unsupported without generating or packaging", async () => {
    const root = await tempDirectory();
    const provider = new SequenceProvider([
      response({ status: "unsupported", reason: "New ores are outside the current registry." }),
    ]);
    let generated = false;

    const result = await runLocalFactorioGeneration(
      {
        provider,
        prompt: "Add a new ore",
        runDirectory: path.join(root, "runs"),
      },
      {
        generationId: () => "generation-unsupported",
        generate: () => {
          generated = true;
          throw new Error("must not generate");
        },
      },
    );

    expect(result.status).toBe("unsupported");
    expect(generated).toBe(false);
    expect(result.progress.map((event) => event.stage)).toEqual(["planning", "unsupported"]);
  });

  it("repairs a Factorio semantic failure and aggregates Planner plus Repair usage", async () => {
    const root = await tempDirectory();
    const provider = new SequenceProvider([
      response(plannerDraft(), 80, 20),
      response({ dataLua: "-- repaired lua\n" }, 50, 30),
    ]);
    let validations = 0;

    const result = await runLocalFactorioGeneration(
      {
        provider,
        prompt: "Make steel furnaces twice as fast",
        outputDirectory: path.join(root, "dist"),
        runDirectory: path.join(root, "runs"),
      },
      {
        generationId: () => "generation-repaired",
        validate: async () => {
          validations += 1;
          if (validations === 1) {
            throw new ProjectError({
              code: "semantic_assertion_failed",
              stage: "validation",
              message: "expected=4 actual=2",
            });
          }
          return { ok: true, durationMs: 77 };
        },
      },
    );

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("expected repaired success");
    expect(validations).toBe(2);
    expect(provider.requests).toHaveLength(2);
    expect(result.telemetry.repairAttempts).toHaveLength(1);
    expect(result.telemetry.usage).toMatchObject({ inputTokens: 130, outputTokens: 50, totalTokens: 180, estimatedCostUsd: 0.006 });
    expect(result.telemetry.validation).toMatchObject({
      initialStatus: "failed",
      initialError: { code: "semantic_assertion_failed" },
      repaired: true,
      finalDurationMs: 77,
    });
    expect(result.progress.map((event) => event.stage)).toContain("repairing");
  });

  it("returns a terminal typed failure without invoking Repair for process errors", async () => {
    const root = await tempDirectory();
    const provider = new SequenceProvider([response(plannerDraft())]);

    const result = await runLocalFactorioGeneration(
      {
        provider,
        prompt: "Make steel furnaces twice as fast",
        runDirectory: path.join(root, "runs"),
      },
      {
        generationId: () => "generation-process-failure",
        validate: async () => {
          throw new ProjectError({
            code: "process_error",
            stage: "process",
            message: "Factorio unavailable",
            retryable: true,
          });
        },
      },
    );

    expect(result.status).toBe("failed");
    if (result.status !== "failed") throw new Error("expected failure");
    expect(result.error).toMatchObject({ code: "process_error", stage: "process" });
    expect(result.telemetry.repairAttempts).toHaveLength(0);
    expect(provider.requests).toHaveLength(1);
    expect(result.progress.at(-1)?.stage).toBe("failed");
  });
});
