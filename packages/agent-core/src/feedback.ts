import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ProjectError } from "@project/domain";
import { z } from "zod";

const safeGenerationId = /^[A-Za-z0-9-]{8,80}$/;

const StoredRunSchema = z.object({
  schemaVersion: z.literal(1),
  generationId: z.string().regex(safeGenerationId),
  createdAt: z.string(),
  updatedAt: z.string(),
  result: z.record(z.string(), z.unknown()),
  feedback: z
    .object({
      rating: z.enum(["up", "down"]),
      note: z.string().max(2_000).optional(),
      createdAt: z.string(),
    })
    .optional(),
});

export interface RecordFeedbackOptions {
  readonly generationId: string;
  readonly rating: "up" | "down";
  readonly note?: string;
  readonly runDirectory?: string;
}

export interface RecordFeedbackResult {
  readonly generationId: string;
  readonly reportPath: string;
  readonly feedback: {
    readonly rating: "up" | "down";
    readonly note?: string;
    readonly createdAt: string;
  };
}

export async function recordLocalGenerationFeedback(
  options: RecordFeedbackOptions,
): Promise<RecordFeedbackResult> {
  if (!safeGenerationId.test(options.generationId)) {
    throw new ProjectError({
      code: "input_error",
      stage: "input",
      message: "Invalid generation ID",
    });
  }

  const note = options.note?.trim();
  if (note !== undefined && note.length > 2_000) {
    throw new ProjectError({
      code: "input_error",
      stage: "input",
      message: "Feedback note exceeds 2000 characters",
    });
  }

  const reportPath = path.resolve(
    options.runDirectory ?? ".runs",
    `${options.generationId}.json`,
  );

  let parsed: z.infer<typeof StoredRunSchema>;
  try {
    parsed = StoredRunSchema.parse(JSON.parse(await readFile(reportPath, "utf8")));
  } catch (error) {
    throw new ProjectError({
      code: "input_error",
      stage: "input",
      message: `Generation report not found or invalid: ${options.generationId}`,
      cause: error,
    });
  }

  if (parsed.generationId !== options.generationId) {
    throw new ProjectError({
      code: "input_error",
      stage: "input",
      message: "Generation report ID mismatch",
    });
  }

  const createdAt = new Date().toISOString();
  const feedback = {
    rating: options.rating,
    ...(note ? { note } : {}),
    createdAt,
  } as const;

  const updated = {
    ...parsed,
    updatedAt: createdAt,
    feedback,
  };
  await writeFile(reportPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");

  return {
    generationId: options.generationId,
    reportPath,
    feedback,
  };
}
