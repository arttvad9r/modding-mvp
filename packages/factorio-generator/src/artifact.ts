import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  GeneratedFileManifestSchema,
  ProjectError,
  normalizeProjectError,
  type GeneratedFileManifest,
  type GeneratedTextFile,
  type ModSpec,
} from "@project/domain";
import { runFactorioModTest, type HarnessResult } from "@project/factorio-harness";
import { strToU8, zipSync } from "fflate";

import { generateFactorioMod, type GeneratedFactorioMod } from "./generator.js";

const allowedFiles = new Map<string, GeneratedTextFile["role"]>([
  ["info.json", "metadata"],
  ["data.lua", "data_stage"],
]);
const safeDirectoryName = /^[a-z0-9]+(?:-[a-z0-9]+)*_[0-9]+\.[0-9]+\.[0-9]+$/;

export interface BuildFactorioArtifactOptions {
  readonly spec: ModSpec;
  readonly outputDirectory: string;
  readonly factorioBin?: string;
}

export interface BuildFactorioArtifactResult {
  readonly zipPath: string;
  readonly directoryName: string;
  readonly validation: HarnessResult;
}

export interface ValidateGeneratedFactorioModOptions {
  readonly generated: GeneratedFactorioMod;
  readonly factorioBin?: string;
}

function packagingError(message: string, cause?: unknown): ProjectError {
  return new ProjectError({
    code: "packaging_error",
    stage: "packaging",
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

export function validateFactorioManifest(input: GeneratedFileManifest): GeneratedFileManifest {
  let manifest: GeneratedFileManifest;
  try {
    manifest = GeneratedFileManifestSchema.parse(input);
  } catch (error) {
    throw packagingError("Generated Factorio manifest is invalid", error);
  }

  const seen = new Set<string>();

  for (const file of manifest.files) {
    const expectedRole = allowedFiles.get(file.path);
    if (expectedRole === undefined) {
      throw packagingError(`Unsupported Factorio artifact file: ${file.path}`);
    }
    if (file.role !== expectedRole) {
      throw packagingError(`Unexpected role for ${file.path}: ${file.role ?? "missing"}`);
    }
    seen.add(file.path);
  }

  for (const requiredPath of allowedFiles.keys()) {
    if (!seen.has(requiredPath)) {
      throw packagingError(`Missing required Factorio artifact file: ${requiredPath}`);
    }
  }

  return manifest;
}

async function materializeManifest(
  manifest: GeneratedFileManifest,
  buildRoot: string,
  directoryName: string,
): Promise<string> {
  if (!safeDirectoryName.test(directoryName)) {
    throw packagingError(`Unsafe Factorio artifact directory name: ${directoryName}`);
  }

  const validated = validateFactorioManifest(manifest);
  const modPath = path.join(buildRoot, directoryName);

  try {
    await mkdir(modPath, { recursive: false });
    for (const file of validated.files) {
      const target = path.join(modPath, ...file.path.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content, { encoding: "utf8", flag: "wx" });
    }
    return modPath;
  } catch (error) {
    throw normalizeProjectError(error, {
      code: "packaging_error",
      stage: "packaging",
      message: "Failed to materialize generated Factorio files",
    });
  }
}

export function createFactorioZip(
  manifest: GeneratedFileManifest,
  directoryName: string,
): Uint8Array {
  if (!safeDirectoryName.test(directoryName)) {
    throw packagingError(`Unsafe Factorio artifact directory name: ${directoryName}`);
  }

  const validated = validateFactorioManifest(manifest);
  const entries: Record<string, Uint8Array> = {};
  for (const file of validated.files) {
    entries[`${directoryName}/${file.path}`] = strToU8(file.content);
  }

  try {
    return zipSync(entries, { level: 9 });
  } catch (error) {
    throw normalizeProjectError(error, {
      code: "packaging_error",
      stage: "packaging",
      message: "Failed to create Factorio ZIP",
    });
  }
}

export async function validateGeneratedFactorioMod(
  options: ValidateGeneratedFactorioModOptions,
): Promise<HarnessResult> {
  let buildRoot: string;
  try {
    buildRoot = await mkdtemp(path.join(tmpdir(), "factorio-artifact-validate-"));
  } catch (error) {
    throw normalizeProjectError(error, {
      code: "packaging_error",
      stage: "packaging",
      message: "Failed to create temporary validation directory",
    });
  }

  try {
    const modPath = await materializeManifest(
      options.generated.manifest,
      buildRoot,
      options.generated.directoryName,
    );

    let validation: HarnessResult;
    try {
      validation = await runFactorioModTest({
        modPath,
        semanticAssertionLua: options.generated.semanticAssertionLua,
        ...(options.factorioBin ? { factorioBin: options.factorioBin } : {}),
      });
    } catch (error) {
      throw normalizeProjectError(error, {
        code: "process_error",
        stage: "process",
        message: "Factorio validation process failed",
        retryable: true,
      });
    }

    if (!validation.ok) {
      const code = validation.errorType ?? "process_error";
      throw new ProjectError({
        code,
        stage: code === "process_error" ? "process" : "validation",
        message: validation.summary ?? "Factorio validation failed",
        retryable: code === "process_error",
        details: {
          exitCode: validation.exitCode,
          signal: validation.signal,
          durationMs: validation.durationMs,
        },
      });
    }

    return validation;
  } finally {
    await rm(buildRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function buildValidatedFactorioArtifact(
  options: BuildFactorioArtifactOptions,
): Promise<BuildFactorioArtifactResult> {
  const generated = generateFactorioMod(options.spec);
  const validation = await validateGeneratedFactorioMod({
    generated,
    ...(options.factorioBin ? { factorioBin: options.factorioBin } : {}),
  });

  try {
    const outputDirectory = path.resolve(options.outputDirectory);
    await mkdir(outputDirectory, { recursive: true });
    const zipPath = path.join(outputDirectory, `${generated.directoryName}.zip`);
    const zipBytes = createFactorioZip(generated.manifest, generated.directoryName);
    await writeFile(zipPath, zipBytes, { flag: "w" });

    return {
      zipPath,
      directoryName: generated.directoryName,
      validation,
    };
  } catch (error) {
    throw normalizeProjectError(error, {
      code: "packaging_error",
      stage: "packaging",
      message: "Failed to write validated Factorio artifact",
    });
  }
}
