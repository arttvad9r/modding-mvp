import { ProjectError } from "@project/domain";

import type { LlmJsonRequest, LlmJsonResponse, LlmProvider, LlmUsage } from "./provider.js";

export type OpenAIChatJsonMode = "response_format" | "prompt_only";

export interface OpenAIChatCompletionsProviderOptions {
  readonly providerName: string;
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly jsonMode?: OpenAIChatJsonMode;
  readonly fetchImpl?: typeof fetch;
  readonly inputUsdPerMillionTokens?: number;
  readonly outputUsdPerMillionTokens?: number;
}

interface OpenAIChatCompletionsBody {
  readonly model?: string;
  readonly choices?: readonly {
    readonly message?: {
      readonly role?: string;
      readonly content?: string | null;
    };
  }[];
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
  } | null;
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
  } | null;
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function usageFromResponse(
  body: OpenAIChatCompletionsBody,
  options: OpenAIChatCompletionsProviderOptions,
): LlmUsage | undefined {
  const usage = body.usage;
  if (!usage) return undefined;

  const inputTokens = usage.prompt_tokens ?? 0;
  const outputTokens = usage.completion_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? inputTokens + outputTokens;
  const hasPricing =
    options.inputUsdPerMillionTokens !== undefined &&
    options.outputUsdPerMillionTokens !== undefined;
  const estimatedCostUsd = hasPricing
    ? (inputTokens / 1_000_000) * options.inputUsdPerMillionTokens! +
      (outputTokens / 1_000_000) * options.outputUsdPerMillionTokens!
    : undefined;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    ...(estimatedCostUsd === undefined ? {} : { estimatedCostUsd }),
  };
}

export class OpenAIChatCompletionsProvider implements LlmProvider {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly jsonMode: OpenAIChatJsonMode;

  constructor(private readonly options: OpenAIChatCompletionsProviderOptions) {
    if (!options.providerName.trim()) {
      throw new ProjectError({
        code: "input_error",
        stage: "input",
        message: "LLM provider name must not be empty",
      });
    }
    if (!options.apiKey.trim()) {
      throw new ProjectError({
        code: "input_error",
        stage: "input",
        message: `${options.providerName} API key must not be empty`,
      });
    }
    if (!options.model.trim()) {
      throw new ProjectError({
        code: "input_error",
        stage: "input",
        message: `${options.providerName} model must not be empty`,
      });
    }
    if (!options.baseUrl.trim()) {
      throw new ProjectError({
        code: "input_error",
        stage: "input",
        message: `${options.providerName} base URL must not be empty`,
      });
    }

    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.jsonMode = options.jsonMode ?? "prompt_only";
  }

  async generateJson(request: LlmJsonRequest): Promise<LlmJsonResponse> {
    const startedAt = Date.now();
    const contract = [
      `JSON output contract (${request.schemaName}):`,
      request.schemaDescription,
      "Return one valid JSON object only. Do not wrap it in Markdown or code fences.",
    ].join("\n");
    const systemMessages = request.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content);
    const messages = [
      { role: "system" as const, content: [...systemMessages, contract].join("\n\n") },
      ...request.messages.filter((message) => message.role !== "system"),
    ];

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.options.model,
          messages,
          stream: false,
          ...(this.jsonMode === "response_format"
            ? { response_format: { type: "json_object" } }
            : {}),
          ...(request.maxOutputTokens === undefined
            ? {}
            : { max_tokens: request.maxOutputTokens }),
          ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        }),
      });
    } catch (error) {
      throw new ProjectError({
        code: "process_error",
        stage: "planning",
        message: `${this.options.providerName} request failed: ${error instanceof Error ? error.message : String(error)}`,
        retryable: true,
        cause: error,
      });
    }

    let body: OpenAIChatCompletionsBody;
    try {
      body = (await response.json()) as OpenAIChatCompletionsBody;
    } catch (error) {
      throw new ProjectError({
        code: "process_error",
        stage: "planning",
        message: `${this.options.providerName} returned a non-JSON HTTP response (status ${response.status})`,
        retryable: retryableStatus(response.status),
        details: { httpStatus: response.status },
        cause: error,
      });
    }

    if (!response.ok || body.error) {
      throw new ProjectError({
        code: "process_error",
        stage: "planning",
        message: body.error?.message ?? `${this.options.providerName} request failed with HTTP ${response.status}`,
        retryable: retryableStatus(response.status),
        details: {
          httpStatus: response.status,
          ...(body.error?.code === undefined ? {} : { providerCode: body.error.code }),
        },
      });
    }

    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== "string" || text.trim() === "") {
      throw new ProjectError({
        code: "schema_error",
        stage: "planning",
        message: `${this.options.providerName} response contained no assistant JSON content`,
        retryable: true,
      });
    }

    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (error) {
      throw new ProjectError({
        code: "schema_error",
        stage: "planning",
        message: `${this.options.providerName} assistant content was not valid JSON`,
        retryable: true,
        cause: error,
      });
    }

    const usage = usageFromResponse(body, this.options);
    return {
      value,
      provider: this.options.providerName,
      model: body.model ?? this.options.model,
      ...(usage === undefined ? {} : { usage }),
      durationMs: Date.now() - startedAt,
    };
  }
}
