import { createServer } from "node:http";

import {
  PgBossGenerationQueue,
  PostgresGenerationRepository,
  PostgresGenerationSubmissionStore,
  PostgresRateLimitStore,
  PostgresServiceUserRepository,
  createServicePostgresClient,
} from "@project/service-postgres";
import { createS3ArtifactStore } from "@project/service-s3";

import { createGenerationApiHandler } from "./api.js";
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
  const endpoint = optional("S3_ENDPOINT");
  const artifactStore = createS3ArtifactStore({
    bucket: required("S3_BUCKET"),
    region: optional("S3_REGION") ?? "us-east-1",
    ...(endpoint === undefined ? {} : { endpoint }),
    forcePathStyle: boolean("S3_FORCE_PATH_STYLE", false),
    ...(accessKeyId === undefined || secretAccessKey === undefined
      ? {}
      : { credentials: { accessKeyId, secretAccessKey } }),
  });

  const repository = new PostgresGenerationRepository(database.db);
  const users = new PostgresServiceUserRepository(database.db);
  const rateLimits = new PostgresRateLimitStore(database.db);
  const submissionStore = new PostgresGenerationSubmissionStore(database.db, queue);
  const apiHandler = createGenerationApiHandler({
    users,
    repository,
    rateLimits,
    submissionStore,
    artifactDownloads: artifactStore,
    ipHashSalt: required("API_IP_HASH_SALT"),
    trustProxy: boolean("API_TRUST_PROXY", false),
  });
  const handler = createPrivateBetaWebHandler(apiHandler);
  const server = createServer((request, response) => {
    void handler(request, response);
  });
  const host = optional("API_HOST") ?? "127.0.0.1";
  const listenPort = port();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, host, () => resolve());
  });
  console.log(JSON.stringify({ status: "READY", host, port: listenPort }));

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(JSON.stringify({ status: "STOPPING", signal }));
    await new Promise<void>((resolve) => server.close(() => resolve())).catch(() => undefined);
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
