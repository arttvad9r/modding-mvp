import { and, asc, desc, eq, lt } from "drizzle-orm";

import {
  GenerationRecordSchema,
  type GenerationRecord,
  type GenerationRepository,
  type QueuedGenerationRecord,
  type RunningGenerationRecord,
} from "@project/service-core";

import type { ServicePostgresDb } from "./db.js";
import { generations, type GenerationRow } from "./schema.js";

function rowToRecord(row: GenerationRow): GenerationRecord {
  const record = GenerationRecordSchema.parse(row.record);
  if (
    record.id !== row.id ||
    record.userId !== row.userId ||
    record.revision !== row.revision ||
    record.status !== row.status ||
    record.prompt !== row.prompt ||
    record.createdAt !== row.createdAt.toISOString() ||
    record.updatedAt !== row.updatedAt.toISOString()
  ) {
    throw new Error(`Generation row metadata diverges from record JSON: ${row.id}`);
  }
  return record;
}

export function generationRecordValues(record: GenerationRecord) {
  return {
    id: record.id,
    userId: record.userId,
    revision: record.revision,
    status: record.status,
    prompt: record.prompt,
    record,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

export class PostgresGenerationRepository implements GenerationRepository {
  constructor(private readonly db: ServicePostgresDb) {}

  async insert(input: QueuedGenerationRecord): Promise<void> {
    const record = GenerationRecordSchema.parse(input);
    if (record.status !== "queued") throw new Error("GenerationRepository.insert requires queued status");
    await this.db.insert(generations).values(generationRecordValues(record));
  }

  async get(id: string): Promise<GenerationRecord | null> {
    const rows = await this.db.select().from(generations).where(eq(generations.id, id)).limit(1);
    const row = rows[0];
    return row === undefined ? null : rowToRecord(row);
  }

  async compareAndSet(
    id: string,
    expectedRevision: number,
    nextInput: GenerationRecord,
  ): Promise<boolean> {
    const next = GenerationRecordSchema.parse(nextInput);
    if (next.id !== id) throw new Error("GenerationRepository.compareAndSet cannot change generation id");
    if (next.revision !== expectedRevision + 1) {
      throw new Error("GenerationRepository.compareAndSet requires next revision = expected revision + 1");
    }

    const rows = await this.db
      .update(generations)
      .set(generationRecordValues(next))
      .where(and(eq(generations.id, id), eq(generations.revision, expectedRevision)))
      .returning({ id: generations.id });
    return rows.length === 1;
  }

  async listByUserCreatedDesc(userId: string, limit: number): Promise<readonly GenerationRecord[]> {
    const rows = await this.db
      .select()
      .from(generations)
      .where(eq(generations.userId, userId))
      .orderBy(desc(generations.createdAt))
      .limit(limit);
    return rows.map(rowToRecord);
  }

  async listRunningUpdatedBefore(
    cutoff: string,
    limit: number,
  ): Promise<readonly RunningGenerationRecord[]> {
    const rows = await this.db
      .select()
      .from(generations)
      .where(and(eq(generations.status, "running"), lt(generations.updatedAt, new Date(cutoff))))
      .orderBy(asc(generations.updatedAt))
      .limit(limit);
    return rows.map((row) => {
      const record = rowToRecord(row);
      if (record.status !== "running") throw new Error(`Expected running generation: ${record.id}`);
      return record;
    });
  }

  async listQueuedCreatedBefore(
    cutoff: string,
    limit: number,
  ): Promise<readonly QueuedGenerationRecord[]> {
    const rows = await this.db
      .select()
      .from(generations)
      .where(and(eq(generations.status, "queued"), lt(generations.createdAt, new Date(cutoff))))
      .orderBy(asc(generations.createdAt))
      .limit(limit);
    return rows.map((row) => {
      const record = rowToRecord(row);
      if (record.status !== "queued") throw new Error(`Expected queued generation: ${record.id}`);
      return record;
    });
  }
}
