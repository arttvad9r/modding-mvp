import {
  GenerationRecordSchema,
  type ArtifactStore,
  type GenerationExecutor,
  type GenerationRecord,
  type GenerationRepository,
  type QueuedGenerationRecord,
} from "@project/service-core";
import type { PgBossGenerationQueue } from "@project/service-postgres";
import { describe, expect, it } from "vitest";

import { startGenerationWorker } from "../src/index.js";

class MemoryRepository implements GenerationRepository {
  readonly records = new Map<string, GenerationRecord>();
  async insert(record: QueuedGenerationRecord) { this.records.set(record.id, record); }
  async get(id: string) { return this.records.get(id) ?? null; }
  async compareAndSet(id: string, revision: number, next: GenerationRecord) {
    const current = this.records.get(id);
    if (!current || current.revision !== revision) return false;
    this.records.set(id, GenerationRecordSchema.parse(next));
    return true;
  }
  async listByUserCreatedDesc(userId: string, limit: number) {
    return [...this.records.values()]
      .filter((record) => record.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }
  async listRunningUpdatedBefore() { return []; }
  async listQueuedCreatedBefore(cutoff: string, limit: number) {
    return [...this.records.values()]
      .filter((record): record is QueuedGenerationRecord =>
        record.status === "queued" && record.createdAt < cutoff)
      .slice(0, limit);
  }
}

const userId = "00000000-0000-4000-8000-000000000001";

describe("generation worker runtime", () => {
  it("registers pg-boss work, processes the generation, and stops cleanly", async () => {
    const id = "99999999-9999-4999-8999-999999999999";
    const repository = new MemoryRepository();
    repository.records.set(id, GenerationRecordSchema.parse({
      schemaVersion: 2,
      id,
      userId,
      revision: 0,
      prompt: "unsupported runtime request",
      status: "queued",
      createdAt: "2026-10-11T00:00:00.000Z",
      updatedAt: "2026-10-11T00:00:00.000Z",
    }));

    let started = 0;
    let stopped = 0;
    const inspectedJobs: string[] = [];
    let handler: ((jobs: Array<{ data: unknown }>) => Promise<void>) | undefined;
    const queue = {
      queueName: "factorio-generation",
      async start() { started += 1; },
      async stop() { stopped += 1; },
      async jobState(generationId: string) {
        inspectedJobs.push(generationId);
        return "pending";
      },
      boss: {
        async work(_name: string, _options: unknown, next: typeof handler) {
          handler = next;
          return "worker-123";
        },
      },
    } as unknown as PgBossGenerationQueue;
    const artifactStore: ArtifactStore = {
      async put() { throw new Error("unsupported result must not publish artifact"); },
      async delete() { throw new Error("unsupported result must not delete artifacts"); },
    };
    const executor: GenerationExecutor = {
      async execute() {
        return {
          status: "unsupported",
          reason: "Outside current registry",
          telemetry: {
            durationMs: 1,
            attempts: [],
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          },
        };
      },
    };

    const runtime = await startGenerationWorker({
      queue,
      repository,
      artifactStore,
      executor,
      staleRecoveryIntervalMs: 1_000,
    });
    expect(runtime.workerId).toBe("worker-123");
    expect(started).toBe(1);
    expect(inspectedJobs).toEqual([id]);
    expect(await repository.get(id)).toMatchObject({ status: "queued" });
    expect(handler).toBeDefined();

    await handler!([{ data: { schemaVersion: 1, generationId: id } }]);
    expect(await repository.get(id)).toMatchObject({ status: "unsupported", revision: 2 });

    await runtime.stop();
    expect(stopped).toBe(1);
  });

  it("refuses deadlines that would outlive the pg-boss job expiry", async () => {
    let started = 0;
    const queue = { async start() { started += 1; } } as unknown as PgBossGenerationQueue;
    await expect(startGenerationWorker({
      queue,
      repository: new MemoryRepository(),
      artifactStore: { async put() { throw new Error("unused"); }, async delete() {} },
      executor: { async execute() { throw new Error("unused"); } },
      executionTimeoutMs: 800_000,
      publishTimeoutMs: 60_000,
    })).rejects.toThrow(/pg-boss job expiry/);
    expect(started).toBe(0);
  });
});
