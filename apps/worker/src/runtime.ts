import {
  DEFAULT_EXECUTION_TIMEOUT_MS,
  DEFAULT_PUBLISH_TIMEOUT_MS,
  GenerationJobSchema,
  HEARTBEAT_GRACE_MS,
  processGenerationJob,
  reconcileOrphanedQueuedGenerations,
  recoverStaleRunningGenerations,
  type ArtifactStore,
  type GenerationExecutor,
  type GenerationRepository,
} from "@project/service-core";
import { GENERATION_QUEUE_OPTIONS, type PgBossGenerationQueue } from "@project/service-postgres";

export interface GenerationWorkerRuntimeOptions {
  readonly queue: PgBossGenerationQueue;
  readonly repository: GenerationRepository;
  readonly artifactStore: ArtifactStore;
  readonly executor: GenerationExecutor;
  readonly concurrency?: number;
  readonly heartbeatIntervalMs?: number;
  readonly staleAfterMs?: number;
  readonly staleRecoveryIntervalMs?: number;
  /** Queued records older than this are checked against their pg-boss job state. */
  readonly orphanQueuedAfterMs?: number;
  readonly executionTimeoutMs?: number;
  readonly publishTimeoutMs?: number;
  readonly onRecoveryError?: (error: unknown) => void;
  /** Called after every successful recovery pass (startup and interval); used as a liveness signal. */
  readonly onRecoverySuccess?: () => void;
}

export interface GenerationWorkerRuntime {
  readonly workerId: string;
  stop(): Promise<void>;
}

const DEFAULT_STALE_AFTER_MS = 5 * 60_000;
const DEFAULT_RECOVERY_INTERVAL_MS = 60_000;
const DEFAULT_ORPHAN_QUEUED_AFTER_MS = 60_000;

function boundedInteger(
  value: number,
  label: string,
  min: number,
  max: number,
): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer in range ${min}..${max}`);
  }
  return value;
}

export async function startGenerationWorker(
  options: GenerationWorkerRuntimeOptions,
): Promise<GenerationWorkerRuntime> {
  const concurrency = boundedInteger(options.concurrency ?? 1, "Worker concurrency", 1, 16);
  const staleAfterMs = boundedInteger(
    options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS,
    "Stale generation threshold",
    1_000,
    24 * 60 * 60_000,
  );
  const recoveryIntervalMs = boundedInteger(
    options.staleRecoveryIntervalMs ?? DEFAULT_RECOVERY_INTERVAL_MS,
    "Stale recovery interval",
    1_000,
    60 * 60_000,
  );

  const orphanQueuedAfterMs = boundedInteger(
    options.orphanQueuedAfterMs ?? DEFAULT_ORPHAN_QUEUED_AFTER_MS,
    "Orphaned queued generation threshold",
    1_000,
    24 * 60 * 60_000,
  );
  const claimLifetimeMs = (options.executionTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS)
    + (options.publishTimeoutMs ?? DEFAULT_PUBLISH_TIMEOUT_MS)
    + HEARTBEAT_GRACE_MS;
  if (claimLifetimeMs >= GENERATION_QUEUE_OPTIONS.expireInSeconds * 1_000) {
    throw new Error(
      `Execution + publication timeouts + ${HEARTBEAT_GRACE_MS} ms heartbeat grace must stay below the `
        + `${GENERATION_QUEUE_OPTIONS.expireInSeconds} s pg-boss job expiry`,
    );
  }
  const recover = async () => {
    await recoverStaleRunningGenerations({ repository: options.repository, staleAfterMs });
    await reconcileOrphanedQueuedGenerations({
      repository: options.repository,
      jobs: options.queue,
      queuedForMs: orphanQueuedAfterMs,
    });
    options.onRecoverySuccess?.();
  };

  await options.queue.start();
  await recover();

  const workerId = await options.queue.boss.work(
    options.queue.queueName,
    {
      batchSize: 1,
      localConcurrency: concurrency,
      pollingIntervalSeconds: 0.5,
    },
    async (jobs) => {
      for (const job of jobs) {
        await processGenerationJob({
          repository: options.repository,
          artifactStore: options.artifactStore,
          executor: options.executor,
          job: GenerationJobSchema.parse(job.data),
          ...(options.heartbeatIntervalMs === undefined
            ? {}
            : { heartbeatIntervalMs: options.heartbeatIntervalMs }),
          ...(options.executionTimeoutMs === undefined
            ? {}
            : { executionTimeoutMs: options.executionTimeoutMs }),
          ...(options.publishTimeoutMs === undefined ? {} : { publishTimeoutMs: options.publishTimeoutMs }),
        });
      }
    },
  );

  let stopped = false;
  let recoveryInFlight: Promise<void> = Promise.resolve();
  const recoveryTimer = setInterval(() => {
    if (stopped) return;
    recoveryInFlight = recover()
      .catch((error) => {
        options.onRecoveryError?.(error);
      });
  }, recoveryIntervalMs);
  recoveryTimer.unref?.();

  return {
    workerId,
    async stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(recoveryTimer);
      await recoveryInFlight;
      await options.queue.stop();
    },
  };
}
