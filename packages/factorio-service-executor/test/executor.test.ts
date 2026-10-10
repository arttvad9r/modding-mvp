import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { LlmJsonRequest, LlmJsonResponse, LlmProvider } from "@project/llm";
import { describe, expect, it } from "vitest";

import { createFactorioGenerationExecutor } from "../src/index.js";

class UnsupportedProvider implements LlmProvider {
  async generateJson(_request: LlmJsonRequest): Promise<LlmJsonResponse> {
    return {
      value: { status: "unsupported", reason: "Outside current capability registry" },
      provider: "fake",
      model: "fake-model",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      durationMs: 3,
    };
  }
}

describe("Factorio service executor", () => {
  it("maps unsupported Planner output and removes temporary M5 run files", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "factorio-service-executor-unit-"));
    try {
      const executor = createFactorioGenerationExecutor({
        provider: new UnsupportedProvider(),
        tempDirectory: parent,
      });
      const result = await executor.execute({
        generationId: "11111111-1111-4111-8111-111111111111",
        prompt: "Add runtime scripting for player teleportation",
      });

      expect(result).toMatchObject({
        status: "unsupported",
        reason: "Outside current capability registry",
        telemetry: {
          attempts: [{ kind: "planner", provider: "fake", model: "fake-model" }],
          usage: { totalTokens: 15 },
        },
      });
      expect(await readdir(parent)).toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
