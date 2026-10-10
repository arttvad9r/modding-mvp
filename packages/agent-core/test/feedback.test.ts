import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { recordLocalGenerationFeedback } from "../src/index.js";

const tempDirectories: string[] = [];

async function tempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "feedback-test-"));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("recordLocalGenerationFeedback", () => {
  it("updates exactly one local generation report with bounded feedback", async () => {
    const root = await tempDirectory();
    const runs = path.join(root, "runs");
    await mkdir(runs, { recursive: true });
    const generationId = "generation-feedback-1234";
    const reportPath = path.join(runs, `${generationId}.json`);
    await writeFile(
      reportPath,
      `${JSON.stringify({
        schemaVersion: 1,
        generationId,
        createdAt: "2026-10-11T00:00:00.000Z",
        updatedAt: "2026-10-11T00:00:00.000Z",
        result: { status: "success", generationId },
      })}\n`,
      "utf8",
    );

    const result = await recordLocalGenerationFeedback({
      generationId,
      rating: "up",
      note: "Installed successfully",
      runDirectory: runs,
    });

    expect(result).toMatchObject({
      generationId,
      reportPath,
      feedback: { rating: "up", note: "Installed successfully" },
    });
    const updated = JSON.parse(await readFile(reportPath, "utf8"));
    expect(updated.feedback).toMatchObject({ rating: "up", note: "Installed successfully" });
  });

  it("rejects unsafe IDs before reading the filesystem", async () => {
    const root = await tempDirectory();
    await expect(
      recordLocalGenerationFeedback({
        generationId: "../outside",
        rating: "down",
        runDirectory: root,
      }),
    ).rejects.toMatchObject({ code: "input_error", stage: "input" });
  });
});
