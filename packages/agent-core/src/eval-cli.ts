#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

import { serializeProjectError } from "@project/domain";
import { OpenAIResponsesProvider } from "@project/llm";

import { PlannerEvalCasesSchema, runPlannerEval } from "./eval.js";

function optionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

const invocationDirectory = process.env.INIT_CWD ?? process.cwd();
const rawEvalPath = process.argv.slice(2).filter((arg) => arg !== "--")[0] ?? "evals/planner/golden.json";
const evalPath = path.resolve(invocationDirectory, rawEvalPath);
const minClassification = optionalNumber(process.env.PLANNER_MIN_CLASSIFICATION) ?? 0.9;
const minModSpec = optionalNumber(process.env.PLANNER_MIN_MODSPEC) ?? 0.8;

if (!process.env.OPENAI_API_KEY) {
  console.error(
    JSON.stringify(
      {
        status: "ERROR",
        error: {
          code: "input_error",
          stage: "input",
          message: "OPENAI_API_KEY is required for planner evals",
          retryable: false,
        },
      },
      null,
      2,
    ),
  );
  process.exitCode = 2;
} else {
  try {
    const cases = PlannerEvalCasesSchema.parse(JSON.parse(await readFile(evalPath, "utf8")));
    const inputPrice = optionalNumber(process.env.OPENAI_INPUT_USD_PER_MILLION);
    const outputPrice = optionalNumber(process.env.OPENAI_OUTPUT_USD_PER_MILLION);
    const provider = new OpenAIResponsesProvider({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL ?? "gpt-6-luna",
      ...(inputPrice === undefined ? {} : { inputUsdPerMillionTokens: inputPrice }),
      ...(outputPrice === undefined ? {} : { outputUsdPerMillionTokens: outputPrice }),
    });
    const report = await runPlannerEval(provider, cases);
    const failures = report.cases.filter(
      (item) => !item.classificationCorrect || item.modSpecCorrect === false,
    );
    const passed =
      report.classificationAccuracy >= minClassification &&
      report.supportedModSpecAccuracy >= minModSpec;

    console.log(
      JSON.stringify(
        {
          status: passed ? "PASS" : "FAIL",
          model: process.env.OPENAI_MODEL ?? "gpt-6-luna",
          evalPath,
          thresholds: { classificationAccuracy: minClassification, supportedModSpecAccuracy: minModSpec },
          metrics: {
            total: report.total,
            classificationCorrect: report.classificationCorrect,
            classificationAccuracy: report.classificationAccuracy,
            supportedCases: report.supportedCases,
            supportedModSpecCorrect: report.supportedModSpecCorrect,
            supportedModSpecAccuracy: report.supportedModSpecAccuracy,
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
            message: "Planner eval failed",
          }),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}
