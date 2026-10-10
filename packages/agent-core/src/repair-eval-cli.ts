#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

import { serializeProjectError } from "@project/domain";
import { createConfiguredLlmProvider } from "@project/llm";

import { loadLocalEnvFile } from "./load-local-env.js";
import { RepairEvalCasesSchema, runRepairEval } from "./repair-eval.js";

function optionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : undefined;
}

loadLocalEnvFile();

const invocationDirectory = process.env.INIT_CWD ?? process.cwd();
const rawEvalPath = process.argv.slice(2).filter((arg) => arg !== "--")[0] ?? "evals/repair/golden.json";
const evalPath = path.resolve(invocationDirectory, rawEvalPath);
const minSuccess = optionalNumber(process.env.REPAIR_MIN_SUCCESS) ?? 0.8;

try {
  const cases = RepairEvalCasesSchema.parse(JSON.parse(await readFile(evalPath, "utf8")));
  const configured = createConfiguredLlmProvider();
  const report = await runRepairEval(configured.provider, cases, invocationDirectory);
  const failures = report.cases.filter((item) => !item.repaired);
  const passed = report.initialFailureCorrect === report.total && report.successRate >= minSuccess;
  const totalAttempts = report.cases.reduce((sum, item) => sum + item.attempts.length, 0);

  console.log(
    JSON.stringify(
      {
        status: passed ? "PASS" : "FAIL",
        runtime: {
          provider: configured.id,
          model: configured.model,
          transport: configured.transport,
          baseUrl: configured.baseUrl,
        },
        evalPath,
        thresholds: { repairSuccessRate: minSuccess },
        metrics: {
          total: report.total,
          initialFailureCorrect: report.initialFailureCorrect,
          repaired: report.repaired,
          successRate: report.successRate,
          totalAttempts,
          averageAttempts: report.total === 0 ? 0 : totalAttempts / report.total,
          usage: report.usage,
        },
        failures,
      },
      null,
      2,
    ),
  );
  if (!passed) process.exitCode = 1;
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "ERROR",
        error: serializeProjectError(error, {
          code: "internal_error",
          stage: "planning",
          message: "Repair eval failed",
        }),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
