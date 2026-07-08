/**
 * Unit tests for Issue #242: Date-range filter boundary and clear behaviour.
 *
 * Spec ref: spec § "Event log filtering — Date-range filter"
 *
 * These tests explicitly target the acceptance criteria from Issue #242:
 *   AC1 – range applied: entries outside the start–end window are excluded
 *   AC2 – range cleared: all entries are visible after clearing both inputs
 *   AC3 – boundary inclusion: entry with timestamp == start is included
 *   AC4 – boundary inclusion: entry with timestamp == end is included
 *   AC5 – boundary exclusion: entry with timestamp strictly before start is excluded
 *   AC6 – boundary exclusion: entry with timestamp strictly after end is excluded
 *
 * The filter logic lives in src/dateRangeFilter.ts (introduced in #235).
 * All tests are pure unit tests against the exported functions — no DOM
 * environment or render harness is required for these cases.
 */

import { describe, it, expect } from 'vitest';
import {
  filterByDateRange,
  clearDateRangeFilter,
  type DateRange,
} from '../src/dateRangeFilter';

// ── Fixture helpers ───────────────────────────────────────────────────────────

/** Build a minimal log entry with the given ISO timestamp. */
function entry(id: number, timestamp: string) {
  return { id, timestamp };
}

/**
 * Representative fixture dataset.
 * All timestamps are UTC ISO-8601 strings to avoid timezone ambiguity.
 *
 *   id 1 – 2024-06-01T08:00:00.000Z  (well before the test window)
 *   id 2 – 2024-06-10T00:00:00.000Z  (start boundary)
 *   id 3 – 2024-06-15T12:30:00.000Z  (inside the window)
 *   id 4 – 2024-06-20T23:59:59.000Z  (end boundary)
 *   id 5 – 2024-06-25T06:00:00.000Z  (well after the test window)
 */
const FIXTURE = [
  entry(1, '2024-06-01T08:00:00.000Z'),
  entry(2, '2024-06-10T00:00:00.000Z'),
  entry(3, '2024-06-15T12:30:00.000Z'),
  entry(4, '2024-06-20T23:59:59.000Z'),
  entry(5, '2024-06-25T06:00:00.000Z'),
];

// Convenience constants for the test window boundaries.
const START = '2024-06-10T00:00:00.000Z'; // id 2 timestamp
const END   = '2024-06-20T23:59:59.000Z'; // id 4 timestamp

// ── AC1: range applied — entries outside the window are excluded ──────────────

describe('Issue #242 AC1 – range applied: entries outside start–end window are excluded', () => {
  it('excludes entries whose timestamp is before the start of the range', () => {
    const range: DateRange = { start: START, end: END };
    const result = filterByDateRange(FIXTURE, range);
    // id 1 is before START — must not appear.
    expect(result.some((e) => e.id === 1)).toBe(false);
  });

  it('excludes entries whose timestamp is after the end of the range', () => {
    const range: DateRange = { start: START, end: END };
    const result = filterByDateRange(FIXTURE, range);
    // id 5 is after END — must not appear.
    expect(result.some((e) => e.id === 5)).toBe(false);
  });

  it('includes entries whose timestamp falls strictly inside the range', () => {
    const range: DateRange = { start: START, end: END };
    const result = filterByDateRange(FIXTURE, range);
    // id 3 is inside the window.
    expect(result.some((e) => e.id === 3)).toBe(true);
  });

  it('returns only the entries within the window (ids 2, 3, 4)', () => {
    const range: DateRange = { start: START, end: END };
    const result = filterByDateRange(FIXTURE, range);
    expect(result.map((e) => e.id)).toEqual([2, 3, 4]);
  });

  it('returns an empty array when no entries fall within the range', () => {
    const range: DateRange = {
      start: '2030-01-01T00:00:00.000Z',
      end:   '2030-12-31T23:59:59.999Z',
    };
    expect(filterByDateRange(FIXTURE, range)).toHaveLength(0);
  });

  it('works with only a start bound (open-ended upper bound)', () => {
    const range: DateRange = { start: '2024-06-20T23:59:59.000Z' };
    const result = filterByDateRange(FIXTURE, range);
    // ids 4 and 5 are on or after the start.
    expect(result.map((e) => e.id)).toEqual([4, 5]);
  });

  it('works with only an end bound (open-ended lower bound)', () => {
    const range: DateRange = { end: '2024-06-10T00:00:00.000Z' };
    const result = filterByDateRange(FIXTURE, range);
    // ids 1 and 2 are on or before the end.
    expect(result.map((e) => e.id)).toEqual([1, 2]);
  });
});

