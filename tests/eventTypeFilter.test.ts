/**
 * Unit tests for Issue #144: Event-type filter with composition.
 *
 * Covers the acceptance criteria mandated by the spec:
 *   AC9  – single event type selected: only matching entries are shown.
 *   AC10 – multiple event types selected: entries matching any selected type.
 *   AC11 – all types cleared / 'All' chosen: full unfiltered log restored.
 *   AC12 – event-type filter composed with date-range filter.
 *   AC13 – event-type filter composed with status filter.
 *
 * Also covers helper functions: deriveEventTypes, filterByDateRange,
 * filterByStatuses, and applyFilters (the conjunction combinator).
 *
 * Spec ref: spec § "Event log filtering — Event-type filter"
 */

import { describe, expect, it } from 'vitest';
import {
  filterByEventTypes,
  filterByDateRange,
  filterByStatuses,
  applyFilters,
  deriveEventTypes,
} from '../src/eventTypeFilter';

// ── Shared fixture ────────────────────────────────────────────────────────────
// Six entries across three event types, two statuses, and a spread of
// timestamps — enough to make every filter dimension meaningful.
const LOG = [
  { id: 1, eventType: 'payment.created', timestamp: '2024-01-01T00:00:00Z', status: 'delivered' },
  { id: 2, eventType: 'refund.issued',   timestamp: '2024-01-01T01:00:00Z', status: 'delivered' },
  { id: 3, eventType: 'payment.created', timestamp: '2024-01-01T02:00:00Z', status: 'failed'    },
  { id: 4, eventType: 'dispute.opened',  timestamp: '2024-01-01T03:00:00Z', status: 'pending'   },
  { id: 5, eventType: 'refund.issued',   timestamp: '2024-01-01T04:00:00Z', status: 'failed'    },
  { id: 6, eventType: 'dispute.opened',  timestamp: '2024-01-01T05:00:00Z', status: 'delivered' },
] as const;

// ── AC9: Single event type selected ──────────────────────────────────────────
describe('AC9 – single event type selected', () => {
  it('returns only entries matching the selected type', () => {
    const result = filterByEventTypes([...LOG], ['payment.created']);
    expect(result).toHaveLength(2);
    expect(result.every(e => e.eventType === 'payment.created')).toBe(true);
  });

  it('excludes entries of all other types', () => {
    const result = filterByEventTypes([...LOG], ['payment.created']);
    expect(result.some(e => e.eventType === 'refund.issued')).toBe(false);
    expect(result.some(e => e.eventType === 'dispute.opened')).toBe(false);
  });

  it('works for a type with a single entry in the log', () => {
    const entries = [
      { id: 1, eventType: 'payment.created', timestamp: '2024-01-01T00:00:00Z', status: 'delivered' },
      { id: 2, eventType: 'charge.failed',   timestamp: '2024-01-01T01:00:00Z', status: 'failed'    },
    ];
    const result = filterByEventTypes(entries, ['charge.failed']);
    expect(result).toHaveLength(1);
    expect(result[0].eventType).toBe('charge.failed');
  });

  it('returns empty array when selected type is not present in log', () => {
    const result = filterByEventTypes([...LOG], ['unknown.event']);
    expect(result).toHaveLength(0);
  });
});

// ── AC10: Multiple event types selected ──────────────────────────────────────
describe('AC10 – multiple event types selected', () => {
  it('returns entries matching any of the selected types', () => {
    const result = filterByEventTypes([...LOG], ['payment.created', 'refund.issued']);
    expect(result).toHaveLength(4);
    expect(result.some(e => e.eventType === 'payment.created')).toBe(true);
    expect(result.some(e => e.eventType === 'refund.issued')).toBe(true);
  });

  it('excludes entries of unselected types', () => {
    const result = filterByEventTypes([...LOG], ['payment.created', 'refund.issued']);
    expect(result.some(e => e.eventType === 'dispute.opened')).toBe(false);
  });

  it('returns all entries when all types are explicitly selected', () => {
    const result = filterByEventTypes(
      [...LOG],
      ['payment.created', 'refund.issued', 'dispute.opened']
    );
    expect(result).toHaveLength(LOG.length);
  });

  it('handles two types where one has no matches', () => {
    const result = filterByEventTypes([...LOG], ['payment.created', 'unknown.event']);
    expect(result).toHaveLength(2);
    expect(result.every(e => e.eventType === 'payment.created')).toBe(true);
  });
});

