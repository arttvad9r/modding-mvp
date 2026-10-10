import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  ModSpecSchema,
  serializeProjectError,
  type GeneratedFileManifest,
  type SerializedProjectError,
} from "@project/domain";
import {
  generateFactorioMod,
  validateGeneratedFactorioMod,
  type GeneratedFactorioMod,
} from "@project/factorio-generator";
import { aggregateLlmUsage, type AggregatedLlmUsage, type LlmProvider } from "@project/llm";
import { z } from "zod";

import { repairFactorioManifest, type RepairAttemptMetadata } from "./repair.js";

export const RepairEvalCaseSchema = z.strictObject({
  id: z.string().min(1).max(120),
  specPath: z.string().min(1).max(240),
  fault: z.enum(["append_syntax_error", "no_op"]),
  expectedInitialError: z.enum(["factorio_load_failed", "semantic_assertion_failed"]),
});

export const RepairEvalCasesSchema = z.array(RepairEvalCaseSchema).min(1).max(100);

export type RepairEvalCase = z.infer<typeof RepairEvalCaseSchema>;

export interface RepairEvalCaseResult {
  readonly id: string;
  readonly specPath: string;
  readonly fault: RepairEvalCase["fault"];
  readonly expectedInitialError: RepairEvalCase["expectedInitialError"];
  readonly actualInitialError?: SerializedProjectError;
  readonly initialFailureCorrect: boolean;
  readonly repaired: boolean;
  readonly attempts: readonly RepairAttemptMetadata[];
  readonly error?: SerializedProjectError;
}

export interface RepairEvalReport {
  readonly total: number;
  readonly initialFailureCorrect: number;
  readonly repaired: number;
  readonly successRate: number;
  readonly usage: AggregatedLlmUsage;
  readonly cases: readonly RepairEvalCaseResult[];
}

function replaceDataLua(
  generated: GeneratedFactorioMod,
  dataLua: string,
): GeneratedFactorioMod {
  const manifest: GeneratedFileManifest = {
    files: generated.manifest.files.map((file) =>
      file.path === "data.lua" ? { ...file, content: dataLua } : file,
    ),
  };
  return { ...generated, manifest };
}

function injectFault(
  generated: GeneratedFactorioMod,
  fault: RepairEvalCase["fault"],
): GeneratedFactorioMod {
  const current = generated.manifest.files.find((file) => file.path === "data.lua")?.content;
  if (!current) throw new Error("Generated repair eval fixture lacks data.lua");

  if (fault === "append_syntax_error") {
    return replaceDataLua(generated, `${current}\nlocal =\n`);
  }

  return replaceDataLua(
    generated,
    "-- synthetic repair eval: valid Lua that intentionally omits the requested mutation\n",
  );
}

async function captureInitialFailure(
  generated: GeneratedFactorioMod,
): Promise<SerializedProjectError | undefined> {
  try {
    await validateGeneratedFactorioMod({ generated });
    return undefined;
  } catch (error) {
    return serializeProjectError(error);
  }
}

async function loadSpec(baseDirectory: string, specPath: string) {
  const absolute = path.resolve(baseDirectory, specPath);
  return ModSpecSchema.parse(JSON.parse(await readFile(absolute, "utf8")));
}

export async function runRepairEval(
  provider: LlmProvider,
  cases: readonly RepairEvalCase[],
  baseDirectory: string,
): Promise<RepairEvalReport> {
  const results: RepairEvalCaseResult[] = [];

  for (const testCase of cases) {
    const spec = await loadSpec(baseDirectory, testCase.specPath);
    const correct = generateFactorioMod(spec);
    const broken = injectFault(correct, testCase.fault);
    const initialFailure = await captureInitialFailure(broken);
    const initialFailureCorrect = initialFailure?.code === testCase.expectedInitialError;

    if (!initialFailure || !initialFailureCorrect) {
      results.push({
        id: testCase.id,
        specPath: testCase.specPath,
        fault: testCase.fault,
        expectedInitialError: testCase.expectedInitialError,
        ...(initialFailure === undefined ? {} : { actualInitialError: initialFailure }),
        initialFailureCorrect,
        repaired: false,
        attempts: [],
        error:
          initialFailure ??
          ({
            code: "internal_error",
            stage: "internal",
            message: "Synthetic repair eval fixture unexpectedly passed initial validation",
            retryable: false,
          } satisfies SerializedProjectError),
      });
      continue;
    }

    try {
      const repair = await repairFactorioManifest({
        provider,
        spec,
        priorManifest: broken.manifest,
        failure: initialFailure,
        validateCandidate: async ({ manifest }) =>
          validateGeneratedFactorioMod({ generated: { ...correct, manifest } }),
      });

      if (repair.status === "repaired") {
        results.push({
          id: testCase.id,
          specPath: testCase.specPath,
          fault: testCase.fault,
          expectedInitialError: testCase.expectedInitialError,
          actualInitialError: initialFailure,
          initialFailureCorrect: true,
          repaired: true,
          attempts: repair.attempts,
        });
      } else {
        results.push({
          id: testCase.id,
          specPath: testCase.specPath,
          fault: testCase.fault,
          expectedInitialError: testCase.expectedInitialError,
          actualInitialError: initialFailure,
          initialFailureCorrect: true,
          repaired: false,
          attempts: repair.attempts,
          error: repair.error,
        });
      }
    } catch (error) {
      results.push({
        id: testCase.id,
        specPath: testCase.specPath,
        fault: testCase.fault,
        expectedInitialError: testCase.expectedInitialError,
        actualInitialError: initialFailure,
        initialFailureCorrect: true,
        repaired: false,
        attempts: [],
        error: serializeProjectError(error),
      });
    }
  }

  const initialFailureCorrect = results.filter((item) => item.initialFailureCorrect).length;
  const repaired = results.filter((item) => item.repaired).length;
  const usage = aggregateLlmUsage(
    results.flatMap((item) => item.attempts.map((attempt) => attempt.usage)),
  );

  return {
    total: results.length,
    initialFailureCorrect,
    repaired,
    successRate: results.length === 0 ? 0 : repaired / results.length,
    usage,
    cases: results,
  };
}
