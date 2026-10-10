import { describe, expect, it } from "vitest";

import { createConfiguredLlmProvider } from "../src/index.js";

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
        OLLAMA_MODEL: "test-model",
      },
      { fetchImpl: noopFetch },
    );

    expect(configured).toMatchObject({
      id: "ollama-cloud",
      model: "test-model",
      baseUrl: "https://ollama.com/v1",
      transport: "chat_completions",
    });
  });

  it("creates Z.ai general and coding presets with distinct official base URLs", () => {
    const general = createConfiguredLlmProvider(
      {
        LLM_PROVIDER: "zai",
        ZAI_API_KEY: "test-key",
        ZAI_MODEL: "glm-test",
      },
      { fetchImpl: noopFetch },
    );
    const coding = createConfiguredLlmProvider(
      {
        LLM_PROVIDER: "z.ai",
        ZAI_API_KEY: "test-key",
        ZAI_MODEL: "glm-test",
        ZAI_API_MODE: "coding",
      },
      { fetchImpl: noopFetch },
    );

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
