import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { LlmJsonRequest, LlmJsonResponse, LlmProvider } from "@project/llm";
import { describe, expect, it } from "vitest";

import { runLocalFactorioGeneration } from "../src/index.js";

class FixedPlannerProvider implements LlmProvider {
  readonly requests: LlmJsonRequest[] = [];

  async generateJson(request: LlmJsonRequest): Promise<LlmJsonResponse> {
    this.requests.push(request);
    return {
      value: {
        status: "supported",
        title: "E2E faster steel furnace",
        slug: "e2e-faster-steel-furnace",
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
      provider: "fake-planner",
      model: "fake-model",
      usage: { inputTokens: 100, outputTokens: 30, totalTokens: 130 },
      durationMs: 1,
    };
  }
}

describe("local prompt-to-ZIP pipeline against real Factorio", () => {
  it("produces an installable validated ZIP and local run report", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "local-pipeline-integration-"));
    try {
      const provider = new FixedPlannerProvider();
      const result = await runLocalFactorioGeneration(
        {
          provider,
          prompt: "Make steel furnaces twice as fast",
          outputDirectory: path.join(root, "dist"),
          runDirectory: path.join(root, "runs"),
        },
        { generationId: () => "integration-generation-1234" },
      );

      expect(result.status).toBe("success");
      if (result.status !== "success") throw new Error("Expected success");
      expect(result.telemetry.validation).toMatchObject({ initialStatus: "passed", repaired: false });
      expect((await readFile(result.zipPath)).byteLength).toBeGreaterThan(0);
      const report = JSON.parse(await readFile(result.reportPath, "utf8"));
      expect(report.result).toMatchObject({
        status: "success",
        generationId: "integration-generation-1234",
        zipPath: result.zipPath,
      });
      expect(provider.requests).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
