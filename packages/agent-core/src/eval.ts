import { isDeepStrictEqual } from "node:util";

import {
  PrototypePropertyChangeSchema,
  RecipeIngredientChangeSchema,
  TechnologyCostChangeSchema,
  TechnologyPrerequisiteChangeSchema,
  serializeProjectError,
  type ModSpec,
} from "@project/domain";
import { aggregateLlmUsage, type AggregatedLlmUsage, type LlmProvider } from "@project/llm";
import { z } from "zod";

import { planFactorioPrompt } from "./planner.js";

const EvalChangeSchema = z.discriminatedUnion("type", [
  PrototypePropertyChangeSchema,
  RecipeIngredientChangeSchema,
  TechnologyCostChangeSchema,
  TechnologyPrerequisiteChangeSchema,
]);

const SupportedExpectationSchema = z.strictObject({
  status: z.literal("supported"),
  capability: z.enum([
    "prototype_property",
    "recipe_ingredient",
    "technology_cost",
    "technology_prerequisite",
  ]),
  changes: z.array(EvalChangeSchema).min(1).max(16),
});

const UnsupportedExpectationSchema = z.strictObject({
  status: z.literal("unsupported"),
});

export const PlannerEvalCaseSchema = z.strictObject({
  id: z.string().min(1).max(120),
  prompt: z.string().min(1).max(4_000),
  expected: z.union([SupportedExpectationSchema, UnsupportedExpectationSchema]),
});

export const PlannerEvalCasesSchema = z.array(PlannerEvalCaseSchema).min(1);
export type PlannerEvalCase = z.infer<typeof PlannerEvalCaseSchema>;

export interface PlannerEvalCaseResult {
  readonly id: string;
  readonly prompt: string;
  readonly expectedStatus: "supported" | "unsupported";
  readonly actualStatus: "supported" | "unsupported" | "error";
  readonly classificationCorrect: boolean;
  readonly modSpecCorrect: boolean | null;
  readonly actualCapability?: ModSpec["capability"];
  readonly error?: ReturnType<typeof serializeProjectError>;
}

export interface PlannerEvalReport {
  readonly cases: readonly PlannerEvalCaseResult[];
  readonly total: number;
  readonly classificationCorrect: number;
  readonly classificationAccuracy: number;
  readonly supportedCases: number;
  readonly supportedModSpecCorrect: number;
  readonly supportedModSpecAccuracy: number;
  readonly usage: AggregatedLlmUsage;
}

export async function runPlannerEval(
  provider: LlmProvider,
  inputCases: readonly PlannerEvalCase[],
): Promise<PlannerEvalReport> {
  const cases = PlannerEvalCasesSchema.parse(inputCases);
  const ids = new Set<string>();
  for (const item of cases) {
    if (ids.has(item.id)) throw new Error(`Duplicate planner eval id: ${item.id}`);
    ids.add(item.id);
  }

  const results: PlannerEvalCaseResult[] = [];
  const usages: AggregatedLlmUsage[] = [];

  for (const item of cases) {
    try {
      const result = await planFactorioPrompt({ provider, prompt: item.prompt });
      usages.push(result.usage);
      const classificationCorrect = result.status === item.expected.status;

      if (item.expected.status === "supported") {
        const modSpecCorrect =
          result.status === "supported" &&
          result.modSpec.capability === item.expected.capability &&
          isDeepStrictEqual(result.modSpec.changes, item.expected.changes);
        results.push({
          id: item.id,
          prompt: item.prompt,
          expectedStatus: item.expected.status,
          actualStatus: result.status,
          classificationCorrect,
          modSpecCorrect,
          ...(result.status === "supported"
            ? { actualCapability: result.modSpec.capability }
            : {}),
        });
      } else {
        results.push({
          id: item.id,
          prompt: item.prompt,
          expectedStatus: item.expected.status,
          actualStatus: result.status,
          classificationCorrect,
          modSpecCorrect: null,
          ...(result.status === "supported"
            ? { actualCapability: result.modSpec.capability }
            : {}),
        });
      }
    } catch (error) {
      results.push({
        id: item.id,
        prompt: item.prompt,
        expectedStatus: item.expected.status,
        actualStatus: "error",
        classificationCorrect: false,
        modSpecCorrect: item.expected.status === "supported" ? false : null,
        error: serializeProjectError(error, {
          code: "internal_error",
          stage: "planning",
          message: "Planner eval case failed",
        }),
      });
    }
  }

  const classificationCorrect = results.filter((item) => item.classificationCorrect).length;
  const supportedResults = results.filter((item) => item.expectedStatus === "supported");
  const supportedModSpecCorrect = supportedResults.filter((item) => item.modSpecCorrect === true).length;

  return {
    cases: results,
    total: results.length,
    classificationCorrect,
    classificationAccuracy: classificationCorrect / results.length,
    supportedCases: supportedResults.length,
    supportedModSpecCorrect,
    supportedModSpecAccuracy:
      supportedResults.length === 0 ? 1 : supportedModSpecCorrect / supportedResults.length,
    usage: aggregateLlmUsage(usages),
  };
}
