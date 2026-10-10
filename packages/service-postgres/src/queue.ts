import { PgBoss } from "pg-boss";

import { GenerationJobSchema, type GenerationJob, type GenerationQueue } from "@project/service-core";

export const GENERATION_QUEUE_NAME = "factorio-generation";

export interface PgBossGenerationQueueOptions {
  readonly connectionString: string;
  readonly schema?: string;
  readonly queueName?: string;
}

export class PgBossGenerationQueue implements GenerationQueue {
  readonly boss: PgBoss;
  readonly queueName: string;
  private started = false;

  constructor(options: PgBossGenerationQueueOptions) {
    this.queueName = options.queueName ?? GENERATION_QUEUE_NAME;
    this.boss = new PgBoss({
      connectionString: options.connectionString,
      backend: "postgres",
      schema: options.schema ?? "pgboss",
      application_name: "factorio-modding-service",
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    await this.boss.start();
    await this.boss.createQueue(this.queueName, {
      retryLimit: 0,
      expireInSeconds: 900,
      deleteAfterSeconds: 604_800,
    });
    this.started = true;
  }

  async enqueue(input: GenerationJob): Promise<void> {
    if (!this.started) throw new Error("PgBossGenerationQueue must be started before enqueue");
    const job = GenerationJobSchema.parse(input);
    const id = await this.boss.send(this.queueName, job, { retryLimit: 0 });
    if (id === null) throw new Error("pg-boss did not create generation job");
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    await this.boss.stop({ graceful: true });
  }
}
