import { describe, expect, it } from 'vitest';
import { extractErrorSummary } from '../src/harness.js';

describe('extractErrorSummary', () => {
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
