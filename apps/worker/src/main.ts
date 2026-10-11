import { createFactorioGenerationExecutor } from "@project/factorio-service-executor";
import { createConfiguredLlmProviderChain } from "@project/llm";
import {
  PgBossGenerationQueue,
  PostgresGenerationRepository,
  createServicePostgresClient,
} from "@project/service-postgres";
import { createS3ArtifactStore } from "@project/service-s3";

import { startGenerationWorker } from "./runtime.js";

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function required(name: string): string {
  const value = optional(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function boolean(name: string, fallback: boolean): boolean {
  const value = optional(name);
  if (value === undefined) return fallback;
  if (value === "1" || value.toLowerCase() === "true") return true;
  if (value === "0" || value.toLowerCase() === "false") return false;
  throw new Error(`${name} must be true/false or 1/0`);
}

function positiveInteger(name: string): number | undefined {
  const raw = optional(name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

async function main(): Promise<void> {
  const connectionString = required("DATABASE_URL");
  const llm = createConfiguredLlmProviderChain(process.env, {}, (error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(JSON.stringify({ type: "llm_provider_failover", message }));
  });
  const database = createServicePostgresClient({ connectionString });
  const repository = new PostgresGenerationRepository(database.db);
  const queue = new PgBossGenerationQueue({
    connectionString,
    schema: optional("PG_BOSS_SCHEMA") ?? "project_pgboss",
  });

  const accessKeyId = optional("S3_ACCESS_KEY_ID");
  const secretAccessKey = optional("S3_SECRET_ACCESS_KEY");
  if ((accessKeyId === undefined) !== (secretAccessKey === undefined)) {
    throw new Error("S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured together");
  }
  const s3Endpoint = optional("S3_ENDPOINT");
  const artifactStore = createS3ArtifactStore({
    bucket: required("S3_BUCKET"),
    region: optional("S3_REGION") ?? "us-east-1",
    ...(s3Endpoint === undefined ? {} : { endpoint: s3Endpoint }),
    forcePathStyle: boolean("S3_FORCE_PATH_STYLE", false),
    ...(accessKeyId === undefined || secretAccessKey === undefined
      ? {}
      : { credentials: { accessKeyId, secretAccessKey } }),
  });
  const factorioBin = optional("FACTORIO_BIN");
  const executor = createFactorioGenerationExecutor({
    provider: llm.provider,
    ...(factorioBin === undefined ? {} : { factorioBin }),
  });

  const concurrency = positiveInteger("WORKER_CONCURRENCY");
  const heartbeatIntervalMs = positiveInteger("WORKER_HEARTBEAT_MS");
  const staleAfterMs = positiveInteger("WORKER_STALE_AFTER_MS");
  const staleRecoveryIntervalMs = positiveInteger("WORKER_RECOVERY_INTERVAL_MS");
  const runtime = await startGenerationWorker({
    queue,
    repository,
    artifactStore,
    executor,
    ...(concurrency === undefined ? {} : { concurrency }),
    ...(heartbeatIntervalMs === undefined ? {} : { heartbeatIntervalMs }),
    ...(staleAfterMs === undefined ? {} : { staleAfterMs }),
    ...(staleRecoveryIntervalMs === undefined ? {} : { staleRecoveryIntervalMs }),
    onRecoveryError(error) {
      console.error(JSON.stringify({ type: "worker_recovery_error", message: String(error) }));
    },
  });

  console.log(
    JSON.stringify({
      status: "READY",
      workerId: runtime.workerId,
      provider: llm.primary.id,
      model: llm.primary.model,
      ...(llm.fallback === undefined ? {} : { fallbackProvider: llm.fallback.id, fallbackModel: llm.fallback.model }),
      queue: queue.queueName,
    }),
  );

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(JSON.stringify({ status: "STOPPING", signal }));
    await runtime.stop().catch((error) => console.error(String(error)));
    await database.close().catch((error) => console.error(String(error)));
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "ERROR", message: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
