import { ProjectError } from "@project/domain";

import { FallbackLlmProvider } from "./fallback-provider.js";
import { OpenAIChatCompletionsProvider } from "./openai-chat-completions.js";
import { OpenAIResponsesProvider } from "./openai-responses.js";
import type { LlmProvider } from "./provider.js";

export type ConfiguredLlmProviderId = "openai" | "ollama-cloud" | "zai";
export type ZaiApiMode = "general" | "coding";

export interface ConfiguredLlmProvider {
  readonly id: ConfiguredLlmProviderId;
  readonly model: string;
  readonly baseUrl: string;
  readonly transport: "responses" | "chat_completions";
  readonly provider: LlmProvider;
}

export interface ConfiguredLlmProviderDependencies {
  readonly fetchImpl?: typeof fetch;
}

export interface ConfiguredLlmProviderChain {
  readonly primary: ConfiguredLlmProvider;
  readonly fallback?: ConfiguredLlmProvider;
  readonly provider: LlmProvider;
}

const OLLAMA_CLOUD_BASE_URL = "https://ollama.com/v1";
const DEFAULT_OLLAMA_CLOUD_MODEL = "glm-5.3-flash";
const DEFAULT_ZAI_MODEL = "glm-5.3-flash";
const ZAI_GENERAL_BASE_URL = "https://api.z.ai/api/paas/v4";
const ZAI_CODING_BASE_URL = "https://api.z.ai/api/coding/paas/v4";

function value(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const result = env[key]?.trim();
  return result ? result : undefined;
}

function required(
  env: NodeJS.ProcessEnv,
  keys: readonly string[],
  label: string,
): string {
  for (const key of keys) {
    const found = value(env, key);
    if (found !== undefined) return found;
  }

  throw new ProjectError({
    code: "input_error",
    stage: "input",
    message: `${label} is required; set ${keys.join(" or ")}`,
  });
}

function optionalNumber(env: NodeJS.ProcessEnv, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const raw = value(env, key);
    if (raw === undefined) continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    throw new ProjectError({
      code: "input_error",
      stage: "input",
      message: `${key} must be a non-negative finite number`,
    });
  }
  return undefined;
}

function pricing(
  env: NodeJS.ProcessEnv,
  providerPrefix: "OPENAI" | "OLLAMA" | "ZAI",
): {
  readonly inputUsdPerMillionTokens?: number;
  readonly outputUsdPerMillionTokens?: number;
} {
  const input = optionalNumber(env, [
    "LLM_INPUT_USD_PER_MILLION",
    `${providerPrefix}_INPUT_USD_PER_MILLION`,
  ]);
  const output = optionalNumber(env, [
    "LLM_OUTPUT_USD_PER_MILLION",
    `${providerPrefix}_OUTPUT_USD_PER_MILLION`,
  ]);

  return {
    ...(input === undefined ? {} : { inputUsdPerMillionTokens: input }),
    ...(output === undefined ? {} : { outputUsdPerMillionTokens: output }),
  };
}

function parseProviderId(raw: string | undefined): ConfiguredLlmProviderId {
  const normalized = (raw ?? "openai").trim().toLowerCase();
  if (normalized === "openai") return "openai";
  if (normalized === "ollama" || normalized === "ollama-cloud") return "ollama-cloud";
  if (normalized === "zai" || normalized === "z.ai") return "zai";

  throw new ProjectError({
    code: "input_error",
    stage: "input",
    message: `Unsupported LLM_PROVIDER: ${raw}`,
    details: { supported: ["openai", "ollama-cloud", "zai"] },
  });
}

function parseZaiMode(raw: string | undefined): ZaiApiMode {
  const normalized = (raw ?? "general").trim().toLowerCase();
  if (normalized === "general" || normalized === "coding") return normalized;
  throw new ProjectError({
    code: "input_error",
    stage: "input",
    message: `Unsupported ZAI_API_MODE: ${raw}`,
    details: { supported: ["general", "coding"] },
  });
}

