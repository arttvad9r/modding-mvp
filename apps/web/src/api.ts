import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { ProjectError } from "@project/domain";
import {
  BetaSurveyResponseSchema,
  SubmitGenerationRequestSchema,
  WillingnessToPaySchema,
  authenticateAccessToken,
  findGenerationForUser,
  recordGenerationFeedback,
  submitGenerationAtomically,
  type ArtifactDownloadSigner,
  type BetaSurveyRepository,
  type GenerationRecord,
  type GenerationRepository,
  type GenerationSubmissionStore,
  type RateLimitStore,
  type ServiceUser,
  type ServiceUserRepository,
} from "@project/service-core";
import { z, ZodError } from "zod";

const FeedbackBodySchema = z.strictObject({
  rating: z.enum(["up", "down"]),
  note: z.string().trim().min(1).max(2_000).optional(),
});

const SurveyBodySchema = z.strictObject({
  willingnessToPay: WillingnessToPaySchema,
});

const MAX_JSON_BODY_BYTES = 16 * 1024;

export interface ApiRateLimitRule {
  readonly limit: number;
  readonly windowMs: number;
}

export interface ApiRateLimitPolicy {
  readonly authIp: ApiRateLimitRule;
  readonly createUser: ApiRateLimitRule;
  readonly createIp: ApiRateLimitRule;
  readonly readUser: ApiRateLimitRule;
  readonly readIp: ApiRateLimitRule;
  readonly feedbackUser: ApiRateLimitRule;
  readonly feedbackIp: ApiRateLimitRule;
  readonly downloadUser: ApiRateLimitRule;
  readonly downloadIp: ApiRateLimitRule;
  readonly surveyUser: ApiRateLimitRule;
  readonly surveyIp: ApiRateLimitRule;
}

export const DEFAULT_API_RATE_LIMIT_POLICY: ApiRateLimitPolicy = {
  authIp: { limit: 120, windowMs: 60_000 },
  createUser: { limit: 10, windowMs: 60 * 60_000 },
  createIp: { limit: 30, windowMs: 60 * 60_000 },
  readUser: { limit: 300, windowMs: 60_000 },
  readIp: { limit: 600, windowMs: 60_000 },
  feedbackUser: { limit: 30, windowMs: 60 * 60_000 },
  feedbackIp: { limit: 100, windowMs: 60 * 60_000 },
  downloadUser: { limit: 120, windowMs: 60 * 60_000 },
  downloadIp: { limit: 300, windowMs: 60 * 60_000 },
  surveyUser: { limit: 20, windowMs: 60 * 60_000 },
  surveyIp: { limit: 100, windowMs: 60 * 60_000 },
};

export interface GenerationApiDependencies {
  readonly users: ServiceUserRepository;
  readonly repository: GenerationRepository;
  readonly submissionStore: GenerationSubmissionStore;
  readonly rateLimits: RateLimitStore;
  readonly artifactDownloads: ArtifactDownloadSigner;
  readonly surveys: BetaSurveyRepository;
  readonly ipHashSalt: string;
  readonly trustProxy?: boolean;
  readonly rateLimitPolicy?: ApiRateLimitPolicy;
  readonly now?: () => Date;
}

interface RequestContext {
  readonly user: ServiceUser;
  readonly ipHash: string;
}

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function setBaseHeaders(response: ServerResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): void {
  setBaseHeaders(response);
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(`${JSON.stringify(body)}\n`);
}

function publicGeneration(record: GenerationRecord): Record<string, unknown> {
  const { userId: _userId, baseModSpec: _baseModSpec, ...rest } = record;
  if (record.status !== "succeeded") return rest;
  return {
    ...rest,
    artifact: {
      fileName: record.artifact.fileName,
      contentType: record.artifact.contentType,
      sizeBytes: record.artifact.sizeBytes,
    },
  };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_JSON_BODY_BYTES) {
      throw new HttpError(413, "request_too_large", "JSON request body exceeds 16 KiB");
    }
    chunks.push(buffer);
  }
  if (size === 0) throw new HttpError(400, "invalid_json", "JSON request body is required");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
  }
}

function clientIp(request: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers["x-forwarded-for"];
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const first = raw?.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.socket.remoteAddress ?? "unknown";
}

function hashIp(ipHashSalt: string, ip: string): string {
  if (ipHashSalt.length < 16) throw new Error("ipHashSalt must contain at least 16 characters");
  return createHash("sha256").update(ipHashSalt, "utf8").update("\0").update(ip, "utf8").digest("hex");
}

