import { ProjectError } from "@project/domain";
import { describe, expect, it } from "vitest";

import { FallbackLlmProvider, OpenAIChatCompletionsProvider, type LlmJsonRequest } from "../src/index.js";

const request: LlmJsonRequest = {
  messages: [{ role: "user", content: "hello" }],
  schemaName: "test",
  schemaDescription: "{}",
};

const completion = JSON.stringify({
  model: "fake",
  choices: [{ message: { role: "assistant", content: "{\"ok\":true}" } }],
});

function provider(fetchImpl: typeof fetch, extra: { timeoutMs?: number; maxResponseBytes?: number } = {}) {
  return new OpenAIChatCompletionsProvider({
    providerName: "fake",
    apiKey: "test-key",
    model: "fake",
    baseUrl: "https://llm.invalid/v1",
    fetchImpl,
    ...extra,
  });
}

async function failure(promise: Promise<unknown>): Promise<ProjectError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectError);
    return error as ProjectError;
  }
  throw new Error("Expected the provider call to fail");
}

function streamResponse(
  start: (controller: ReadableStreamDefaultController<Uint8Array>) => void,
  cancel?: () => void,
): Response {
  return new Response(new ReadableStream<Uint8Array>({ start, ...(cancel ? { cancel } : {}) }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("LLM provider deadlines", () => {
  it("passes an abort signal and times out when response headers never arrive", async () => {
    let observed: AbortSignal | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      observed = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    };

    const error = await failure(provider(fetchImpl, { timeoutMs: 30 }).generateJson(request));
    expect(observed).toBeInstanceOf(AbortSignal);
    expect(observed?.aborted).toBe(true);
    expect(error).toMatchObject({ code: "process_error", stage: "planning", retryable: true });
    expect(error.message).toContain("timed out after 30 ms");
  });

  it("times out a response body that never completes", async () => {
    const fetchImpl: typeof fetch = async () =>
      streamResponse((controller) => controller.enqueue(new TextEncoder().encode("{\"choices\":")));

    const error = await failure(provider(fetchImpl, { timeoutMs: 30 }).generateJson(request));
    expect(error.message).toContain("timed out");
    expect(error.retryable).toBe(true);
  });

  it("bounds the whole call, not each chunk, for a slowly continuing stream", async () => {
    let timer: NodeJS.Timeout | undefined;
    let cancelled = false;
    const fetchImpl: typeof fetch = async () =>
      streamResponse(
        (controller) => {
          timer = setInterval(() => controller.enqueue(new TextEncoder().encode(" ")), 5);
        },
        () => {
          cancelled = true;
          clearInterval(timer);
        },
      );

    const startedAt = Date.now();
    const error = await failure(provider(fetchImpl, { timeoutMs: 60 }).generateJson(request));
    clearInterval(timer);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(error.message).toContain("timed out after 60 ms");
    expect(cancelled).toBe(true);
  });

  it("rejects an oversized response body without buffering it", async () => {
    const fetchImpl: typeof fetch = async () =>
      streamResponse((controller) => {
        controller.enqueue(new Uint8Array(600));
        controller.enqueue(new Uint8Array(600));
        controller.close();
      });

    const error = await failure(provider(fetchImpl, { maxResponseBytes: 1_000 }).generateJson(request));
    expect(error).toMatchObject({ code: "process_error", retryable: true });
    expect(error.message).toContain("exceeded 1000 bytes");
  });

  it("still parses a normal response", async () => {
    const fetchImpl: typeof fetch = async () => new Response(completion, { status: 200 });
    await expect(provider(fetchImpl).generateJson(request)).resolves.toMatchObject({ value: { ok: true } });
  });

  it("fails over after a primary timeout but not after the generation deadline cancels the call", async () => {
    const hanging: typeof fetch = async () => new Promise<Response>(() => undefined);
    let fallbackCalls = 0;
    const fallbackFetch: typeof fetch = async () => {
      fallbackCalls += 1;
      return new Response(completion, { status: 200 });
    };
    const chain = new FallbackLlmProvider({
      primary: provider(hanging, { timeoutMs: 20 }),
      fallback: provider(fallbackFetch),
    });

    await expect(chain.generateJson(request)).resolves.toMatchObject({ value: { ok: true } });
    expect(fallbackCalls).toBe(1);

    const deadline = new AbortController();
    setTimeout(() => deadline.abort(), 20);
    const slowChain = new FallbackLlmProvider({
      primary: provider(hanging, { timeoutMs: 10_000 }),
      fallback: provider(fallbackFetch),
    });
    const error = await failure(slowChain.generateJson({ ...request, signal: deadline.signal }));
    expect(error.message).toContain("cancelled by the generation deadline");
    expect(fallbackCalls).toBe(1);
  });
});
