import { ProjectError } from "@project/domain";
import { describe, expect, it, vi } from "vitest";

import { FallbackLlmProvider, shouldFailOverLlmProvider, type LlmProvider } from "../src/index.js";

const request = { messages: [{ role: "user" as const, content: "x" }], schemaName: "x", schemaDescription: "x" };

function provider(generateJson: LlmProvider["generateJson"]): LlmProvider {
  return { generateJson };
}

describe("FallbackLlmProvider", () => {
  it("uses fallback for retryable provider/process failures", async () => {
    const primary = provider(async () => {
      throw new ProjectError({ code: "process_error", stage: "planning", message: "rate limited", retryable: true });
    });
    const fallbackCall = vi.fn(async () => ({ value: { status: "supported" }, provider: "zai", model: "glm" }));
    const fallback = provider(fallbackCall);

    const result = await new FallbackLlmProvider({ primary, fallback }).generateJson(request);

    expect(result.provider).toBe("zai");
    expect(fallbackCall).toHaveBeenCalledOnce();
  });

  it("uses fallback for provider auth/billing availability failures", async () => {
    const error = new ProjectError({
      code: "process_error",
      stage: "planning",
      message: "payment required",
      details: { httpStatus: 402, providerCode: "insufficient_credit" },
    });
    expect(shouldFailOverLlmProvider(error)).toBe(true);
  });

  it("does not fail over on schema errors even when they are retryable", async () => {
    const primary = provider(async () => {
      throw new ProjectError({ code: "schema_error", stage: "planning", message: "bad JSON", retryable: true });
    });
    const fallbackCall = vi.fn(async () => ({ value: {}, provider: "zai", model: "glm" }));

    await expect(new FallbackLlmProvider({ primary, fallback: provider(fallbackCall) }).generateJson(request))
      .rejects.toMatchObject({ code: "schema_error" });
    expect(fallbackCall).not.toHaveBeenCalled();
  });

  it("does not consult fallback when primary returns a product-level result", async () => {
    const fallbackCall = vi.fn(async () => ({ value: {}, provider: "zai", model: "glm" }));
    const primary = provider(async () => ({
      value: { status: "unsupported", reason: "outside scope" },
      provider: "ollama-cloud",
      model: "glm-5.3-flash",
    }));

    const result = await new FallbackLlmProvider({ primary, fallback: provider(fallbackCall) }).generateJson(request);

    expect(result.value).toEqual({ status: "unsupported", reason: "outside scope" });
    expect(fallbackCall).not.toHaveBeenCalled();
  });
});
