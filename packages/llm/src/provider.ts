export type LlmRole = "system" | "user" | "assistant";

export interface LlmMessage {
  readonly role: LlmRole;
  readonly content: string;
}

export interface LlmUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly estimatedCostUsd?: number;
}

export interface LlmJsonRequest {
  readonly messages: readonly LlmMessage[];
  readonly schemaName: string;
  readonly schemaDescription: string;
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
}

export interface LlmJsonResponse {
  readonly value: unknown;
  readonly provider: string;
  readonly model: string;
  readonly usage?: LlmUsage;
  readonly durationMs?: number;
}

export interface LlmProvider {
  generateJson(request: LlmJsonRequest): Promise<LlmJsonResponse>;
}

export interface AggregatedLlmUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly estimatedCostUsd?: number;
}

export function aggregateLlmUsage(
  usages: readonly (LlmUsage | undefined)[],
): AggregatedLlmUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let estimatedCostUsd = 0;
  let hasEstimatedCost = false;

  for (const usage of usages) {
    inputTokens += usage?.inputTokens ?? 0;
    outputTokens += usage?.outputTokens ?? 0;
    totalTokens += usage?.totalTokens ?? (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
    if (usage?.estimatedCostUsd !== undefined) {
      estimatedCostUsd += usage.estimatedCostUsd;
      hasEstimatedCost = true;
    }
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    ...(hasEstimatedCost ? { estimatedCostUsd } : {}),
  };
}
