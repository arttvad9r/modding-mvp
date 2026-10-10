import { ProjectError, type ModSpec } from "@project/domain";
import { describe, expect, it } from "vitest";

import {
  GenerationRecordSchema,
  processGenerationJob,
  recordGenerationFeedback,
  submitGeneration,
  type ArtifactRef,
  type ArtifactStore,
  type ArtifactStorePutInput,
  type GenerationExecutor,
  type GenerationJob,
  type GenerationQueue,
  type GenerationRecord,
  type GenerationRepository,
  type QueuedGenerationRecord,
  type ServiceGenerationExecution,
} from "../src/index.js";

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

  async put(input: ArtifactStorePutInput): Promise<ArtifactRef> {
    this.puts.push(input);
    return {
      key: input.key,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.bytes.byteLength,
    };
  }
}

class FixedExecutor implements GenerationExecutor {
  calls = 0;

  constructor(private readonly execution: ServiceGenerationExecution) {}

  async execute(): Promise<ServiceGenerationExecution> {
    this.calls += 1;
    return this.execution;
  }
}

async function queued(repository: MemoryRepository, queue = new MemoryQueue()) {
  return submitGeneration({
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
      rating: "down",
      note: "Need runtime scripting",
      now: () => fixedDate,
    });
    expect(updated).toMatchObject({
      status: "unsupported",
      revision: 3,
      feedback: { rating: "down", note: "Need runtime scripting" },
    });
  });
});
