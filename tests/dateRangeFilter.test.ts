/**
 * Unit tests for the date-range filter (Issue #82).
 *
 * Covers all acceptance criteria:
 *   AC1  – start bound hides entries strictly before start.
 *   AC2  – end bound hides entries strictly after end.
 *   AC3  – entry at exactly the start timestamp is visible (boundary-inclusive).
 *   AC4  – entry at exactly the end timestamp is visible (boundary-inclusive).
 *   AC5  – entry 1 ms before start is hidden.
 *   AC6  – entry 1 ms after end is hidden.
 *   AC7  – clearing both inputs restores all entries.
 *   AC8  – filter works with only a start bound (no end).
 *   AC8  – filter works with only an end bound (no start).
 *   AC9  – date-range filter composes correctly with event-type and status filters.
 *   AC10 – unit test: range applied — only in-range entries are rendered.
 *   AC11 – unit test: range cleared — all entries are rendered.
 *   AC12 – unit test: boundary entry at exactly start is included.
 *   AC13 – unit test: boundary entry at exactly end is included.
 *   AC14 – unit test: entry 1 ms before start excluded; 1 ms after end excluded.
 *
 * Spec ref: spec § "Event log filtering — Date-range filter"
 */

import { describe, it, expect } from 'vitest';
import {
  filterByDateRange,
  isDateRangeFilterActive,
  clearDateRangeFilter,
  composeFilters,
  DateRange,
} from '../src/dateRangeFilter';

// ── Fixture helpers ───────────────────────────────────────────────────────────

/** Build a minimal log entry with the given ISO timestamp. */
function entry(id: number, timestamp: string, eventType = 'payment.created', status = 'delivered') {
  return { id, timestamp, eventType, status };
}

/** Epoch ms for a known anchor point used across tests. */
const ANCHOR_MS = Date.parse('2024-06-15T12:00:00.000Z');
const ANCHOR = new Date(ANCHOR_MS).toISOString();
const BEFORE_1MS = new Date(ANCHOR_MS - 1).toISOString();
const AFTER_1MS = new Date(ANCHOR_MS + 1).toISOString();

const START_MS = Date.parse('2024-06-01T00:00:00.000Z');
const END_MS = Date.parse('2024-06-30T23:59:59.999Z');
const START = new Date(START_MS).toISOString();
const END = new Date(END_MS).toISOString();

// Entries used in the main fixture
const ENTRIES = [
  entry(1, new Date(START_MS - 1).toISOString()),          // 1 ms before start → out
  entry(2, START),                                          // exactly start → in
  entry(3, '2024-06-15T12:00:00.000Z'),                    // mid-range → in
  entry(4, END),                                            // exactly end → in
  entry(5, new Date(END_MS + 1).toISOString()),             // 1 ms after end → out
];

// ── isDateRangeFilterActive ───────────────────────────────────────────────────

describe('isDateRangeFilterActive', () => {
  it('returns false for an empty object', () => {
    expect(isDateRangeFilterActive({})).toBe(false);
  });

  it('returns false when both start and end are undefined', () => {
    expect(isDateRangeFilterActive({ start: undefined, end: undefined })).toBe(false);
  });

  it('returns false when both start and end are empty strings', () => {
    expect(isDateRangeFilterActive({ start: '', end: '' })).toBe(false);
  });

  it('returns true when only start is set', () => {
    expect(isDateRangeFilterActive({ start: START })).toBe(true);
  });

  it('returns true when only end is set', () => {
    expect(isDateRangeFilterActive({ end: END })).toBe(true);
  });

  it('returns true when both start and end are set', () => {
    expect(isDateRangeFilterActive({ start: START, end: END })).toBe(true);
  });
});

// ── clearDateRangeFilter ──────────────────────────────────────────────────────

describe('clearDateRangeFilter', () => {
  it('returns an object with no bounds set', () => {
    const cleared = clearDateRangeFilter();
    expect(isDateRangeFilterActive(cleared)).toBe(false);
  });

  it('returns a fresh object each call (no shared reference)', () => {
    const a = clearDateRangeFilter();
    const b = clearDateRangeFilter();
    expect(a).not.toBe(b);
  });
});

// ── filterByDateRange — no filter active ─────────────────────────────────────

