import { describe, expect, it } from "vitest";

import {
  submitGenerationAtomically,
  type GenerationJob,
  type GenerationSubmissionStore,
  type QueuedGenerationRecord,
} from "../src/index.js";

const generationId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-10-11T00:00:00.000Z");

class CapturingSubmissionStore implements GenerationSubmissionStore {
  readonly calls: Array<{ record: QueuedGenerationRecord; job: GenerationJob }> = [];
  fail = false;

  async submit(record: QueuedGenerationRecord, job: GenerationJob): Promise<void> {
    this.calls.push({ record, job });
    if (this.fail) throw new Error("transaction rolled back");
  }
}

describe("atomic generation submission", () => {
  it("delegates the queued record and matching id-only job as one store operation", async () => {
    const store = new CapturingSubmissionStore();
    const result = await submitGenerationAtomically({
      submissionStore: store,
      prompt: "Make steel furnaces twice as fast",
      generationId: () => generationId,
      now: () => now,
    });

    expect(result).toMatchObject({ id: generationId, revision: 0, status: "queued" });
    expect(store.calls).toEqual([
      {
        record: result,
        job: { schemaVersion: 1, generationId },
      },
    ]);
  });

  it("normalizes a transactional store failure without pretending the generation was accepted", async () => {
    const store = new CapturingSubmissionStore();
    store.fail = true;

    await expect(
      submitGenerationAtomically({
        submissionStore: store,
        prompt: "Make steel furnaces twice as fast",
        generationId: () => generationId,
        now: () => now,
      }),
    ).rejects.toMatchObject({
      code: "process_error",
      stage: "process",
      retryable: true,
      details: { generationId },
    });
  });
});
