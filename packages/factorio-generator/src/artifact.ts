import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  GeneratedFileManifestSchema,
  type GeneratedFileManifest,
  type GeneratedTextFile,
} from "@project/domain";
import { runFactorioModTest, type HarnessResult } from "@project/factorio-harness";
import { strToU8, zipSync } from "fflate";

import { generateFactorioMod } from "./generator.js";
import type { ModSpec } from "@project/domain";

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

export function validateFactorioManifest(input: GeneratedFileManifest): GeneratedFileManifest {
  const manifest = GeneratedFileManifestSchema.parse(input);
  const seen = new Set<string>();

  for (const file of manifest.files) {
    const expectedRole = allowedFiles.get(file.path);
    if (expectedRole === undefined) {
      throw new Error(`Unsupported Factorio artifact file: ${file.path}`);
    }
    if (file.role !== expectedRole) {
      throw new Error(`Unexpected role for ${file.path}: ${file.role ?? "missing"}`);
    }
    seen.add(file.path);
  }

  for (const requiredPath of allowedFiles.keys()) {
    if (!seen.has(requiredPath)) {
      throw new Error(`Missing required Factorio artifact file: ${requiredPath}`);
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
    throw new Error(`Unsafe Factorio artifact directory name: ${directoryName}`);
  }

  const validated = validateFactorioManifest(manifest);
  const modPath = path.join(buildRoot, directoryName);
  await mkdir(modPath, { recursive: false });

  for (const file of validated.files) {
    const target = path.join(modPath, ...file.path.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, { encoding: "utf8", flag: "wx" });
  }

  return modPath;
}

export function createFactorioZip(
  manifest: GeneratedFileManifest,
  directoryName: string,
): Uint8Array {
  if (!safeDirectoryName.test(directoryName)) {
    throw new Error(`Unsafe Factorio artifact directory name: ${directoryName}`);
  }

  const validated = validateFactorioManifest(manifest);
  const entries: Record<string, Uint8Array> = {};
  for (const file of validated.files) {
    entries[`${directoryName}/${file.path}`] = strToU8(file.content);
  }
  return zipSync(entries, { level: 9 });
}

export async function buildValidatedFactorioArtifact(
  options: BuildFactorioArtifactOptions,
): Promise<BuildFactorioArtifactResult> {
  const generated = generateFactorioMod(options.spec);
  const buildRoot = await mkdtemp(path.join(tmpdir(), "factorio-artifact-build-"));

  try {
    const modPath = await materializeManifest(
      generated.manifest,
      buildRoot,
      generated.directoryName,
    );
    const validation = await runFactorioModTest({
      modPath,
      semanticAssertionLua: generated.semanticAssertionLua,
      ...(options.factorioBin ? { factorioBin: options.factorioBin } : {}),
    });

    if (!validation.ok) {
      throw new Error(
        `Factorio validation failed (${validation.errorType ?? "unknown"}): ${validation.summary ?? "no summary"}`,
      );
    }

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
  } finally {
    await rm(buildRoot, { recursive: true, force: true });
  }
}
