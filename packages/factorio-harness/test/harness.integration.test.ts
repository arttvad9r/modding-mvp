import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runFactorioModTest } from '../src/harness.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const validMod = path.join(testDir, 'fixtures/valid_mod');
const invalidMod = path.join(testDir, 'fixtures/invalid_mod');
const semanticFailureMod = path.join(testDir, 'fixtures/semantic_failure_mod');

describe('Factorio headless integration', () => {
  it('accepts a valid prototype-stage mod', async () => {
    const result = await runFactorioModTest({ modPath: validMod });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.errorType).toBeNull();
    expect(result.summary).toBeNull();
  });

  it('rejects a mod with invalid Lua as a load failure', async () => {
    const result = await runFactorioModTest({ modPath: invalidMod });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.errorType).toBe('factorio_load_failed');
    expect(result.summary).toContain('Failed to load mod');
    expect(result.summary).toContain('syntax error');
  });

  it('distinguishes a semantic assertion failure from a load error', async () => {
    const result = await runFactorioModTest({
      modPath: semanticFailureMod,
      semanticAssertionLua: `local furnace = data.raw["furnace"]["steel-furnace"]
local actual = furnace and furnace.crafting_speed or nil
if actual ~= 4 then
  error("__PROJECT_SEMANTIC_ASSERTION__|furnace.steel-furnace.crafting_speed|expected=4|actual=" .. tostring(actual), 0)
end
`,
    });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.errorType).toBe('semantic_assertion_failed');
    expect(result.summary).toContain('__PROJECT_SEMANTIC_ASSERTION__');
    expect(result.summary).toContain('expected=4');
    expect(result.summary).toContain('actual=3');
  });

  it('runs concurrent validations without sharing Factorio lock or write-data', async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, () => runFactorioModTest({ modPath: validMod })),
    );

    expect(results.map((result) => result.errorType)).toEqual([null, null, null, null]);
    expect(results.every((result) => result.ok)).toBe(true);
  }, 120_000);

  it('validates against the base game only, with bundled expansions disabled', async () => {
    const result = await runFactorioModTest({
      modPath: validMod,
      semanticAssertionLua: `if mods["space-age"] or mods["quality"] or mods["elevated-rails"] then
  error("__PROJECT_SEMANTIC_ASSERTION__|environment|expected=base-only|actual=expansion-enabled", 0)
end
`,
    });

    expect(result.ok).toBe(true);
  });
});
