/**
 * Unit tests for the date-range filter (Issue #85).
 *
 * Covers all spec-mandated cases:
 *   AC2 – entries within range are included.
 *   AC3 – entries outside range are excluded.
 *   AC4 – entry exactly equal to start timestamp is included (boundary inclusive).
 *   AC5 – entry exactly equal to end timestamp is included (boundary inclusive).
 *   AC6 – clearing both inputs (null/undefined) restores the full unfiltered log.
 *   AC7 – applying a range with no matching entries returns an empty result.
 *
 * Spec ref: spec § "Event log filtering — Date-range filter" (test coverage)
 */

import { describe, expect, it } from 'vitest';
import { filterByDateRange } from '../src/dateRangeFilter';

// ── Shared fixture ────────────────────────────────────────────────────────────
// Six entries spread across a 5-hour window in UTC.
// Timestamps chosen so boundary tests are unambiguous.
const ENTRIES = [
  { id: 1, eventType: 'payment.created', timestamp: '2024-03-01T08:00:00.000Z' }, // before range
  { id: 2, eventType: 'payment.created', timestamp: '2024-03-01T09:00:00.000Z' }, // === start (boundary)
  { id: 3, eventType: 'refund.issued',   timestamp: '2024-03-01T10:00:00.000Z' }, // inside range
  { id: 4, eventType: 'refund.issued',   timestamp: '2024-03-01T11:00:00.000Z' }, // inside range
  { id: 5, eventType: 'dispute.opened',  timestamp: '2024-03-01T12:00:00.000Z' }, // === end (boundary)
  { id: 6, eventType: 'dispute.opened',  timestamp: '2024-03-01T13:00:00.000Z' }, // after range
];

const RANGE_START = '2024-03-01T09:00:00.000Z';
const RANGE_END   = '2024-03-01T12:00:00.000Z';

// ── AC2: Entries within range are included ────────────────────────────────────
describe('filterByDateRange – entries within range (AC2)', () => {
  it('returns entries whose timestamp falls strictly inside the range', () => {
    const result = filterByDateRange(ENTRIES, RANGE_START, RANGE_END);
    // ids 2, 3, 4, 5 are within [start, end]
    const ids = result.map((e) => e.id);
    expect(ids).toContain(3);
    expect(ids).toContain(4);
  });

  it('does not return entries whose timestamp falls strictly outside the range', () => {
    const result = filterByDateRange(ENTRIES, RANGE_START, RANGE_END);
    const ids = result.map((e) => e.id);
    expect(ids).not.toContain(1); // before start
    expect(ids).not.toContain(6); // after end
  });

  it('returns the correct total count of in-range entries', () => {
    const result = filterByDateRange(ENTRIES, RANGE_START, RANGE_END);
    // ids 2 (start boundary), 3, 4, 5 (end boundary) → 4 entries
    expect(result).toHaveLength(4);
  });
});

// ── AC3: Entries outside range are excluded ───────────────────────────────────
describe('filterByDateRange – entries outside range excluded (AC3)', () => {
  it('excludes the entry before the start', () => {
    const result = filterByDateRange(ENTRIES, RANGE_START, RANGE_END);
    expect(result.find((e) => e.id === 1)).toBeUndefined();
  });

  it('excludes the entry after the end', () => {
    const result = filterByDateRange(ENTRIES, RANGE_START, RANGE_END);
    expect(result.find((e) => e.id === 6)).toBeUndefined();
  });

  it('excludes all entries when range is a single instant with no matches', () => {
    // A timestamp that does not appear in the fixture.
    const instant = '2024-03-01T09:30:00.000Z';
    const result = filterByDateRange(ENTRIES, instant, instant);
    expect(result).toHaveLength(0);
  });
});

// ── AC4: Start-boundary entry is included ─────────────────────────────────────
describe('filterByDateRange – start boundary inclusive (AC4)', () => {
  it('includes an entry whose timestamp exactly equals the start', () => {
    const result = filterByDateRange(ENTRIES, RANGE_START, RANGE_END);
    const startEntry = result.find((e) => e.timestamp === RANGE_START);
    expect(startEntry).toBeDefined();
    expect(startEntry?.id).toBe(2);
  });

  it('includes the start-boundary entry when only start is set (no end)', () => {
    const result = filterByDateRange(ENTRIES, RANGE_START, null);
    const startEntry = result.find((e) => e.timestamp === RANGE_START);
    expect(startEntry).toBeDefined();
  });
});

