import { describe, expect, it } from "vitest";

import { OpenAIResponsesProvider } from "../src/index.js";

describe("OpenAIResponsesProvider", () => {
  it("maps the generic JSON provider contract to the Responses API", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(
        JSON.stringify({
          status: "completed",
          model: "gpt-6-luna",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({ status: "unsupported", reason: "outside scope" }),
                },
              ],
            },
          ],
          usage: { input_tokens: 1000, output_tokens: 500, total_tokens: 1500 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const provider = new OpenAIResponsesProvider({
      apiKey: "test-key",
      model: "gpt-6-luna",
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
    });

    expect(capturedUrl).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(String(capturedInit?.body));
    expect(body).toMatchObject({
      model: "gpt-6-luna",
      input: [{ role: "user", content: "user request" }],
      text: { format: { type: "json_object" } },
      store: false,
      max_output_tokens: 500,
    });
    expect(body.instructions).toContain("system rules");
    expect(body.instructions).toContain("JSON output contract (planner)");
    expect(body.instructions).toContain("Return JSON");
    expect(result.value).toEqual({ status: "unsupported", reason: "outside scope" });
    expect(result.provider).toBe("openai");
    expect(result.usage).toMatchObject({ inputTokens: 1000, outputTokens: 500, totalTokens: 1500 });
    expect(result.usage?.estimatedCostUsd).toBeCloseTo(0.000175);
  });

  it("normalizes retryable HTTP failures", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({ status: "failed", error: { code: "rate_limit", message: "slow down" } }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    const provider = new OpenAIResponsesProvider({
      apiKey: "test-key",
      model: "gpt-6-luna",
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

  it("rejects non-JSON model output as a planning schema error", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          status: "completed",
          output: [{ type: "message", content: [{ type: "output_text", text: "not-json" }] }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    const provider = new OpenAIResponsesProvider({
      apiKey: "test-key",
      model: "gpt-6-luna",
      fetchImpl,
    });

    await expect(
      provider.generateJson({ messages: [{ role: "user", content: "x" }], schemaName: "x", schemaDescription: "x" }),
    ).rejects.toMatchObject({ code: "schema_error", stage: "planning", retryable: true });
  });
});
