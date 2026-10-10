#!/usr/bin/env node
import path from "node:path";

import { serializeProjectError } from "@project/domain";

import { recordLocalGenerationFeedback } from "./feedback.js";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
let runDirectory = ".runs";
const positional: string[] = [];
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--runs") {
    const value = args[index + 1];
    if (!value) {
      console.error("--runs requires a value");
      process.exitCode = 2;
      break;
    }
    runDirectory = value;
    index += 1;
  } else if (arg !== undefined) {
    positional.push(arg);
  }
}

if (process.exitCode === undefined) {
  const [generationId, ratingRaw, ...noteParts] = positional;
  const rating = ratingRaw === "up" || ratingRaw === "down" ? ratingRaw : undefined;

  if (!generationId || !rating) {
    console.error(
      'Usage: pnpm prompt:feedback -- <generation-id> <up|down> ["note"] [--runs .runs]',
    );
    process.exitCode = 2;
  } else {
    try {
      const invocationDirectory = process.env.INIT_CWD ?? process.cwd();
      const result = await recordLocalGenerationFeedback({
        generationId,
        rating,
        runDirectory: path.resolve(invocationDirectory, runDirectory),
        ...(noteParts.length === 0 ? {} : { note: noteParts.join(" ") }),
      });
      console.log(JSON.stringify({ status: "OK", result }, null, 2));
    } catch (error) {
      console.error(
        JSON.stringify(
          {
            status: "ERROR",
            error: serializeProjectError(error, {
              code: "internal_error",
              stage: "internal",
              message: "Feedback CLI failed",
            }),
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
    }
  }
}