// ── AC11: All types cleared / 'All' chosen ───────────────────────────────────
describe('AC11 – all types cleared restores full unfiltered log', () => {
  it('returns the original array reference when selectedTypes is empty', () => {
    const entries = [...LOG];
    const result = filterByEventTypes(entries, []);
    expect(result).toBe(entries);
  });

  it('returns all entries when selectedTypes is empty', () => {
    const result = filterByEventTypes([...LOG], []);
    expect(result).toHaveLength(LOG.length);
  });

  it('returns empty array for empty log with empty selection', () => {
    const result = filterByEventTypes([], []);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty log with a selection', () => {
    const result = filterByEventTypes([], ['payment.created']);
    expect(result).toHaveLength(0);
  });
});

// ── AC12: Event-type filter composed with date-range filter ──────────────────
describe('AC12 – event-type filter composed with date-range filter', () => {
  it('returns only entries satisfying both event-type and date-range constraints', () => {
    // Select payment.created AND restrict to timestamps after 01:00
    const result = applyFilters(
      [...LOG],
      ['payment.created'],
      '2024-01-01T01:00:00Z',
      null,
      []
    );
    // Only id=3 (payment.created at 02:00) qualifies; id=1 is before start
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
  });

  it('returns empty when date range excludes all entries of the selected type', () => {
    const result = applyFilters(
      [...LOG],
      ['payment.created'],
      '2024-01-01T10:00:00Z', // after all entries
      null,
      []
    );
    expect(result).toHaveLength(0);
  });

  it('includes boundary entries (start == timestamp)', () => {
    const result = applyFilters(
      [...LOG],
      ['payment.created'],
      '2024-01-01T00:00:00Z', // exactly equals id=1 timestamp
      '2024-01-01T01:30:00Z',
      []
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it('includes boundary entries (end == timestamp)', () => {
    const result = applyFilters(
      [...LOG],
      ['payment.created'],
      null,
      '2024-01-01T02:00:00Z', // exactly equals id=3 timestamp
      []
    );
    expect(result).toHaveLength(2);
    expect(result.map(e => e.id).sort()).toEqual([1, 3]);
  });

  it('no event-type filter + date range returns all types within range', () => {
    const result = applyFilters(
      [...LOG],
      [],
      '2024-01-01T01:00:00Z',
      '2024-01-01T03:00:00Z',
      []
    );
    // ids 2, 3, 4 fall within [01:00, 03:00]
    expect(result).toHaveLength(3);
    expect(result.map(e => e.id).sort()).toEqual([2, 3, 4]);
  });

  it('filterByDateRange alone: no bounds returns original array', () => {
    const entries = [...LOG];
    const result = filterByDateRange(entries, null, null);
    expect(result).toBe(entries);
  });

  it('filterByDateRange alone: start bound only', () => {
    const result = filterByDateRange([...LOG], '2024-01-01T03:00:00Z', null);
    expect(result).toHaveLength(3); // ids 4, 5, 6
    expect(result.map(e => e.id).sort()).toEqual([4, 5, 6]);
  });

  it('filterByDateRange alone: end bound only', () => {
    const result = filterByDateRange([...LOG], null, '2024-01-01T02:00:00Z');
    expect(result).toHaveLength(3); // ids 1, 2, 3
    expect(result.map(e => e.id).sort()).toEqual([1, 2, 3]);
  });
});

// ── AC13: Event-type filter composed with status filter ──────────────────────
describe('AC13 – event-type filter composed with status filter', () => {
  it('returns only entries satisfying both event-type and status constraints', () => {
    // payment.created AND delivered → only id=1
    const result = applyFilters([...LOG], ['payment.created'], null, null, ['delivered']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it('returns empty when no entry satisfies both constraints', () => {
    // dispute.opened AND failed → none (dispute entries are pending/delivered)
    const result = applyFilters([...LOG], ['dispute.opened'], null, null, ['failed']);
    expect(result).toHaveLength(0);
  });

  it('multiple event types AND single status', () => {
    // payment.created OR refund.issued AND failed → ids 3, 5
    const result = applyFilters(
      [...LOG],
      ['payment.created', 'refund.issued'],
      null,
      null,
      ['failed']
    );
    expect(result).toHaveLength(2);
    expect(result.map(e => e.id).sort()).toEqual([3, 5]);
  });

  it('no event-type filter + status filter returns all types with that status', () => {
    const result = applyFilters([...LOG], [], null, null, ['delivered']);
    // ids 1, 2, 6 are delivered
    expect(result).toHaveLength(3);
    expect(result.map(e => e.id).sort()).toEqual([1, 2, 6]);
  });

  it('filterByStatuses alone: empty selection returns original array', () => {
    const entries = [...LOG];
    const result = filterByStatuses(entries, []);
    expect(result).toBe(entries);
  });

  it('filterByStatuses alone: single status', () => {
    const result = filterByStatuses([...LOG], ['pending']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(4);
  });

  it('filterByStatuses alone: multiple statuses', () => {
    const result = filterByStatuses([...LOG], ['delivered', 'pending']);
    expect(result).toHaveLength(4); // ids 1, 2, 4, 6
    expect(result.map(e => e.id).sort()).toEqual([1, 2, 4, 6]);
  });
});

// ── applyFilters: all three dimensions active ─────────────────────────────────
describe('applyFilters – all three dimensions active simultaneously', () => {
  it('applies event-type, date-range, and status as a conjunction', () => {
    // payment.created AND timestamp >= 01:00 AND failed
    // id=3 (payment.created, 02:00, failed) qualifies; id=1 is delivered
    const result = applyFilters(
      [...LOG],
      ['payment.created'],
      '2024-01-01T01:00:00Z',
      null,
      ['failed']
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
  });

  it('returns empty when no entry satisfies all three constraints', () => {
    const result = applyFilters(
      [...LOG],
      ['refund.issued'],
      '2024-01-01T05:00:00Z', // after all refund entries
      null,
      ['delivered']
    );
    expect(result).toHaveLength(0);
  });

  it('no active filters returns full list', () => {
    const result = applyFilters([...LOG], [], null, null, []);
    expect(result).toHaveLength(LOG.length);
  });
});

// ── deriveEventTypes ──────────────────────────────────────────────────────────
describe('deriveEventTypes – dynamic event-type list derivation (AC8)', () => {
  it('returns sorted unique event types from the log', () => {
    const types = deriveEventTypes([...LOG]);
    expect(types).toEqual(['dispute.opened', 'payment.created', 'refund.issued']);
  });

  it('returns empty array for an empty log', () => {
    expect(deriveEventTypes([])).toEqual([]);
  });

  it('returns a single type when all entries share the same type', () => {
    const entries = [
      { eventType: 'payment.created', timestamp: '2024-01-01T00:00:00Z', status: 'delivered' },
      { eventType: 'payment.created', timestamp: '2024-01-01T01:00:00Z', status: 'failed' },
    ];
    expect(deriveEventTypes(entries)).toEqual(['payment.created']);
  });

  it('deduplicates repeated event types', () => {
    const entries = [
      { eventType: 'b.event', timestamp: '2024-01-01T00:00:00Z', status: 'delivered' },
      { eventType: 'a.event', timestamp: '2024-01-01T01:00:00Z', status: 'delivered' },
      { eventType: 'b.event', timestamp: '2024-01-01T02:00:00Z', status: 'failed' },
    ];
    expect(deriveEventTypes(entries)).toEqual(['a.event', 'b.event']);
  });
});