// ── AC2: range cleared — all entries are visible ──────────────────────────────

describe('Issue #242 AC2 – range cleared: all entries are visible after clearing', () => {
  it('returns all entries when the range is cleared after being active', () => {
    // First apply a filter that narrows the result.
    const active: DateRange = { start: START, end: END };
    const filtered = filterByDateRange(FIXTURE, active);
    expect(filtered).toHaveLength(3); // sanity check

    // Now clear the filter and re-apply.
    const cleared = clearDateRangeFilter();
    const restored = filterByDateRange(FIXTURE, cleared);
    expect(restored).toHaveLength(FIXTURE.length);
  });

  it('cleared range returns the same array reference (no unnecessary copy)', () => {
    const cleared = clearDateRangeFilter();
    const result = filterByDateRange(FIXTURE, cleared);
    expect(result).toBe(FIXTURE);
  });

  it('cleared range with an empty entries list returns an empty array', () => {
    const cleared = clearDateRangeFilter();
    expect(filterByDateRange([], cleared)).toHaveLength(0);
  });

  it('cleared range with a single-entry list returns that entry', () => {
    const single = [entry(99, '2024-06-15T00:00:00.000Z')];
    const cleared = clearDateRangeFilter();
    const result = filterByDateRange(single, cleared);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(99);
  });

  it('clearing via { start: "", end: "" } also restores all entries', () => {
    const result = filterByDateRange(FIXTURE, { start: '', end: '' });
    expect(result).toHaveLength(FIXTURE.length);
  });
});

// ── AC3: boundary inclusion — timestamp exactly equals start ──────────────────

