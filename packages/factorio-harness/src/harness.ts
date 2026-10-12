import { spawn } from 'node:child_process';
import { access, copyFile, cp, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ProjectError, type ProjectErrorCode } from '@project/domain';

export interface HarnessOptions {
  /** Candidate mod directory. Omitted only for a baseline run of the isolated base game. */
  modPath?: string;
  factorioBin?: string;
  timeoutMs?: number;
  keepTemp?: boolean;
  semanticAssertionLua?: string;
  /**
   * When set, Factorio runs `--dump-data` instead of `--create` and the resulting
   * `data-raw-dump.json` is copied to this caller-owned path on success.
   */
  dataRawDumpPath?: string;
  /** Kills the Factorio process when the owning generation is cancelled. */
  signal?: AbortSignal;
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

interface ProcessOutcome {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_LOG_CHARS = 100_000;
const SEMANTIC_MARKER = '__PROJECT_SEMANTIC_ASSERTION__|';
const VALIDATOR_MOD_NAME = 'zz-project-semantic-validator';
const VALIDATOR_MOD_VERSION = '0.0.0';
// Factorio enables any installed mod that mod-list.json does not mention. The
// headless archive ships these expansion mods, so validation must disable them
// explicitly to stay on the isolated base game.
const BUNDLED_EXPANSION_MODS = ['space-age', 'quality', 'elevated-rails'] as const;
const MOD_NAME_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const MOD_VERSION_PATTERN = /^(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})$/;
const INFRASTRUCTURE_FAILURE = /Couldn't acquire exclusive lock/i;

export function defaultFactorioBinPath(): string {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  const sourceLayout = path.resolve(currentDirectory, '../../../.tools/factorio/bin/x64/factorio');
  const compiledLayout = path.resolve(currentDirectory, '../../../../.tools/factorio/bin/x64/factorio');
  return currentDirectory.includes(`${path.sep}dist${path.sep}`) ? compiledLayout : sourceLayout;
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

function invalidCandidate(message: string, cause?: unknown): ProjectError {
  return new ProjectError({
    code: 'factorio_load_failed',
    stage: 'validation',
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

async function rejectSymlinks(modPath: string): Promise<void> {
  let rootStat;
  try {
    rootStat = await lstat(modPath);
  } catch (error) {
    throw invalidCandidate(`Cannot read mod directory ${modPath}: ${String(error)}`, error);
  }
  if (!rootStat.isDirectory()) throw invalidCandidate(`Mod path is not a directory: ${modPath}`);

  const entries = await readdir(modPath, { recursive: true, withFileTypes: true });
  const linked = entries.find((entry) => entry.isSymbolicLink());
  if (linked) {
    throw invalidCandidate(
      `Mod directory must not contain symbolic links: ${path.relative(modPath, path.join(linked.parentPath, linked.name))}`,
    );
  }
}

async function readModInfo(modPath: string): Promise<ModInfo> {
  const infoPath = path.join(modPath, 'info.json');
  let parsed: unknown;

  try {
    parsed = JSON.parse(await readFile(infoPath, 'utf8'));
  } catch (error) {
    throw invalidCandidate(`Cannot read valid info.json from ${modPath}: ${String(error)}`, error);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('name' in parsed) ||
    !('version' in parsed) ||
    typeof parsed.name !== 'string' ||
    typeof parsed.version !== 'string'
  ) {
    throw invalidCandidate('info.json must contain string fields "name" and "version"');
  }
  if (!MOD_NAME_PATTERN.test(parsed.name)) {
    throw invalidCandidate('info.json "name" must be 1-100 letters, digits, "-" or "_"');
  }
  if (!MOD_VERSION_PATTERN.test(parsed.version)) {
    throw invalidCandidate('info.json "version" must be a Factorio version such as 1.0.0');
  }

  return { name: parsed.name, version: parsed.version };
}

function containedPath(root: string, child: string): string {
  const resolved = path.resolve(root, child);
  const relative = path.relative(root, resolved);
  if (relative !== child || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw invalidCandidate(`Refusing to write outside the harness directory: ${child}`);
  }
  return resolved;
}

function appendBounded(current: string, chunk: string): string {
  const next = current + chunk;
  return next.length <= MAX_LOG_CHARS * 2 ? next : next.slice(-MAX_LOG_CHARS);
}

function boundedLog(value: string): string {
  return value.length <= MAX_LOG_CHARS ? value : value.slice(-MAX_LOG_CHARS);
}

function runFactorioProcess(
  factorioBin: string,
  args: readonly string[],
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<ProcessOutcome> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ status: null, signal: null, stdout: '', stderr: '', error: new Error('Factorio validation was cancelled') });
      return;
    }
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timeoutError: Error | undefined;

    const child = spawn(factorioBin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    const onAbort = () => {
      timeoutError ??= new Error('Factorio validation was cancelled');
      child.kill('SIGKILL');
    };
    const settle = (outcome: Omit<ProcessOutcome, 'stdout' | 'stderr'>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve({ ...outcome, stdout: boundedLog(stdout), stderr: boundedLog(stderr) });
    };
    const timer = setTimeout(() => {
      timeoutError = new Error(`Factorio validation timed out after ${timeoutMs} ms`);
      child.kill('SIGKILL');
    }, timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout = appendBounded(stdout, chunk); });
    child.stderr.on('data', (chunk: string) => { stderr = appendBounded(stderr, chunk); });
    child.once('error', (error) => {
      child.kill('SIGKILL');
      settle({ status: null, signal: null, error });
    });
    child.once('close', (status, signal) => {
      settle({ status, signal, ...(timeoutError === undefined ? {} : { error: timeoutError }) });
    });
  });
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
  const log = `${stderr}\n${stdout}`;
  if (log.includes(SEMANTIC_MARKER)) {
    return 'semantic_assertion_failed';
  }
  if (processError || INFRASTRUCTURE_FAILURE.test(log)) {
    return 'process_error';
  }
  return 'factorio_load_failed';
}

