import {
  ModSpecSchema,
  SerializedProjectErrorSchema,
  type ModSpec,
  type SerializedProjectError,
} from "@project/domain";
import { z } from "zod";

import { UserIdSchema } from "./auth.js";

const safeArtifactKey = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/;
const safeZipName = /^[a-z0-9]+(?:-[a-z0-9]+)*_[0-9]+\.[0-9]+\.[0-9]+\.zip$/;

export const ArtifactFileNameSchema = z.string().regex(safeZipName);

export const GenerationIdSchema = z.string().uuid();
export const GenerationStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "unsupported",
  "failed",
]);
export const GenerationPromptSchema = z.string().trim().min(1).max(4_000);
export const TimestampSchema = z.string().datetime({ offset: true });

export const UsageSummarySchema = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  estimatedCostUsd: z.number().nonnegative().optional(),
});

export const PlannerAttemptSummarySchema = z.strictObject({
  kind: z.literal("planner"),
  attempt: z.number().int().min(1).max(3),
  provider: z.string().min(1).max(120),
  model: z.string().min(1).max(200),
  usage: UsageSummarySchema.partial().optional(),
  durationMs: z.number().int().nonnegative().optional(),
});

export const RepairAttemptSummarySchema = z.strictObject({
  kind: z.literal("repair"),
  attempt: z.number().int().min(1).max(2),
  outcome: z.enum([
    "provider_error",
    "candidate_rejected",
    "validation_failed",
    "validated",
  ]),
  provider: z.string().min(1).max(120).optional(),
  model: z.string().min(1).max(200).optional(),
  usage: UsageSummarySchema.partial().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  error: SerializedProjectErrorSchema.optional(),
});

export const GenerationAttemptSummarySchema = z.discriminatedUnion("kind", [
  PlannerAttemptSummarySchema,
  RepairAttemptSummarySchema,
]);

export const GenerationTelemetrySchema = z.strictObject({
  durationMs: z.number().int().nonnegative(),
  attempts: z.array(GenerationAttemptSummarySchema).max(16),
  usage: UsageSummarySchema,
  validation: z
    .strictObject({
      initialStatus: z.enum(["passed", "failed"]),
      initialError: SerializedProjectErrorSchema.optional(),
      finalDurationMs: z.number().int().nonnegative().optional(),
      repaired: z.boolean(),
    })
    .optional(),
});

export const ArtifactKeySchema = z
  .string()
  .min(1)
  .max(512)
  .regex(safeArtifactKey)
  .refine((value) => !value.includes("..") && !value.includes("\\"), "Unsafe artifact key");

export const ArtifactRefSchema = z.strictObject({
  key: ArtifactKeySchema,
  fileName: ArtifactFileNameSchema,
  contentType: z.literal("application/zip"),
  sizeBytes: z.number().int().nonnegative(),
});

export const GenerationFeedbackSchema = z.strictObject({
  rating: z.enum(["up", "down"]),
  note: z.string().trim().min(1).max(2_000).optional(),
  createdAt: TimestampSchema,
});

const GenerationBaseSchema = z.strictObject({
  schemaVersion: z.literal(2),
  id: GenerationIdSchema,
  userId: UserIdSchema,
  revision: z.number().int().nonnegative(),
  prompt: GenerationPromptSchema,
  sourceGenerationId: GenerationIdSchema.optional(),
  baseModSpec: ModSpecSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const QueuedGenerationRecordSchema = GenerationBaseSchema.extend({
  status: z.literal("queued"),
});

export const RunningGenerationRecordSchema = GenerationBaseSchema.extend({
  status: z.literal("running"),
  startedAt: TimestampSchema,
});

export const SucceededGenerationRecordSchema = GenerationBaseSchema.extend({
  status: z.literal("succeeded"),
  startedAt: TimestampSchema,
  finishedAt: TimestampSchema,
  modSpec: ModSpecSchema,
  artifact: ArtifactRefSchema,
  telemetry: GenerationTelemetrySchema,
  feedback: GenerationFeedbackSchema.optional(),
});

export const UnsupportedGenerationRecordSchema = GenerationBaseSchema.extend({
  status: z.literal("unsupported"),
  startedAt: TimestampSchema,
  finishedAt: TimestampSchema,
  reason: z.string().trim().min(1).max(600),
  telemetry: GenerationTelemetrySchema,
  feedback: GenerationFeedbackSchema.optional(),
});

export const FailedGenerationRecordSchema = GenerationBaseSchema.extend({
  status: z.literal("failed"),
  startedAt: TimestampSchema.optional(),
  finishedAt: TimestampSchema,
  modSpec: ModSpecSchema.optional(),
  error: SerializedProjectErrorSchema,
  telemetry: GenerationTelemetrySchema.optional(),
  feedback: GenerationFeedbackSchema.optional(),
});

export const GenerationRecordSchema = z
  .discriminatedUnion("status", [
    QueuedGenerationRecordSchema,
    RunningGenerationRecordSchema,
    SucceededGenerationRecordSchema,
    UnsupportedGenerationRecordSchema,
    FailedGenerationRecordSchema,
  ])
  .superRefine((record, ctx) => {
    if ((record.sourceGenerationId === undefined) !== (record.baseModSpec === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceGenerationId"],
        message: "Revision generations require both sourceGenerationId and baseModSpec",
      });
    }
    if (record.sourceGenerationId === record.id) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceGenerationId"],
        message: "A generation cannot revise itself",
      });
    }
  });

