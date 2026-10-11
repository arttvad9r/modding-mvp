import {
  GenerationRecordSchema,
  type BetaSurveyResponse,
  type GenerationRecord,
} from "@project/service-core";

import type { ServicePostgresDb } from "./db.js";
import { betaSurveyResponses, generations, serviceUsers } from "./schema.js";

export interface BetaKpiInput {
  readonly provisionedUserIds: readonly string[];
  readonly generationRecords: readonly GenerationRecord[];
  readonly surveyResponses: readonly BetaSurveyResponse[];
}

export interface BetaKpiReport {
  readonly generatedAt: string;
  readonly testers: {
    readonly provisioned: number;
    readonly active: number;
    readonly repeatWithTwoDistinctPrompts: number;
    readonly targets: {
      readonly active: number;
      readonly repeat: number;
      readonly activeReached: boolean;
      readonly repeatReached: boolean;
    };
  };
  readonly generations: {
    readonly total: number;
    readonly queued: number;
    readonly running: number;
    readonly succeeded: number;
    readonly unsupported: number;
    readonly failed: number;
    readonly nonUnsupportedTerminalSuccessRate: number | null;
    readonly directSuccessRate: number | null;
    readonly repairedSuccesses: number;
    readonly medianPromptToResultMs: number | null;
    readonly medianFactorioValidationMs: number | null;
  };
  readonly feedback: {
    readonly total: number;
    readonly up: number;
    readonly down: number;
    readonly succeededWithFeedback: number;
    readonly succeededFeedbackDown: number;
    readonly succeededFeedbackCoverage: number | null;
    readonly reportedFalseSuccessRate: number | null;
  };
  readonly willingnessToPay: {
    readonly yes: number;
    readonly maybe: number;
    readonly no: number;
    readonly targetYes: number;
    readonly targetReached: boolean;
  };
  readonly usage: {
    readonly totalTokens: number;
    readonly estimatedCostUsd: number;
    readonly costCoverageGenerations: number;
    readonly repairAttempts: number;
  };
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const left = sorted[middle - 1];
  const right = sorted[middle];
  return left === undefined || right === undefined ? null : (left + right) / 2;
}

export function calculateBetaKpis(
  input: BetaKpiInput,
  generatedAt = new Date().toISOString(),
): BetaKpiReport {
  const records = input.generationRecords.map((record) => GenerationRecordSchema.parse(record));
  const byStatus = {
    queued: 0,
    running: 0,
    succeeded: 0,
    unsupported: 0,
    failed: 0,
  };
  const promptsByUser = new Map<string, Set<string>>();
  const terminalDurations: number[] = [];
  const validationDurations: number[] = [];
  let directSucceeded = 0;
  let repairedSuccesses = 0;
  let feedbackUp = 0;
  let feedbackDown = 0;
  let succeededWithFeedback = 0;
  let succeededFeedbackDown = 0;
  let totalTokens = 0;
  let estimatedCostUsd = 0;
  let costCoverageGenerations = 0;
  let repairAttempts = 0;

  for (const record of records) {
    byStatus[record.status] += 1;
    const prompts = promptsByUser.get(record.userId) ?? new Set<string>();
    prompts.add(record.prompt);
    promptsByUser.set(record.userId, prompts);

    if (record.status === "queued" || record.status === "running") continue;
    const telemetry = record.telemetry;
    if (telemetry !== undefined) {
      terminalDurations.push(telemetry.durationMs);
      totalTokens += telemetry.usage.totalTokens;
      if (telemetry.usage.estimatedCostUsd !== undefined) {
        estimatedCostUsd += telemetry.usage.estimatedCostUsd;
        costCoverageGenerations += 1;
      }
      repairAttempts += telemetry.attempts.filter((attempt) => attempt.kind === "repair").length;
      if (telemetry.validation?.finalDurationMs !== undefined) {
        validationDurations.push(telemetry.validation.finalDurationMs);
      }
    }

    if (record.status === "succeeded") {
      if (record.telemetry.validation?.repaired === false) directSucceeded += 1;
      if (record.telemetry.validation?.repaired === true) repairedSuccesses += 1;
      if (record.feedback !== undefined) {
        succeededWithFeedback += 1;
        if (record.feedback.rating === "down") succeededFeedbackDown += 1;
      }
    }

    if (record.feedback?.rating === "up") feedbackUp += 1;
    if (record.feedback?.rating === "down") feedbackDown += 1;
  }

  const repeatWithTwoDistinctPrompts = [...promptsByUser.values()].filter((prompts) => prompts.size >= 2).length;
  const supportedTerminal = byStatus.succeeded + byStatus.failed;
  const surveyCounts = { yes: 0, maybe: 0, no: 0 };
  for (const response of input.surveyResponses) surveyCounts[response.willingnessToPay] += 1;

  return {
    generatedAt,
    testers: {
      provisioned: new Set(input.provisionedUserIds).size,
      active: promptsByUser.size,
      repeatWithTwoDistinctPrompts,
      targets: {
        active: 30,
        repeat: 10,
        activeReached: promptsByUser.size >= 30,
        repeatReached: repeatWithTwoDistinctPrompts >= 10,
      },
    },
    generations: {
      total: records.length,
      ...byStatus,
      nonUnsupportedTerminalSuccessRate: ratio(byStatus.succeeded, supportedTerminal),
      directSuccessRate: ratio(directSucceeded, supportedTerminal),
      repairedSuccesses,
      medianPromptToResultMs: median(terminalDurations),
      medianFactorioValidationMs: median(validationDurations),
    },
    feedback: {
      total: feedbackUp + feedbackDown,
      up: feedbackUp,
      down: feedbackDown,
      succeededWithFeedback,
      succeededFeedbackDown,
      succeededFeedbackCoverage: ratio(succeededWithFeedback, byStatus.succeeded),
      reportedFalseSuccessRate: ratio(succeededFeedbackDown, succeededWithFeedback),
    },
    willingnessToPay: {
      ...surveyCounts,
      targetYes: 3,
      targetReached: surveyCounts.yes >= 3,
    },
    usage: {
      totalTokens,
      estimatedCostUsd,
      costCoverageGenerations,
      repairAttempts,
    },
  };
}

export async function buildBetaKpiReport(
  db: ServicePostgresDb,
  generatedAt = new Date().toISOString(),
): Promise<BetaKpiReport> {
  const [userRows, generationRows, surveyRows] = await Promise.all([
    db.select({ id: serviceUsers.id, metricsEligible: serviceUsers.metricsEligible }).from(serviceUsers),
    db.select({ record: generations.record }).from(generations),
    db.select().from(betaSurveyResponses),
  ]);

  const eligibleUserIds = new Set(
    userRows.filter((row) => row.metricsEligible).map((row) => row.id),
  );
  const eligibleGenerationRecords = generationRows
    .map((row) => GenerationRecordSchema.parse(row.record))
    .filter((record) => eligibleUserIds.has(record.userId));
  const eligibleSurveyResponses = surveyRows
    .filter((row) => eligibleUserIds.has(row.userId))
    .map((row) => ({
      userId: row.userId,
      willingnessToPay: row.willingnessToPay,
      updatedAt: row.updatedAt.toISOString(),
    }));

  return calculateBetaKpis(
    {
      provisionedUserIds: [...eligibleUserIds],
      generationRecords: eligibleGenerationRecords,
      surveyResponses: eligibleSurveyResponses,
    },
    generatedAt,
  );
}
