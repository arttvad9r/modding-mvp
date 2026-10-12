import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  ProjectError,
  normalizeProjectError,
  serializeProjectError,
  type GeneratedFileManifest,
  type ModSpec,
  type SerializedProjectError,
} from "@project/domain";
import {
  createFactorioZip,
  generateFactorioMod,
  validateGeneratedFactorioMod,
  validateRepairedFactorioMod,
  type GeneratedFactorioMod,
} from "@project/factorio-generator";
import {
  aggregateLlmUsage,
  type AggregatedLlmUsage,
  type LlmProvider,
} from "@project/llm";

import { planFactorioPrompt, type PlannerAttemptMetadata } from "./planner.js";
import { planFactorioRevision } from "./revision.js";
import {
  repairFactorioManifest,
  type RepairAttemptMetadata,
} from "./repair.js";

export type PipelineProgressStage =
  | "planning"
  | "generating"
  | "validating"
  | "repairing"
  | "packaging"
  | "complete"
  | "unsupported"
  | "failed";

export interface PipelineProgressEvent {
  readonly sequence: number;
  readonly stage: PipelineProgressStage;
  readonly message: string;
  readonly elapsedMs: number;
}

export interface PipelineValidationSummary {
  readonly initialStatus: "passed" | "failed";
  readonly initialError?: SerializedProjectError;
  readonly finalDurationMs?: number;
  readonly repaired: boolean;
}

export interface PipelineTelemetry {
  readonly durationMs: number;
  readonly plannerAttempts: readonly PlannerAttemptMetadata[];
  readonly repairAttempts: readonly RepairAttemptMetadata[];
  readonly usage: AggregatedLlmUsage;
  readonly validation?: PipelineValidationSummary;
}

interface PipelineResultBase {
  readonly generationId: string;
  readonly prompt: string;
  readonly reportPath: string;
  readonly progress: readonly PipelineProgressEvent[];
  readonly telemetry: PipelineTelemetry;
}

export interface PipelineSuccessResult extends PipelineResultBase {
  readonly status: "success";
  readonly modSpec: ModSpec;
  readonly zipPath: string;
  readonly directoryName: string;
}

export interface PipelineUnsupportedResult extends PipelineResultBase {
  readonly status: "unsupported";
  readonly reason: string;
}

export interface PipelineFailedResult extends PipelineResultBase {
  readonly status: "failed";
  readonly modSpec?: ModSpec;
  readonly error: SerializedProjectError;
}

export type LocalGenerationResult =
  | PipelineSuccessResult
  | PipelineUnsupportedResult
  | PipelineFailedResult;

type LocalGenerationResultWithoutReport =
  | Omit<PipelineSuccessResult, "reportPath">
  | Omit<PipelineUnsupportedResult, "reportPath">
  | Omit<PipelineFailedResult, "reportPath">;

export interface LocalGenerationOptions {
  readonly provider: LlmProvider;
  readonly prompt: string;
  readonly outputDirectory?: string;
  readonly runDirectory?: string;
  readonly factorioBin?: string;
  readonly maxRepairAttempts?: number;
  readonly baseModSpec?: ModSpec;
  readonly onProgress?: (event: PipelineProgressEvent) => void;
  /** Execution deadline: cancels provider calls and Factorio runs, then fails the run as retryable. */
  readonly signal?: AbortSignal;
}

interface ValidationLike {
  readonly ok: boolean;
  readonly durationMs: number;
}

export interface LocalGenerationDependencies {
  readonly generate?: (spec: ModSpec) => GeneratedFactorioMod;
  readonly validate?: (
    generated: GeneratedFactorioMod,
    factorioBin?: string,
    signal?: AbortSignal,
  ) => Promise<ValidationLike>;
  /** Validates a model-repaired candidate, including its data.raw integrity against the ModSpec. */
  readonly validateRepaired?: (
    spec: ModSpec,
    generated: GeneratedFactorioMod,
    factorioBin?: string,
    signal?: AbortSignal,
  ) => Promise<ValidationLike>;
  readonly writeArtifact?: (
    manifest: GeneratedFileManifest,
    directoryName: string,
    outputDirectory: string,
  ) => Promise<string>;
  readonly generationId?: () => string;
  readonly now?: () => number;
}

