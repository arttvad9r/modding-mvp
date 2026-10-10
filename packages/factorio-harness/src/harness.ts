import { spawnSync } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface HarnessOptions {
  modPath: string;
  factorioBin?: string;
  timeoutMs?: number;
  keepTemp?: boolean;
}

export interface HarnessResult {
  ok: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
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

function bundledFactorioPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), '../../../.tools/factorio/bin/x64/factorio');
}

async function requireFile(filePath: string, label: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

async function readModInfo(modPath: string): Promise<ModInfo> {
  const infoPath = path.join(modPath, 'info.json');
  let parsed: unknown;

  try {
    parsed = JSON.parse(await readFile(infoPath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read valid info.json from ${modPath}: ${String(error)}`);
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
    throw new Error('info.json must contain non-empty string fields "name" and "version"');
  }

  return { name: parsed.name, version: parsed.version };
}

function boundedLog(value: string | Buffer | null | undefined): string {
  const text = value?.toString() ?? '';
  return text.length <= MAX_LOG_CHARS ? text : text.slice(-MAX_LOG_CHARS);
}

export function extractErrorSummary(stdout: string, stderr: string): string | null {
  const lines = `${stderr}\n${stdout}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const preferred = lines.find((line) => /(^|\s)(error|failed|exception)(\s|:)/i.test(line));
  if (preferred) return preferred;

  return lines.length > 0 ? lines.at(-1) ?? null : null;
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

    await writeFile(
      path.join(modsDirectory, 'mod-list.json'),
      JSON.stringify(
        {
          mods: [
            { name: 'base', enabled: true },
            { name: modInfo.name, enabled: true },
          ],
        },
        null,
        2,
      ),
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
    const summary = ok
      ? null
      : result.error?.message ?? extractErrorSummary(stdout, stderr) ?? 'Factorio validation failed';

    return {
      ok,
      exitCode: result.status,
      signal: result.signal,
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
