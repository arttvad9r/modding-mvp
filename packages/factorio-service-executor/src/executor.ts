import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  runLocalFactorioGeneration,
  type LocalGenerationResult,
  type PipelineTelemetry,
} from "@project/agent-core";
import type { LlmProvider } from "@project/llm";
import {
  GenerationTelemetrySchema,
  type GenerationExecutor,
  type GenerationTelemetry,
  type ServiceGenerationExecution,
} from "@project/service-core";
import { mkdtemp } from "node:fs/promises";

export interface CreateFactorioGenerationExecutorOptions {
  readonly provider: LlmProvider;
  readonly factorioBin?: string;
  readonly tempDirectory?: string;
}

function mapTelemetry(input: PipelineTelemetry): GenerationTelemetry {
  return GenerationTelemetrySchema.parse({
    durationMs: input.durationMs,
    attempts: [
      ...input.plannerAttempts.map((attempt) => ({
        kind: "planner" as const,
        attempt: attempt.attempt,
        provider: attempt.provider,
        model: attempt.model,
        ...(attempt.usage === undefined ? {} : { usage: attempt.usage }),
        ...(attempt.durationMs === undefined ? {} : { durationMs: attempt.durationMs }),
      })),
      ...input.repairAttempts.map((attempt) => ({
        kind: "repair" as const,
        attempt: attempt.attempt,
        outcome: attempt.outcome,
        ...(attempt.provider === undefined ? {} : { provider: attempt.provider }),
        ...(attempt.model === undefined ? {} : { model: attempt.model }),
        ...(attempt.usage === undefined ? {} : { usage: attempt.usage }),
        ...(attempt.durationMs === undefined ? {} : { durationMs: attempt.durationMs }),
        ...(attempt.error === undefined ? {} : { error: attempt.error }),
      })),
    ],
    usage: input.usage,
    ...(input.validation === undefined
      ? {}
      : {
          validation: {
            initialStatus: input.validation.initialStatus,
            ...(input.validation.initialError === undefined
              ? {}
              : { initialError: input.validation.initialError }),
            ...(input.validation.finalDurationMs === undefined
              ? {}
              : { finalDurationMs: input.validation.finalDurationMs }),
            repaired: input.validation.repaired,
          },
        }),
  });
}

async function mapResult(result: LocalGenerationResult): Promise<ServiceGenerationExecution> {
  const telemetry = mapTelemetry(result.telemetry);

  if (result.status === "unsupported") {
    return { status: "unsupported", reason: result.reason, telemetry };
  }
  if (result.status === "failed") {
    return {
      status: "failed",
      ...(result.modSpec === undefined ? {} : { modSpec: result.modSpec }),
      error: result.error,
      telemetry,
    };
  }

  return {
    status: "success",
    modSpec: result.modSpec,
    artifact: {
      fileName: path.basename(result.zipPath),
      bytes: new Uint8Array(await readFile(result.zipPath)),
    },
    telemetry,
  };
}

export function createFactorioGenerationExecutor(
  options: CreateFactorioGenerationExecutorOptions,
): GenerationExecutor {
  return {
    async execute({ generationId, prompt, baseModSpec, signal }) {
      const parent = options.tempDirectory ?? tmpdir();
      const workRoot = await mkdtemp(path.join(parent, "factorio-service-generation-"));
      try {
        const result = await runLocalFactorioGeneration(
          {
            provider: options.provider,
            prompt,
            ...(baseModSpec === undefined ? {} : { baseModSpec }),
            outputDirectory: path.join(workRoot, "dist"),
            runDirectory: path.join(workRoot, "runs"),
            ...(options.factorioBin === undefined ? {} : { factorioBin: options.factorioBin }),
            ...(signal === undefined ? {} : { signal }),
          },
          { generationId: () => generationId },
        );
        return await mapResult(result);
      } finally {
        await rm(workRoot, { recursive: true, force: true }).catch(() => undefined);
      }
    },
  };
}