async function writeIsolatedConfig(factorioBin: string, workingDirectory: string): Promise<string> {
  const realBin = await realpath(factorioBin);
  const readData = path.resolve(path.dirname(realBin), '../../data');
  const writeData = path.join(workingDirectory, 'write-data');
  for (const value of [readData, writeData]) {
    if (/[\r\n]/.test(value)) {
      throw new ProjectError({
        code: 'process_error',
        stage: 'process',
        message: 'Factorio paths must not contain line breaks',
        retryable: false,
      });
    }
  }
  await mkdir(writeData, { recursive: true });
  const configPath = path.join(workingDirectory, 'config.ini');
  await writeFile(configPath, `[path]\nread-data=${readData}\nwrite-data=${writeData}\n`, 'utf8');
  return configPath;
}

export async function runFactorioModTest(options: HarnessOptions): Promise<HarnessResult> {
  const startedAt = Date.now();
  const factorioBin = path.resolve(options.factorioBin ?? process.env.FACTORIO_BIN ?? defaultFactorioBinPath());
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  await requireFile(factorioBin, 'Factorio binary');

  let candidate: { sourcePath: string; info: ModInfo } | undefined;
  if (options.modPath !== undefined) {
    const sourcePath = path.resolve(options.modPath);
    await rejectSymlinks(sourcePath);
    candidate = { sourcePath, info: await readModInfo(sourcePath) };
  }
  if (options.semanticAssertionLua !== undefined) {
    if (candidate === undefined) {
      throw new ProjectError({
        code: 'internal_error',
        stage: 'internal',
        message: 'Semantic assertions require a candidate mod',
      });
    }
    if (candidate.info.name === VALIDATOR_MOD_NAME) {
      throw invalidCandidate(`Candidate mod name is reserved: ${VALIDATOR_MOD_NAME}`);
    }
  }

  const workingDirectory = await mkdtemp(path.join(tmpdir(), 'factorio-mod-test-'));
  const modsDirectory = path.join(workingDirectory, 'mods');
  const outputSave = path.join(workingDirectory, 'validation.zip');

  try {
    await mkdir(modsDirectory, { recursive: true });
    const configPath = await writeIsolatedConfig(factorioBin, workingDirectory);

    const modList: Array<{ name: string; enabled: boolean }> = [
      { name: 'base', enabled: true },
      ...BUNDLED_EXPANSION_MODS.map((name) => ({ name, enabled: false })),
    ];

    if (candidate !== undefined) {
      const isolatedModPath = containedPath(
        modsDirectory,
        `${candidate.info.name}_${candidate.info.version}`,
      );
      await cp(candidate.sourcePath, isolatedModPath, { recursive: true, force: false, errorOnExist: true });
      modList.push({ name: candidate.info.name, enabled: true });
    }

    if (candidate !== undefined && options.semanticAssertionLua !== undefined) {
      const validatorPath = containedPath(
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
            dependencies: [candidate.info.name],
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
      modList.push({ name: VALIDATOR_MOD_NAME, enabled: true });
    }

    await writeFile(
      path.join(modsDirectory, 'mod-list.json'),
      JSON.stringify({ mods: modList }, null, 2),
      'utf8',
    );

    const action = options.dataRawDumpPath === undefined ? ['--create', outputSave] : ['--dump-data'];
    const result = await runFactorioProcess(
      factorioBin,
      ['--config', configPath, '--mod-directory', modsDirectory, '--no-log-rotation', ...action],
      timeoutMs,
      options.signal,
    );

    const stdout = result.stdout;
    let stderr = result.stderr;
    let processError = result.error;
    let ok = result.status === 0 && processError === undefined;

    if (ok && options.dataRawDumpPath !== undefined) {
      try {
        await copyFile(
          path.join(workingDirectory, 'write-data', 'script-output', 'data-raw-dump.json'),
          options.dataRawDumpPath,
        );
      } catch (error) {
        ok = false;
        processError = new Error(`Factorio did not produce data-raw-dump.json: ${String(error)}`);
        stderr = boundedLog(`${stderr}\n${processError.message}`);
      }
    }

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
