import { describe, it, expect } from 'vitest';
import { parseMoneyToCents, centsToRm, legacyTimestampToIso } from '../lib/money.mjs';

describe('parseMoneyToCents', () => {
  it.each([
    ['18', 1800],
    ['0', 0],
    ['-0', 0],
    ['19.3', 1930],
    ['-33.6', -3360],
    ['5.60', 560],
    ['-10', -1000],
    ['', 0],
    [null, 0],
    [undefined, 0],
    [10, 1000],
    ['-0.5', -50],
  ])('parses %j -> %i', (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
  });

  it('rejects non-numeric values', () => {
    expect(() => parseMoneyToCents('abc')).toThrow(/Unparseable money value/);
  });

  it('rejects sub-sen precision (would lose money)', () => {
    expect(() => parseMoneyToCents('1.234')).toThrow(/sub-sen precision/);
  });
});

describe('centsToRm', () => {
  it.each([
    [1930, 'RM 19.30'],
    [0, 'RM 0.00'],
    [-3360, '-RM 33.60'],
    [5, 'RM 0.05'],
  ])('formats %i -> %s', (cents, expected) => {
    expect(centsToRm(cents)).toBe(expected);
  });
});

describe('legacyTimestampToIso', () => {
  it('treats legacy wall-clock time as Malaysia (+08:00)', () => {
    // 2026-03-01 16:50 MYT == 2026-03-01 08:50 UTC
    expect(legacyTimestampToIso('2026-03-01', '16:50')).toBe(
      '2026-03-01T08:50:00.000Z'
    );
  });

  it('accepts missing time as midnight', () => {
    expect(legacyTimestampToIso('2026-03-01', '')).toBe(
      '2026-02-28T16:00:00.000Z'
    );
  });

  it('returns null for missing date', () => {
    expect(legacyTimestampToIso('', '16:50')).toBeNull();
  });

  it('rejects garbage dates', () => {
    expect(() => legacyTimestampToIso('not-a-date', '16:50')).toThrow(
      /Unparseable legacy timestamp/
    );
  });
});
