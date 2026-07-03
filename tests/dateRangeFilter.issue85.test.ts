/**
 * Supplementary unit tests for Issue #85 — date-range filter boundary conditions.
 *
 * These tests complement tests/dateRangeFilter.test.ts (shipped by Dev) with
 * additional coverage of:
 *   - Filter composition: date-range filter applied on top of an event-type
 *     pre-filtered list (spec § "Filter composition").
 *   - Immutability: the original entries array is not mutated by the filter.
 *   - Ordering: the relative order of entries is preserved in the result.
 *   - Millisecond-precision boundaries: timestamps that differ by 1 ms from
 *     the boundary are correctly included/excluded.
 *   - String-only boundary: start > end (inverted range) returns empty result
 *     without throwing.
 *
 * Spec ref: spec § "Event log filtering — Date-range filter"
 */

import { describe, expect, it } from 'vitest';
import { filterByDateRange } from '../src/dateRangeFilter';
import { filterByEventTypes } from '../src/eventTypeFilter';

// ── Shared fixture ────────────────────────────────────────────────────────────
const ENTRIES = [
  { id: 1, eventType: 'payment.created', timestamp: '2024-06-01T10:00:00.000Z' },
  { id: 2, eventType: 'refund.issued',   timestamp: '2024-06-01T10:00:00.001Z' }, // 1 ms after id 1
  { id: 3, eventType: 'payment.created', timestamp: '2024-06-01T11:00:00.000Z' },
  { id: 4, eventType: 'dispute.opened',  timestamp: '2024-06-01T12:00:00.000Z' },
  { id: 5, eventType: 'refund.issued',   timestamp: '2024-06-01T12:00:00.000Z' }, // same ts as id 4
  { id: 6, eventType: 'payment.created', timestamp: '2024-06-01T13:00:00.000Z' },
];

const START = '2024-06-01T10:00:00.001Z'; // exactly id 2's timestamp
const END   = '2024-06-01T12:00:00.000Z'; // exactly ids 4 & 5's timestamp

// ── Filter composition: date-range + event-type ───────────────────────────────
describe('filterByDateRange – filter composition with event-type filter', () => {
  it('correctly filters a list that has already been narrowed by event type', () => {
    // First narrow to payment.created (ids 1, 3, 6), then apply date range.
    const byType = filterByEventTypes(ENTRIES, ['payment.created']);
    const result = filterByDateRange(byType, START, END);
    // id 1 is at 10:00:00.000 — before START (10:00:00.001) → excluded
    // id 3 is at 11:00:00.000 — inside range → included
    // id 6 is at 13:00:00.000 — after END → excluded
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
  });

  it('returns empty when event-type filter leaves no entries in the date range', () => {
    // dispute.opened only has id 4 (12:00:00.000 === END → included).
    const byType = filterByEventTypes(ENTRIES, ['dispute.opened']);
    // Narrow to a range that excludes id 4.
    const result = filterByDateRange(byType, START, '2024-06-01T11:59:59.999Z');
    expect(result).toHaveLength(0);
  });

  it('date-range then event-type gives the same result as event-type then date-range', () => {
    // Commutativity check: both orderings should yield the same set of ids.
    const dateFirst = filterByEventTypes(
      filterByDateRange(ENTRIES, START, END),
      ['refund.issued'],
    );
    const typeFirst = filterByDateRange(
      filterByEventTypes(ENTRIES, ['refund.issued']),
      START,
      END,
    );
    const dateFirstIds = dateFirst.map((e) => e.id).sort();
    const typeFirstIds = typeFirst.map((e) => e.id).sort();
    expect(dateFirstIds).toEqual(typeFirstIds);
  });
});

// ── Immutability ──────────────────────────────────────────────────────────────
describe('filterByDateRange – immutability', () => {
  it('does not mutate the original entries array when a range is applied', () => {
    const original = [...ENTRIES];
    filterByDateRange(ENTRIES, START, END);
    expect(ENTRIES).toHaveLength(original.length);
    ENTRIES.forEach((entry, i) => {
      expect(entry.id).toBe(original[i].id);
    });
  });

  it('does not mutate the original entries array when no filter is active', () => {
    const original = [...ENTRIES];
    filterByDateRange(ENTRIES, null, null);
    expect(ENTRIES).toHaveLength(original.length);
  });
});

// ── Ordering ──────────────────────────────────────────────────────────────────
describe('filterByDateRange – result ordering', () => {
  it('preserves the relative order of entries in the filtered result', () => {
    const result = filterByDateRange(ENTRIES, START, END);
    // Expected order by id: 2, 3, 4, 5 (ascending, matching fixture order).
    const ids = result.map((e) => e.id);
    expect(ids).toEqual([2, 3, 4, 5]);
  });
});

// ── Millisecond-precision boundaries ─────────────────────────────────────────
describe('filterByDateRange – millisecond-precision boundary conditions', () => {
  it('excludes an entry that is 1 ms before the start boundary', () => {
    // id 1 is at 10:00:00.000; START is 10:00:00.001 → id 1 must be excluded.
    const result = filterByDateRange(ENTRIES, START, END);
    expect(result.find((e) => e.id === 1)).toBeUndefined();
  });

  it('includes an entry whose timestamp is exactly 1 ms after the start boundary', () => {
    // id 2 is at 10:00:00.001 === START → must be included.
    const result = filterByDateRange(ENTRIES, START, END);
    expect(result.find((e) => e.id === 2)).toBeDefined();
  });

  it('includes two entries that share the exact end-boundary timestamp', () => {
    // ids 4 and 5 both have timestamp 12:00:00.000 === END → both included.
    const result = filterByDateRange(ENTRIES, START, END);
    expect(result.find((e) => e.id === 4)).toBeDefined();
    expect(result.find((e) => e.id === 5)).toBeDefined();
  });
});

// ── Inverted range (start > end) ──────────────────────────────────────────────
describe('filterByDateRange – inverted range (start > end)', () => {
  it('returns an empty array when start is after end without throwing', () => {
    // Inverted range: no entry can satisfy ts >= start AND ts <= end when start > end.
    expect(() => {
      const result = filterByDateRange(ENTRIES, END, START);
      expect(result).toHaveLength(0);
    }).not.toThrow();
  });
});

// ── Only-start / only-end open bounds ────────────────────────────────────────
describe('filterByDateRange – open-ended ranges', () => {
  it('with only start set: excludes entries before start, includes all from start onward', () => {
    const result = filterByDateRange(ENTRIES, START, null);
    // id 1 (10:00:00.000) is before START → excluded; ids 2–6 are at or after START.
    expect(result.find((e) => e.id === 1)).toBeUndefined();
    expect(result).toHaveLength(5);
  });

  it('with only end set: includes all entries up to and including end, excludes after', () => {
    const result = filterByDateRange(ENTRIES, null, END);
    // id 6 (13:00:00.000) is after END → excluded; ids 1–5 are at or before END.
    expect(result.find((e) => e.id === 6)).toBeUndefined();
    expect(result).toHaveLength(5);
  });

  it('with only start set: start-boundary entry is included (AC4 open-bound variant)', () => {
    const result = filterByDateRange(ENTRIES, START, null);
    expect(result.find((e) => e.timestamp === START)).toBeDefined();
  });

  it('with only end set: end-boundary entry is included (AC5 open-bound variant)', () => {
    const result = filterByDateRange(ENTRIES, null, END);
    // Both id 4 and id 5 share the END timestamp.
    const atEnd = result.filter((e) => e.timestamp === END);
    expect(atEnd).toHaveLength(2);
  });
});
