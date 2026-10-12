import { GenerationRecordSchema, type BetaSurveyResponse } from "@project/service-core";
import { describe, expect, it } from "vitest";

import { calculateBetaKpis } from "../src/index.js";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const userC = "33333333-3333-4333-8333-333333333333";
const createdAt = "2026-10-11T00:00:00.000Z";

const modSpec = {
  title: "Faster steel furnace",
  slug: "faster-steel-furnace",
  target: { game: "factorio", channel: "stable", versionLine: "2.0" },
  capability: "prototype_property",
  changes: [{
    type: "prototype_property",
    prototypeType: "furnace",
    prototypeName: "steel-furnace",
    property: "crafting_speed",
    operation: { type: "multiply", factor: 2 },
  }],
  assertions: [{
    type: "prototype_property_matches",
    prototypeType: "furnace",
    prototypeName: "steel-furnace",
    property: "crafting_speed",
    expectation: { type: "multiply", factor: 2 },
  }],
} as const;

function succeeded(options: {
  id: string;
  prompt: string;
  repaired: boolean;
  durationMs: number;
  totalTokens: number;
  estimatedCostUsd?: number;
  feedback: "up" | "down";
  intentMatch?: "yes" | "partial" | "no";
  gameTest?: "worked" | "partly" | "failed" | "not_tested";
  mainIssue?: "misunderstood" | "did_not_load" | "wrong_behavior" | "missing_capability" | "mod_conflict" | "other";
  downloaded?: boolean;
}) {
  const attempts = options.repaired
    ? [{
        kind: "repair" as const,
        attempt: 1,
        outcome: "validated" as const,
        provider: "fake",
        model: "fake-model",
        durationMs: 50,
      }]
    : [];
  return GenerationRecordSchema.parse({
    schemaVersion: 2,
    id: options.id,
    userId: userA,
    revision: 2,
    prompt: options.prompt,
    status: "succeeded",
    createdAt,
    updatedAt: "2026-10-11T00:00:03.000Z",
    startedAt: "2026-10-11T00:00:01.000Z",
    finishedAt: "2026-10-11T00:00:03.000Z",
    modSpec,
    artifact: {
      key: `generations/${options.id}/faster-steel-furnace_0.1.0.zip`,
      fileName: "faster-steel-furnace_0.1.0.zip",
      contentType: "application/zip",
      sizeBytes: 512,
    },
    ...(options.downloaded ? { firstDownloadedAt: "2026-10-11T00:00:30.000Z" } : {}),
    telemetry: {
      durationMs: options.durationMs,
      attempts,
      usage: {
        inputTokens: Math.max(0, options.totalTokens - 10),
        outputTokens: 10,
        totalTokens: options.totalTokens,
        ...(options.estimatedCostUsd === undefined ? {} : { estimatedCostUsd: options.estimatedCostUsd }),
      },
      validation: {
        initialStatus: options.repaired ? "failed" : "passed",
        repaired: options.repaired,
        finalDurationMs: 100,
      },
    },
    feedback: {
      rating: options.feedback,
      ...(options.intentMatch === undefined ? {} : { intentMatch: options.intentMatch }),
      ...(options.gameTest === undefined ? {} : { gameTest: options.gameTest }),
      ...(options.mainIssue === undefined ? {} : { mainIssue: options.mainIssue }),
      createdAt: "2026-10-11T00:01:00.000Z",
    },
  });
}