describe('Issue #242 AC3 – boundary inclusion: entry with timestamp == start is included', () => {
  it('entry whose timestamp exactly equals start is present in the result', () => {
    const range: DateRange = { start: START, end: END };
    const result = filterByDateRange(FIXTURE, range);
    expect(result.some((e) => e.id === 2)).toBe(true);
  });

  it('single-entry list where the entry timestamp equals start is returned', () => {
    const entries = [entry(1, START)];
    const range: DateRange = { start: START, end: END };
    const result = filterByDateRange(entries, range);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it('start-only range includes an entry whose timestamp equals start', () => {
    const entries = [entry(1, START)];
    const range: DateRange = { start: START };
    const result = filterByDateRange(entries, range);
    expect(result).toHaveLength(1);
  });

  it('degenerate range (start === end) includes the entry at that exact timestamp', () => {
    const ts = '2024-06-15T12:30:00.000Z'; // id 3 in FIXTURE
    const range: DateRange = { start: ts, end: ts };
    const result = filterByDateRange(FIXTURE, range);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
  });
});

// ── AC4: boundary inclusion — timestamp exactly equals end ────────────────────

describe('Issue #242 AC4 – boundary inclusion: entry with timestamp == end is included', () => {
  it('entry whose timestamp exactly equals end is present in the result', () => {
    const range: DateRange = { start: START, end: END };
    const result = filterByDateRange(FIXTURE, range);
    expect(result.some((e) => e.id === 4)).toBe(true);
  });

  it('single-entry list where the entry timestamp equals end is returned', () => {
    const entries = [entry(1, END)];
    const range: DateRange = { start: START, end: END };
    const result = filterByDateRange(entries, range);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it('end-only range includes an entry whose timestamp equals end', () => {
    const entries = [entry(1, END)];
    const range: DateRange = { end: END };
    const result = filterByDateRange(entries, range);
    expect(result).toHaveLength(1);
  });

  it('both boundary entries (start and end) are included simultaneously', () => {
    const range: DateRange = { start: START, end: END };
    const result = filterByDateRange(FIXTURE, range);
    const ids = result.map((e) => e.id);
    expect(ids).toContain(2); // start boundary
    expect(ids).toContain(4); // end boundary
  });
});

// ── AC5: boundary exclusion — timestamp strictly before start ─────────────────

describe('Issue #242 AC5 – boundary exclusion: entry strictly before start is excluded', () => {
  const START_MS = new Date(START).getTime();
  const ONE_MS_BEFORE_START = new Date(START_MS - 1).toISOString();

  it('entry 1 ms before start is excluded', () => {
    const entries = [
      entry(1, ONE_MS_BEFORE_START),
      entry(2, START), // exactly at start — should be included
    ];
    const range: DateRange = { start: START, end: END };
    const result = filterByDateRange(entries, range);
    expect(result.some((e) => e.id === 1)).toBe(false);
    expect(result.some((e) => e.id === 2)).toBe(true);
  });

  it('entry well before start is excluded', () => {
    const range: DateRange = { start: START, end: END };
    const result = filterByDateRange(FIXTURE, range);
    // id 1 (2024-06-01) is well before START (2024-06-10).
    expect(result.some((e) => e.id === 1)).toBe(false);
  });

  it('only the entry before start is excluded when others are in range', () => {
    const entries = [
      entry(10, ONE_MS_BEFORE_START),
      entry(11, START),
      entry(12, END),
    ];
    const range: DateRange = { start: START, end: END };
    const result = filterByDateRange(entries, range);
    expect(result.map((e) => e.id)).toEqual([11, 12]);
  });

  it('all entries before start are excluded when none fall in range', () => {
    const entries = [
      entry(1, '2024-01-01T00:00:00.000Z'),
      entry(2, '2024-05-31T23:59:59.999Z'),
    ];
    const range: DateRange = { start: START, end: END };
    expect(filterByDateRange(entries, range)).toHaveLength(0);
  });
});

// ── AC6: boundary exclusion — timestamp strictly after end ────────────────────

describe('Issue #242 AC6 – boundary exclusion: entry strictly after end is excluded', () => {
  const END_MS = new Date(END).getTime();
  const ONE_MS_AFTER_END = new Date(END_MS + 1).toISOString();

  it('entry 1 ms after end is excluded', () => {
    const entries = [
      entry(1, END),              // exactly at end — should be included
      entry(2, ONE_MS_AFTER_END), // 1 ms after end — should be excluded
    ];
    const range: DateRange = { start: START, end: END };
    const result = filterByDateRange(entries, range);
    expect(result.some((e) => e.id === 1)).toBe(true);
    expect(result.some((e) => e.id === 2)).toBe(false);
  });

  it('entry well after end is excluded', () => {
    const range: DateRange = { start: START, end: END };
    const result = filterByDateRange(FIXTURE, range);
    // id 5 (2024-06-25) is well after END (2024-06-20).
    expect(result.some((e) => e.id === 5)).toBe(false);
  });

  it('only the entry after end is excluded when others are in range', () => {
    const entries = [
      entry(10, START),
      entry(11, END),
      entry(12, ONE_MS_AFTER_END),
    ];
    const range: DateRange = { start: START, end: END };
    const result = filterByDateRange(entries, range);
    expect(result.map((e) => e.id)).toEqual([10, 11]);
  });

  it('all entries after end are excluded when none fall in range', () => {
    const entries = [
      entry(1, '2024-07-01T00:00:00.000Z'),
      entry(2, '2024-12-31T23:59:59.999Z'),
    ];
    const range: DateRange = { start: START, end: END };
    expect(filterByDateRange(entries, range)).toHaveLength(0);
  });
});

// ── AC2 additional: isDateRangeFilterActive reflects cleared state ────────────

describe('Issue #242 AC2 – isDateRangeFilterActive returns false after clearDateRangeFilter', () => {
  it('clearDateRangeFilter() produces a range where isDateRangeFilterActive is false', async () => {
    const { isDateRangeFilterActive, clearDateRangeFilter: clear } = await import('../src/dateRangeFilter');
    expect(isDateRangeFilterActive(clear())).toBe(false);
  });

  it('isDateRangeFilterActive is true when start is set', async () => {
    const { isDateRangeFilterActive } = await import('../src/dateRangeFilter');
    expect(isDateRangeFilterActive({ start: '2024-06-10T00:00:00.000Z' })).toBe(true);
  });

  it('isDateRangeFilterActive is true when end is set', async () => {
    const { isDateRangeFilterActive } = await import('../src/dateRangeFilter');
    expect(isDateRangeFilterActive({ end: '2024-06-20T23:59:59.000Z' })).toBe(true);
  });

  it('isDateRangeFilterActive is false for an empty DateRange object {}', async () => {
    // An empty object (no start, no end) is also a valid "no filter" state.
    const { isDateRangeFilterActive } = await import('../src/dateRangeFilter');
    expect(isDateRangeFilterActive({})).toBe(false);
  });

  it('filterByDateRange returns the original array for an empty DateRange object {}', () => {
    // Ensures the filter short-circuits correctly when neither bound is set.
    const result = filterByDateRange(FIXTURE, {});
    expect(result).toBe(FIXTURE);
  });
});

// ── AC1 + AC2: multiple apply/clear cycles remain consistent ─────────────────

describe('Issue #242 AC1+AC2 – repeated apply/clear cycles produce consistent results', () => {
  it('applying the same range twice yields the same result', () => {
    const range: DateRange = { start: START, end: END };
    const first  = filterByDateRange(FIXTURE, range);
    const second = filterByDateRange(FIXTURE, range);
    expect(second.map((e) => e.id)).toEqual(first.map((e) => e.id));
  });

  it('clearing after two consecutive applies restores the full list', () => {
    const range: DateRange = { start: START, end: END };
    filterByDateRange(FIXTURE, range); // first apply
    filterByDateRange(FIXTURE, range); // second apply
    const cleared = clearDateRangeFilter();
    expect(filterByDateRange(FIXTURE, cleared)).toHaveLength(FIXTURE.length);
  });

  it('alternating apply/clear/apply produces the same filtered result each time', () => {
    const range: DateRange = { start: START, end: END };
    const cleared = clearDateRangeFilter();

    const r1 = filterByDateRange(FIXTURE, range).map((e) => e.id);
    filterByDateRange(FIXTURE, cleared); // clear
    const r2 = filterByDateRange(FIXTURE, range).map((e) => e.id);

    expect(r2).toEqual(r1);
  });

  it('narrowing the range after a wider range excludes previously included entries', () => {
    const wide: DateRange   = { start: START, end: END };
    const narrow: DateRange = { start: '2024-06-15T00:00:00.000Z', end: '2024-06-15T23:59:59.999Z' };

    const wideResult   = filterByDateRange(FIXTURE, wide).map((e) => e.id);
    const narrowResult = filterByDateRange(FIXTURE, narrow).map((e) => e.id);

    // Wide result contains ids 2, 3, 4; narrow result contains only id 3.
    expect(wideResult).toContain(2);
    expect(narrowResult).not.toContain(2);
    expect(narrowResult).toContain(3);
  });
});

// ── AC3+AC5 / AC4+AC6: millisecond-precision boundary symmetry ───────────────

describe('Issue #242 AC3+AC5 / AC4+AC6 – millisecond-precision boundary symmetry', () => {
  /**
   * These tests verify that the boundary is a closed interval [start, end]
   * with millisecond precision: the entry at exactly start (or end) is in,
   * and the entry 1 ms away is out.  This is the tightest possible test of
   * the inclusive-boundary requirement.
   */

  it('AC3 vs AC5: entry at start included; entry 1 ms before start excluded (symmetric check)', () => {
    const startMs = new Date(START).getTime();
    const atStart      = new Date(startMs).toISOString();
    const oneBeforeStart = new Date(startMs - 1).toISOString();

    const range: DateRange = { start: START, end: END };
    const atResult     = filterByDateRange([entry(1, atStart)], range);
    const beforeResult = filterByDateRange([entry(2, oneBeforeStart)], range);

    expect(atResult).toHaveLength(1);     // included
    expect(beforeResult).toHaveLength(0); // excluded
  });

  it('AC4 vs AC6: entry at end included; entry 1 ms after end excluded (symmetric check)', () => {
    const endMs = new Date(END).getTime();
    const atEnd        = new Date(endMs).toISOString();
    const oneAfterEnd  = new Date(endMs + 1).toISOString();

    const range: DateRange = { start: START, end: END };
    const atResult    = filterByDateRange([entry(1, atEnd)], range);
    const afterResult = filterByDateRange([entry(2, oneAfterEnd)], range);

    expect(atResult).toHaveLength(1);    // included
    expect(afterResult).toHaveLength(0); // excluded
  });

  it('range spanning exactly 1 ms includes only the entry at that millisecond', () => {
    const midMs  = new Date('2024-06-15T12:30:00.000Z').getTime();
    const midIso = new Date(midMs).toISOString();
    const prevIso = new Date(midMs - 1).toISOString();
    const nextIso = new Date(midMs + 1).toISOString();

    const range: DateRange = { start: midIso, end: midIso };
    const entries = [
      entry(1, prevIso),
      entry(2, midIso),
      entry(3, nextIso),
    ];
    const result = filterByDateRange(entries, range);
    expect(result.map((e) => e.id)).toEqual([2]);
  });
});

// ── Combined boundary correctness ─────────────────────────────────────────────

describe('Issue #242 – combined boundary correctness', () => {
  const START_MS = new Date(START).getTime();
  const END_MS   = new Date(END).getTime();
  const ONE_MS_BEFORE_START = new Date(START_MS - 1).toISOString();
  const ONE_MS_AFTER_END    = new Date(END_MS   + 1).toISOString();

  it('entries 1 ms outside both boundaries are excluded; boundary entries are included', () => {
    const entries = [
      entry(1, ONE_MS_BEFORE_START), // excluded
      entry(2, START),               // included (== start)
      entry(3, END),                 // included (== end)
      entry(4, ONE_MS_AFTER_END),    // excluded
    ];
    const range: DateRange = { start: START, end: END };
    const result = filterByDateRange(entries, range);
    expect(result.map((e) => e.id)).toEqual([2, 3]);
  });

  it('zero-deliveries edge case: empty list with active range returns empty array', () => {
    const range: DateRange = { start: START, end: END };
    expect(filterByDateRange([], range)).toHaveLength(0);
  });

  it('100% failure edge case: all entries outside range returns empty array', () => {
    const entries = [
      entry(1, ONE_MS_BEFORE_START),
      entry(2, ONE_MS_AFTER_END),
    ];
    const range: DateRange = { start: START, end: END };
    expect(filterByDateRange(entries, range)).toHaveLength(0);
  });

  it('single-attempt edge case: one entry exactly at start is returned', () => {
    const entries = [entry(1, START)];
    const range: DateRange = { start: START, end: END };
    const result = filterByDateRange(entries, range);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it('single-attempt edge case: one entry exactly at end is returned', () => {
    const entries = [entry(1, END)];
    const range: DateRange = { start: START, end: END };
    const result = filterByDateRange(entries, range);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });
});
