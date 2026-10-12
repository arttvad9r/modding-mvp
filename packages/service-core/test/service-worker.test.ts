import { ProjectError, type ModSpec } from "@project/domain";
import { describe, expect, it } from "vitest";

import {
  GenerationRecordSchema,
  processGenerationJob,
  reconcileOrphanedQueuedGenerations,
  recoverStaleRunningGenerations,
  recordGenerationFeedback,
  submitGeneration,
  type ArtifactRef,
  type ArtifactStore,
  type ArtifactStorePutInput,
  type GenerationExecutor,
  type GenerationJob,
  type GenerationJobState,
  type GenerationQueue,
  type GenerationRecord,
  type GenerationRepository,
  type QueuedGenerationRecord,
  type ServiceGenerationExecution,
} from "../src/index.js";

const userId = "00000000-0000-4000-8000-000000000001";
const generationId = "11111111-1111-4111-8111-111111111111";
const fixedDate = new Date("2026-10-11T00:00:00.000Z");

const modSpec: ModSpec = {
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

const telemetry = {
  durationMs: 5000,
  attempts: [
    {
      kind: "planner" as const,
      attempt: 1,
      provider: "zai",
      model: "glm-5.3-flash",
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
      durationMs: 4000,
    },
  ],
  usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
  validation: {
    initialStatus: "passed" as const,
    finalDurationMs: 900,
    repaired: false,
  },
};

class MemoryRepository implements GenerationRepository {
  readonly records = new Map<string, GenerationRecord>();

  async insert(record: QueuedGenerationRecord): Promise<void> {
    if (this.records.has(record.id)) throw new Error("duplicate generation");
    this.records.set(record.id, record);
  }

  async get(id: string): Promise<GenerationRecord | null> {
    return this.records.get(id) ?? null;
  }

  async compareAndSet(
    id: string,
    expectedRevision: number,
    next: GenerationRecord,
  ): Promise<boolean> {
    const current = this.records.get(id);
    if (!current || current.revision !== expectedRevision) return false;
    this.records.set(id, GenerationRecordSchema.parse(next));
    return true;
  }

  async listByUserCreatedDesc(userId: string, limit: number) {
    return [...this.records.values()]
      .filter((record) => record.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }

  async listRunningUpdatedBefore(cutoff: string, limit: number) {
    return [...this.records.values()]
      .filter((record) => record.status === "running" && record.updatedAt < cutoff)
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .slice(0, limit)
      .map((record) => {
        if (record.status !== "running") throw new Error("Expected running record");
        return record;
      });
  }

  async listQueuedCreatedBefore(cutoff: string, limit: number) {
    return [...this.records.values()]
      .filter((record) => record.status === "queued" && record.createdAt < cutoff)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, limit)
      .map((record) => {
        if (record.status !== "queued") throw new Error("Expected queued record");
        return record;
      });
  }
}

class MemoryQueue implements GenerationQueue {
  readonly jobs: GenerationJob[] = [];
  fail = false;

  async enqueue(job: GenerationJob): Promise<void> {
    if (this.fail) throw new Error("queue unavailable");
    this.jobs.push(job);
  }
}

class MemoryArtifactStore implements ArtifactStore {
  readonly puts: ArtifactStorePutInput[] = [];
  readonly deletes: string[] = [];
  beforeReturn: (input: ArtifactStorePutInput) => Promise<void> = async () => undefined;

  async put(input: ArtifactStorePutInput): Promise<ArtifactRef> {
    this.puts.push(input);
    await this.beforeReturn(input);
    return {
      key: input.key,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.bytes.byteLength,
    };
  }

  async delete(key: string): Promise<void> {
    this.deletes.push(key);
  }
}

class FixedExecutor implements GenerationExecutor {
  calls = 0;
  lastInput: Parameters<GenerationExecutor["execute"]>[0] | undefined;

  constructor(private readonly execution: ServiceGenerationExecution) {}

  async execute(input: Parameters<GenerationExecutor["execute"]>[0]): Promise<ServiceGenerationExecution> {
    this.calls += 1;
    this.lastInput = input;
    return this.execution;
  }
}

async function queued(repository: MemoryRepository, queue = new MemoryQueue()) {
  return submitGeneration({
    userId,
    repository,
    queue,
    prompt: "Make steel furnaces twice as fast",
    generationId: () => generationId,
    now: () => fixedDate,
  });
}

describe("service submission", () => {
  it("persists a queued generation before enqueueing a small generation-id-only job", async () => {
    const repository = new MemoryRepository();
    const queue = new MemoryQueue();

    const record = await queued(repository, queue);

    expect(record).toMatchObject({ status: "queued", revision: 0 });
    expect(queue.jobs).toEqual([{ schemaVersion: 1, generationId }]);
    expect(await repository.get(generationId)).toMatchObject({ status: "queued" });
  });

  it("marks the generation failed when queue publication fails", async () => {
    const repository = new MemoryRepository();
    const queue = new MemoryQueue();
    queue.fail = true;

    await expect(queued(repository, queue)).rejects.toMatchObject({
      code: "process_error",
      retryable: true,
    });
    expect(await repository.get(generationId)).toMatchObject({
      status: "failed",
      error: { code: "process_error" },
    });
  });
});

describe("generation worker state machine", () => {
  it("claims queued work, publishes a validated ZIP, and makes duplicate delivery idempotent", async () => {
    const repository = new MemoryRepository();
    const queue = new MemoryQueue();
    await queued(repository, queue);
    const artifacts = new MemoryArtifactStore();
    const executor = new FixedExecutor({
      status: "success",
      modSpec,
      artifact: {
        fileName: "faster-steel-furnace_0.1.0.zip",
        bytes: new Uint8Array([1, 2, 3, 4]),
      },
      telemetry,
    });

    const first = await processGenerationJob({
      repository,
      artifactStore: artifacts,
      executor,
      job: queue.jobs[0]!,
      now: () => fixedDate,
    });

    expect(first).toMatchObject({
      outcome: "processed",
      record: {
        status: "succeeded",
        revision: 2,
        artifact: {
          key: `generations/${generationId}/faster-steel-furnace_0.1.0.zip`,
          sizeBytes: 4,
        },
      },
    });
    expect(artifacts.puts).toHaveLength(1);
    expect(executor.calls).toBe(1);

    const duplicate = await processGenerationJob({
      repository,
      artifactStore: artifacts,
      executor,
      job: queue.jobs[0]!,
      now: () => fixedDate,
    });
    expect(duplicate.outcome).toBe("already_terminal");
    expect(executor.calls).toBe(1);
    expect(artifacts.puts).toHaveLength(1);
  });

  it("passes an immutable base ModSpec snapshot to the executor for revision generations", async () => {
    const repository = new MemoryRepository();
    const queue = new MemoryQueue();
    const sourceGenerationId = "22222222-2222-4222-8222-222222222222";
    await submitGeneration({
      userId,
      repository,
      queue,
      prompt: "Keep the furnace tweak and halve Automation research cost",
      sourceGenerationId,
      baseModSpec: modSpec,
      generationId: () => generationId,
      now: () => fixedDate,
    });
    const executor = new FixedExecutor({
      status: "unsupported",
      reason: "Synthetic revision outcome",
      telemetry,
    });

    await processGenerationJob({
      repository,
      artifactStore: new MemoryArtifactStore(),
      executor,
      job: queue.jobs[0]!,
      now: () => fixedDate,
    });

    expect(executor.lastInput).toMatchObject({
      generationId,
      prompt: "Keep the furnace tweak and halve Automation research cost",
      baseModSpec: modSpec,
    });
    expect(await repository.get(generationId)).toMatchObject({
      sourceGenerationId,
      baseModSpec: modSpec,
    });
  });

  it("persists unsupported and failed executor outcomes without publishing artifacts", async () => {
    for (const execution of [
      { status: "unsupported" as const, reason: "Outside current registry", telemetry },
      {
        status: "failed" as const,
        modSpec,
        error: {
          code: "process_error" as const,
          stage: "process" as const,
          message: "Factorio unavailable",
          retryable: true,
        },
        telemetry,
      },
    ]) {
      const repository = new MemoryRepository();
      const queue = new MemoryQueue();
      await queued(repository, queue);
      const artifacts = new MemoryArtifactStore();
      const result = await processGenerationJob({
        repository,
        artifactStore: artifacts,
        executor: new FixedExecutor(execution),
        job: queue.jobs[0]!,
        now: () => fixedDate,
      });

      expect(result.record.status).toBe(execution.status === "unsupported" ? "unsupported" : "failed");
      expect(artifacts.puts).toHaveLength(0);
    }
  });

  it("normalizes an executor crash into a persisted retryable process failure", async () => {
    const repository = new MemoryRepository();
    const queue = new MemoryQueue();
    await queued(repository, queue);
    const executor: GenerationExecutor = {
      async execute() {
        throw new Error("worker dependency crashed");
      },
    };

    const result = await processGenerationJob({
      repository,
      artifactStore: new MemoryArtifactStore(),
      executor,
      job: queue.jobs[0]!,
      now: () => fixedDate,
    });

    expect(result.record).toMatchObject({
      status: "failed",
      error: { code: "process_error", retryable: true },
    });
  });

  it("persists an artifact-store outage as failed instead of leaving the generation running", async () => {
    const repository = new MemoryRepository();
    const queue = new MemoryQueue();
    await queued(repository, queue);
    const artifacts: ArtifactStore = {
      async put() {
        throw new Error("object storage unavailable");
      },
      async delete() {},
    };
    const executor = new FixedExecutor({
      status: "success",
      modSpec,
      artifact: {
        fileName: "faster-steel-furnace_0.1.0.zip",
        bytes: new Uint8Array([1, 2]),
      },
      telemetry,
    });

    const result = await processGenerationJob({
      repository,
      artifactStore: artifacts,
      executor,
      job: queue.jobs[0]!,
      now: () => fixedDate,
    });

    expect(result.record).toMatchObject({
      status: "failed",
      modSpec: { slug: "faster-steel-furnace" },
      error: { code: "process_error", retryable: true },
      telemetry: { usage: { totalTokens: 120 } },
    });
  });

  it("heartbeats a long-running generation and persists the terminal state from the latest revision", async () => {
    const repository = new MemoryRepository();
    const queue = new MemoryQueue();
    await queued(repository, queue);
    let tick = 0;
    const executor: GenerationExecutor = {
      async execute() {
        await new Promise((resolve) => setTimeout(resolve, 45));
        return {
          status: "unsupported",
          reason: "Synthetic long-running request",
          telemetry,
        };
      },
    };

    const result = await processGenerationJob({
      repository,
      artifactStore: new MemoryArtifactStore(),
      executor,
      job: queue.jobs[0]!,
      heartbeatIntervalMs: 10,
      now: () => new Date(fixedDate.getTime() + tick++ * 1_000),
    });

    expect(result.record.status).toBe("unsupported");
    expect(result.record.revision).toBeGreaterThan(2);
  });

  it("recovers only stale running generations with compare-and-set protection", async () => {
    const repository = new MemoryRepository();
    const stale = GenerationRecordSchema.parse({
      schemaVersion: 2,
      id: generationId,
      userId,
      revision: 4,
      prompt: "stale generation",
      status: "running",
      createdAt: "2026-10-11T00:00:00.000Z",
      updatedAt: "2026-10-11T00:01:00.000Z",
      startedAt: "2026-10-11T00:00:10.000Z",
    });
    const fresh = GenerationRecordSchema.parse({
      ...stale,
      id: "22222222-2222-4222-8222-222222222222",
      prompt: "fresh generation",
      updatedAt: "2026-10-11T00:09:30.000Z",
    });
    repository.records.set(stale.id, stale);
    repository.records.set(fresh.id, fresh);

    const recovery = await recoverStaleRunningGenerations({
      repository,
      staleAfterMs: 5 * 60_000,
      now: () => new Date("2026-10-11T00:10:00.000Z"),
    });

    expect(recovery).toEqual({ scanned: 1, recovered: 1, skipped: 0 });
    expect(await repository.get(stale.id)).toMatchObject({
      status: "failed",
      revision: 5,
      error: { code: "process_error", retryable: true },
    });
    expect(await repository.get(fresh.id)).toMatchObject({ status: "running", revision: 4 });
  });

  it("rejects an unsafe executor ZIP name before calling the artifact store", async () => {
    const repository = new MemoryRepository();
    const queue = new MemoryQueue();
    await queued(repository, queue);
    const artifacts = new MemoryArtifactStore();
    const executor = new FixedExecutor({
      status: "success",
      modSpec,
      artifact: {
        fileName: "../../escape.zip",
        bytes: new Uint8Array([1, 2]),
      },
      telemetry,
    });

    const result = await processGenerationJob({
      repository,
      artifactStore: artifacts,
      executor,
      job: queue.jobs[0]!,
      now: () => fixedDate,
    });

    expect(result.record).toMatchObject({
      status: "failed",
      error: { code: "schema_error" },
    });
    expect(artifacts.puts).toHaveLength(0);
  });
});

describe("service feedback", () => {
  it("accepts bounded feedback only after a terminal result", async () => {
    const repository = new MemoryRepository();
    const queue = new MemoryQueue();
    await queued(repository, queue);

    await expect(
      recordGenerationFeedback({
        repository,
        generationId,
        userId,
        rating: "up",
        now: () => fixedDate,
      }),
    ).rejects.toBeInstanceOf(ProjectError);

    await processGenerationJob({
      repository,
      artifactStore: new MemoryArtifactStore(),
      executor: new FixedExecutor({ status: "unsupported", reason: "Not supported", telemetry }),
      job: queue.jobs[0]!,
      now: () => fixedDate,
    });

    const updated = await recordGenerationFeedback({
      repository,
      generationId,
      userId,
      rating: "down",
      intentMatch: "partial",
      gameTest: "not_tested",
      mainIssue: "missing_capability",
      note: "Need runtime scripting",
      now: () => fixedDate,
    });
    expect(updated).toMatchObject({
      status: "unsupported",
      revision: 3,
      feedback: { rating: "down", intentMatch: "partial", gameTest: "not_tested", mainIssue: "missing_capability", note: "Need runtime scripting" },
    });
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const successExecution: ServiceGenerationExecution = {
  status: "success",
  modSpec,
  artifact: { fileName: "faster-steel-furnace_0.1.0.zip", bytes: new Uint8Array([1, 2, 3, 4]) },
  telemetry,
};

describe("generation worker deadlines and publication lifecycle", () => {
  it("keeps heartbeating through a slow upload and records finishedAt after publication", async () => {
    const repository = new MemoryRepository();
    const queue = new MemoryQueue();
    await queued(repository, queue);
    let clock = fixedDate.getTime();
    const now = () => new Date(clock);
    const artifacts = new MemoryArtifactStore();
    let recovery: Awaited<ReturnType<typeof recoverStaleRunningGenerations>> | undefined;
    artifacts.beforeReturn = async () => {
      clock += 2_000;
      await sleep(60);
      recovery = await recoverStaleRunningGenerations({ repository, staleAfterMs: 1_000, now });
    };

    const result = await processGenerationJob({
      repository,
      artifactStore: artifacts,
      executor: new FixedExecutor(successExecution),
      job: queue.jobs[0]!,
      now,
      heartbeatIntervalMs: 10,
    });

    expect(recovery).toEqual({ scanned: 0, recovered: 0, skipped: 0 });
    expect(result.record).toMatchObject({ status: "succeeded", finishedAt: new Date(clock).toISOString() });
    expect(artifacts.deletes).toEqual([]);
  });

  it("deletes the uploaded object when the claim is lost during publication", async () => {
    const repository = new MemoryRepository();
    const queue = new MemoryQueue();
    await queued(repository, queue);
    const artifacts = new MemoryArtifactStore();
    artifacts.beforeReturn = async () => {
      const current = (await repository.get(generationId))!;
      await repository.compareAndSet(generationId, current.revision, GenerationRecordSchema.parse({
        ...current,
        revision: current.revision + 1,
        status: "failed",
        finishedAt: fixedDate.toISOString(),
        error: { code: "process_error", stage: "process", message: "Generation worker heartbeat became stale", retryable: true },
      }));
      await sleep(40);
    };

    const result = await processGenerationJob({
      repository,
      artifactStore: artifacts,
      executor: new FixedExecutor(successExecution),
      job: queue.jobs[0]!,
      now: () => fixedDate,
      heartbeatIntervalMs: 10,
    });

    expect(result).toMatchObject({ outcome: "already_terminal", record: { status: "failed" } });
    expect(artifacts.deletes).toEqual([`generations/${generationId}/faster-steel-furnace_0.1.0.zip`]);
  });

  it("bounds publication time, aborts the upload, and cleans up a late object", async () => {
    const repository = new MemoryRepository();
    const queue = new MemoryQueue();
    await queued(repository, queue);
    const artifacts = new MemoryArtifactStore();
    artifacts.beforeReturn = () => new Promise<void>(() => undefined);

    const result = await processGenerationJob({
      repository,
      artifactStore: artifacts,
      executor: new FixedExecutor(successExecution),
      job: queue.jobs[0]!,
      now: () => fixedDate,
      publishTimeoutMs: 30,
    });

    expect(result.record).toMatchObject({
      status: "failed",
      error: { code: "process_error", retryable: true, message: "Artifact publication exceeded 30 ms" },
    });
    expect(artifacts.puts[0]?.signal?.aborted).toBe(true);
    expect(artifacts.deletes).toEqual([`generations/${generationId}/faster-steel-furnace_0.1.0.zip`]);
  });

  it("aborts executor work at the execution deadline and persists a retryable failure", async () => {
    const repository = new MemoryRepository();
    const queue = new MemoryQueue();
    await queued(repository, queue);
    let observed: AbortSignal | undefined;
    const executor: GenerationExecutor = {
      async execute({ signal }) {
        observed = signal;
        await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }));
        throw new ProjectError({
          code: "process_error",
          stage: "process",
          message: "Generation exceeded its execution deadline",
          retryable: true,
        });
      },
    };

    const result = await processGenerationJob({
      repository,
      artifactStore: new MemoryArtifactStore(),
      executor,
      job: queue.jobs[0]!,
      now: () => fixedDate,
      executionTimeoutMs: 30,
    });

    expect(observed?.aborted).toBe(true);
    expect(result.record).toMatchObject({
      status: "failed",
      error: { code: "process_error", retryable: true, message: "Generation exceeded its execution deadline" },
    });
  });

  it("stops renewing the claim after every deadline so recovery can end an executor that ignores cancellation", async () => {
    const repository = new MemoryRepository();
    const queue = new MemoryQueue();
    await queued(repository, queue);
    let clock = fixedDate.getTime();
    const now = () => new Date(clock);
    const artifacts = new MemoryArtifactStore();
    const executor: GenerationExecutor = {
      async execute() {
        await sleep(30);
        clock += 60 * 60_000;
        await sleep(50);
        const recovery = await recoverStaleRunningGenerations({ repository, staleAfterMs: 5 * 60_000, now });
        expect(recovery.recovered).toBe(1);
        return successExecution;
      },
    };

    const result = await processGenerationJob({
      repository,
      artifactStore: artifacts,
      executor,
      job: queue.jobs[0]!,
      now,
      heartbeatIntervalMs: 10,
    });

    expect(result.record).toMatchObject({ status: "failed", error: { message: "Generation worker heartbeat became stale" } });
    expect(artifacts.deletes).toEqual([`generations/${generationId}/faster-steel-furnace_0.1.0.zip`]);
  });
});

describe("orphaned queued generation reconciliation", () => {
  const ids = {
    pending: "22222222-2222-4222-8222-222222222222",
    active: "33333333-3333-4333-8333-333333333333",
    finished: "44444444-4444-4444-8444-444444444444",
    missing: "55555555-5555-4555-8555-555555555555",
    fresh: "66666666-6666-4666-8666-666666666666",
  } as const;

  async function seed(repository: MemoryRepository, id: string, createdAt: Date) {
    await submitGeneration({
      userId,
      repository,
      queue: new MemoryQueue(),
      prompt: "Make steel furnaces twice as fast",
      generationId: () => id,
      now: () => createdAt,
    });
  }

  it("fails only queued records whose job can no longer start them, as a retryable failure", async () => {
    const repository = new MemoryRepository();
    const old = new Date(fixedDate.getTime() - 10 * 60_000);
    for (const id of [ids.pending, ids.active, ids.finished, ids.missing]) await seed(repository, id, old);
    await seed(repository, ids.fresh, fixedDate);
    const states = new Map<string, GenerationJobState>([
      [ids.pending, "pending"],
      [ids.active, "active"],
      [ids.finished, "finished"],
      [ids.missing, "missing"],
      [ids.fresh, "missing"],
    ]);
    const inspected: string[] = [];

    const result = await reconcileOrphanedQueuedGenerations({
      repository,
      jobs: { async jobState(id) { inspected.push(id); return states.get(id)!; } },
      queuedForMs: 60_000,
      now: () => fixedDate,
    });

    expect(result).toEqual({ scanned: 4, failed: 2, skipped: 2 });
    expect(inspected).not.toContain(ids.fresh);
    expect(await repository.get(ids.pending)).toMatchObject({ status: "queued" });
    expect(await repository.get(ids.active)).toMatchObject({ status: "queued" });
    expect(await repository.get(ids.fresh)).toMatchObject({ status: "queued" });
    for (const id of [ids.finished, ids.missing]) {
      expect(await repository.get(id)).toMatchObject({
        status: "failed",
        finishedAt: fixedDate.toISOString(),
        error: { code: "process_error", retryable: true, details: { jobState: states.get(id) } },
      });
    }
  });

  it("does not overwrite a record that a worker claimed concurrently", async () => {
    const repository = new MemoryRepository();
    await seed(repository, ids.finished, new Date(fixedDate.getTime() - 10 * 60_000));

    const result = await reconcileOrphanedQueuedGenerations({
      repository,
      jobs: {
        async jobState(id) {
          const current = (await repository.get(id))!;
          await repository.compareAndSet(id, current.revision, GenerationRecordSchema.parse({
            ...current,
            revision: current.revision + 1,
            status: "running",
            startedAt: fixedDate.toISOString(),
            updatedAt: fixedDate.toISOString(),
          }));
          return "finished";
        },
      },
      queuedForMs: 60_000,
      now: () => fixedDate,
    });

    expect(result).toEqual({ scanned: 1, failed: 0, skipped: 1 });
    expect(await repository.get(ids.finished)).toMatchObject({ status: "running" });
  });
});
