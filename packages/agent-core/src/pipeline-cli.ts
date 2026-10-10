#!/usr/bin/env node
import path from "node:path";

import { serializeProjectError } from "@project/domain";
import { createConfiguredLlmProvider } from "@project/llm";

import { loadLocalEnvFile } from "./load-local-env.js";
import { runLocalFactorioGeneration } from "./pipeline.js";

loadLocalEnvFile();

function parseArgs(args: string[]) {
  const promptParts: string[] = [];
  let outputDirectory: string | undefined;
  let runDirectory: string | undefined;
  let factorioBin: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--output" || arg === "--runs" || arg === "--factorio-bin") {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} requires a value`);
      index += 1;
      if (arg === "--output") outputDirectory = value;
      if (arg === "--runs") runDirectory = value;
      if (arg === "--factorio-bin") factorioBin = value;
      continue;
    }
    promptParts.push(arg ?? "");
  }

  return {
    prompt: promptParts.join(" ").trim(),
    ...(outputDirectory === undefined ? {} : { outputDirectory }),
    ...(runDirectory === undefined ? {} : { runDirectory }),
    ...(factorioBin === undefined ? {} : { factorioBin }),
  };
}

try {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.prompt) {
    console.error(
      'Usage: pnpm prompt:build -- "<Factorio mod request>" [--output dist] [--runs .runs]',
    );
    process.exitCode = 2;
  } else {
    const configured = createConfiguredLlmProvider();
    const invocationDirectory = process.env.INIT_CWD ?? process.cwd();
    const result = await runLocalFactorioGeneration({
      provider: configured.provider,
      prompt: parsed.prompt,
      outputDirectory: path.resolve(invocationDirectory, parsed.outputDirectory ?? "dist"),
      runDirectory: path.resolve(invocationDirectory, parsed.runDirectory ?? ".runs"),
      ...(parsed.factorioBin === undefined
        ? {}
        : { factorioBin: path.resolve(invocationDirectory, parsed.factorioBin) }),
      onProgress: (event) => {
        console.error(JSON.stringify({ type: "progress", ...event }));
      },
    });

    console.log(
      JSON.stringify(
        {
          runtime: {
            provider: configured.id,
            model: configured.model,
            transport: configured.transport,
            baseUrl: configured.baseUrl,
          },
          result,
        },
        null,
        2,
      ),
    );

    if (result.status === "failed") process.exitCode = 1;
    if (result.status === "unsupported") process.exitCode = 3;
  }
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "ERROR",
        error: serializeProjectError(error, {
          code: "internal_error",
          stage: "internal",
          message: "Local pipeline CLI failed",
        }),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
