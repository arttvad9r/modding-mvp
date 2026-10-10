import { describe, expect, it } from 'vitest';
import { classifyHarnessError, extractErrorSummary } from '../src/harness.js';

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

  it('classifies process errors separately from Factorio load errors', () => {
    expect(classifyHarnessError('', '', new Error('timeout'))).toBe('process_error');
    expect(classifyHarnessError('Error Failed to load mod', '')).toBe(
      'factorio_load_failed',
    );
  });
});