export function createConfiguredLlmProvider(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: ConfiguredLlmProviderDependencies = {},
): ConfiguredLlmProvider {
  const id = parseProviderId(value(env, "LLM_PROVIDER"));
  const fetchImpl = dependencies.fetchImpl;

  if (id === "openai") {
    const apiKey = required(env, ["OPENAI_API_KEY"], "OpenAI API key");
    const model = required(env, ["LLM_MODEL", "OPENAI_MODEL"], "OpenAI model");
    const baseUrl = value(env, "OPENAI_BASE_URL") ?? "https://api.openai.com/v1";
    return {
      id,
      model,
      baseUrl,
      transport: "responses",
      provider: new OpenAIResponsesProvider({
        apiKey,
        model,
        baseUrl,
        ...(fetchImpl === undefined ? {} : { fetchImpl }),
        ...pricing(env, "OPENAI"),
      }),
    };
  }

  if (id === "ollama-cloud") {
    const apiKey = required(env, ["OLLAMA_API_KEY"], "Ollama Cloud API key");
    const model =
      value(env, "LLM_MODEL") ?? value(env, "OLLAMA_MODEL") ?? DEFAULT_OLLAMA_CLOUD_MODEL;
    const baseUrl = value(env, "OLLAMA_BASE_URL") ?? OLLAMA_CLOUD_BASE_URL;
    return {
      id,
      model,
      baseUrl,
      transport: "chat_completions",
      provider: new OpenAIChatCompletionsProvider({
        providerName: "ollama-cloud",
        apiKey,
        model,
        baseUrl,
        jsonMode: "response_format",
        reasoningEffort: model.startsWith("glm-5.3") ? "low" : "none",
        ...(fetchImpl === undefined ? {} : { fetchImpl }),
        ...pricing(env, "OLLAMA"),
      }),
    };
  }

  const apiKey = required(env, ["ZAI_API_KEY"], "Z.ai API key");
  const model = value(env, "LLM_MODEL") ?? value(env, "ZAI_MODEL") ?? DEFAULT_ZAI_MODEL;
  const mode = parseZaiMode(value(env, "ZAI_API_MODE"));
  const baseUrl =
    value(env, "ZAI_BASE_URL") ??
    (mode === "coding" ? ZAI_CODING_BASE_URL : ZAI_GENERAL_BASE_URL);

  return {
    id,
    model,
    baseUrl,
    transport: "chat_completions",
    provider: new OpenAIChatCompletionsProvider({
      providerName: "zai",
      apiKey,
      model,
      baseUrl,
      jsonMode: "prompt_only",
      ...(fetchImpl === undefined ? {} : { fetchImpl }),
      ...pricing(env, "ZAI"),
    }),
  };
}


export function createConfiguredLlmProviderChain(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: ConfiguredLlmProviderDependencies = {},
  onFailOver?: (error: unknown) => void,
): ConfiguredLlmProviderChain {
  const primaryId = value(env, "LLM_PRIMARY_PROVIDER") ?? value(env, "LLM_PROVIDER") ?? "openai";
  const primary = createConfiguredLlmProvider({ ...env, LLM_PROVIDER: primaryId }, dependencies);
  const fallbackId = value(env, "LLM_FALLBACK_PROVIDER");
  if (fallbackId === undefined) return { primary, provider: primary.provider };

  const fallback = createConfiguredLlmProvider({ ...env, LLM_PROVIDER: fallbackId }, dependencies);
  if (fallback.id === primary.id) {
    throw new ProjectError({
      code: "input_error",
      stage: "input",
      message: "LLM fallback provider must differ from the primary provider",
    });
  }

  return {
    primary,
    fallback,
    provider: new FallbackLlmProvider({
      primary: primary.provider,
      fallback: fallback.provider,
      ...(onFailOver === undefined ? {} : { onFailOver }),
    }),
  };
}