// ── AC5: End-boundary entry is included ──────────────────────────────────────
describe('filterByDateRange – end boundary inclusive (AC5)', () => {
  it('includes an entry whose timestamp exactly equals the end', () => {
    const result = filterByDateRange(ENTRIES, RANGE_START, RANGE_END);
    const endEntry = result.find((e) => e.timestamp === RANGE_END);
    expect(endEntry).toBeDefined();
    expect(endEntry?.id).toBe(5);
  });

  it('includes the end-boundary entry when only end is set (no start)', () => {
    const result = filterByDateRange(ENTRIES, null, RANGE_END);
    const endEntry = result.find((e) => e.timestamp === RANGE_END);
    expect(endEntry).toBeDefined();
  });
});

// ── AC6: Clearing both inputs restores the full unfiltered log ────────────────
describe('filterByDateRange – clearing filter restores full log (AC6)', () => {
  it('returns all entries when both start and end are null', () => {
    const result = filterByDateRange(ENTRIES, null, null);
    expect(result).toHaveLength(ENTRIES.length);
  });

  it('returns all entries when both start and end are undefined', () => {
    const result = filterByDateRange(ENTRIES, undefined, undefined);
    expect(result).toHaveLength(ENTRIES.length);
  });

  it('returns all entries when start is null and end is undefined', () => {
    const result = filterByDateRange(ENTRIES, null, undefined);
    expect(result).toHaveLength(ENTRIES.length);
  });

  it('returns all entries when start is undefined and end is null', () => {
    const result = filterByDateRange(ENTRIES, undefined, null);
    expect(result).toHaveLength(ENTRIES.length);
  });

  it('returns the same entries (by id) as the original fixture when cleared', () => {
    const result = filterByDateRange(ENTRIES, null, null);
    const resultIds = result.map((e) => e.id).sort();
    const fixtureIds = ENTRIES.map((e) => e.id).sort();
    expect(resultIds).toEqual(fixtureIds);
  });
});

// ── AC7: Range with no matching entries returns empty result ──────────────────
describe('filterByDateRange – no matching entries returns empty (AC7)', () => {
  it('returns an empty array when the range is entirely before all entries', () => {
    const result = filterByDateRange(
      ENTRIES,
      '2024-01-01T00:00:00.000Z',
      '2024-01-01T23:59:59.999Z',
    );
    expect(result).toHaveLength(0);
  });

  it('returns an empty array when the range is entirely after all entries', () => {
    const result = filterByDateRange(
      ENTRIES,
      '2024-12-31T00:00:00.000Z',
      '2024-12-31T23:59:59.999Z',
    );
    expect(result).toHaveLength(0);
  });

  it('does not throw when the range has no matching entries', () => {
    expect(() =>
      filterByDateRange(ENTRIES, '2099-01-01T00:00:00.000Z', '2099-01-01T01:00:00.000Z'),
    ).not.toThrow();
  });

  it('returns an empty array when the entry list is empty', () => {
    const result = filterByDateRange([], RANGE_START, RANGE_END);
    expect(result).toHaveLength(0);
  });
});

// ── Additional edge cases ─────────────────────────────────────────────────────
describe('filterByDateRange – edge cases', () => {
  it('works correctly with only a start bound (no end)', () => {
    // All entries at or after RANGE_START (ids 2–6)
    const result = filterByDateRange(ENTRIES, RANGE_START, null);
    expect(result).toHaveLength(5);
    expect(result.find((e) => e.id === 1)).toBeUndefined();
  });

  it('works correctly with only an end bound (no start)', () => {
    // All entries at or before RANGE_END (ids 1–5)
    const result = filterByDateRange(ENTRIES, null, RANGE_END);
    expect(result).toHaveLength(5);
    expect(result.find((e) => e.id === 6)).toBeUndefined();
  });

  it('preserves extra fields on returned entries (generic type parameter)', () => {
    const rich = [
      { timestamp: '2024-03-01T10:00:00.000Z', amount: 100, currency: 'USD' },
      { timestamp: '2024-03-01T14:00:00.000Z', amount: 50,  currency: 'AUD' },
    ];
    const result = filterByDateRange(rich, RANGE_START, RANGE_END);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(100);
    expect(result[0].currency).toBe('USD');
  });

  it('handles a range where start equals end (single-instant range)', () => {
    // Only the entry with exactly that timestamp should be returned.
    const instant = '2024-03-01T10:00:00.000Z';
    const result = filterByDateRange(ENTRIES, instant, instant);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
  });
});
