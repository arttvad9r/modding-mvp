import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { ProjectError } from '@project/domain';
import { classifyHarnessError, extractErrorSummary, runFactorioModTest } from '../src/harness.js';

describe('extractErrorSummary', () => {
  it('prefers semantic assertion marker lines', () => {
    const summary = extractErrorSummary(
      'Error generic\n__PROJECT_SEMANTIC_ASSERTION__|furnace.steel-furnace.crafting_speed|expected=4|actual=3',
      '',
    );

    expect(summary).toContain('__PROJECT_SEMANTIC_ASSERTION__');
  });

  it('prefers explicit error lines', () => {
    const summary = extractErrorSummary(
      'Loading mod\nError ModManager.cpp:123: Failed to load mod example',
      '',
    );

    expect(summary).toContain('Error ModManager.cpp:123');
  });

  it('falls back to the last non-empty line', () => {
    expect(extractErrorSummary('first\nlast', '')).toBe('last');
  });

  it('returns null for empty logs', () => {
    expect(extractErrorSummary('', '')).toBeNull();
  });
});

describe('classifyHarnessError', () => {
  it('classifies semantic assertion failures separately', () => {
    expect(
      classifyHarnessError(
        '__PROJECT_SEMANTIC_ASSERTION__|furnace.steel-furnace.crafting_speed|expected=4|actual=3',
        '',
      ),
    ).toBe('semantic_assertion_failed');
  });

  it('classifies a Factorio lock conflict as an infrastructure failure', () => {
    expect(
      classifyHarnessError("Couldn't acquire exclusive lock on /x/.lock: Resource temporarily unavailable", ''),
    ).toBe('process_error');
  });

  it('classifies process errors separately from Factorio load errors', () => {
    expect(classifyHarnessError('', '', new Error('timeout'))).toBe('process_error');
    expect(classifyHarnessError('Error Failed to load mod', '')).toBe(
      'factorio_load_failed',
    );
  });
});


describe('harness preflight taxonomy', () => {
  it('uses process_error when the Factorio binary is unavailable', async () => {
    try {
      await runFactorioModTest({
        modPath: '/definitely/not/used',
        factorioBin: '/definitely/missing/factorio',
      });
      throw new Error('Expected runFactorioModTest to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectError);
      expect((error as ProjectError).code).toBe('process_error');
      expect((error as ProjectError).stage).toBe('process');
    }
  });
});

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function scratch(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'harness-unit-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function fakeFactorio(root: string, script: string): Promise<string> {
  const bin = path.join(root, 'factorio', 'bin', 'x64', 'factorio');
  await mkdir(path.dirname(bin), { recursive: true });
  await mkdir(path.join(root, 'factorio', 'data'), { recursive: true });
  await writeFile(bin, `#!/bin/sh\n${script}\n`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

async function candidate(root: string, info: Record<string, unknown>): Promise<string> {
  const modPath = path.join(root, 'candidate');
  await mkdir(modPath, { recursive: true });
  await writeFile(path.join(modPath, 'info.json'), JSON.stringify(info), 'utf8');
  await writeFile(path.join(modPath, 'data.lua'), '-- empty\n', 'utf8');
  return modPath;
}

async function expectRejectedCandidate(options: Parameters<typeof runFactorioModTest>[0]) {
  try {
    await runFactorioModTest(options);
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectError);
    expect((error as ProjectError).code).toBe('factorio_load_failed');
    return error as ProjectError;
  }
  throw new Error('Expected the candidate to be rejected');
}

describe('harness file isolation', () => {
  it('rejects traversal in info.json before copying anything', async () => {
    const root = await scratch();
    const marker = `escape-${path.basename(root)}`;
    const factorioBin = await fakeFactorio(root, 'exit 0');
    for (const info of [
      { name: `../../${marker}`, version: '0.1.0' },
      { name: 'ok-name', version: '../../0.1.0' },
      { name: 'ok-name', version: '1.0' },
      { name: '', version: '1.0.0' },
    ]) {
      const modPath = await candidate(root, info);
      await expectRejectedCandidate({ modPath, factorioBin });
      await rm(modPath, { recursive: true, force: true });
    }

    const siblings = await readdir(path.dirname(tmpdir()));
    const nearby = await readdir(tmpdir());
    expect([...siblings, ...nearby].some((entry) => entry.includes(marker))).toBe(false);
  });

  it('rejects symbolic links inside the candidate mod', async () => {
    const root = await scratch();
    const factorioBin = await fakeFactorio(root, 'exit 0');
    const modPath = await candidate(root, { name: 'linked-mod', version: '1.0.0' });
    await symlink('/etc/hostname', path.join(modPath, 'settings.lua'));

    const error = await expectRejectedCandidate({ modPath, factorioBin });
    expect(error.message).toContain('symbolic links');
  });

  it('gives each run its own config and write-data and disables bundled expansions', async () => {
    const root = await scratch();
    const capture = path.join(root, 'capture');
    await mkdir(capture);
    const factorioBin = await fakeFactorio(
      root,
      `cfg="$2"; mods="$4"; dir="${capture}/$$"; mkdir -p "$dir"; cp "$cfg" "$dir/config.ini"; cp "$mods/mod-list.json" "$dir/"; echo "$@" > "$dir/args"`,
    );
    const modPath = await candidate(root, { name: 'parallel-mod', version: '1.0.0' });

    const results = await Promise.all(
      Array.from({ length: 4 }, () => runFactorioModTest({ modPath, factorioBin })),
    );
    expect(results.every((result) => result.ok)).toBe(true);

    const runs = await readdir(capture);
    expect(runs).toHaveLength(4);
    const writeDirectories = new Set<string>();
    for (const run of runs) {
      const config = await readFile(path.join(capture, run, 'config.ini'), 'utf8');
      const writeData = /write-data=(.*)/.exec(config)?.[1];
      expect(writeData).toBeDefined();
      writeDirectories.add(writeData!);
      expect(config).toContain(`read-data=${path.join(root, 'factorio', 'data')}`);
      const modList = JSON.parse(await readFile(path.join(capture, run, 'mod-list.json'), 'utf8')) as {
        mods: Array<{ name: string; enabled: boolean }>;
      };
      expect(modList.mods).toEqual(expect.arrayContaining([
        { name: 'base', enabled: true },
        { name: 'space-age', enabled: false },
        { name: 'quality', enabled: false },
        { name: 'elevated-rails', enabled: false },
        { name: 'parallel-mod', enabled: true },
      ]));
    }
    expect(writeDirectories.size).toBe(4);
  });

  it('kills a hung Factorio process and reports a retryable process_error', async () => {
    const root = await scratch();
    const factorioBin = await fakeFactorio(root, 'exec sleep 30');
    const modPath = await candidate(root, { name: 'slow-mod', version: '1.0.0' });

    const startedAt = Date.now();
    const result = await runFactorioModTest({ modPath, factorioBin, timeoutMs: 200 });
    expect(Date.now() - startedAt).toBeLessThan(5_000);
    expect(result.ok).toBe(false);
    expect(result.errorType).toBe('process_error');
    expect(result.summary).toContain('timed out');
  });
});