function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization;
  if (!authorization) throw new HttpError(401, "unauthorized", "Authentication required");
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!match?.[1]) throw new HttpError(401, "unauthorized", "Authentication required");
  return match[1];
}

async function consumeLimit(
  store: RateLimitStore,
  key: string,
  rule: ApiRateLimitRule,
  now: Date,
): Promise<void> {
  const decision = await store.consume({ key, limit: rule.limit, windowMs: rule.windowMs, now });
  if (decision.allowed) return;
  const retrySeconds = Math.max(1, Math.ceil((new Date(decision.resetAt).getTime() - now.getTime()) / 1_000));
  throw new HttpError(429, "rate_limited", "Too many requests", {
    "Retry-After": String(retrySeconds),
    "X-RateLimit-Limit": String(decision.limit),
    "X-RateLimit-Remaining": "0",
    "X-RateLimit-Reset": decision.resetAt,
  });
}

async function authenticateRequest(
  request: IncomingMessage,
  dependencies: GenerationApiDependencies,
): Promise<RequestContext> {
  const now = (dependencies.now ?? (() => new Date()))();
  const ipHash = hashIp(
    dependencies.ipHashSalt,
    clientIp(request, dependencies.trustProxy ?? false),
  );
  const policy = dependencies.rateLimitPolicy ?? DEFAULT_API_RATE_LIMIT_POLICY;
  await consumeLimit(dependencies.rateLimits, `ip:${ipHash}:auth`, policy.authIp, now);

  let user: ServiceUser;
  try {
    user = await authenticateAccessToken(dependencies.users, bearerToken(request));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "unauthorized", "Authentication required");
  }
  return { user, ipHash };
}

async function applyRouteLimits(
  dependencies: GenerationApiDependencies,
  context: RequestContext,
  scope: "create" | "read" | "feedback" | "download" | "survey",
): Promise<void> {
  const policy = dependencies.rateLimitPolicy ?? DEFAULT_API_RATE_LIMIT_POLICY;
  const now = (dependencies.now ?? (() => new Date()))();
  const userRule = policy[`${scope}User`];
  const ipRule = policy[`${scope}Ip`];
  await consumeLimit(dependencies.rateLimits, `ip:${context.ipHash}:${scope}`, ipRule, now);
  await consumeLimit(dependencies.rateLimits, `user:${context.user.id}:${scope}`, userRule, now);
}

