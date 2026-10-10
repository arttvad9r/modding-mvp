import { randomUUID } from "node:crypto";

import { ProjectError, normalizeProjectError } from "@project/domain";
import { z } from "zod";

import {
  GenerationFeedbackSchema,
  GenerationIdSchema,
  GenerationRecordSchema,
  SubmitGenerationRequestSchema,
  type GenerationQueue,
  type GenerationRecord,
  type GenerationRepository,
  type GenerationSubmissionStore,
  type QueuedGenerationRecord,
} from "./contracts.js";

interface QueuedGenerationInput {
  readonly prompt: string;
  readonly generationId?: () => string;
  readonly now?: () => Date;
}

function createQueuedGeneration(input: QueuedGenerationInput): QueuedGenerationRecord {
  const request = SubmitGenerationRequestSchema.parse({ prompt: input.prompt });
  const id = GenerationIdSchema.parse((input.generationId ?? randomUUID)());
  const timestamp = (input.now ?? (() => new Date()))().toISOString();
  return GenerationRecordSchema.parse({
    schemaVersion: 1,
    id,
    revision: 0,
    prompt: request.prompt,
    status: "queued",
    createdAt: timestamp,
    updatedAt: timestamp,
  }) as QueuedGenerationRecord;
}

export interface SubmitGenerationOptions extends QueuedGenerationInput {
  readonly repository: GenerationRepository;
  readonly queue: GenerationQueue;
}

export interface SubmitGenerationAtomicOptions extends QueuedGenerationInput {
  readonly submissionStore: GenerationSubmissionStore;
}

export async function submitGeneration(
  options: SubmitGenerationOptions,
): Promise<QueuedGenerationRecord> {
  const record = createQueuedGeneration(options);
  const id = record.id;

  await options.repository.insert(record);

  try {
    await options.queue.enqueue({ schemaVersion: 1, generationId: id });
  } catch (error) {
    const normalized = normalizeProjectError(error, {
      code: "process_error",
      stage: "process",
      message: "Failed to enqueue generation job",
      retryable: true,
    });
    const failedAt = (options.now ?? (() => new Date()))().toISOString();
    const failed = GenerationRecordSchema.parse({
      ...record,
      revision: record.revision + 1,
      status: "failed",
      updatedAt: failedAt,
      finishedAt: failedAt,
      error: normalized.toJSON(),
    });
    await options.repository.compareAndSet(id, record.revision, failed).catch(() => false);
    throw new ProjectError({
      code: normalized.code,
      stage: normalized.stage,
      message: normalized.message,
      retryable: normalized.retryable,
      details: { generationId: id },
      cause: error,
    });
  }

  return record;
}

export async function submitGenerationAtomically(
  options: SubmitGenerationAtomicOptions,
): Promise<QueuedGenerationRecord> {
  const record = createQueuedGeneration(options);
  try {
    await options.submissionStore.submit(record, {
      schemaVersion: 1,
      generationId: record.id,
    });
  } catch (error) {
    const normalized = normalizeProjectError(error, {
      code: "process_error",
      stage: "process",
      message: "Failed to persist and enqueue generation atomically",
      retryable: true,
    });
    throw new ProjectError({
      code: normalized.code,
      stage: normalized.stage,
      message: normalized.message,
      retryable: normalized.retryable,
      details: { generationId: record.id },
      cause: error,
    });
  }
  return record;
}

export async function findGeneration(
  repository: GenerationRepository,
  generationId: string,
): Promise<GenerationRecord | null> {
  const id = GenerationIdSchema.parse(generationId);
  const record = await repository.get(id);
  return record === null ? null : GenerationRecordSchema.parse(record);
}

const FeedbackInputSchema = z.strictObject({
  generationId: GenerationIdSchema,
  rating: z.enum(["up", "down"]),
  note: z.string().trim().min(1).max(2_000).optional(),
});

export interface RecordGenerationFeedbackOptions {
  readonly repository: GenerationRepository;
  readonly generationId: string;
  readonly rating: "up" | "down";
  readonly note?: string;
  readonly now?: () => Date;
}

export async function recordGenerationFeedback(
  options: RecordGenerationFeedbackOptions,
): Promise<GenerationRecord> {
  const input = FeedbackInputSchema.parse({
    generationId: options.generationId,
    rating: options.rating,
    ...(options.note === undefined ? {} : { note: options.note }),
  });
  const now = options.now ?? (() => new Date());

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await options.repository.get(input.generationId);
    if (current === null) {
      throw new ProjectError({
        code: "input_error",
        stage: "input",
        message: `Generation not found: ${input.generationId}`,
      });
    }
    const parsed = GenerationRecordSchema.parse(current);
    if (parsed.status === "queued" || parsed.status === "running") {
      throw new ProjectError({
        code: "input_error",
        stage: "input",
        message: "Feedback is accepted only after a generation reaches a terminal state",
      });
    }

    const timestamp = now().toISOString();
    const feedback = GenerationFeedbackSchema.parse({
      rating: input.rating,
      ...(input.note === undefined ? {} : { note: input.note }),
      createdAt: timestamp,
    });
    const next = GenerationRecordSchema.parse({
      ...parsed,
      revision: parsed.revision + 1,
      updatedAt: timestamp,
      feedback,
    });
    if (await options.repository.compareAndSet(parsed.id, parsed.revision, next)) return next;
  }

  throw new ProjectError({
    code: "process_error",
    stage: "process",
    message: "Generation changed concurrently while recording feedback",
    retryable: true,
  });
}
