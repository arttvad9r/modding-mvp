import { sql } from "drizzle-orm";
import { fromDrizzle } from "pg-boss";

import {
  GenerationJobSchema,
  GenerationRecordSchema,
  type GenerationJob,
  type GenerationSubmissionStore,
  type QueuedGenerationRecord,
} from "@project/service-core";

import type { ServicePostgresDb } from "./db.js";
import { GENERATION_QUEUE_OPTIONS, PgBossGenerationQueue } from "./queue.js";
import { generationRecordValues } from "./repository.js";
import { generations } from "./schema.js";

export class PostgresGenerationSubmissionStore implements GenerationSubmissionStore {
  constructor(
    private readonly db: ServicePostgresDb,
    private readonly queue: PgBossGenerationQueue,
  ) {}

  async submit(recordInput: QueuedGenerationRecord, jobInput: GenerationJob): Promise<void> {
    const record = GenerationRecordSchema.parse(recordInput);
    if (record.status !== "queued") throw new Error("Atomic generation submission requires queued status");
    const job = GenerationJobSchema.parse(jobInput);
    if (job.generationId !== record.id) {
      throw new Error("Atomic generation submission job id must match generation record id");
    }

    await this.db.transaction(async (tx) => {
      await tx.insert(generations).values(generationRecordValues(record));
      const jobId = await this.queue.boss.send(this.queue.queueName, job, {
        retryLimit: GENERATION_QUEUE_OPTIONS.retryLimit,
        db: fromDrizzle(tx, sql),
      });
      if (jobId === null) throw new Error("pg-boss did not create generation job");
    });
  }
}
