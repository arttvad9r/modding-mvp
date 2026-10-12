import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
import { defaultFactorioBinPath, runFactorioModTest, type HarnessResult } from "@project/factorio-harness";
import { strToU8, zipSync } from "fflate";

import { generateFactorioMod, type GeneratedFactorioMod } from "./generator.js";
import {
  diffDataRaw,
  findFootprintViolations,
  fingerprintDataRaw,
  modSpecFootprint,
  summarizeAddresses,
  type DataRawFingerprint,
} from "./integrity.js";

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
  readonly signal?: AbortSignal;
}

export interface ValidateRepairedFactorioModOptions extends ValidateGeneratedFactorioModOptions {
  readonly spec: ModSpec;
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

    return await runHarness({
      modPath,
      semanticAssertionLua: options.generated.semanticAssertionLua,
      ...(options.factorioBin ? { factorioBin: options.factorioBin } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } finally {
    await rm(buildRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function runHarness(options: Parameters<typeof runFactorioModTest>[0]): Promise<HarnessResult> {
  let validation: HarnessResult;
  try {
    validation = await runFactorioModTest(options);
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
}

async function readFingerprint(dumpPath: string): Promise<DataRawFingerprint> {
  try {
    return fingerprintDataRaw(JSON.parse(await readFile(dumpPath, "utf8")));
  } catch (error) {
    throw normalizeProjectError(error, {
      code: "process_error",
      stage: "process",
      message: "Failed to read Factorio data-raw dump",
      retryable: true,
    });
  }
}

const baseGameFingerprints = new Map<string, Promise<DataRawFingerprint>>();

async function dumpFingerprint(
  scratch: string,
  label: string,
  options: Omit<Parameters<typeof runFactorioModTest>[0], "dataRawDumpPath">,
): Promise<DataRawFingerprint> {
  const dumpPath = path.join(scratch, `${label}.json`);
  await runHarness({ ...options, dataRawDumpPath: dumpPath });
  try {
    return await readFingerprint(dumpPath);
  } finally {
    await rm(dumpPath, { force: true }).catch(() => undefined);
  }
}

function baseGameFingerprint(scratch: string, factorioBin: string | undefined): Promise<DataRawFingerprint> {
  const key = path.resolve(factorioBin ?? process.env.FACTORIO_BIN ?? defaultFactorioBinPath());
  const cached = baseGameFingerprints.get(key);
  if (cached) return cached;
  const pending = dumpFingerprint(scratch, "base-game", { factorioBin: key });
  baseGameFingerprints.set(key, pending);
  pending.catch(() => baseGameFingerprints.delete(key));
  return pending;
}

function integrityFailure(message: string, addresses: readonly string[]): ProjectError {
  return new ProjectError({
    code: "semantic_assertion_failed",
    stage: "validation",
    message: `${message}: ${summarizeAddresses(addresses)}`,
    details: { addresses: addresses.slice(0, 50) },
  });
}

/** Awaits every run so no Factorio process outlives cleanup, then reports the first failure in order. */
async function settleAll<T extends readonly unknown[]>(
  pending: { readonly [K in keyof T]: Promise<T[K]> },
): Promise<T> {
  const outcomes = await Promise.allSettled(pending);
  const failed = outcomes.find((outcome) => outcome.status === "rejected");
  if (failed) throw failed.reason;
  return outcomes.map((outcome) => (outcome as PromiseFulfilledResult<unknown>).value) as unknown as T;
}

/**
 * Validates a model-repaired manifest. Repair returns arbitrary data-stage Lua, so passing the
 * accepted assertions is not enough: the installed mod (without the companion validator) must
 * produce exactly the validated `data.raw`, and that state may differ from the base game only
 * inside the footprint of the accepted ModSpec.
 */
export async function validateRepairedFactorioMod(
  options: ValidateRepairedFactorioModOptions,
): Promise<HarnessResult> {
  let buildRoot: string;
  try {
    buildRoot = await mkdtemp(path.join(tmpdir(), "factorio-repair-validate-"));
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
    const bin = {
      ...(options.factorioBin ? { factorioBin: options.factorioBin } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    };
    // The four Factorio runs use isolated write-data, so they can run concurrently.
    const [created, validated, installed, baseline] = await settleAll([
      runHarness({ modPath, semanticAssertionLua: options.generated.semanticAssertionLua, ...bin }),
      dumpFingerprint(buildRoot, "with-validator", {
        modPath,
        semanticAssertionLua: options.generated.semanticAssertionLua,
        ...bin,
      }),
      dumpFingerprint(buildRoot, "installed", { modPath, ...bin }),
      baseGameFingerprint(buildRoot, options.factorioBin),
    ] as const);

    const divergent = diffDataRaw(validated, installed);
    if (divergent.length > 0) {
      throw integrityFailure(
        "Repaired data.lua produces different prototypes when the semantic validator is absent",
        divergent,
      );
    }
    const violations = findFootprintViolations(baseline, installed, modSpecFootprint(options.spec));
    if (violations.length > 0) {
      throw integrityFailure("Repaired data.lua changes prototypes outside the accepted ModSpec", violations);
    }

    return created;
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
