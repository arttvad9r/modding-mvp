import { createServer, type Server } from "node:http";

import {
  GenerationRecordSchema,
  createServiceUser,
  type ArtifactDownloadSigner,
  type BetaSurveyRepository,
  type BetaSurveyResponse,
  type GenerationJob,
  type GenerationRecord,
  type GenerationRepository,
  type GenerationSubmissionStore,
  type QueuedGenerationRecord,
  type RateLimitConsumeInput,
  type RateLimitDecision,
  type RateLimitStore,
  type ServiceUser,
  type ServiceUserRepository,
} from "@project/service-core";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_API_RATE_LIMIT_POLICY,
  createGenerationApiHandler,
  type ApiRateLimitPolicy,
} from "../src/api.js";

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
  async listRunningUpdatedBefore() { return []; }
}

class MemoryUsers implements ServiceUserRepository {
  readonly users: ServiceUser[] = [];
  async insert(user: ServiceUser) { this.users.push(user); }
  async findByTokenHash(tokenHash: string) { return this.users.find((user) => user.tokenHash === tokenHash) ?? null; }
  async get(id: string) { return this.users.find((user) => user.id === id) ?? null; }
}

class MemorySubmissionStore implements GenerationSubmissionStore {
  readonly jobs: GenerationJob[] = [];
  constructor(private readonly repository: MemoryRepository) {}
  async submit(record: QueuedGenerationRecord, job: GenerationJob) {
    await this.repository.insert(record);
    this.jobs.push(job);
  }
}

class MemorySurveys implements BetaSurveyRepository {
  readonly responses = new Map<string, BetaSurveyResponse>();
  async upsert(response: BetaSurveyResponse) { this.responses.set(response.userId, response); }
  async get(userId: string) { return this.responses.get(userId) ?? null; }
}

class MemoryRateLimits implements RateLimitStore {
  private readonly counts = new Map<string, number>();
  async consume(input: RateLimitConsumeInput): Promise<RateLimitDecision> {
    const count = (this.counts.get(input.key) ?? 0) + 1;
    this.counts.set(input.key, count);
    const now = input.now ?? new Date();
    return {
      allowed: count <= input.limit,
      limit: input.limit,
      remaining: Math.max(0, input.limit - count),
      resetAt: new Date(now.getTime() + input.windowMs).toISOString(),
    };
  }
}

class FixedDownloadSigner implements ArtifactDownloadSigner {
  readonly keys: string[] = [];
  async createDownloadUrl(artifact: { key: string }) {
    this.keys.push(artifact.key);
    return `https://download.invalid/${encodeURIComponent(artifact.key)}`;
  }
}

interface TestApi {
  readonly repository: MemoryRepository;
  readonly submissionStore: MemorySubmissionStore;
  readonly signer: FixedDownloadSigner;
  readonly surveys: MemorySurveys;
  readonly user: ServiceUser;
  readonly token: string;
  readonly otherUser: ServiceUser;
  readonly otherToken: string;
  readonly baseUrl: string;
  readonly server: Server;
}

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
});

async function startApi(policy: ApiRateLimitPolicy = DEFAULT_API_RATE_LIMIT_POLICY): Promise<TestApi> {
  const repository = new MemoryRepository();
  const users = new MemoryUsers();
  const submissionStore = new MemorySubmissionStore(repository);
  const signer = new FixedDownloadSigner();
  const surveys = new MemorySurveys();
  const first = createServiceUser({
    label: "First tester",
    userId: () => "11111111-1111-4111-8111-111111111111",
    token: () => "beta_first_test_token_abcdefghijklmnopqrstuvwxyz",
  });
  const second = createServiceUser({
    label: "Second tester",
    userId: () => "22222222-2222-4222-8222-222222222222",
    token: () => "beta_second_test_token_abcdefghijklmnopqrstuvwxyz",
  });
  await users.insert(first.user);
  await users.insert(second.user);
  const handler = createGenerationApiHandler({
    users,
    repository,
    submissionStore,
    rateLimits: new MemoryRateLimits(),
    artifactDownloads: signer,
    surveys,
    ipHashSalt: "0123456789abcdef-test-salt",
    rateLimitPolicy: policy,
    now: () => new Date("2026-10-11T00:00:00.000Z"),
  });
  const server = createServer((request, response) => void handler(request, response));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP server address");
  return {
    repository,
    submissionStore,
    signer,
    surveys,
    user: first.user,
    token: first.accessToken,
    otherUser: second.user,
    otherToken: second.accessToken,
    baseUrl: `http://127.0.0.1:${address.port}`,
    server,
  };
}

function auth(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function submit(api: TestApi, token = api.token) {
  return fetch(`${api.baseUrl}/v1/generations`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ prompt: "Make steel furnaces twice as fast" }),
  });
}

