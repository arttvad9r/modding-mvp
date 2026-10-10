import {
  ModSpecSchema,
  ProjectError,
  SerializedProjectErrorSchema,
  normalizeProjectError,
} from "@project/domain";

import {
  ArtifactFileNameSchema,
  ArtifactRefSchema,
  GenerationJobSchema,
  GenerationRecordSchema,
  GenerationTelemetrySchema,
  type ArtifactStore,
  type GenerationExecutor,
  type GenerationJob,
  type GenerationRecord,
  type GenerationRepository,
  type RunningGenerationRecord,
  type ServiceGenerationExecution,
} from "./contracts.js";

export interface ProcessGenerationJobOptions {
  readonly repository: GenerationRepository;
  readonly artifactStore: ArtifactStore;
  readonly executor: GenerationExecutor;
  readonly job: GenerationJob;
  readonly now?: () => Date;
}

export interface ProcessGenerationJobResult {
  readonly outcome: "processed" | "already_terminal" | "already_running";
  readonly record: GenerationRecord;
}

const MAX_SERVICE_ARTIFACT_BYTES = 10 * 1024 * 1024;

function terminal(record: GenerationRecord): boolean {
  return record.status === "succeeded" || record.status === "unsupported" || record.status === "failed";
}

function normalizeExecution(execution: ServiceGenerationExecution): ServiceGenerationExecution {
  if (execution.status === "success") {
    const fileName = ArtifactFileNameSchema.parse(execution.artifact.fileName);
    if (
      !(execution.artifact.bytes instanceof Uint8Array) ||
      execution.artifact.bytes.byteLength < 1 ||
      execution.artifact.bytes.byteLength > MAX_SERVICE_ARTIFACT_BYTES
    ) {
      throw new ProjectError({
        code: "schema_error",
        stage: "process",
        message: `Generation executor artifact must be 1..${MAX_SERVICE_ARTIFACT_BYTES} bytes`,
      });
    }
    return {
      status: "success",
      modSpec: ModSpecSchema.parse(execution.modSpec),
      artifact: {
        fileName,
        bytes: execution.artifact.bytes,
      },
      telemetry: GenerationTelemetrySchema.parse(execution.telemetry),
    };
  }
  if (execution.status === "unsupported") {
    const reason = execution.reason.trim();
    if (reason.length < 1 || reason.length > 600) {
      throw new ProjectError({
        code: "schema_error",
        stage: "process",
        message: "Generation executor returned an invalid unsupported reason",
      });
    }
    return {
      status: "unsupported",
      reason,
      telemetry: GenerationTelemetrySchema.parse(execution.telemetry),
    };
  }
  const parsedError = SerializedProjectErrorSchema.parse(execution.error);
  return {
    status: "failed",
    ...(execution.modSpec === undefined ? {} : { modSpec: ModSpecSchema.parse(execution.modSpec) }),
    error: {
      code: parsedError.code,
      stage: parsedError.stage,
      message: parsedError.message,
      retryable: parsedError.retryable,
      ...(parsedError.details === undefined ? {} : { details: parsedError.details }),
    },
    ...(execution.telemetry === undefined
      ? {}
      : { telemetry: GenerationTelemetrySchema.parse(execution.telemetry) }),
  };
}

async function claimQueuedGeneration(
  repository: GenerationRepository,
  current: GenerationRecord,
  now: () => Date,
): Promise<ProcessGenerationJobResult | RunningGenerationRecord> {
  if (terminal(current)) return { outcome: "already_terminal", record: current };
  if (current.status === "running") return { outcome: "already_running", record: current };

  const timestamp = now().toISOString();
  const running = GenerationRecordSchema.parse({
    ...current,
    revision: current.revision + 1,
    status: "running",
    startedAt: timestamp,
    updatedAt: timestamp,
  }) as RunningGenerationRecord;

  if (await repository.compareAndSet(current.id, current.revision, running)) return running;

  const reloaded = await repository.get(current.id);
  if (reloaded === null) {
    throw new ProjectError({
      code: "internal_error",
      stage: "internal",
      message: `Generation disappeared while claiming job: ${current.id}`,
    });
  }
  const parsed = GenerationRecordSchema.parse(reloaded);
  if (terminal(parsed)) return { outcome: "already_terminal", record: parsed };
  if (parsed.status === "running") return { outcome: "already_running", record: parsed };

  throw new ProjectError({
    code: "process_error",
    stage: "process",
    message: `Could not claim queued generation: ${current.id}`,
    retryable: true,
  });
}

