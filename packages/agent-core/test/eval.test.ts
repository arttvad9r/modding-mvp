import { readFile } from "node:fs/promises";
import path from "node:path";

import type { LlmJsonRequest, LlmJsonResponse, LlmProvider } from "@project/llm";
import { describe, expect, it } from "vitest";

import { PlannerEvalCasesSchema, runPlannerEval } from "../src/index.js";

class EvalProvider implements LlmProvider {
  private index = 0;
  constructor(private readonly values: readonly unknown[]) {}

  async generateJson(_request: LlmJsonRequest): Promise<LlmJsonResponse> {
    const value = this.values[this.index++];
    return {
      value,
      provider: "fake",
      model: "fake-model",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    };
  }
}

describe("planner eval runner", () => {
  it("scores classification and exact semantic ModSpec changes", async () => {
    const cases = PlannerEvalCasesSchema.parse([
      {
        id: "supported",
        prompt: "Double Automation research cost",
        expected: {
          status: "supported",
          capability: "technology_cost",
          changes: [
            {
              type: "technology_cost",
              technologyName: "automation",
              operation: { type: "multiply", factor: 2 },
            },
          ],
        },
      },
      {
        id: "unsupported",
        prompt: "Add a new ore",
        expected: { status: "unsupported" },
      },
    ]);
    const provider = new EvalProvider([
      {
        status: "supported",
        title: "Expensive automation",
        slug: "expensive-automation",
        capability: "technology_cost",
        changes: cases[0]!.expected.status === "supported" ? cases[0]!.expected.changes : [],
      },
      { status: "unsupported", reason: "New ores are outside the registry." },
    ]);

    const report = await runPlannerEval(provider, cases);
    expect(report.total).toBe(2);
    expect(report.classificationAccuracy).toBe(1);
    expect(report.supportedModSpecAccuracy).toBe(1);
    expect(report.usage.totalTokens).toBe(30);
  });

  it("keeps a non-trivial golden prompt corpus valid", async () => {
    const file = path.resolve(process.cwd(), "../../evals/planner/golden.json");
    const cases = PlannerEvalCasesSchema.parse(JSON.parse(await readFile(file, "utf8")));
    const ids = new Set(cases.map((item) => item.id));
    const supported = cases.filter((item) => item.expected.status === "supported");
    const unsupported = cases.filter((item) => item.expected.status === "unsupported");

    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect(ids.size).toBe(cases.length);
    expect(supported.length).toBeGreaterThanOrEqual(10);
    expect(unsupported.length).toBeGreaterThanOrEqual(10);
  });
});
