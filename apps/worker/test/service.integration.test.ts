import path from "node:path";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { LlmJsonRequest, LlmJsonResponse, LlmProvider } from "@project/llm";
import {
  createServiceUser,
  findGeneration,
  submitGenerationAtomically,
  type GenerationRecord,
} from "@project/service-core";
import {
  PgBossGenerationQueue,
  PostgresGenerationRepository,
  PostgresGenerationSubmissionStore,
  PostgresServiceUserRepository,
  createServicePostgresClient,
} from "@project/service-postgres";
import { createS3ArtifactStore } from "@project/service-s3";
import { createFactorioGenerationExecutor } from "@project/factorio-service-executor";
import { describe, expect, it } from "vitest";

import { startGenerationWorker } from "../src/index.js";

class FixedPlannerProvider implements LlmProvider {
  readonly requests: LlmJsonRequest[] = [];

  async generateJson(request: LlmJsonRequest): Promise<LlmJsonResponse> {
    this.requests.push(request);
    return {
      value: {
        status: "supported",
        title: "Faster steel furnaces",
        slug: "faster-steel-furnaces-service-e2e",
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
      },
      provider: "service-integration-fake",
      model: "typed-planner-fixture",
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
      durationMs: 2,
    };
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing integration environment variable: ${name}`);
  return value;
}

async function waitForTerminal(
  repository: PostgresGenerationRepository,
  id: string,
  timeoutMs = 20_000,
): Promise<GenerationRecord> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const record = await findGeneration(repository, id);
    if (record && record.status !== "queued" && record.status !== "running") return record;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Generation did not reach a terminal state within ${timeoutMs} ms`);
}

describe("private-beta service infrastructure flow", () => {
  it("atomically enqueues, consumes, validates in Factorio, uploads to S3, and persists success", async () => {
    const connectionString = required("PROJECT_SERVICE_POSTGRES_URL");
    const database = createServicePostgresClient({ connectionString });
    const migrationsFolder = path.resolve(
      fileURLToPath(new URL("../../../packages/service-postgres/drizzle/", import.meta.url)),
    );
    await migrate(database.db, { migrationsFolder });

    const queue = new PgBossGenerationQueue({
      connectionString,
      schema: "project_pgboss_service_e2e",
      queueName: "factorio-generation-service-e2e",
    });
    const repository = new PostgresGenerationRepository(database.db);
    const submissionStore = new PostgresGenerationSubmissionStore(database.db, queue);
    const userId = "00000000-0000-4000-8000-000000000001";
    await new PostgresServiceUserRepository(database.db).insert(
      createServiceUser({
        label: "Worker integration tester",
        userId: () => userId,
        token: () => "beta_worker_integration_token_1234567890abcdef",
      }).user,
    );
    const artifactStore = createS3ArtifactStore({
      endpoint: required("PROJECT_SERVICE_S3_ENDPOINT"),
      bucket: required("PROJECT_SERVICE_S3_BUCKET"),
      region: "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: required("PROJECT_SERVICE_S3_ACCESS_KEY"),
        secretAccessKey: required("PROJECT_SERVICE_S3_SECRET_KEY"),
      },
    });
    const provider = new FixedPlannerProvider();
    const executor = createFactorioGenerationExecutor({ provider });
    const worker = await startGenerationWorker({
      queue,
      repository,
      artifactStore,
      executor,
      heartbeatIntervalMs: 100,
      staleAfterMs: 10_000,
      staleRecoveryIntervalMs: 5_000,
    });

    try {
      const generationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      const accepted = await submitGenerationAtomically({
        userId,
        submissionStore,
        prompt: "Make steel furnaces twice as fast",
        generationId: () => generationId,
      });
      expect(accepted.status).toBe("queued");

      const terminal = await waitForTerminal(repository, generationId);
      expect(terminal).toMatchObject({
        status: "succeeded",
        modSpec: { capability: "prototype_property" },
        artifact: {
          key: `generations/${generationId}/faster-steel-furnaces-service-e2e_0.1.0.zip`,
          contentType: "application/zip",
        },
        telemetry: {
          usage: { totalTokens: 120 },
          validation: { initialStatus: "passed", repaired: false },
        },
      });
      if (terminal.status !== "succeeded") throw new Error("Expected succeeded generation");
      expect(terminal.artifact.sizeBytes).toBeGreaterThan(0);
      expect(provider.requests).toHaveLength(1);

      const downloadUrl = await artifactStore.createDownloadUrl(terminal.artifact, 60);
      const response = await fetch(downloadUrl);
      expect(response.status).toBe(200);
      expect((await response.arrayBuffer()).byteLength).toBe(terminal.artifact.sizeBytes);
    } finally {
      await worker.stop().catch(() => undefined);
      await database.close().catch(() => undefined);
    }
  }, 30_000);
});