describe('filterByDateRange – no filter active', () => {
  it('returns all entries when range is empty object', () => {
    const result = filterByDateRange(ENTRIES, {});
    expect(result).toHaveLength(ENTRIES.length);
  });

  it('returns all entries when both bounds are empty strings', () => {
    const result = filterByDateRange(ENTRIES, { start: '', end: '' });
    expect(result).toHaveLength(ENTRIES.length);
  });

  it('returns all entries for an empty input list', () => {
    expect(filterByDateRange([], {})).toHaveLength(0);
  });
});

// ── AC10: Range applied — only in-range entries are visible ──────────────────

describe('AC10 – range applied: only in-range entries are visible', () => {
  it('hides entries outside the selected range', () => {
    const result = filterByDateRange(ENTRIES, { start: START, end: END });
    // entries 2, 3, 4 are in range; 1 and 5 are out
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.id)).toEqual([2, 3, 4]);
  });

  it('returns an empty array when no entries fall within the range', () => {
    const future = '2099-01-01T00:00:00.000Z';
    const result = filterByDateRange(ENTRIES, { start: future, end: future });
    expect(result).toHaveLength(0);
  });
});

// ── AC11: Range cleared — all entries are restored ───────────────────────────

describe('AC11 – range cleared: all entries are restored', () => {
  it('restores all entries after clearing both inputs', () => {
    // Apply a filter first
    const filtered = filterByDateRange(ENTRIES, { start: START, end: END });
    expect(filtered).toHaveLength(3);

    // Clear the filter
    const restored = filterByDateRange(ENTRIES, clearDateRangeFilter());
    expect(restored).toHaveLength(ENTRIES.length);
  });

  it('restores all entries when start is cleared (only end was set)', () => {
    const withEnd = filterByDateRange(ENTRIES, { end: END });
    const cleared = filterByDateRange(ENTRIES, {});
    expect(cleared).toHaveLength(ENTRIES.length);
    // Sanity: the end-only filter did restrict results
    expect(withEnd.length).toBeLessThan(ENTRIES.length);
  });
});

// ── AC12: Boundary entry at exactly start is included ────────────────────────

describe('AC12 – boundary entry at exactly start is included', () => {
  it('includes an entry whose timestamp equals the start bound', () => {
    const result = filterByDateRange(ENTRIES, { start: START, end: END });
    const startEntry = result.find((e) => e.id === 2);
    expect(startEntry).toBeDefined();
  });

  it('includes an entry when its timestamp exactly equals start (no end bound)', () => {
    const result = filterByDateRange([entry(1, START)], { start: START });
    expect(result).toHaveLength(1);
  });

  it('includes an entry when start and end are the same timestamp (single-point range)', () => {
    const result = filterByDateRange([entry(1, ANCHOR)], { start: ANCHOR, end: ANCHOR });
    expect(result).toHaveLength(1);
  });
});

// ── AC13: Boundary entry at exactly end is included ──────────────────────────

describe('AC13 – boundary entry at exactly end is included', () => {
  it('includes an entry whose timestamp equals the end bound', () => {
    const result = filterByDateRange(ENTRIES, { start: START, end: END });
    const endEntry = result.find((e) => e.id === 4);
    expect(endEntry).toBeDefined();
  });

  it('includes an entry when its timestamp exactly equals end (no start bound)', () => {
    const result = filterByDateRange([entry(1, END)], { end: END });
    expect(result).toHaveLength(1);
  });
});

// ── AC14: Entry 1 ms before start excluded; 1 ms after end excluded ──────────

describe('AC14 – 1 ms outside either boundary is excluded', () => {
  it('excludes an entry 1 ms before the start bound', () => {
    const result = filterByDateRange(ENTRIES, { start: START, end: END });
    const tooEarly = result.find((e) => e.id === 1);
    expect(tooEarly).toBeUndefined();
  });

  it('excludes an entry 1 ms after the end bound', () => {
    const result = filterByDateRange(ENTRIES, { start: START, end: END });
    const tooLate = result.find((e) => e.id === 5);
    expect(tooLate).toBeUndefined();
  });

  it('excludes an entry 1 ms before start when only start is set', () => {
    const result = filterByDateRange([entry(1, BEFORE_1MS)], { start: ANCHOR });
    expect(result).toHaveLength(0);
  });

  it('excludes an entry 1 ms after end when only end is set', () => {
    const result = filterByDateRange([entry(1, AFTER_1MS)], { end: ANCHOR });
    expect(result).toHaveLength(0);
  });

  it('includes an entry exactly at the anchor when start = anchor', () => {
    const result = filterByDateRange([entry(1, ANCHOR)], { start: ANCHOR });
    expect(result).toHaveLength(1);
  });

  it('includes an entry exactly at the anchor when end = anchor', () => {
    const result = filterByDateRange([entry(1, ANCHOR)], { end: ANCHOR });
    expect(result).toHaveLength(1);
  });
});