function generationIdFromPath(pathname: string, suffix = ""): string | null {
  const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^/v1/generations/([^/]+)${escapedSuffix}$`).exec(pathname);
  return match?.[1] ?? null;
}

function handleError(response: ServerResponse, error: unknown): void {
  if (response.writableEnded) return;
  if (error instanceof HttpError) {
    sendJson(response, error.statusCode, { error: { code: error.code, message: error.message } }, error.headers);
    return;
  }
  if (error instanceof ZodError) {
    sendJson(response, 400, { error: { code: "invalid_request", message: "Request failed validation" } });
    return;
  }
  if (error instanceof ProjectError) {
    const status = error.code === "process_error" ? 503 : error.code === "internal_error" ? 500 : 400;
    sendJson(response, status, { error: { code: error.code, message: error.message } });
    return;
  }
  sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server error" } });
}

export function createGenerationApiHandler(dependencies: GenerationApiDependencies) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", "http://localhost");
      if (method === "GET" && url.pathname === "/health/live") {
        sendJson(response, 200, { status: "ok" });
        return;
      }

      const context = await authenticateRequest(request, dependencies);

      if (method === "POST" && url.pathname === "/v1/survey") {
        await applyRouteLimits(dependencies, context, "survey");
        const body = SurveyBodySchema.parse(await readJsonBody(request));
        const updatedAt = (dependencies.now ?? (() => new Date()))().toISOString();
        const survey = BetaSurveyResponseSchema.parse({
          userId: context.user.id,
          willingnessToPay: body.willingnessToPay,
          updatedAt,
        });
        await dependencies.surveys.upsert(survey);
        sendJson(response, 200, {
          survey: { willingnessToPay: survey.willingnessToPay, updatedAt: survey.updatedAt },
        });
        return;
      }

      if (method === "POST" && url.pathname === "/v1/generations") {
        await applyRouteLimits(dependencies, context, "create");
        const body = SubmitGenerationRequestSchema.parse(await readJsonBody(request));
        const record = await submitGenerationAtomically({
          submissionStore: dependencies.submissionStore,
          userId: context.user.id,
          prompt: body.prompt,
          ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
        });
        sendJson(response, 202, { generation: publicGeneration(record) });
        return;
      }

      const reviseId = generationIdFromPath(url.pathname, "/revise");
      if (method === "POST" && reviseId !== null) {
        await applyRouteLimits(dependencies, context, "create");
        const current = await findGenerationForUser(dependencies.repository, reviseId, context.user.id);
        if (current === null) throw new HttpError(404, "not_found", "Generation not found");
        if (current.status !== "succeeded") {
          throw new HttpError(409, "not_revisable", "Only successful generations can be revised");
        }
        const body = SubmitGenerationRequestSchema.parse(await readJsonBody(request));
        const revised = await submitGenerationAtomically({
          submissionStore: dependencies.submissionStore,
          userId: context.user.id,
          prompt: body.prompt,
          sourceGenerationId: current.id,
          baseModSpec: current.modSpec,
          ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
        });
        sendJson(response, 202, {
          generation: publicGeneration(revised),
          revisedFromGenerationId: current.id,
        });
        return;
      }

      const retryId = generationIdFromPath(url.pathname, "/retry");
      if (method === "POST" && retryId !== null) {
        await applyRouteLimits(dependencies, context, "create");
        const current = await findGenerationForUser(dependencies.repository, retryId, context.user.id);
        if (current === null) throw new HttpError(404, "not_found", "Generation not found");
        if (current.status !== "failed" || current.error.retryable !== true) {
          throw new HttpError(409, "not_retryable", "Only retryable failed generations can be retried");
        }
        const retried = await submitGenerationAtomically({
          submissionStore: dependencies.submissionStore,
          userId: context.user.id,
          prompt: current.prompt,
          ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
        });
        sendJson(response, 202, {
          generation: publicGeneration(retried),
          retriedFromGenerationId: current.id,
        });
        return;
      }

      const feedbackId = generationIdFromPath(url.pathname, "/feedback");
      if (method === "POST" && feedbackId !== null) {
        await applyRouteLimits(dependencies, context, "feedback");
        const current = await findGenerationForUser(dependencies.repository, feedbackId, context.user.id);
        if (current === null) throw new HttpError(404, "not_found", "Generation not found");
        if (current.status === "queued" || current.status === "running") {
          throw new HttpError(409, "not_terminal", "Feedback is accepted only for terminal generations");
        }
        const body = FeedbackBodySchema.parse(await readJsonBody(request));
        const updated = await recordGenerationFeedback({
          repository: dependencies.repository,
          generationId: feedbackId,
          userId: context.user.id,
          rating: body.rating,
          ...(body.note === undefined ? {} : { note: body.note }),
          ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
        });
        sendJson(response, 200, { generation: publicGeneration(updated) });
        return;
      }

      const downloadId = generationIdFromPath(url.pathname, "/download");
      if (method === "GET" && downloadId !== null) {
        await applyRouteLimits(dependencies, context, "download");
        const current = await findGenerationForUser(dependencies.repository, downloadId, context.user.id);
        if (current === null) throw new HttpError(404, "not_found", "Generation not found");
        if (current.status !== "succeeded") {
          throw new HttpError(409, "artifact_not_ready", "Generation artifact is not available");
        }
        const location = await dependencies.artifactDownloads.createDownloadUrl(current.artifact, 60);
        const acceptsJson = (request.headers.accept ?? "").split(",").some((value) => value.trim().startsWith("application/json"));
        if (acceptsJson) {
          sendJson(response, 200, { downloadUrl: location, expiresInSeconds: 60 });
          return;
        }
        setBaseHeaders(response);
        response.statusCode = 302;
        response.setHeader("Location", location);
        response.end();
        return;
      }

      const generationId = generationIdFromPath(url.pathname);
      if (method === "GET" && generationId !== null) {
        await applyRouteLimits(dependencies, context, "read");
        const record = await findGenerationForUser(dependencies.repository, generationId, context.user.id);
        if (record === null) throw new HttpError(404, "not_found", "Generation not found");
        sendJson(response, 200, { generation: publicGeneration(record) });
        return;
      }

      throw new HttpError(404, "not_found", "Route not found");
    } catch (error) {
      handleError(response, error);
    }
  };
}
