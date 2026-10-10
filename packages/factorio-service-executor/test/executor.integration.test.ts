import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { LlmJsonRequest, LlmJsonResponse, LlmProvider } from "@project/llm";
import { describe, expect, it } from "vitest";

import { createFactorioGenerationExecutor } from "../src/index.js";

class SupportedProvider implements LlmProvider {
  async generateJson(_request: LlmJsonRequest): Promise<LlmJsonResponse> {
    return {
      value: {
        status: "supported",
        title: "Double steel furnace speed",
        slug: "double-steel-furnace-speed-service",
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
      },
      provider: "fake-service-integration",
      model: "fake-service-model",
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
      durationMs: 1,
    };
  }
}

describe("Factorio service executor against real Factorio", () => {
  it("returns validated ZIP bytes and service telemetry without retaining local run files", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "factorio-service-executor-integration-"));
    try {
      const executor = createFactorioGenerationExecutor({
        provider: new SupportedProvider(),
        tempDirectory: parent,
      });
      const result = await executor.execute({
        generationId: "22222222-2222-4222-8222-222222222222",
        prompt: "Make steel furnaces twice as fast",
      });

      expect(result.status).toBe("success");
      if (result.status !== "success") throw new Error("Expected service executor success");
      expect(result.modSpec.capability).toBe("prototype_property");
      expect(result.artifact.fileName).toBe("double-steel-furnace-speed-service_0.1.0.zip");
      expect(result.artifact.bytes.byteLength).toBeGreaterThan(100);
      expect(result.telemetry).toMatchObject({
        attempts: [{ kind: "planner", provider: "fake-service-integration" }],
        validation: { initialStatus: "passed", repaired: false },
        usage: { totalTokens: 120 },
      });
      expect(await readdir(parent)).toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
