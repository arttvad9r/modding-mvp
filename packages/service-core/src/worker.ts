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
  readonly heartbeatIntervalMs?: number;
}

export interface ProcessGenerationJobResult {
  readonly outcome: "processed" | "already_terminal" | "already_running";
  readonly record: GenerationRecord;
}

const MAX_SERVICE_ARTIFACT_BYTES = 10 * 1024 * 1024;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const MIN_HEARTBEAT_INTERVAL_MS = 10;
const MAX_HEARTBEAT_INTERVAL_MS = 300_000;

function terminal(record: GenerationRecord): boolean {
  return record.status === "succeeded" || record.status === "unsupported" || record.status === "failed";
}

interface HeartbeatStopResult {
  readonly running: RunningGenerationRecord;
  readonly lostRecord?: GenerationRecord;
  readonly error?: ProjectError;
}

function startRunningHeartbeat(
  repository: GenerationRepository,
  initial: RunningGenerationRecord,
  intervalMs: number,
  now: () => Date,
): { stop(): Promise<HeartbeatStopResult> } {
  let current = initial;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<void> = Promise.resolve();
  let lostRecord: GenerationRecord | undefined;
  let heartbeatError: ProjectError | undefined;

  const schedule = () => {
    if (stopped || lostRecord !== undefined || heartbeatError !== undefined) return;
    timer = setTimeout(() => {
      inFlight = beat();
    }, intervalMs);
    timer.unref?.();
  };

  const beat = async (): Promise<void> => {
    if (stopped || lostRecord !== undefined || heartbeatError !== undefined) return;
    try {
      const updatedAt = now().toISOString();
      const next = GenerationRecordSchema.parse({
        ...current,
        revision: current.revision + 1,
        updatedAt,
      });
      if (next.status !== "running") throw new Error("Heartbeat unexpectedly changed generation status");

      if (await repository.compareAndSet(current.id, current.revision, next)) {
        current = next;
      } else {
        const actual = await repository.get(current.id);
        if (actual === null) {
          heartbeatError = new ProjectError({
            code: "internal_error",
            stage: "internal",
            message: `Generation disappeared during heartbeat: ${current.id}`,
          });
        } else {
          lostRecord = GenerationRecordSchema.parse(actual);
        }
      }
    } catch (error) {
      heartbeatError = normalizeProjectError(error, {
        code: "process_error",
        stage: "process",
        message: "Generation heartbeat failed",
        retryable: true,
      });
    } finally {
      schedule();
    }
  };

  schedule();

  return {
    async stop() {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      await inFlight;
      return {
        running: current,
        ...(lostRecord === undefined ? {} : { lostRecord }),
        ...(heartbeatError === undefined ? {} : { error: heartbeatError }),
      };
    },
  };
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
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  if (
    !Number.isInteger(heartbeatIntervalMs) ||
    heartbeatIntervalMs < MIN_HEARTBEAT_INTERVAL_MS ||
    heartbeatIntervalMs > MAX_HEARTBEAT_INTERVAL_MS
  ) {
    throw new ProjectError({
      code: "input_error",
      stage: "input",
      message: `Generation heartbeat interval must be an integer in range ${MIN_HEARTBEAT_INTERVAL_MS}..${MAX_HEARTBEAT_INTERVAL_MS} ms`,
    });
  }
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
  const heartbeat = startRunningHeartbeat(options.repository, claimed, heartbeatIntervalMs, now);
  let execution: ServiceGenerationExecution | undefined;
  let executionError: unknown;
  try {
    execution = normalizeExecution(
      await options.executor.execute({
        generationId: claimed.id,
        prompt: claimed.prompt,
      }),
    );
  } catch (error) {
    executionError = error;
  }

  const heartbeatState = await heartbeat.stop();
  const running = heartbeatState.running;
  if (heartbeatState.lostRecord !== undefined) {
    const actual = heartbeatState.lostRecord;
    if (terminal(actual)) return { outcome: "already_terminal", record: actual };
    if (actual.status === "running") return { outcome: "already_running", record: actual };
    throw new ProjectError({
      code: "process_error",
      stage: "process",
      message: `Generation lost its running claim: ${running.id}`,
      retryable: true,
    });
  }

  if (heartbeatState.error !== undefined) executionError = heartbeatState.error;
  if (executionError !== undefined) {
    const normalized = normalizeProjectError(executionError, {
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
  if (execution === undefined) {
    throw new ProjectError({
      code: "internal_error",
      stage: "internal",
      message: "Generation executor completed without a result",
    });
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

export interface RecoverStaleRunningGenerationsOptions {
  readonly repository: GenerationRepository;
  readonly staleAfterMs: number;
  readonly limit?: number;
  readonly now?: () => Date;
}

export interface RecoverStaleRunningGenerationsResult {
  readonly scanned: number;
  readonly recovered: number;
  readonly skipped: number;
}

export async function recoverStaleRunningGenerations(
  options: RecoverStaleRunningGenerationsOptions,
): Promise<RecoverStaleRunningGenerationsResult> {
  const limit = options.limit ?? 100;
  if (!Number.isInteger(options.staleAfterMs) || options.staleAfterMs < 1_000) {
    throw new ProjectError({
      code: "input_error",
      stage: "input",
      message: "staleAfterMs must be an integer >= 1000",
    });
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
    throw new ProjectError({
      code: "input_error",
      stage: "input",
      message: "Stale generation recovery limit must be an integer in range 1..1000",
    });
  }

  const now = options.now ?? (() => new Date());
  const recoveryTime = now();
  const cutoff = new Date(recoveryTime.getTime() - options.staleAfterMs).toISOString();
  const candidates = await options.repository.listRunningUpdatedBefore(cutoff, limit);
  let recovered = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const finishedAt = recoveryTime.toISOString();
    const failed = GenerationRecordSchema.parse({
      ...candidate,
      revision: candidate.revision + 1,
      status: "failed",
      updatedAt: finishedAt,
      finishedAt,
      error: {
        code: "process_error",
        stage: "process",
        message: "Generation worker heartbeat became stale",
        retryable: true,
        details: {
          staleAfterMs: options.staleAfterMs,
          lastHeartbeatAt: candidate.updatedAt,
        },
      },
    });
    if (await options.repository.compareAndSet(candidate.id, candidate.revision, failed)) {
      recovered += 1;
    } else {
      skipped += 1;
    }
  }

  return { scanned: candidates.length, recovered, skipped };
}