export const GenerationJobSchema = z.strictObject({
  schemaVersion: z.literal(1),
  generationId: GenerationIdSchema,
});

export const SubmitGenerationRequestSchema = z.strictObject({
  prompt: GenerationPromptSchema,
});

export type GenerationStatus = z.infer<typeof GenerationStatusSchema>;
export type GenerationRecord = z.infer<typeof GenerationRecordSchema>;
export type QueuedGenerationRecord = z.infer<typeof QueuedGenerationRecordSchema>;
export type RunningGenerationRecord = z.infer<typeof RunningGenerationRecordSchema>;
export type SucceededGenerationRecord = z.infer<typeof SucceededGenerationRecordSchema>;
export type UnsupportedGenerationRecord = z.infer<typeof UnsupportedGenerationRecordSchema>;
export type FailedGenerationRecord = z.infer<typeof FailedGenerationRecordSchema>;
export type GenerationJob = z.infer<typeof GenerationJobSchema>;
export type GenerationTelemetry = z.infer<typeof GenerationTelemetrySchema>;
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;
export type GenerationFeedback = z.infer<typeof GenerationFeedbackSchema>;

export interface GenerationRepository {
  insert(record: QueuedGenerationRecord): Promise<void>;
  get(id: string): Promise<GenerationRecord | null>;
  compareAndSet(
    id: string,
    expectedRevision: number,
    next: GenerationRecord,
  ): Promise<boolean>;
  listByUserCreatedDesc(userId: string, limit: number): Promise<readonly GenerationRecord[]>;
  listRunningUpdatedBefore(cutoff: string, limit: number): Promise<readonly RunningGenerationRecord[]>;
}

export interface GenerationQueue {
  enqueue(job: GenerationJob): Promise<void>;
}

export interface GenerationSubmissionStore {
  submit(record: QueuedGenerationRecord, job: GenerationJob): Promise<void>;
}

export interface ArtifactStorePutInput {
  readonly key: string;
  readonly fileName: string;
  readonly contentType: "application/zip";
  readonly bytes: Uint8Array;
}

export interface ArtifactStore {
  put(input: ArtifactStorePutInput): Promise<ArtifactRef>;
}

export interface ArtifactDownloadSigner {
  createDownloadUrl(artifact: ArtifactRef, expiresInSeconds?: number): Promise<string>;
}

export type ServiceGenerationExecution =
  | {
      readonly status: "success";
      readonly modSpec: ModSpec;
      readonly artifact: {
        readonly fileName: string;
        readonly bytes: Uint8Array;
      };
      readonly telemetry: GenerationTelemetry;
    }
  | {
      readonly status: "unsupported";
      readonly reason: string;
      readonly telemetry: GenerationTelemetry;
    }
  | {
      readonly status: "failed";
      readonly modSpec?: ModSpec;
      readonly error: SerializedProjectError;
      readonly telemetry?: GenerationTelemetry;
    };

export interface GenerationExecutor {
  execute(input: {
    readonly generationId: string;
    readonly prompt: string;
    readonly baseModSpec?: ModSpec;
  }): Promise<ServiceGenerationExecution>;
}
