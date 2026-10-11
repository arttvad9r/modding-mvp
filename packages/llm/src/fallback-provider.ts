import { ProjectError } from "@project/domain";

import type { LlmJsonRequest, LlmJsonResponse, LlmProvider } from "./provider.js";

const FAILOVER_HTTP_STATUSES = new Set([401, 402, 403]);
const PROVIDER_AVAILABILITY_CODE = /(auth|unauthor|forbid|quota|billing|credit|balance|exhaust|limit)/i;

export function shouldFailOverLlmProvider(error: unknown): boolean {
  if (!(error instanceof ProjectError)) return false;
  if (error.code !== "process_error" || error.stage !== "planning") return false;
  if (error.retryable) return true;

  const httpStatus = error.details?.httpStatus;
  if (typeof httpStatus === "number" && FAILOVER_HTTP_STATUSES.has(httpStatus)) return true;

  const providerCode = error.details?.providerCode;
  return typeof providerCode === "string" && PROVIDER_AVAILABILITY_CODE.test(providerCode);
}

export interface FallbackLlmProviderOptions {
  readonly primary: LlmProvider;
  readonly fallback: LlmProvider;
  readonly shouldFailOver?: (error: unknown) => boolean;
  readonly onFailOver?: (error: unknown) => void;
}

export class FallbackLlmProvider implements LlmProvider {
  constructor(private readonly options: FallbackLlmProviderOptions) {}

  async generateJson(request: LlmJsonRequest): Promise<LlmJsonResponse> {
    try {
      return await this.options.primary.generateJson(request);
    } catch (error) {
      const shouldFailOver = this.options.shouldFailOver ?? shouldFailOverLlmProvider;
      if (!shouldFailOver(error)) throw error;
      this.options.onFailOver?.(error);
      return this.options.fallback.generateJson(request);
    }
  }
}