describe("private-beta KPI report", () => {
  it("computes product hypotheses without counting same-prompt retries as repeat usage", () => {
    const records = [
      succeeded({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        prompt: "Make steel furnaces twice as fast",
        repaired: false,
        durationMs: 1_000,
        totalTokens: 100,
        estimatedCostUsd: 0.001,
        feedback: "up",
        intentMatch: "yes",
        gameTest: "worked",
        downloaded: true,
      }),
      succeeded({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        prompt: "Make iron gears cost one plate",
        repaired: true,
        durationMs: 3_000,
        totalTokens: 200,
        estimatedCostUsd: 0.002,
        feedback: "down",
        intentMatch: "no",
        gameTest: "failed",
        mainIssue: "misunderstood",
      }),
      GenerationRecordSchema.parse({
        schemaVersion: 2,
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        userId: userB,
        revision: 2,
        prompt: "Double automation research cost",
        status: "failed",
        createdAt,
        updatedAt: "2026-10-11T00:00:04.000Z",
        finishedAt: "2026-10-11T00:00:04.000Z",
        error: {
          code: "process_error",
          stage: "process",
          message: "Transient worker error",
          retryable: true,
        },
      }),
      GenerationRecordSchema.parse({
        schemaVersion: 2,
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        userId: userB,
        revision: 2,
        prompt: "Double automation research cost",
        status: "unsupported",
        createdAt,
        updatedAt: "2026-10-11T00:00:02.000Z",
        startedAt: "2026-10-11T00:00:01.000Z",
        finishedAt: "2026-10-11T00:00:02.000Z",
        reason: "Outside current capability registry",
        telemetry: {
          durationMs: 2_000,
          attempts: [],
          usage: { inputTokens: 40, outputTokens: 10, totalTokens: 50 },
          validation: { initialStatus: "passed", repaired: false },
        },
      }),
    ];
    const surveys: BetaSurveyResponse[] = [
      { userId: userA, willingnessToPay: "yes", updatedAt: "2026-10-11T00:02:00.000Z" },
      { userId: userB, willingnessToPay: "maybe", updatedAt: "2026-10-11T00:02:00.000Z" },
    ];

    const report = calculateBetaKpis(
      {
        provisionedUserIds: [userA, userB, userC],
        generationRecords: records,
        surveyResponses: surveys,
      },
      "2026-10-11T00:03:00.000Z",
    );

    expect(report.testers).toMatchObject({
      provisioned: 3,
      active: 2,
      repeatWithTwoDistinctPrompts: 1,
      targets: { activeReached: false, repeatReached: false },
    });
    expect(report.generations).toMatchObject({
      total: 4,
      succeeded: 2,
      failed: 1,
      unsupported: 1,
      repairedSuccesses: 1,
      downloadStarted: 1,
      downloadStartRate: 0.5,
      // Wall clock createdAt -> finishedAt: succeeded 3 s, 3 s; failed 4 s; unsupported 2 s.
      medianPromptToResultMs: 3_000,
      medianSucceededPromptToResultMs: 3_000,
      medianQueueWaitMs: 1_000,
      medianExecutionMs: 2_000,
      medianFactorioValidationMs: 100,
    });
    expect(report.generations.nonUnsupportedTerminalSuccessRate).toBeCloseTo(2 / 3);
    expect(report.generations.directSuccessRate).toBeCloseTo(1 / 3);
    expect(report.feedback).toMatchObject({
      total: 2,
      up: 1,
      down: 1,
      succeededWithFeedback: 2,
      succeededFeedbackDown: 1,
      succeededFeedbackCoverage: 1,
      reportedFalseSuccessRate: 0.5,
      structuredSucceededFeedback: 2,
      structuredFeedbackCoverage: 1,
      intentYes: 1,
      intentPartial: 0,
      intentNo: 1,
      gameWorked: 1,
      gamePartly: 0,
      gameFailed: 1,
      gameNotTested: 0,
      inGameTested: 2,
      inGameTestCoverage: 1,
      inGameWorkedRate: 0.5,
      reportedRuntimeFailureRate: 0.5,
      problemOutcomeCount: 1,
      problemOutcomeRate: 0.5,
      mainIssues: { misunderstood: 1 },
    });
    expect(report.willingnessToPay).toEqual({
      yes: 1,
      maybe: 1,
      no: 0,
      targetYes: 3,
      targetReached: false,
    });
    expect(report.usage).toEqual({
      totalTokens: 350,
      estimatedCostUsd: 0.003,
      costCoverageGenerations: 2,
      repairAttempts: 1,
    });
  });

  it("counts a runtime problem even when the request intent was understood", () => {
    const report = calculateBetaKpis({
      provisionedUserIds: [userA],
      generationRecords: [succeeded({
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        prompt: "Create a reviewed machine",
        repaired: false,
        durationMs: 1_000,
        totalTokens: 100,
        feedback: "up",
        intentMatch: "yes",
        gameTest: "failed",
        mainIssue: "wrong_behavior",
      })],
      surveyResponses: [],
    });

    expect(report.feedback.reportedFalseSuccessRate).toBe(0);
    expect(report.feedback.reportedRuntimeFailureRate).toBe(1);
    expect(report.feedback.problemOutcomeCount).toBe(1);
    expect(report.feedback.problemOutcomeRate).toBe(1);
  });

  it("measures prompt-to-result on the wall clock, including queue wait and publication", () => {
    const slow = GenerationRecordSchema.parse({
      ...succeeded({
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        prompt: "Make steel furnaces twice as fast",
        repaired: false,
        durationMs: 3_000,
        totalTokens: 100,
        feedback: "up",
      }),
      startedAt: "2026-10-11T00:29:00.000Z",
      updatedAt: "2026-10-11T00:30:00.000Z",
      finishedAt: "2026-10-11T00:30:00.000Z",
    });
    const fastUnsupported = GenerationRecordSchema.parse({
      schemaVersion: 2,
      id: "abababab-abab-4bab-8bab-abababababab",
      userId: userB,
      revision: 2,
      prompt: "Add a new planet",
      status: "unsupported",
      createdAt,
      updatedAt: "2026-10-11T00:00:01.000Z",
      startedAt: "2026-10-11T00:00:00.500Z",
      finishedAt: "2026-10-11T00:00:01.000Z",
      reason: "Outside current capability registry",
      telemetry: { durationMs: 400, attempts: [], usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
    });

    const report = calculateBetaKpis({
      provisionedUserIds: [userA, userB],
      generationRecords: [slow, fastUnsupported],
      surveyResponses: [],
    });

    expect(report.generations.medianPromptToResultMs).toBe((1_800_000 + 1_000) / 2);
    expect(report.generations.medianSucceededPromptToResultMs).toBe(1_800_000);
    expect(report.generations.medianQueueWaitMs).toBe((1_740_000 + 500) / 2);
    expect(report.generations.medianExecutionMs).toBe((3_000 + 400) / 2);
  });

  it("returns null rates when there is no observed denominator", () => {
    const report = calculateBetaKpis({
      provisionedUserIds: [],
      generationRecords: [],
      surveyResponses: [],
    });
    expect(report.generations.nonUnsupportedTerminalSuccessRate).toBeNull();
    expect(report.generations.directSuccessRate).toBeNull();
    expect(report.generations.downloadStartRate).toBeNull();
    expect(report.generations.medianPromptToResultMs).toBeNull();
    expect(report.generations.medianSucceededPromptToResultMs).toBeNull();
    expect(report.generations.medianQueueWaitMs).toBeNull();
    expect(report.generations.medianExecutionMs).toBeNull();
    expect(report.generations.medianFactorioValidationMs).toBeNull();
    expect(report.feedback.succeededFeedbackCoverage).toBeNull();
    expect(report.feedback.reportedFalseSuccessRate).toBeNull();
    expect(report.feedback.structuredFeedbackCoverage).toBeNull();
    expect(report.feedback.inGameTestCoverage).toBeNull();
    expect(report.feedback.inGameWorkedRate).toBeNull();
    expect(report.feedback.reportedRuntimeFailureRate).toBeNull();
    expect(report.feedback.problemOutcomeRate).toBeNull();
  });
});
