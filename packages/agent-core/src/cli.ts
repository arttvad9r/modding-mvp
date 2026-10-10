#!/usr/bin/env node
import { serializeProjectError } from "@project/domain";
import { createConfiguredLlmProvider } from "@project/llm";

import { loadLocalEnvFile } from "./load-local-env.js";
import { planFactorioPrompt } from "./planner.js";

loadLocalEnvFile();

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const prompt = args.join(" ").trim();

if (!prompt) {
  console.error("Usage: pnpm prompt:plan -- \"<Factorio mod request>\"");
  process.exitCode = 2;
} else {
  try {
    const configured = createConfiguredLlmProvider();
    const result = await planFactorioPrompt({ provider: configured.provider, prompt });

    console.log(
      JSON.stringify(
        {
          status: "OK",
          runtime: {
            provider: configured.id,
            model: configured.model,
            transport: configured.transport,
          },
          result,
        },
        null,
        2,
      ),
    );
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
