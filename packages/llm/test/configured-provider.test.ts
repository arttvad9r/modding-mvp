import { describe, expect, it } from "vitest";

import { createConfiguredLlmProvider, createConfiguredLlmProviderChain } from "../src/index.js";

const noopFetch: typeof fetch = async () =>
  new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("createConfiguredLlmProvider", () => {
  it("creates the Ollama Cloud preset with the official OpenAI-compatible base URL", () => {
    const configured = createConfiguredLlmProvider(
      {
        LLM_PROVIDER: "ollama-cloud",
        OLLAMA_API_KEY: "test-key",
      },
      { fetchImpl: noopFetch },
    );

    expect(configured).toMatchObject({
      id: "ollama-cloud",
      model: "glm-5.3-flash",
      baseUrl: "https://ollama.com/v1",
      transport: "chat_completions",
    });
  });

  it("uses low reasoning for Ollama GLM 5.3 so reasoning stays separate from JSON content", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const configured = createConfiguredLlmProvider(
      { LLM_PROVIDER: "ollama-cloud", OLLAMA_API_KEY: "test-key", LLM_MODEL: "glm-5.3-flash" },
      { fetchImpl },
    );

    await configured.provider.generateJson({
      messages: [{ role: "user", content: "x" }],
      schemaName: "x",
      schemaDescription: "x",
    });

    expect(capturedBody?.reasoning_effort).toBe("low");
  });

  it("creates an Ollama primary with Z.ai fallback without sharing provider-specific model settings", () => {
    const chain = createConfiguredLlmProviderChain(
      {
        LLM_PRIMARY_PROVIDER: "ollama-cloud",
        LLM_FALLBACK_PROVIDER: "zai",
        OLLAMA_API_KEY: "ollama-key",
        OLLAMA_MODEL: "glm-5.3-flash",
        ZAI_API_KEY: "zai-key",
        ZAI_MODEL: "glm-5.3-flash",
        ZAI_API_MODE: "coding",
      },
      { fetchImpl: noopFetch },
    );

    expect(chain.primary).toMatchObject({ id: "ollama-cloud", model: "glm-5.3-flash" });
    expect(chain.fallback).toMatchObject({
      id: "zai",
      model: "glm-5.3-flash",
      baseUrl: "https://api.z.ai/api/coding/paas/v4",
    });
  });

  it("fails over from Ollama transport errors to Z.ai", async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.startsWith("https://ollama.com/")) {
        return new Response(JSON.stringify({ error: { code: "rate_limit", message: "slow down" } }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ model: "glm-5.3-flash", choices: [{ message: { content: '{"status":"unsupported","reason":"x"}' } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const chain = createConfiguredLlmProviderChain(
      {
        LLM_PRIMARY_PROVIDER: "ollama-cloud",
        LLM_FALLBACK_PROVIDER: "zai",
        OLLAMA_API_KEY: "ollama-key",
        OLLAMA_MODEL: "glm-5.3-flash",
        ZAI_API_KEY: "zai-key",
        ZAI_MODEL: "glm-5.3-flash",
        ZAI_API_MODE: "coding",
      },
      { fetchImpl },
    );

    const result = await chain.provider.generateJson({
      messages: [{ role: "user", content: "x" }],
      schemaName: "x",
      schemaDescription: "x",
    });

    expect(result.provider).toBe("zai");
    expect(urls).toEqual([
      "https://ollama.com/v1/chat/completions",
      "https://api.z.ai/api/coding/paas/v4/chat/completions",
    ]);
  });

  it("creates Z.ai general and coding presets with distinct official base URLs", () => {
    const general = createConfiguredLlmProvider(
      {
        LLM_PROVIDER: "zai",
        ZAI_API_KEY: "test-key",
      },
      { fetchImpl: noopFetch },
    );
    const coding = createConfiguredLlmProvider(
      {
        LLM_PROVIDER: "z.ai",
        ZAI_API_KEY: "test-key",
        ZAI_API_MODE: "coding",
      },
      { fetchImpl: noopFetch },
    );

    expect(general.model).toBe("glm-5.3-flash");
    expect(coding.model).toBe("glm-5.3-flash");
    expect(general.baseUrl).toBe("https://api.z.ai/api/paas/v4");
    expect(coding.baseUrl).toBe("https://api.z.ai/api/coding/paas/v4");
  });

  it("accepts generic model and pricing overrides", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          model: "generic-model",
          choices: [{ message: { content: "{}" } }],
          usage: { prompt_tokens: 1000, completion_tokens: 1000, total_tokens: 2000 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const configured = createConfiguredLlmProvider(
      {
        LLM_PROVIDER: "ollama",
        OLLAMA_API_KEY: "test-key",
        LLM_MODEL: "generic-model",
        LLM_INPUT_USD_PER_MILLION: "1",
        LLM_OUTPUT_USD_PER_MILLION: "2",
      },
      { fetchImpl },
    );

    const result = await configured.provider.generateJson({
      messages: [{ role: "user", content: "x" }],
      schemaName: "x",
      schemaDescription: "x",
    });

    expect(capturedBody?.model).toBe("generic-model");
    expect(result.usage?.estimatedCostUsd).toBeCloseTo(0.003);
  });

  it("rejects missing provider credentials and invalid Z.ai mode", () => {
    expect(() =>
      createConfiguredLlmProvider({ LLM_PROVIDER: "ollama-cloud", OLLAMA_MODEL: "x" }),
    ).toThrow("OLLAMA_API_KEY");

    expect(() =>
      createConfiguredLlmProvider({
        LLM_PROVIDER: "zai",
        ZAI_API_KEY: "x",
        ZAI_MODEL: "x",
        ZAI_API_MODE: "wrong",
      }),
    ).toThrow("Unsupported ZAI_API_MODE");
  });
});