const modSpec = {
  title: "Faster steel furnaces",
  slug: "faster-steel-furnaces",
  target: { game: "factorio", channel: "stable", versionLine: "2.0" },
  capability: "prototype_property",
  changes: [{
    type: "prototype_property",
    prototypeType: "furnace",
    prototypeName: "steel-furnace",
    property: "crafting_speed",
    operation: { type: "multiply", factor: 2 },
  }],
  assertions: [{
    type: "prototype_property_matches",
    prototypeType: "furnace",
    prototypeName: "steel-furnace",
    property: "crafting_speed",
    expectation: { type: "multiply", factor: 2 },
  }],
} as const;

const telemetry = {
  durationMs: 100,
  attempts: [],
  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  validation: { initialStatus: "passed", finalDurationMs: 50, repaired: false },
} as const;

describe("private-beta HTTP API", () => {
  it("keeps health public but requires a bearer token for generation routes", async () => {
    const api = await startApi();
    expect((await fetch(`${api.baseUrl}/health/live`)).status).toBe(200);
    const response = await fetch(`${api.baseUrl}/v1/generations`);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "unauthorized" } });
  });

  it("submits an owned generation asynchronously and hides internal ownership metadata", async () => {
    const api = await startApi();
    const response = await submit(api);
    expect(response.status).toBe(202);
    const body = (await response.json()) as { generation: Record<string, unknown> };
    expect(body.generation).toMatchObject({ status: "queued", prompt: "Make steel furnaces twice as fast" });
    expect(body.generation).not.toHaveProperty("userId");
    expect(api.submissionStore.jobs).toHaveLength(1);
    const [record] = [...api.repository.records.values()];
    expect(record?.userId).toBe(api.user.id);
  });

  it("returns 404 instead of leaking a generation owned by another user", async () => {
    const api = await startApi();
    const created = (await (await submit(api)).json()) as { generation: { id: string } };
    const response = await fetch(`${api.baseUrl}/v1/generations/${created.generation.id}`, {
      headers: auth(api.otherToken),
    });
    expect(response.status).toBe(404);
  });

  it("records willingness-to-pay survey responses per authenticated beta user", async () => {
    const api = await startApi();
    const response = await fetch(`${api.baseUrl}/v1/survey`, {
      method: "POST",
      headers: auth(api.token),
      body: JSON.stringify({ willingnessToPay: "yes" }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      survey: { willingnessToPay: "yes" },
    });
    expect(await api.surveys.get(api.user.id)).toMatchObject({
      userId: api.user.id,
      willingnessToPay: "yes",
    });
  });

  it("retries only retryable failures by creating a new immutable generation", async () => {
    const api = await startApi();
    const created = (await (await submit(api)).json()) as { generation: { id: string } };
    const queued = api.repository.records.get(created.generation.id);
    if (!queued) throw new Error("Missing queued generation");

    const tooEarly = await fetch(`${api.baseUrl}/v1/generations/${queued.id}/retry`, {
      method: "POST",
      headers: auth(api.token),
    });
    expect(tooEarly.status).toBe(409);

    const failed = GenerationRecordSchema.parse({
      ...queued,
      revision: 1,
      status: "failed",
      updatedAt: "2026-10-11T00:00:02.000Z",
      finishedAt: "2026-10-11T00:00:02.000Z",
      error: {
        code: "process_error",
        stage: "process",
        message: "Transient worker failure",
        retryable: true,
      },
    });
    api.repository.records.set(queued.id, failed);

    const retriedResponse = await fetch(`${api.baseUrl}/v1/generations/${queued.id}/retry`, {
      method: "POST",
      headers: auth(api.token),
    });
    expect(retriedResponse.status).toBe(202);
    const retriedBody = (await retriedResponse.json()) as {
      generation: { id: string; status: string; prompt: string };
      retriedFromGenerationId: string;
    };
    expect(retriedBody.retriedFromGenerationId).toBe(queued.id);
    expect(retriedBody.generation).toMatchObject({ status: "queued", prompt: queued.prompt });
    expect(retriedBody.generation.id).not.toBe(queued.id);
    expect(api.repository.records.get(queued.id)).toEqual(failed);
    expect(api.submissionStore.jobs).toHaveLength(2);
  });

  it("revises only an owned successful generation by creating a new immutable generation", async () => {
    const api = await startApi();
    const created = (await (await submit(api)).json()) as { generation: { id: string } };
    const queued = api.repository.records.get(created.generation.id);
    if (!queued) throw new Error("Missing queued generation");

    const tooEarly = await fetch(`${api.baseUrl}/v1/generations/${queued.id}/revise`, {
      method: "POST",
      headers: auth(api.token),
      body: JSON.stringify({ prompt: "Also halve Automation research cost" }),
    });
    expect(tooEarly.status).toBe(409);

    const succeeded = GenerationRecordSchema.parse({
      ...queued,
      revision: 1,
      status: "succeeded",
      startedAt: "2026-10-11T00:00:01.000Z",
      finishedAt: "2026-10-11T00:00:02.000Z",
      updatedAt: "2026-10-11T00:00:02.000Z",
      modSpec,
      artifact: {
        key: `generations/${queued.id}/faster-steel-furnaces_0.1.0.zip`,
        fileName: "faster-steel-furnaces_0.1.0.zip",
        contentType: "application/zip",
        sizeBytes: 321,
      },
      telemetry,
    });
    api.repository.records.set(queued.id, succeeded);

    const response = await fetch(`${api.baseUrl}/v1/generations/${queued.id}/revise`, {
      method: "POST",
      headers: auth(api.token),
      body: JSON.stringify({ prompt: "Also halve Automation research cost" }),
    });
    expect(response.status).toBe(202);
    const body = (await response.json()) as {
      generation: { id: string; status: string; sourceGenerationId?: string; baseModSpec?: unknown };
      revisedFromGenerationId: string;
    };
    expect(body.revisedFromGenerationId).toBe(queued.id);
    expect(body.generation).toMatchObject({
      status: "queued",
      sourceGenerationId: queued.id,
    });
    expect(body.generation).not.toHaveProperty("baseModSpec");
    expect(body.generation.id).not.toBe(queued.id);

    const revised = api.repository.records.get(body.generation.id);
    expect(revised).toMatchObject({
      status: "queued",
      prompt: "Also halve Automation research cost",
      sourceGenerationId: queued.id,
      baseModSpec: modSpec,
    });
    expect(api.repository.records.get(queued.id)).toEqual(succeeded);
    expect(api.submissionStore.jobs).toHaveLength(2);
  });

  it("accepts feedback only after terminal state and redirects downloads through a signer", async () => {
    const api = await startApi();
    const created = (await (await submit(api)).json()) as { generation: { id: string } };
    const queued = api.repository.records.get(created.generation.id);
    if (!queued) throw new Error("Missing queued generation");

    const earlyFeedback = await fetch(`${api.baseUrl}/v1/generations/${queued.id}/feedback`, {
      method: "POST",
      headers: auth(api.token),
      body: JSON.stringify({ rating: "up" }),
    });
    expect(earlyFeedback.status).toBe(409);

    const succeeded = GenerationRecordSchema.parse({
      ...queued,
      revision: 1,
      status: "succeeded",
      startedAt: "2026-10-11T00:00:01.000Z",
      finishedAt: "2026-10-11T00:00:02.000Z",
      updatedAt: "2026-10-11T00:00:02.000Z",
      modSpec,
      artifact: {
        key: `generations/${queued.id}/faster-steel-furnaces_0.1.0.zip`,
        fileName: "faster-steel-furnaces_0.1.0.zip",
        contentType: "application/zip",
        sizeBytes: 321,
      },
      telemetry,
    });
    api.repository.records.set(queued.id, succeeded);

    const getResponse = await fetch(`${api.baseUrl}/v1/generations/${queued.id}`, { headers: auth(api.token) });
    const getBody = (await getResponse.json()) as { generation: Record<string, unknown> };
    expect(getBody.generation).not.toHaveProperty("userId");
    expect(getBody.generation.artifact).not.toHaveProperty("key");

    const feedback = await fetch(`${api.baseUrl}/v1/generations/${queued.id}/feedback`, {
      method: "POST",
      headers: auth(api.token),
      body: JSON.stringify({ rating: "up", note: "Installed" }),
    });
    expect(feedback.status).toBe(200);

    const download = await fetch(`${api.baseUrl}/v1/generations/${queued.id}/download`, {
      headers: auth(api.token),
      redirect: "manual",
    });
    expect(download.status).toBe(302);
    expect(download.headers.get("location")).toContain("download.invalid");

    const signedJson = await fetch(`${api.baseUrl}/v1/generations/${queued.id}/download`, {
      headers: { ...auth(api.token), Accept: "application/json" },
    });
    expect(signedJson.status).toBe(200);
    await expect(signedJson.json()).resolves.toMatchObject({
      downloadUrl: expect.stringContaining("download.invalid"),
      expiresInSeconds: 60,
    });
    expect(api.signer.keys).toEqual([
      `generations/${queued.id}/faster-steel-furnaces_0.1.0.zip`,
      `generations/${queued.id}/faster-steel-furnaces_0.1.0.zip`,
    ]);
  });

  it("returns 429 when the per-user generation-create bucket is exhausted", async () => {
    const api = await startApi({
      ...DEFAULT_API_RATE_LIMIT_POLICY,
      createUser: { limit: 1, windowMs: 60_000 },
    });
    expect((await submit(api)).status).toBe(202);
    const second = await submit(api);
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBeTruthy();
  });
});
