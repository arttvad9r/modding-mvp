import { describe, expect, it } from "vitest";

import { OpenAIChatCompletionsProvider } from "../src/index.js";

describe("OpenAIChatCompletionsProvider", () => {
  it("maps the generic JSON contract to OpenAI-compatible chat completions", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(
        JSON.stringify({
          model: "test-model",
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify({ status: "unsupported", reason: "outside scope" }),
              },
            },
          ],
          usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const provider = new OpenAIChatCompletionsProvider({
      providerName: "ollama-cloud",
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "https://ollama.com/v1/",
      jsonMode: "response_format",
      fetchImpl,
      inputUsdPerMillionTokens: 0.05,
      outputUsdPerMillionTokens: 0.25,
    });
    const result = await provider.generateJson({
      messages: [
        { role: "system", content: "system rules" },
        { role: "user", content: "user request" },
      ],
      schemaName: "planner",
      schemaDescription: "Return JSON",
      maxOutputTokens: 500,
      temperature: 0,
    });

    expect(capturedUrl).toBe("https://ollama.com/v1/chat/completions");
    const body = JSON.parse(String(capturedInit?.body));
    expect(body).toMatchObject({
      model: "test-model",
      stream: false,
      response_format: { type: "json_object" },
      max_tokens: 500,
      temperature: 0,
    });
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("system rules");
    expect(body.messages[0].content).toContain("JSON output contract (planner)");
    expect(body.messages[0].content).toContain("Return JSON");
    expect(body.messages[1]).toEqual({ role: "user", content: "user request" });
    expect(result.provider).toBe("ollama-cloud");
    expect(result.value).toEqual({ status: "unsupported", reason: "outside scope" });
    expect(result.usage).toMatchObject({ inputTokens: 1000, outputTokens: 500, totalTokens: 1500 });
    expect(result.usage?.estimatedCostUsd).toBeCloseTo(0.000175);
  });

  it("supports prompt-only JSON mode for providers without verified response_format support", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: '{"status":"unsupported","reason":"x"}' } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const provider = new OpenAIChatCompletionsProvider({
      providerName: "zai",
      apiKey: "test-key",
      model: "glm-test",
      baseUrl: "https://api.z.ai/api/paas/v4",
      jsonMode: "prompt_only",
      fetchImpl,
    });

    await provider.generateJson({
      messages: [{ role: "user", content: "x" }],
      schemaName: "x",
      schemaDescription: "x",
    });

    expect(capturedBody).not.toHaveProperty("response_format");
  });

  it("normalizes retryable HTTP failures", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({ error: { code: "rate_limit", message: "slow down" } }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    const provider = new OpenAIChatCompletionsProvider({
      providerName: "zai",
      apiKey: "test-key",
      model: "glm-test",
      baseUrl: "https://api.z.ai/api/paas/v4",
      fetchImpl,
    });

    await expect(
      provider.generateJson({ messages: [{ role: "user", content: "x" }], schemaName: "x", schemaDescription: "x" }),
    ).rejects.toMatchObject({
      code: "process_error",
      stage: "planning",
      retryable: true,
      details: { httpStatus: 429, providerCode: "rate_limit" },
    });
  });

  it("rejects malformed assistant JSON as a retryable planning schema error", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { role: "assistant", content: "not-json" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    const provider = new OpenAIChatCompletionsProvider({
      providerName: "ollama-cloud",
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "https://ollama.com/v1",
      fetchImpl,
    });

    await expect(
      provider.generateJson({ messages: [{ role: "user", content: "x" }], schemaName: "x", schemaDescription: "x" }),
    ).rejects.toMatchObject({ code: "schema_error", stage: "planning", retryable: true });
  });
});