// ── AC1: Start bound hides entries strictly before start ─────────────────────

describe('AC1 – start bound hides entries strictly before start', () => {
  it('hides entries whose timestamp is strictly before start', () => {
    const result = filterByDateRange(ENTRIES, { start: START });
    // entry 1 is 1 ms before start → excluded
    expect(result.find((e) => e.id === 1)).toBeUndefined();
  });

  it('keeps entries at or after start', () => {
    const result = filterByDateRange(ENTRIES, { start: START });
    expect(result.map((e) => e.id)).toContain(2); // exactly start
    expect(result.map((e) => e.id)).toContain(3); // mid-range
    expect(result.map((e) => e.id)).toContain(4); // exactly end
    expect(result.map((e) => e.id)).toContain(5); // after end (no upper bound)
  });
});

// ── AC2: End bound hides entries strictly after end ──────────────────────────

describe('AC2 – end bound hides entries strictly after end', () => {
  it('hides entries whose timestamp is strictly after end', () => {
    const result = filterByDateRange(ENTRIES, { end: END });
    // entry 5 is 1 ms after end → excluded
    expect(result.find((e) => e.id === 5)).toBeUndefined();
  });

  it('keeps entries at or before end', () => {
    const result = filterByDateRange(ENTRIES, { end: END });
    expect(result.map((e) => e.id)).toContain(1); // before start (no lower bound)
    expect(result.map((e) => e.id)).toContain(2); // exactly start
    expect(result.map((e) => e.id)).toContain(3); // mid-range
    expect(result.map((e) => e.id)).toContain(4); // exactly end
  });
});

// ── AC8: Only start set (no end) ─────────────────────────────────────────────

describe('AC8 – only start set (no end bound)', () => {
  it('applies a lower bound with no upper bound', () => {
    const result = filterByDateRange(ENTRIES, { start: START });
    // entries 2, 3, 4, 5 are at or after start; entry 1 is before
    expect(result).toHaveLength(4);
    expect(result.map((e) => e.id)).toEqual([2, 3, 4, 5]);
  });

  it('includes entries far in the future when no end is set', () => {
    const future = entry(99, '2099-12-31T23:59:59.999Z');
    const result = filterByDateRange([...ENTRIES, future], { start: START });
    expect(result.find((e) => e.id === 99)).toBeDefined();
  });
});

// ── AC8: Only end set (no start) ─────────────────────────────────────────────

describe('AC8 – only end set (no start bound)', () => {
  it('applies an upper bound with no lower bound', () => {
    const result = filterByDateRange(ENTRIES, { end: END });
    // entries 1, 2, 3, 4 are at or before end; entry 5 is after
    expect(result).toHaveLength(4);
    expect(result.map((e) => e.id)).toEqual([1, 2, 3, 4]);
  });

  it('includes entries far in the past when no start is set', () => {
    const ancient = entry(0, '1970-01-01T00:00:00.000Z');
    const result = filterByDateRange([ancient, ...ENTRIES], { end: END });
    expect(result.find((e) => e.id === 0)).toBeDefined();
  });
});

// ── AC9: Filter composition ───────────────────────────────────────────────────

