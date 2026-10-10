#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  ModSpecSchema,
  ProjectError,
  normalizeProjectError,
  serializeProjectError,
} from "@project/domain";

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
    let source: string;
    try {
      source = await readFile(specPath, "utf8");
    } catch (error) {
      throw new ProjectError({
        code: "input_error",
        stage: "input",
        message: `Cannot read ModSpec file: ${specPath}`,
        cause: error,
      });
    }

    let raw: unknown;
    try {
      raw = JSON.parse(source);
    } catch (error) {
      throw new ProjectError({
        code: "schema_error",
        stage: "input",
        message: `ModSpec file is not valid JSON: ${specPath}`,
        cause: error,
      });
    }

    let spec;
    try {
      spec = ModSpecSchema.parse(raw);
    } catch (error) {
      throw normalizeProjectError(error, {
        code: "schema_error",
        stage: "input",
        message: "Invalid ModSpec",
      });
    }

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
          error: serializeProjectError(error),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}