async function persistTerminal(
  repository: GenerationRepository,
  running: RunningGenerationRecord,
  next: GenerationRecord,
): Promise<GenerationRecord> {
  const versioned = GenerationRecordSchema.parse({
    ...next,
    revision: running.revision + 1,
  });
  if (!(await repository.compareAndSet(running.id, running.revision, versioned))) {
    const current = await repository.get(running.id);
    if (current !== null && terminal(current)) return GenerationRecordSchema.parse(current);
    throw new ProjectError({
      code: "process_error",
      stage: "process",
      message: `Generation changed concurrently before terminal update: ${running.id}`,
      retryable: true,
    });
  }
  return versioned;
}

export async function processGenerationJob(
  options: ProcessGenerationJobOptions,
): Promise<ProcessGenerationJobResult> {
  const job = GenerationJobSchema.parse(options.job);
  const now = options.now ?? (() => new Date());
  const existing = await options.repository.get(job.generationId);
  if (existing === null) {
    throw new ProjectError({
      code: "input_error",
      stage: "input",
      message: `Generation job references missing generation: ${job.generationId}`,
    });
  }

  const claimed = await claimQueuedGeneration(
    options.repository,
    GenerationRecordSchema.parse(existing),
    now,
  );
  if (!("status" in claimed)) return claimed;
  const running = claimed;

  let execution: ServiceGenerationExecution;
  try {
    execution = normalizeExecution(
      await options.executor.execute({
        generationId: running.id,
        prompt: running.prompt,
      }),
    );
  } catch (error) {
    const normalized = normalizeProjectError(error, {
      code: "process_error",
      stage: "process",
      message: "Generation executor failed",
      retryable: true,
    });
    const finishedAt = now().toISOString();
    const failed = GenerationRecordSchema.parse({
      ...running,
      status: "failed",
      updatedAt: finishedAt,
      finishedAt,
      error: normalized.toJSON(),
    });
    const record = await persistTerminal(options.repository, running, failed);
    return { outcome: "processed", record };
  }

  const finishedAt = now().toISOString();

  if (execution.status === "unsupported") {
    const unsupported = GenerationRecordSchema.parse({
      ...running,
      status: "unsupported",
      updatedAt: finishedAt,
      finishedAt,
      reason: execution.reason,
      telemetry: execution.telemetry,
    });
    const record = await persistTerminal(options.repository, running, unsupported);
    return { outcome: "processed", record };
  }

  if (execution.status === "failed") {
    const failed = GenerationRecordSchema.parse({
      ...running,
      status: "failed",
      updatedAt: finishedAt,
      finishedAt,
      ...(execution.modSpec === undefined ? {} : { modSpec: execution.modSpec }),
      error: execution.error,
      ...(execution.telemetry === undefined ? {} : { telemetry: execution.telemetry }),
    });
    const record = await persistTerminal(options.repository, running, failed);
    return { outcome: "processed", record };
  }

  const key = `generations/${running.id}/${execution.artifact.fileName}`;
  let artifact;
  try {
    artifact = ArtifactRefSchema.parse(
      await options.artifactStore.put({
        key,
        fileName: execution.artifact.fileName,
        contentType: "application/zip",
        bytes: execution.artifact.bytes,
      }),
    );
    if (
      artifact.key !== key ||
      artifact.fileName !== execution.artifact.fileName ||
      artifact.contentType !== "application/zip" ||
      artifact.sizeBytes !== execution.artifact.bytes.byteLength
    ) {
      throw new ProjectError({
        code: "internal_error",
        stage: "internal",
        message: "Artifact store returned metadata that does not match the published ZIP",
      });
    }
  } catch (error) {
    const normalized = normalizeProjectError(error, {
      code: "process_error",
      stage: "process",
      message: "Artifact publication failed",
      retryable: true,
    });
    const failed = GenerationRecordSchema.parse({
      ...running,
      status: "failed",
      updatedAt: finishedAt,
      finishedAt,
      modSpec: execution.modSpec,
      error: normalized.toJSON(),
      telemetry: execution.telemetry,
    });
    const record = await persistTerminal(options.repository, running, failed);
    return { outcome: "processed", record };
  }

  const succeeded = GenerationRecordSchema.parse({
    ...running,
    status: "succeeded",
    updatedAt: finishedAt,
    finishedAt,
    modSpec: execution.modSpec,
    artifact,
    telemetry: execution.telemetry,
  });
  const record = await persistTerminal(options.repository, running, succeeded);
  return { outcome: "processed", record };
}
