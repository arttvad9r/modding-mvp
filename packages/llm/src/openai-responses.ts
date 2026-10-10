import { ProjectError } from "@project/domain";

import type { LlmJsonRequest, LlmJsonResponse, LlmProvider, LlmUsage } from "./provider.js";

export interface OpenAIResponsesProviderOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly inputUsdPerMillionTokens?: number;
  readonly outputUsdPerMillionTokens?: number;
}

interface OpenAIResponsesBody {
  readonly model?: string;
  readonly status?: string;
  readonly error?: { readonly code?: string; readonly message?: string } | null;
  readonly output?: readonly {
    readonly type?: string;
    readonly content?: readonly {
      readonly type?: string;
      readonly text?: string;
    }[];
  }[];
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly total_tokens?: number;
  } | null;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

function responseText(body: OpenAIResponsesBody): string | null {
  const chunks: string[] = [];
  for (const item of body.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }
  return chunks.length > 0 ? chunks.join("") : null;
}

function usageFromResponse(
  body: OpenAIResponsesBody,
  options: OpenAIResponsesProviderOptions,
): LlmUsage | undefined {
  const usage = body.usage;
  if (!usage) return undefined;

  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
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

function retryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

export class OpenAIResponsesProvider implements LlmProvider {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAIResponsesProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new ProjectError({
        code: "input_error",
        stage: "input",
        message: "OpenAI API key must not be empty",
      });
    }
    if (!options.model.trim()) {
      throw new ProjectError({
        code: "input_error",
        stage: "input",
        message: "OpenAI model must not be empty",
      });
    }
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generateJson(request: LlmJsonRequest): Promise<LlmJsonResponse> {
    const startedAt = Date.now();
    const instructions = [
      ...request.messages
        .filter((message) => message.role === "system")
        .map((message) => message.content),
      `JSON output contract (${request.schemaName}):\n${request.schemaDescription}`,
    ].join("\n\n");
    const input = request.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role, content: message.content }));

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.options.model,
          instructions,
          input,
          text: { format: { type: "json_object" } },
          store: false,
          ...(request.maxOutputTokens === undefined
            ? {}
            : { max_output_tokens: request.maxOutputTokens }),
          ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        }),
      });
    } catch (error) {
      throw new ProjectError({
        code: "process_error",
        stage: "planning",
        message: `OpenAI request failed: ${error instanceof Error ? error.message : String(error)}`,
        retryable: true,
        cause: error,
      });
    }

    let body: OpenAIResponsesBody;
    try {
      body = (await response.json()) as OpenAIResponsesBody;
    } catch (error) {
      throw new ProjectError({
        code: "process_error",
        stage: "planning",
        message: `OpenAI returned a non-JSON HTTP response (status ${response.status})`,
        retryable: retryableStatus(response.status),
        details: { httpStatus: response.status },
        cause: error,
      });
    }

    if (!response.ok || body.status === "failed" || body.error) {
      throw new ProjectError({
        code: "process_error",
        stage: "planning",
        message: body.error?.message ?? `OpenAI request failed with HTTP ${response.status}`,
        retryable: retryableStatus(response.status),
        details: {
          httpStatus: response.status,
          ...(body.error?.code === undefined ? {} : { providerCode: body.error.code }),
        },
      });
    }

    const text = responseText(body);
    if (text === null) {
      throw new ProjectError({
        code: "schema_error",
        stage: "planning",
        message: "OpenAI response contained no output_text JSON payload",
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
        message: "OpenAI output_text was not valid JSON",
        retryable: true,
        cause: error,
      });
    }

    const usage = usageFromResponse(body, this.options);
    return {
      value,
      provider: "openai",
      model: body.model ?? this.options.model,
      ...(usage === undefined ? {} : { usage }),
      durationMs: Date.now() - startedAt,
    };
  }
}