interface ReportPayload {
  readonly schemaVersion: 1;
  readonly generationId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly result: Omit<LocalGenerationResult, "reportPath"> & { readonly reportPath: string };
  readonly feedback?: {
    readonly rating: "up" | "down";
    readonly note?: string;
    readonly createdAt: string;
  };
}

const repairableCodes = new Set(["factorio_load_failed", "semantic_assertion_failed"]);

function isRepairable(error: SerializedProjectError): boolean {
  return repairableCodes.has(error.code);
}

function defaultNow(): number {
  return Date.now();
}

async function defaultValidate(
  generated: GeneratedFactorioMod,
  factorioBin?: string,
  signal?: AbortSignal,
): Promise<ValidationLike> {
  return validateGeneratedFactorioMod({
    generated,
    ...(factorioBin === undefined ? {} : { factorioBin }),
    ...(signal === undefined ? {} : { signal }),
  });
}

async function defaultValidateRepaired(
  spec: ModSpec,
  generated: GeneratedFactorioMod,
  factorioBin?: string,
  signal?: AbortSignal,
): Promise<ValidationLike> {
  return validateRepairedFactorioMod({
    spec,
    generated,
    ...(factorioBin === undefined ? {} : { factorioBin }),
    ...(signal === undefined ? {} : { signal }),
  });
}

function withSignal(provider: LlmProvider, signal: AbortSignal | undefined): LlmProvider {
  if (signal === undefined) return provider;
  return { generateJson: (request) => provider.generateJson({ ...request, signal }) };
}

function ensureNotCancelled(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw new ProjectError({
    code: "process_error",
    stage: "process",
    message: "Generation exceeded its execution deadline",
    retryable: true,
    details: { cancelled: true },
  });
}

async function defaultWriteArtifact(
  manifest: GeneratedFileManifest,
  directoryName: string,
  outputDirectory: string,
): Promise<string> {
  const output = path.resolve(outputDirectory);
  await mkdir(output, { recursive: true });
  const zipPath = path.join(output, `${directoryName}.zip`);
  const bytes = createFactorioZip(manifest, directoryName);
  await writeFile(zipPath, bytes, { flag: "w" });
  return zipPath;
}

function projectErrorFromSerialized(error: SerializedProjectError): ProjectError {
  return new ProjectError({
    code: error.code,
    stage: error.stage,
    message: error.message,
    retryable: error.retryable,
    ...(error.details === undefined ? {} : { details: error.details }),
  });
}

function aggregatePipelineUsage(
  plannerAttempts: readonly PlannerAttemptMetadata[],
  repairAttempts: readonly RepairAttemptMetadata[],
): AggregatedLlmUsage {
  return aggregateLlmUsage([
    ...plannerAttempts.map((attempt) => attempt.usage),
    ...repairAttempts.map((attempt) => attempt.usage),
  ]);
}

