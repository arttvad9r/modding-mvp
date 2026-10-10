import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runFactorioModTest } from '../src/harness.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const validMod = path.join(testDir, 'fixtures/valid_mod');
const invalidMod = path.join(testDir, 'fixtures/invalid_mod');

describe('Factorio headless integration', () => {
  it('accepts a valid prototype-stage mod', async () => {
    const result = await runFactorioModTest({ modPath: validMod });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.summary).toBeNull();
  });

  it('rejects a mod with invalid Lua', async () => {
    const result = await runFactorioModTest({ modPath: invalidMod });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.summary).toContain('Failed to load mod');
    expect(result.summary).toContain('syntax error');
  });
});
