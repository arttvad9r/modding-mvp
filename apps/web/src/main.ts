import { createServer } from "node:http";

import {
  PgBossGenerationQueue,
  PostgresBetaSurveyRepository,
  PostgresGenerationRepository,
  PostgresGenerationSubmissionStore,
  PostgresRateLimitStore,
  PostgresServiceUserRepository,
  createServicePostgresClient,
  deleteExpiredRateLimitBuckets,
} from "@project/service-postgres";
import { createS3ArtifactStore } from "@project/service-s3";

import { createGenerationApiHandler } from "./api.js";
import { createReadinessProbe, serviceReadinessChecks } from "./readiness.js";
import { createWebRequestListener } from "./server.js";
import { createPrivateBetaWebHandler } from "./ui.js";

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

function boundedInteger(name: string, fallback: number, min: number, max: number): number {
  const raw = optional(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer ${min}..${max}`);
  return value;
}

function port(): number {
  const raw = optional("API_PORT") ?? "3000";
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) throw new Error("API_PORT must be 1..65535");
  return value;
}

async function main(): Promise<void> {
  const connectionString = required("DATABASE_URL");
  const database = createServicePostgresClient({ connectionString });
  const queue = new PgBossGenerationQueue({
    connectionString,
    schema: optional("PG_BOSS_SCHEMA") ?? "project_pgboss",
  });
  await queue.start();

  const accessKeyId = optional("S3_ACCESS_KEY_ID");
  const secretAccessKey = optional("S3_SECRET_ACCESS_KEY");
  if ((accessKeyId === undefined) !== (secretAccessKey === undefined)) {
    throw new Error("S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured together");
  }
  const storeAt = (endpoint: string | undefined) => createS3ArtifactStore({
    bucket: required("S3_BUCKET"),
    region: optional("S3_REGION") ?? "us-east-1",
    ...(endpoint === undefined ? {} : { endpoint }),
    forcePathStyle: boolean("S3_FORCE_PATH_STYLE", false),
    ...(accessKeyId === undefined || secretAccessKey === undefined
      ? {}
      : { credentials: { accessKeyId, secretAccessKey } }),
  });
  // Web only signs download URLs against S3_ENDPOINT, which may be a public name that does not
  // resolve inside the container; readiness can probe the same bucket through an internal endpoint.
  const artifactStore = storeAt(optional("S3_ENDPOINT"));
  const readinessEndpoint = optional("S3_READINESS_ENDPOINT");
  const readinessStore = readinessEndpoint === undefined ? artifactStore : storeAt(readinessEndpoint);

  const repository = new PostgresGenerationRepository(database.db);
  const users = new PostgresServiceUserRepository(database.db);
  const rateLimits = new PostgresRateLimitStore(database.db);
  const surveys = new PostgresBetaSurveyRepository(database.db);
  const submissionStore = new PostgresGenerationSubmissionStore(database.db, queue);
  const readiness = createReadinessProbe({
    checks: serviceReadinessChecks({ database: database.pool, queue, storage: readinessStore }),
    onCheckFailure: (component, error) => {
      console.error(JSON.stringify({
        type: "readiness_check_failed",
        component,
        message: error instanceof Error ? error.message : String(error),
      }));
    },
  });
  const apiHandler = createGenerationApiHandler({
    users,
    repository,
    rateLimits,
    submissionStore,
    artifactDownloads: artifactStore,
    surveys,
    ipHashSalt: required("API_IP_HASH_SALT"),
    trustProxy: boolean("API_TRUST_PROXY", false),
    readiness,
  });
  const handler = createPrivateBetaWebHandler(apiHandler);
  const server = createServer(createWebRequestListener(handler));
  const host = optional("API_HOST") ?? "127.0.0.1";
  const listenPort = port();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, host, () => resolve());
  });
  console.log(JSON.stringify({ status: "READY", host, port: listenPort }));

  const cleanupIntervalMs = boundedInteger("RATE_LIMIT_CLEANUP_INTERVAL_MS", 15 * 60_000, 60_000, 24 * 60 * 60_000);
  let cleanupInFlight: Promise<void> = Promise.resolve();
  const cleanupRateLimits = () => {
    cleanupInFlight = deleteExpiredRateLimitBuckets(database.db)
      .then((result) => {
        if (result.deleted > 0 || result.truncated) {
          console.log(JSON.stringify({ type: "rate_limit_cleanup", ...result }));
        }
      })
      .catch((error) => {
        console.error(JSON.stringify({ type: "rate_limit_cleanup_error", message: String(error) }));
      });
  };
  cleanupRateLimits();
  const cleanupTimer = setInterval(cleanupRateLimits, cleanupIntervalMs);
  cleanupTimer.unref();

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(JSON.stringify({ status: "STOPPING", signal }));
    clearInterval(cleanupTimer);
    await new Promise<void>((resolve) => server.close(() => resolve())).catch(() => undefined);
    await cleanupInFlight;
    await queue.stop().catch(() => undefined);
    await database.close().catch(() => undefined);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "ERROR", message: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