async function persistReport(
  runDirectory: string,
  result: LocalGenerationResult,
): Promise<string> {
  const runs = path.resolve(runDirectory);
  await mkdir(runs, { recursive: true });
  const reportPath = path.join(runs, `${result.generationId}.json`);
  const now = new Date().toISOString();
  const payload: ReportPayload = {
    schemaVersion: 1,
    generationId: result.generationId,
    createdAt: now,
    updatedAt: now,
    result: { ...result, reportPath },
  };
  await writeFile(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return reportPath;
}

export async function runLocalFactorioGeneration(
  options: LocalGenerationOptions,
  dependencies: LocalGenerationDependencies = {},
): Promise<LocalGenerationResult> {
  const generationId = (dependencies.generationId ?? randomUUID)();
  const now = dependencies.now ?? defaultNow;
  const startedAt = now();
  const outputDirectory = options.outputDirectory ?? "dist";
  const runDirectory = options.runDirectory ?? ".runs";
  const generate = dependencies.generate ?? generateFactorioMod;
  const validate = dependencies.validate ?? defaultValidate;
  const validateRepaired = dependencies.validateRepaired ?? defaultValidateRepaired;
  const provider = withSignal(options.provider, options.signal);
  const signal = options.signal;
  const writeArtifact = dependencies.writeArtifact ?? defaultWriteArtifact;
  const progress: PipelineProgressEvent[] = [];
  let sequence = 0;
  let plannerAttempts: readonly PlannerAttemptMetadata[] = [];
  let repairAttempts: readonly RepairAttemptMetadata[] = [];
  let modSpec: ModSpec | undefined;
  let validationSummary: PipelineValidationSummary | undefined;

  const emit = (stage: PipelineProgressStage, message: string): void => {
    const event: PipelineProgressEvent = {
      sequence: ++sequence,
      stage,
      message,
      elapsedMs: Math.max(0, now() - startedAt),
    };
    progress.push(event);
    options.onProgress?.(event);
  };

  const telemetry = (): PipelineTelemetry => ({
    durationMs: Math.max(0, now() - startedAt),
    plannerAttempts,
    repairAttempts,
    usage: aggregatePipelineUsage(plannerAttempts, repairAttempts),
    ...(validationSummary === undefined ? {} : { validation: validationSummary }),
  });

  const finalize = async (
    partial: LocalGenerationResultWithoutReport,
  ): Promise<LocalGenerationResult> => {
    const placeholder = { ...partial, reportPath: "" } as LocalGenerationResult;
    const reportPath = await persistReport(runDirectory, placeholder);
    return { ...partial, reportPath } as LocalGenerationResult;
  };

  try {
    emit(
      "planning",
      options.baseModSpec === undefined
        ? "Planning request against supported Factorio capabilities"
        : "Planning follow-up revision against the accepted tweak bundle",
    );
    const plan =
      options.baseModSpec === undefined
        ? await planFactorioPrompt({ provider, prompt: options.prompt })
        : await planFactorioRevision({
            provider,
            baseModSpec: options.baseModSpec,
            prompt: options.prompt,
          });
    plannerAttempts = plan.attempts;
    ensureNotCancelled(signal);

    if (plan.status === "unsupported") {
      emit("unsupported", plan.reason);
      return finalize({
        status: "unsupported",
        generationId,
        prompt: options.prompt,
        reason: plan.reason,
        progress,
        telemetry: telemetry(),
      });
    }

    modSpec = plan.modSpec;
    emit("generating", `Generating deterministic ${modSpec.capability} artifact`);
    let generated = generate(modSpec);

    emit("validating", "Validating generated artifact in real Factorio");
    try {
      const validation = await validate(generated, options.factorioBin, signal);
      validationSummary = {
        initialStatus: "passed",
        finalDurationMs: validation.durationMs,
        repaired: false,
      };
    } catch (error) {
      const serialized = serializeProjectError(error, {
        code: "internal_error",
        stage: "internal",
        message: "Initial Factorio validation failed unexpectedly",
      });
      validationSummary = {
        initialStatus: "failed",
        initialError: serialized,
        repaired: false,
      };
      if (!isRepairable(serialized)) throw projectErrorFromSerialized(serialized);
      ensureNotCancelled(signal);

      emit("repairing", `Repairing ${serialized.code} without changing accepted ModSpec`);
      const repair = await repairFactorioManifest({
        provider,
        spec: modSpec,
        priorManifest: generated.manifest,
        failure: serialized,
        ...(options.maxRepairAttempts === undefined
          ? {}
          : { maxAttempts: options.maxRepairAttempts }),
        validateCandidate: async ({ spec, manifest }) =>
          validateRepaired(spec, { ...generated, manifest }, options.factorioBin, signal),
      });
      repairAttempts = repair.attempts;

      ensureNotCancelled(signal);
      if (repair.status === "failed") {
        throw projectErrorFromSerialized(repair.error);
      }

      generated = { ...generated, manifest: repair.manifest };
      validationSummary = {
        initialStatus: "failed",
        initialError: serialized,
        finalDurationMs: repair.validation.durationMs,
        repaired: true,
      };
    }

    ensureNotCancelled(signal);
    emit("packaging", "Packaging validated installable ZIP");
    const zipPath = await writeArtifact(
      generated.manifest,
      generated.directoryName,
      outputDirectory,
    );
    emit("complete", "Validated ZIP is ready");

    return finalize({
      status: "success",
      generationId,
      prompt: options.prompt,
      modSpec,
      zipPath,
      directoryName: generated.directoryName,
      progress,
      telemetry: telemetry(),
    });
  } catch (error) {
    const serialized = serializeProjectError(error, {
      code: "internal_error",
      stage: "internal",
      message: "Local generation pipeline failed",
    });
    emit("failed", serialized.message);
    return finalize({
      status: "failed",
      generationId,
      prompt: options.prompt,
      ...(modSpec === undefined ? {} : { modSpec }),
      error: serialized,
      progress,
      telemetry: telemetry(),
    });
  }
}
