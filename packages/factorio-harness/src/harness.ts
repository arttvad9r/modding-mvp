import { spawnSync } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ProjectError, type ProjectErrorCode } from '@project/domain';

export interface HarnessOptions {
  modPath: string;
  factorioBin?: string;
  timeoutMs?: number;
  keepTemp?: boolean;
  semanticAssertionLua?: string;
}

export type HarnessErrorType = Extract<
  ProjectErrorCode,
  'semantic_assertion_failed' | 'factorio_load_failed' | 'process_error'
>;

export interface HarnessResult {
  ok: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  errorType: HarnessErrorType | null;
  summary: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  workingDirectory?: string;
}

interface ModInfo {
  name: string;
  version: string;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_LOG_CHARS = 100_000;
const SEMANTIC_MARKER = '__PROJECT_SEMANTIC_ASSERTION__|';
const VALIDATOR_MOD_NAME = 'zz-project-semantic-validator';
const VALIDATOR_MOD_VERSION = '0.0.0';

function bundledFactorioPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), '../../../.tools/factorio/bin/x64/factorio');
}

async function requireFile(filePath: string, label: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    throw new ProjectError({
      code: 'process_error',
      stage: 'process',
      message: `${label} not found: ${filePath}`,
      retryable: false,
    });
  }
}

async function readModInfo(modPath: string): Promise<ModInfo> {
  const infoPath = path.join(modPath, 'info.json');
  let parsed: unknown;

  try {
    parsed = JSON.parse(await readFile(infoPath, 'utf8'));
  } catch (error) {
    throw new ProjectError({
      code: 'factorio_load_failed',
      stage: 'validation',
      message: `Cannot read valid info.json from ${modPath}: ${String(error)}`,
      cause: error,
    });
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('name' in parsed) ||
    !('version' in parsed) ||
    typeof parsed.name !== 'string' ||
    typeof parsed.version !== 'string' ||
    parsed.name.length === 0 ||
    parsed.version.length === 0
  ) {
    throw new ProjectError({
      code: 'factorio_load_failed',
      stage: 'validation',
      message: 'info.json must contain non-empty string fields \"name\" and \"version\"',
    });
  }

  return { name: parsed.name, version: parsed.version };
}

function boundedLog(value: string | Buffer | null | undefined): string {
  const text = value?.toString() ?? '';
  return text.length <= MAX_LOG_CHARS ? text : text.slice(-MAX_LOG_CHARS);
}

function logLines(stdout: string, stderr: string): string[] {
  return `${stderr}\n${stdout}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function extractErrorSummary(stdout: string, stderr: string): string | null {
  const lines = logLines(stdout, stderr);

  const semantic = lines.find((line) => line.includes(SEMANTIC_MARKER));
  if (semantic) return semantic;

  const preferred = lines.find((line) => /(^|\s)(error|failed|exception)(\s|:)/i.test(line));
  if (preferred) return preferred;

  return lines.length > 0 ? lines.at(-1) ?? null : null;
}

export function classifyHarnessError(
  stdout: string,
  stderr: string,
  processError?: Error,
): HarnessErrorType {
  if (`${stderr}\n${stdout}`.includes(SEMANTIC_MARKER)) {
    return 'semantic_assertion_failed';
  }
  if (processError) {
    return 'process_error';
  }
  return 'factorio_load_failed';
}

export async function runFactorioModTest(options: HarnessOptions): Promise<HarnessResult> {
  const startedAt = Date.now();
  const factorioBin = path.resolve(options.factorioBin ?? process.env.FACTORIO_BIN ?? bundledFactorioPath());
  const sourceModPath = path.resolve(options.modPath);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  await requireFile(factorioBin, 'Factorio binary');
  const modInfo = await readModInfo(sourceModPath);

  const workingDirectory = await mkdtemp(path.join(tmpdir(), 'factorio-mod-test-'));
  const modsDirectory = path.join(workingDirectory, 'mods');
  const outputSave = path.join(workingDirectory, 'validation.zip');

  try {
    await mkdir(modsDirectory, { recursive: true });
    const isolatedModPath = path.join(modsDirectory, `${modInfo.name}_${modInfo.version}`);
    await cp(sourceModPath, isolatedModPath, { recursive: true, force: false });

    const enabledMods = [
      { name: 'base', enabled: true },
      { name: modInfo.name, enabled: true },
    ];

    if (options.semanticAssertionLua !== undefined) {
      if (modInfo.name === VALIDATOR_MOD_NAME) {
        throw new ProjectError({
          code: 'factorio_load_failed',
          stage: 'validation',
          message: `Candidate mod name is reserved: ${VALIDATOR_MOD_NAME}`,
        });
      }

      const validatorPath = path.join(
        modsDirectory,
        `${VALIDATOR_MOD_NAME}_${VALIDATOR_MOD_VERSION}`,
      );
      await mkdir(validatorPath, { recursive: true });
      await writeFile(
        path.join(validatorPath, 'info.json'),
        `${JSON.stringify(
          {
            name: VALIDATOR_MOD_NAME,
            version: VALIDATOR_MOD_VERSION,
            title: 'Project semantic validator',
            author: 'Project test harness',
            factorio_version: '2.0',
            dependencies: [modInfo.name],
          },
          null,
          2,
        )}\n`,
        'utf8',
      );
      await writeFile(
        path.join(validatorPath, 'data-final-fixes.lua'),
        options.semanticAssertionLua,
        'utf8',
      );
      enabledMods.push({ name: VALIDATOR_MOD_NAME, enabled: true });
    }

    await writeFile(
      path.join(modsDirectory, 'mod-list.json'),
      JSON.stringify({ mods: enabledMods }, null, 2),
      'utf8',
    );

    const result = spawnSync(
      factorioBin,
      ['--mod-directory', modsDirectory, '--no-log-rotation', '--create', outputSave],
      {
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: MAX_LOG_CHARS * 2,
        env: { ...process.env },
      },
    );

    const stdout = boundedLog(result.stdout);
    const stderr = boundedLog(result.stderr);
    const ok = result.status === 0 && result.error === undefined;
    const processError = result.error instanceof Error ? result.error : undefined;
    const errorType = ok ? null : classifyHarnessError(stdout, stderr, processError);
    const summary = ok
      ? null
      : processError?.message ?? extractErrorSummary(stdout, stderr) ?? 'Factorio validation failed';

    return {
      ok,
      exitCode: result.status,
      signal: result.signal,
      errorType,
      summary,
      stdout,
      stderr,
      durationMs: Date.now() - startedAt,
      ...(options.keepTemp ? { workingDirectory } : {}),
    };
  } finally {
    if (!options.keepTemp) {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  }
}
