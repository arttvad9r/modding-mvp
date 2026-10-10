import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  submitGeneration,
  submitGenerationAtomically,
  type GenerationRecord,
} from "@project/service-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  GENERATION_QUEUE_NAME,
  PgBossGenerationQueue,
  PostgresGenerationRepository,
  PostgresGenerationSubmissionStore,
  createServicePostgresClient,
} from "../src/index.js";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryRoot = path.resolve(packageRoot, "../..");
const defaultBinDir = path.join(repositoryRoot, ".tools/postgresql/18.6/bin");
const binDir = process.env.PROJECT_POSTGRES_BIN_DIR ?? defaultBinDir;

async function withStepTimeout<T>(label: string, promise: Promise<T>, timeoutMs = 10_000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function freeTcpPort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("Could not allocate TCP port")));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

describe("PostgreSQL service adapters", () => {
  let workRoot: string;
  let dataDirectory: string;
  let socketDirectory: string;
  let port: number;
  let connectionString: string;
  let client: ReturnType<typeof createServicePostgresClient>;
  let queue: PgBossGenerationQueue;

  beforeAll(async () => {
    workRoot = await mkdtemp(path.join(os.tmpdir(), "modding-service-postgres-"));
    dataDirectory = path.join(workRoot, "data");
    socketDirectory = path.join(workRoot, "socket");
    await mkdir(socketDirectory);
    port = await freeTcpPort();

    await withStepTimeout(
      "initdb",
      execFileAsync(path.join(binDir, "initdb"), [
        "-D",
        dataDirectory,
        "--auth=trust",
        "--encoding=UTF8",
        "--no-locale",
      ]),
    );
    await withStepTimeout(
      "pg_ctl start",
      execFileAsync(path.join(binDir, "pg_ctl"), [
        "-D",
        dataDirectory,
        "-l",
        path.join(workRoot, "postgres.log"),
        "-o",
        `-h 127.0.0.1 -p ${port} -k ${socketDirectory}`,
        "-w",
        "start",
      ]),
    );

    const user = encodeURIComponent(os.userInfo().username);
    connectionString = `postgresql://${user}@127.0.0.1:${port}/postgres`;
    client = createServicePostgresClient({ connectionString });
    await withStepTimeout(
      "Drizzle migrate",
      migrate(client.db, { migrationsFolder: path.join(packageRoot, "drizzle") }),
    );

    queue = new PgBossGenerationQueue({ connectionString, schema: "project_pgboss" });
    await withStepTimeout("pg-boss start", queue.start());
  }, 30_000);

  afterAll(async () => {
    await queue?.stop().catch(() => undefined);
    await client?.close().catch(() => undefined);
    if (dataDirectory) {
      await execFileAsync(path.join(binDir, "pg_ctl"), ["-D", dataDirectory, "-m", "fast", "-w", "stop"]).catch(
        () => undefined,
      );
    }
    if (workRoot) await rm(workRoot, { recursive: true, force: true });
  }, 30_000);

  it("migrates, persists/reloads records with revision CAS, and round-trips pg-boss jobs", async () => {
    const repository = new PostgresGenerationRepository(client.db);
    const generationId = "33333333-3333-4333-8333-333333333333";
    const now = new Date("2026-10-11T00:00:00.000Z");

    const queued = await submitGeneration({
      repository,
      queue,
      prompt: "Make steel furnaces twice as fast",
      generationId: () => generationId,
      now: () => now,
    });
    expect(queued).toMatchObject({ status: "queued", revision: 0 });
    expect(await repository.get(generationId)).toEqual(queued);

    const jobs = await queue.boss.fetch<{ schemaVersion: 1; generationId: string }>(GENERATION_QUEUE_NAME);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data).toEqual({ schemaVersion: 1, generationId });
    if (jobs[0]) await queue.boss.complete(GENERATION_QUEUE_NAME, jobs[0].id);

    const running: GenerationRecord = {
      ...queued,
      revision: 1,
      status: "running",
      startedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    expect(await repository.compareAndSet(generationId, 0, running)).toBe(true);
    expect(await repository.compareAndSet(generationId, 0, running)).toBe(false);
    expect(await repository.get(generationId)).toEqual(running);
    expect(
      await repository.listRunningUpdatedBefore(
        new Date(now.getTime() + 60_000).toISOString(),
        10,
      ),
    ).toEqual([running]);
  });

  it("commits generation + pg-boss job atomically and rolls the row back when enqueue fails", async () => {
    const repository = new PostgresGenerationRepository(client.db);
    const submissionStore = new PostgresGenerationSubmissionStore(client.db, queue);
    const now = new Date("2026-10-11T00:01:00.000Z");
    const successId = "55555555-5555-4555-8555-555555555555";

    const accepted = await submitGenerationAtomically({
      submissionStore,
      prompt: "Double automation research cost",
      generationId: () => successId,
      now: () => now,
    });
    expect(await repository.get(successId)).toEqual(accepted);
    const [job] = await queue.boss.fetch<{ schemaVersion: 1; generationId: string }>(GENERATION_QUEUE_NAME);
    expect(job?.data).toEqual({ schemaVersion: 1, generationId: successId });
    if (job) await queue.boss.complete(GENERATION_QUEUE_NAME, job.id);

    await queue.boss.deleteQueue(GENERATION_QUEUE_NAME);
    const rolledBackId = "66666666-6666-4666-8666-666666666666";
    await expect(
      submitGenerationAtomically({
        submissionStore,
        prompt: "Double logistics research cost",
        generationId: () => rolledBackId,
        now: () => now,
      }),
    ).rejects.toMatchObject({ code: "process_error", retryable: true });
    expect(await repository.get(rolledBackId)).toBeNull();

    await queue.boss.createQueue(GENERATION_QUEUE_NAME, {
      retryLimit: 0,
      expireInSeconds: 900,
      deleteAfterSeconds: 604_800,
    });
  });
});
