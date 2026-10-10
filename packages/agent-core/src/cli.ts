#!/usr/bin/env node
import { serializeProjectError } from "@project/domain";
import { OpenAIResponsesProvider } from "@project/llm";

import { planFactorioPrompt } from "./planner.js";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const prompt = args.join(" ").trim();

function optionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

if (!prompt) {
  console.error("Usage: pnpm prompt:plan -- \"<Factorio mod request>\"");
  process.exitCode = 2;
} else if (!process.env.OPENAI_API_KEY) {
  console.error(
    JSON.stringify(
      {
        status: "ERROR",
        error: {
          code: "input_error",
          stage: "input",
          message: "OPENAI_API_KEY is required for the OpenAI planner CLI",
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
    const provider = new OpenAIResponsesProvider({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL ?? "gpt-6-luna",
      ...(optionalNumber(process.env.OPENAI_INPUT_USD_PER_MILLION) === undefined
        ? {}
        : { inputUsdPerMillionTokens: optionalNumber(process.env.OPENAI_INPUT_USD_PER_MILLION)! }),
      ...(optionalNumber(process.env.OPENAI_OUTPUT_USD_PER_MILLION) === undefined
        ? {}
        : { outputUsdPerMillionTokens: optionalNumber(process.env.OPENAI_OUTPUT_USD_PER_MILLION)! }),
    });
    const result = await planFactorioPrompt({ provider, prompt });

    console.log(JSON.stringify({ status: "OK", result }, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          status: "ERROR",
          error: serializeProjectError(error, {
            code: "internal_error",
            stage: "planning",
            message: "Planner CLI failed",
          }),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}
