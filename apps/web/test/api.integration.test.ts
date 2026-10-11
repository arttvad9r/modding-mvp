import { createServer, type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createFactorioGenerationExecutor } from "@project/factorio-service-executor";
import type { LlmJsonRequest, LlmJsonResponse, LlmProvider } from "@project/llm";
import { createServiceUser } from "@project/service-core";
import {
  PgBossGenerationQueue,
  PostgresBetaSurveyRepository,
  PostgresGenerationRepository,
  PostgresGenerationSubmissionStore,
  PostgresRateLimitStore,
  PostgresServiceUserRepository,
  createServicePostgresClient,
} from "@project/service-postgres";
import { createS3ArtifactStore } from "@project/service-s3";
import { startGenerationWorker } from "@project/worker";
import { describe, expect, it } from "vitest";

import { createGenerationApiHandler } from "../src/api.js";
import { createPrivateBetaWebHandler } from "../src/ui.js";

class FixedPlannerProvider implements LlmProvider {
  async generateJson(request: LlmJsonRequest): Promise<LlmJsonResponse> {
    const steelChange = {
      type: "prototype_property" as const,
      prototypeType: "furnace",
      prototypeName: "steel-furnace",
      property: "crafting_speed",
      operation: { type: "multiply" as const, factor: 2 },
    };
    const value =
      request.schemaName === "factorio_revision_decision"
        ? {
            status: "supported" as const,
            changes: [
              steelChange,
              {
                type: "technology_cost" as const,
                technologyName: "automation",
                operation: { type: "multiply" as const, factor: 0.5 },
              },
            ],
          }
        : {
            status: "supported" as const,
            title: "Faster steel furnaces API",
            slug: "faster-steel-furnaces-api-e2e",
            capability: "prototype_property" as const,
            changes: [steelChange],
          };
    return {
      value,
      provider: "api-integration-fake",
      model: "typed-planner-fixture",
      usage: { inputTokens: 80, outputTokens: 20, totalTokens: 100 },
      durationMs: 2,
    };
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing integration environment variable: ${name}`);
  return value;
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP server address");
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function waitForSuccess(baseUrl: string, token: string, generationId: string) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/v1/generations/${generationId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { generation: { status: string } };
    if (body.generation.status === "succeeded") return body.generation;
    if (body.generation.status === "failed" || body.generation.status === "unsupported") {
      throw new Error(`Generation terminated with status ${body.generation.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("API generation did not reach success within timeout");
}

describe("private-beta HTTP API through real service infrastructure", () => {
  it("authenticates, enqueues, validates in Factorio, serves download, and records feedback", async () => {
    const connectionString = required("PROJECT_SERVICE_POSTGRES_URL");
    const database = createServicePostgresClient({ connectionString });
    const migrationsFolder = path.resolve(
      fileURLToPath(new URL("../../../packages/service-postgres/drizzle/", import.meta.url)),
    );
    await migrate(database.db, { migrationsFolder });

    const users = new PostgresServiceUserRepository(database.db);
    const createdUser = createServiceUser({
      label: "HTTP integration tester",
      userId: () => "33333333-3333-4333-8333-333333333333",
      token: () => "beta_http_integration_token_1234567890abcdefghi",
    });
    await users.insert(createdUser.user);

    const queue = new PgBossGenerationQueue({
      connectionString,
      schema: "project_pgboss_api_e2e",
      queueName: "factorio-generation-api-e2e",
    });
    const repository = new PostgresGenerationRepository(database.db);
    const submissionStore = new PostgresGenerationSubmissionStore(database.db, queue);
    const surveys = new PostgresBetaSurveyRepository(database.db);
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
    const worker = await startGenerationWorker({
      queue,
      repository,
      artifactStore,
      executor: createFactorioGenerationExecutor({ provider: new FixedPlannerProvider() }),
      heartbeatIntervalMs: 100,
      staleAfterMs: 10_000,
      staleRecoveryIntervalMs: 5_000,
    });
    const apiHandler = createGenerationApiHandler({
      users,
      repository,
      submissionStore,
      rateLimits: new PostgresRateLimitStore(database.db),
      artifactDownloads: artifactStore,
      surveys,
      ipHashSalt: "http-integration-ip-hash-salt",
    });
    const handler = createPrivateBetaWebHandler(apiHandler);
    const server = createServer((request, response) => void handler(request, response));
    const baseUrl = await listen(server);
    const headers = {
      Authorization: `Bearer ${createdUser.accessToken}`,
      "Content-Type": "application/json",
    };

    try {
      const pageResponse = await fetch(`${baseUrl}/`);
      expect(pageResponse.status).toBe(200);
      expect(await pageResponse.text()).toContain("Describe the rebalance.");

      const createResponse = await fetch(`${baseUrl}/v1/generations`, {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt: "Make steel furnaces twice as fast" }),
      });
      expect(createResponse.status).toBe(202);
      const created = (await createResponse.json()) as { generation: { id: string; status: string; userId?: string } };
      expect(created.generation.status).toBe("queued");
      expect(created.generation.userId).toBeUndefined();

      const generation = (await waitForSuccess(baseUrl, createdUser.accessToken, created.generation.id)) as {
        status: string;
        artifact: { fileName: string; sizeBytes: number; key?: string };
      };
      expect(generation).toMatchObject({
        status: "succeeded",
        artifact: { fileName: "faster-steel-furnaces-api-e2e_0.1.0.zip" },
      });
      expect(generation.artifact.key).toBeUndefined();
      expect(generation.artifact.sizeBytes).toBeGreaterThan(0);

      const downloadResponse = await fetch(
        `${baseUrl}/v1/generations/${created.generation.id}/download`,
        { headers: { ...headers, Accept: "application/json" } },
      );
      expect(downloadResponse.status).toBe(200);
      const downloadBody = (await downloadResponse.json()) as { downloadUrl: string; expiresInSeconds: number };
      expect(downloadBody.expiresInSeconds).toBe(60);
      const artifactResponse = await fetch(downloadBody.downloadUrl);
      expect(artifactResponse.status).toBe(200);
      expect((await artifactResponse.arrayBuffer()).byteLength).toBe(generation.artifact.sizeBytes);

      const reviseResponse = await fetch(
        `${baseUrl}/v1/generations/${created.generation.id}/revise`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ prompt: "Keep the furnace tweak and also halve Automation research cost" }),
        },
      );
      expect(reviseResponse.status).toBe(202);
      const reviseBody = (await reviseResponse.json()) as {
        generation: { id: string; status: string; sourceGenerationId?: string; baseModSpec?: unknown };
        revisedFromGenerationId: string;
      };
      expect(reviseBody.revisedFromGenerationId).toBe(created.generation.id);
      expect(reviseBody.generation.sourceGenerationId).toBe(created.generation.id);
      expect(reviseBody.generation.baseModSpec).toBeUndefined();

      const revised = (await waitForSuccess(baseUrl, createdUser.accessToken, reviseBody.generation.id)) as {
        status: string;
        sourceGenerationId?: string;
        modSpec: { capability: string; changes: unknown[] };
        artifact: { fileName: string; sizeBytes: number; key?: string };
      };
      expect(revised).toMatchObject({
        status: "succeeded",
        sourceGenerationId: created.generation.id,
        modSpec: { capability: "mixed" },
        artifact: { fileName: "faster-steel-furnaces-api-e2e_0.1.0.zip" },
      });
      expect(revised.modSpec.changes).toHaveLength(2);
      expect(revised.artifact.sizeBytes).toBeGreaterThan(0);

      const feedbackResponse = await fetch(
        `${baseUrl}/v1/generations/${created.generation.id}/feedback`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ rating: "up", note: "API integration install passed" }),
        },
      );
      expect(feedbackResponse.status).toBe(200);
      const feedback = (await feedbackResponse.json()) as { generation: { feedback: { rating: string } } };
      expect(feedback.generation.feedback.rating).toBe("up");

      const surveyResponse = await fetch(`${baseUrl}/v1/survey`, {
        method: "POST",
        headers,
        body: JSON.stringify({ willingnessToPay: "yes" }),
      });
      expect(surveyResponse.status).toBe(200);
      expect(await surveys.get(createdUser.user.id)).toMatchObject({ willingnessToPay: "yes" });
    } finally {
      await closeServer(server).catch(() => undefined);
      await worker.stop().catch(() => undefined);
      await database.close().catch(() => undefined);
    }
  }, 30_000);
});