describe('AC9 – date-range filter composes with event-type and status filters', () => {
  const compositeEntries = [
    { id: 1, timestamp: '2024-06-10T00:00:00.000Z', eventType: 'payment.created', status: 'delivered' },
    { id: 2, timestamp: '2024-06-10T00:00:00.000Z', eventType: 'refund.issued',   status: 'failed'    },
    { id: 3, timestamp: '2024-06-20T00:00:00.000Z', eventType: 'payment.created', status: 'failed'    },
    { id: 4, timestamp: '2024-06-20T00:00:00.000Z', eventType: 'refund.issued',   status: 'delivered' },
    { id: 5, timestamp: '2024-07-01T00:00:00.000Z', eventType: 'payment.created', status: 'delivered' },
  ];

  it('date-range + event-type: only entries matching both are returned', () => {
    const result = composeFilters(
      compositeEntries,
      { start: '2024-06-01T00:00:00.000Z', end: '2024-06-30T23:59:59.999Z' },
      ['payment.created'],
      ''
    );
    // entries 1 and 3 are payment.created within June
    expect(result.map((e) => e.id)).toEqual([1, 3]);
  });

  it('date-range + status: only entries matching both are returned', () => {
    const result = composeFilters(
      compositeEntries,
      { start: '2024-06-01T00:00:00.000Z', end: '2024-06-30T23:59:59.999Z' },
      [],
      'delivered'
    );
    // entries 1 and 4 are delivered within June
    expect(result.map((e) => e.id)).toEqual([1, 4]);
  });

  it('date-range + event-type + status: all three dimensions applied simultaneously', () => {
    const result = composeFilters(
      compositeEntries,
      { start: '2024-06-01T00:00:00.000Z', end: '2024-06-30T23:59:59.999Z' },
      ['payment.created'],
      'delivered'
    );
    // only entry 1 is payment.created + delivered + within June
    expect(result.map((e) => e.id)).toEqual([1]);
  });

  it('clearing date-range does not affect event-type filter', () => {
    const withDateRange = composeFilters(
      compositeEntries,
      { start: '2024-06-01T00:00:00.000Z', end: '2024-06-30T23:59:59.999Z' },
      ['payment.created'],
      ''
    );
    const dateRangeCleared = composeFilters(
      compositeEntries,
      clearDateRangeFilter(),
      ['payment.created'],
      ''
    );
    // Clearing date-range should expose entry 5 (July) while keeping event-type filter
    expect(withDateRange.map((e) => e.id)).toEqual([1, 3]);
    expect(dateRangeCleared.map((e) => e.id)).toEqual([1, 3, 5]);
  });

  it('clearing event-type does not affect date-range filter', () => {
    const withEventType = composeFilters(
      compositeEntries,
      { start: '2024-06-01T00:00:00.000Z', end: '2024-06-30T23:59:59.999Z' },
      ['payment.created'],
      ''
    );
    const eventTypeCleared = composeFilters(
      compositeEntries,
      { start: '2024-06-01T00:00:00.000Z', end: '2024-06-30T23:59:59.999Z' },
      [],
      ''
    );
    // Clearing event-type should expose refund entries within June
    expect(withEventType.map((e) => e.id)).toEqual([1, 3]);
    expect(eventTypeCleared.map((e) => e.id)).toEqual([1, 2, 3, 4]);
  });

  it('no filter active: all entries returned', () => {
    const result = composeFilters(compositeEntries, {}, [], '');
    expect(result).toHaveLength(compositeEntries.length);
  });

  it('new entries added while filter is active are also filtered', () => {
    const range: DateRange = { start: '2024-06-01T00:00:00.000Z', end: '2024-06-30T23:59:59.999Z' };
    const newEntry = { id: 6, timestamp: '2024-07-15T00:00:00.000Z', eventType: 'payment.created', status: 'delivered' };
    const extended = [...compositeEntries, newEntry];
    const result = filterByDateRange(extended, range);
    // newEntry is in July → excluded
    expect(result.find((e) => e.id === 6)).toBeUndefined();
    // June entries still present
    expect(result.map((e) => e.id)).toEqual([1, 2, 3, 4]);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('returns empty array for empty input regardless of range', () => {
    expect(filterByDateRange([], { start: START, end: END })).toHaveLength(0);
  });

  it('does not mutate the input array', () => {
    const input = [...ENTRIES];
    const before = JSON.stringify(input);
    filterByDateRange(input, { start: START, end: END });
    expect(JSON.stringify(input)).toBe(before);
  });

  it('handles sub-second (millisecond) precision correctly', () => {
    const ms0 = '2024-06-15T12:00:00.000Z';
    const ms1 = '2024-06-15T12:00:00.001Z';
    const ms2 = '2024-06-15T12:00:00.002Z';
    const entries = [entry(1, ms0), entry(2, ms1), entry(3, ms2)];
    const result = filterByDateRange(entries, { start: ms1, end: ms1 });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it('excludes entries with unparseable timestamps', () => {
    const bad = { id: 99, timestamp: 'not-a-date', eventType: 'payment.created', status: 'delivered' };
    const result = filterByDateRange([...ENTRIES, bad], { start: START, end: END });
    expect(result.find((e) => e.id === 99)).toBeUndefined();
  });
});
