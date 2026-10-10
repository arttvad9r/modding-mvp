#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

import { ModSpecSchema } from "@project/domain";

import { buildValidatedFactorioArtifact } from "./artifact.js";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const rawSpecPath = args[0];
const rawOutputDirectory = args[1] ?? "dist";

if (!rawSpecPath) {
  console.error("Usage: pnpm mod:build -- <mod-spec.json> [output-directory]");
  process.exitCode = 2;
} else {
  const invocationDirectory = process.env.INIT_CWD ?? process.cwd();
  const specPath = path.resolve(invocationDirectory, rawSpecPath);
  const outputDirectory = path.resolve(invocationDirectory, rawOutputDirectory);

  try {
    const raw = JSON.parse(await readFile(specPath, "utf8"));
    const spec = ModSpecSchema.parse(raw);
    const result = await buildValidatedFactorioArtifact({ spec, outputDirectory });

    console.log(
      JSON.stringify(
        {
          status: "PASS",
          zipPath: result.zipPath,
          directoryName: result.directoryName,
          validationMs: result.validation.durationMs,
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
          message: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}
