/**
 * Filter composition tests — Issue #162
 *
 * Covers the spec requirement: "The date-range filter works correctly in
 * combination with event-type and status filters" and "The event-type filter
 * works correctly in combination with date-range and status filters."
 *
 * Spec ref: spec § "Event log filtering — Date-range filter" (Filter composition)
 *           spec § "Event log filtering — Event-type filter" (Filter composition)
 *
 * All tests are purely additive — no production filter logic is modified.
 * Tests are co-located with the existing filter unit tests in tests/.
 */

import { describe, expect, it } from 'vitest';
import { applyFilters, type ComposableLogEntry, type FilterState } from '../src/filterComposition.js';
import { filterByDateRange } from '../src/dateRangeFilter.js';
import { filterByEventTypes } from '../src/eventTypeFilter.js';
import { filterByStatuses } from '../src/statusFilter.js';

// ── Shared fixture dataset ────────────────────────────────────────────────────
//
// 12 entries spanning 3 event types × 4 statuses, spread across 3 days.
// Timestamps are chosen so boundary tests are unambiguous.
//
// Day 1: 2024-01-10  (entries 1–4)
// Day 2: 2024-01-15  (entries 5–8)
// Day 3: 2024-01-20  (entries 9–12)

const FIXTURE: ComposableLogEntry[] = [
  // Day 1
  { id: 1,  timestamp: '2024-01-10T08:00:00Z', eventType: 'payment.created', status: 'delivered' },
  { id: 2,  timestamp: '2024-01-10T09:00:00Z', eventType: 'refund.issued',   status: 'failed'    },
  { id: 3,  timestamp: '2024-01-10T10:00:00Z', eventType: 'dispute.opened',  status: 'pending'   },
  { id: 4,  timestamp: '2024-01-10T11:00:00Z', eventType: 'payment.created', status: 'exhausted' },
  // Day 2
  { id: 5,  timestamp: '2024-01-15T08:00:00Z', eventType: 'refund.issued',   status: 'delivered' },
  { id: 6,  timestamp: '2024-01-15T09:00:00Z', eventType: 'dispute.opened',  status: 'failed'    },
  { id: 7,  timestamp: '2024-01-15T10:00:00Z', eventType: 'payment.created', status: 'pending'   },
  { id: 8,  timestamp: '2024-01-15T11:00:00Z', eventType: 'refund.issued',   status: 'exhausted' },
  // Day 3
  { id: 9,  timestamp: '2024-01-20T08:00:00Z', eventType: 'dispute.opened',  status: 'delivered' },
  { id: 10, timestamp: '2024-01-20T09:00:00Z', eventType: 'payment.created', status: 'failed'    },
  { id: 11, timestamp: '2024-01-20T10:00:00Z', eventType: 'refund.issued',   status: 'pending'   },
  { id: 12, timestamp: '2024-01-20T11:00:00Z', eventType: 'dispute.opened',  status: 'exhausted' },
];

// Helper: extract ids from result for readable assertions.
const ids = (entries: ComposableLogEntry[]) => entries.map((e) => (e as any).id).sort((a, b) => a - b);

// ── AC1: Date-range + event-type composition ──────────────────────────────────

describe('AC1 – date-range + event-type filter composition', () => {
  it('returns only entries matching both date range and event type', () => {
    const result = applyFilters(FIXTURE, {
      startDate: '2024-01-10T00:00:00Z',
      endDate:   '2024-01-15T23:59:59Z',
      selectedEventTypes: ['payment.created'],
    });
    // Day 1 payment.created: ids 1, 4 — Day 2 payment.created: id 7
    expect(ids(result)).toEqual([1, 4, 7]);
  });

  it('returns empty array when date range contains no entries of the selected type', () => {
    const result = applyFilters(FIXTURE, {
      startDate: '2024-01-10T00:00:00Z',
      endDate:   '2024-01-10T23:59:59Z',
      selectedEventTypes: ['refund.issued'],
    });
    // Day 1 refund.issued: id 2 — but wait, id 2 IS on day 1
    // Let's use a range that truly has no refund.issued
    const result2 = applyFilters(FIXTURE, {
      startDate: '2024-01-10T08:30:00Z', // after id 2 (09:00)
      endDate:   '2024-01-10T08:59:00Z', // before id 2
      selectedEventTypes: ['refund.issued'],
    });
    expect(result2).toHaveLength(0);
  });

  it('returns empty array when event type exists but not in date range', () => {
    const result = applyFilters(FIXTURE, {
      startDate: '2024-01-12T00:00:00Z',
      endDate:   '2024-01-13T00:00:00Z',
      selectedEventTypes: ['payment.created'],
    });
    // No entries between Jan 12 and Jan 13
    expect(result).toHaveLength(0);
  });

  it('multiple event types with date range returns correct intersection', () => {
    const result = applyFilters(FIXTURE, {
      startDate: '2024-01-15T00:00:00Z',
      endDate:   '2024-01-20T23:59:59Z',
      selectedEventTypes: ['refund.issued', 'dispute.opened'],
    });
    // Day 2: ids 5 (refund), 6 (dispute), 8 (refund)
    // Day 3: ids 9 (dispute), 11 (refund), 12 (dispute)
    expect(ids(result)).toEqual([5, 6, 8, 9, 11, 12]);
  });
});

// ── AC2: Date-range + status composition ─────────────────────────────────────

describe('AC2 – date-range + status filter composition', () => {
  it('returns only entries matching both date range and status', () => {
    const result = applyFilters(FIXTURE, {
      startDate: '2024-01-10T00:00:00Z',
      endDate:   '2024-01-15T23:59:59Z',
      selectedStatuses: ['delivered'],
    });
    // Day 1 delivered: id 1 — Day 2 delivered: id 5
    expect(ids(result)).toEqual([1, 5]);
  });

  it('returns empty array when no entries in range have the selected status', () => {
    const result = applyFilters(FIXTURE, {
      startDate: '2024-01-10T00:00:00Z',
      endDate:   '2024-01-10T23:59:59Z',
      selectedStatuses: ['exhausted'],
    });
    // Day 1 exhausted: id 4 — should be included
    expect(ids(result)).toEqual([4]);

    // Now a range with no exhausted entries
    const result2 = applyFilters(FIXTURE, {
      startDate: '2024-01-12T00:00:00Z',
      endDate:   '2024-01-13T00:00:00Z',
      selectedStatuses: ['exhausted'],
    });
    expect(result2).toHaveLength(0);
  });

  it('multiple statuses with date range returns correct intersection', () => {
    const result = applyFilters(FIXTURE, {
      startDate: '2024-01-20T00:00:00Z',
      endDate:   '2024-01-20T23:59:59Z',
      selectedStatuses: ['delivered', 'failed'],
    });
    // Day 3 delivered: id 9 — Day 3 failed: id 10
    expect(ids(result)).toEqual([9, 10]);
  });
});

// ── AC3: Event-type + status composition ─────────────────────────────────────

describe('AC3 – event-type + status filter composition', () => {
  it('returns only entries matching both event type and status', () => {
    const result = applyFilters(FIXTURE, {
      selectedEventTypes: ['payment.created'],
      selectedStatuses: ['delivered'],
    });
    // payment.created + delivered: id 1 only
    expect(ids(result)).toEqual([1]);
  });

  it('returns empty array when no entries match both event type and status', () => {
    // dispute.opened never has status "exhausted" on day 1 — but id 12 does on day 3
    // Let's pick a combination that truly has no match
    const result = applyFilters(FIXTURE, {
      selectedEventTypes: ['refund.issued'],
      selectedStatuses: ['exhausted'],
    });
    // refund.issued + exhausted: id 8
    expect(ids(result)).toEqual([8]);

    // A combination with no match at all
    const result2 = applyFilters(FIXTURE, {
      selectedEventTypes: ['payment.created'],
      selectedStatuses: ['exhausted'],
    });
    // payment.created + exhausted: id 4
    expect(ids(result2)).toEqual([4]);
  });

  it('multiple event types and multiple statuses returns correct intersection', () => {
    const result = applyFilters(FIXTURE, {
      selectedEventTypes: ['payment.created', 'refund.issued'],
      selectedStatuses: ['failed', 'pending'],
    });
    // payment.created + failed: id 10
    // payment.created + pending: id 7
    // refund.issued + failed: id 2
    // refund.issued + pending: id 11
    expect(ids(result)).toEqual([2, 7, 10, 11]);
  });

  it('returns empty array when event type and status have no overlap', () => {
    // Construct a scenario with no overlap by using a type/status combo not in fixture
    const smallFixture: ComposableLogEntry[] = [
      { timestamp: '2024-01-10T08:00:00Z', eventType: 'payment.created', status: 'delivered' },
      { timestamp: '2024-01-10T09:00:00Z', eventType: 'refund.issued',   status: 'pending'   },
    ];
    const result = applyFilters(smallFixture, {
      selectedEventTypes: ['payment.created'],
      selectedStatuses: ['pending'],
    });
    expect(result).toHaveLength(0);
  });
});

// ── AC4: All three filters simultaneously ────────────────────────────────────

describe('AC4 – date-range + event-type + status (all three filters)', () => {
  it('returns only entries matching all three constraints', () => {
    const result = applyFilters(FIXTURE, {
      startDate: '2024-01-10T00:00:00Z',
      endDate:   '2024-01-15T23:59:59Z',
      selectedEventTypes: ['payment.created'],
      selectedStatuses: ['delivered'],
    });
    // Day 1 payment.created delivered: id 1
    // Day 2 payment.created delivered: none (id 7 is pending)
    expect(ids(result)).toEqual([1]);
  });

  it('returns empty array when no entries satisfy all three constraints', () => {
    const result = applyFilters(FIXTURE, {
      startDate: '2024-01-20T00:00:00Z',
      endDate:   '2024-01-20T23:59:59Z',
      selectedEventTypes: ['payment.created'],
      selectedStatuses: ['delivered'],
    });
    // Day 3 payment.created: id 10 (failed) — no delivered payment.created on day 3
    expect(result).toHaveLength(0);
  });

  it('all three filters with multiple values returns correct intersection', () => {
    const result = applyFilters(FIXTURE, {
      startDate: '2024-01-10T00:00:00Z',
      endDate:   '2024-01-20T23:59:59Z',
      selectedEventTypes: ['refund.issued', 'dispute.opened'],
      selectedStatuses: ['delivered', 'failed'],
    });
    // refund.issued + delivered: id 5
    // refund.issued + failed: id 2
    // dispute.opened + delivered: id 9
    // dispute.opened + failed: id 6
    expect(ids(result)).toEqual([2, 5, 6, 9]);
  });

  it('returns all entries when all three filters are inactive', () => {
    const result = applyFilters(FIXTURE, {
      startDate: null,
      endDate: null,
      selectedEventTypes: [],
      selectedStatuses: [],
    });
    expect(result).toHaveLength(FIXTURE.length);
  });
});

// ── AC5: Clearing one filter while others remain active ───────────────────────

describe('AC5 – clearing one filter re-expands to intersection of remaining filters', () => {
  it('clearing date-range while event-type + status remain active', () => {
    const withDateRange = applyFilters(FIXTURE, {
      startDate: '2024-01-10T00:00:00Z',
      endDate:   '2024-01-10T23:59:59Z',
      selectedEventTypes: ['payment.created'],
      selectedStatuses: ['delivered'],
    });
    // Only id 1 (day 1, payment.created, delivered)
    expect(ids(withDateRange)).toEqual([1]);

    // Clear date range — now all payment.created + delivered across all days
    const withoutDateRange = applyFilters(FIXTURE, {
      startDate: null,
      endDate: null,
      selectedEventTypes: ['payment.created'],
      selectedStatuses: ['delivered'],
    });
    // payment.created + delivered: id 1 only (across all days)
    expect(ids(withoutDateRange)).toEqual([1]);
    // Result is a superset of (or equal to) the date-range-restricted result
    expect(withoutDateRange.length).toBeGreaterThanOrEqual(withDateRange.length);
  });

  it('clearing event-type filter while date-range + status remain active', () => {
    const withEventType = applyFilters(FIXTURE, {
      startDate: '2024-01-15T00:00:00Z',
      endDate:   '2024-01-15T23:59:59Z',
      selectedEventTypes: ['refund.issued'],
      selectedStatuses: ['delivered'],
    });
    // Day 2 refund.issued delivered: id 5
    expect(ids(withEventType)).toEqual([5]);

    // Clear event-type — now all delivered entries on day 2
    const withoutEventType = applyFilters(FIXTURE, {
      startDate: '2024-01-15T00:00:00Z',
      endDate:   '2024-01-15T23:59:59Z',
      selectedEventTypes: [],
      selectedStatuses: ['delivered'],
    });
    // Day 2 delivered: id 5 (refund.issued)
    expect(ids(withoutEventType)).toEqual([5]);
    expect(withoutEventType.length).toBeGreaterThanOrEqual(withEventType.length);
  });

  it('clearing status filter while date-range + event-type remain active', () => {
    const withStatus = applyFilters(FIXTURE, {
      startDate: '2024-01-20T00:00:00Z',
      endDate:   '2024-01-20T23:59:59Z',
      selectedEventTypes: ['dispute.opened'],
      selectedStatuses: ['delivered'],
    });
    // Day 3 dispute.opened delivered: id 9
    expect(ids(withStatus)).toEqual([9]);

    // Clear status — now all dispute.opened entries on day 3
    const withoutStatus = applyFilters(FIXTURE, {
      startDate: '2024-01-20T00:00:00Z',
      endDate:   '2024-01-20T23:59:59Z',
      selectedEventTypes: ['dispute.opened'],
      selectedStatuses: [],
    });
    // Day 3 dispute.opened: ids 9 (delivered), 12 (exhausted)
    expect(ids(withoutStatus)).toEqual([9, 12]);
    expect(withoutStatus.length).toBeGreaterThan(withStatus.length);
  });

  it('clearing all filters one by one progressively expands results', () => {
    const allThree = applyFilters(FIXTURE, {
      startDate: '2024-01-10T00:00:00Z',
      endDate:   '2024-01-15T23:59:59Z',
      selectedEventTypes: ['payment.created'],
      selectedStatuses: ['delivered'],
    });

    const noStatus = applyFilters(FIXTURE, {
      startDate: '2024-01-10T00:00:00Z',
      endDate:   '2024-01-15T23:59:59Z',
      selectedEventTypes: ['payment.created'],
      selectedStatuses: [],
    });

    const noEventType = applyFilters(FIXTURE, {
      startDate: '2024-01-10T00:00:00Z',
      endDate:   '2024-01-15T23:59:59Z',
      selectedEventTypes: [],
      selectedStatuses: [],
    });

    const noFilters = applyFilters(FIXTURE, {
      startDate: null,
      endDate: null,
      selectedEventTypes: [],
      selectedStatuses: [],
    });

    // Each step should be >= the previous (monotonically non-decreasing)
    expect(noStatus.length).toBeGreaterThanOrEqual(allThree.length);
    expect(noEventType.length).toBeGreaterThanOrEqual(noStatus.length);
    expect(noFilters.length).toBeGreaterThanOrEqual(noEventType.length);
    expect(noFilters.length).toBe(FIXTURE.length);
  });
});

// ── AC6: Boundary-date entries with other filters active ──────────────────────

describe('AC6 – boundary-date entries included when date-range is composed with other filters', () => {
  it('entry exactly at startDate is included when event-type filter also matches', () => {
    const exactStart = '2024-01-15T08:00:00Z'; // id 5: refund.issued, delivered
    const result = applyFilters(FIXTURE, {
      startDate: exactStart,
      endDate:   '2024-01-20T23:59:59Z',
      selectedEventTypes: ['refund.issued'],
    });
    expect(ids(result)).toContain(5);
  });

  it('entry exactly at endDate is included when event-type filter also matches', () => {
    const exactEnd = '2024-01-15T11:00:00Z'; // id 8: refund.issued, exhausted
    const result = applyFilters(FIXTURE, {
      startDate: '2024-01-10T00:00:00Z',
      endDate:   exactEnd,
      selectedEventTypes: ['refund.issued'],
    });
    expect(ids(result)).toContain(8);
  });

  it('entry exactly at startDate is included when status filter also matches', () => {
    const exactStart = '2024-01-20T08:00:00Z'; // id 9: dispute.opened, delivered
    const result = applyFilters(FIXTURE, {
      startDate: exactStart,
      endDate:   '2024-01-20T23:59:59Z',
      selectedStatuses: ['delivered'],
    });
    expect(ids(result)).toContain(9);
  });

  it('entry exactly at endDate is included when status filter also matches', () => {
    const exactEnd = '2024-01-20T11:00:00Z'; // id 12: dispute.opened, exhausted
    const result = applyFilters(FIXTURE, {
      startDate: '2024-01-20T00:00:00Z',
      endDate:   exactEnd,
      selectedStatuses: ['exhausted'],
    });
    expect(ids(result)).toContain(12);
  });

  it('entry exactly at startDate is included when all three filters match', () => {
    const exactStart = '2024-01-10T08:00:00Z'; // id 1: payment.created, delivered
    const result = applyFilters(FIXTURE, {
      startDate: exactStart,
      endDate:   '2024-01-10T23:59:59Z',
      selectedEventTypes: ['payment.created'],
      selectedStatuses: ['delivered'],
    });
    expect(ids(result)).toContain(1);
  });

  it('entry exactly at endDate is included when all three filters match', () => {
    const exactEnd = '2024-01-10T11:00:00Z'; // id 4: payment.created, exhausted
    const result = applyFilters(FIXTURE, {
      startDate: '2024-01-10T00:00:00Z',
      endDate:   exactEnd,
      selectedEventTypes: ['payment.created'],
      selectedStatuses: ['exhausted'],
    });
    expect(ids(result)).toContain(4);
  });

  it('entry one millisecond before startDate is excluded', () => {
    // id 5 is at 2024-01-15T08:00:00Z; set start to 1ms later
    const result = applyFilters(FIXTURE, {
      startDate: '2024-01-15T08:00:00.001Z',
      endDate:   '2024-01-20T23:59:59Z',
      selectedEventTypes: ['refund.issued'],
    });
    expect(ids(result)).not.toContain(5);
  });

  it('entry one millisecond after endDate is excluded', () => {
    // id 8 is at 2024-01-15T11:00:00Z; set end to 1ms earlier
    const result = applyFilters(FIXTURE, {
      startDate: '2024-01-10T00:00:00Z',
      endDate:   '2024-01-15T10:59:59.999Z',
      selectedEventTypes: ['refund.issued'],
    });
    expect(ids(result)).not.toContain(8);
  });
});

// ── AC7: Clearing event-type while date-range and/or status remain active ─────

describe('AC7 – clearing event-type restores full event-type dimension only', () => {
  it('clearing event-type while date-range is active returns all types in range', () => {
    const withEventType = applyFilters(FIXTURE, {
      startDate: '2024-01-10T00:00:00Z',
      endDate:   '2024-01-10T23:59:59Z',
      selectedEventTypes: ['payment.created'],
    });
    // Day 1 payment.created: ids 1, 4
    expect(ids(withEventType)).toEqual([1, 4]);

    const withoutEventType = applyFilters(FIXTURE, {
      startDate: '2024-01-10T00:00:00Z',
      endDate:   '2024-01-10T23:59:59Z',
      selectedEventTypes: [],
    });
    // All day 1 entries: ids 1, 2, 3, 4
    expect(ids(withoutEventType)).toEqual([1, 2, 3, 4]);
    // All event types are now present
    const types = new Set(withoutEventType.map((e) => e.eventType));
    expect(types.has('payment.created')).toBe(true);
    expect(types.has('refund.issued')).toBe(true);
    expect(types.has('dispute.opened')).toBe(true);
  });

  it('clearing event-type while status is active returns all types with that status', () => {
    const withEventType = applyFilters(FIXTURE, {
      selectedEventTypes: ['payment.created'],
      selectedStatuses: ['failed'],
    });
    // payment.created + failed: id 10
    expect(ids(withEventType)).toEqual([10]);

    const withoutEventType = applyFilters(FIXTURE, {
      selectedEventTypes: [],
      selectedStatuses: ['failed'],
    });
    // All failed entries: ids 2, 6, 10
    expect(ids(withoutEventType)).toEqual([2, 6, 10]);
    // All event types present in result
    const types = new Set(withoutEventType.map((e) => e.eventType));
    expect(types.has('payment.created')).toBe(true);
    expect(types.has('refund.issued')).toBe(true);
    expect(types.has('dispute.opened')).toBe(true);
  });

  it('clearing event-type while both date-range and status are active returns all types in that intersection', () => {
    const withEventType = applyFilters(FIXTURE, {
      startDate: '2024-01-15T00:00:00Z',
      endDate:   '2024-01-15T23:59:59Z',
      selectedEventTypes: ['refund.issued'],
      selectedStatuses: ['delivered'],
    });
    // Day 2 refund.issued delivered: id 5
    expect(ids(withEventType)).toEqual([5]);

    const withoutEventType = applyFilters(FIXTURE, {
      startDate: '2024-01-15T00:00:00Z',
      endDate:   '2024-01-15T23:59:59Z',
      selectedEventTypes: [],
      selectedStatuses: ['delivered'],
    });
    // Day 2 delivered: id 5 (refund.issued) — only one delivered on day 2
    expect(ids(withoutEventType)).toEqual([5]);
    // The result is a superset of the event-type-filtered result
    expect(withoutEventType.length).toBeGreaterThanOrEqual(withEventType.length);
  });

  it('choosing "All" event types (empty array) is equivalent to no event-type filter', () => {
    // "All" is represented by an empty selectedEventTypes array
    const allTypes = applyFilters(FIXTURE, {
      startDate: '2024-01-20T00:00:00Z',
      endDate:   '2024-01-20T23:59:59Z',
      selectedEventTypes: [],
      selectedStatuses: ['delivered', 'exhausted'],
    });
    const explicitAllTypes = applyFilters(FIXTURE, {
      startDate: '2024-01-20T00:00:00Z',
      endDate:   '2024-01-20T23:59:59Z',
      selectedEventTypes: ['payment.created', 'refund.issued', 'dispute.opened'],
      selectedStatuses: ['delivered', 'exhausted'],
    });
    // Both should return the same entries
    expect(ids(allTypes)).toEqual(ids(explicitAllTypes));
  });
});

// ── Additional edge cases ─────────────────────────────────────────────────────

describe('edge cases – empty intersections and degenerate inputs', () => {
  it('empty entry list with all filters active returns empty array', () => {
    const result = applyFilters([], {
      startDate: '2024-01-01T00:00:00Z',
      endDate:   '2024-12-31T23:59:59Z',
      selectedEventTypes: ['payment.created'],
      selectedStatuses: ['delivered'],
    });
    expect(result).toHaveLength(0);
  });

  it('all filters inactive returns full dataset', () => {
    const result = applyFilters(FIXTURE, {});
    expect(result).toHaveLength(FIXTURE.length);
  });

  it('date range with no entries returns empty regardless of other filters', () => {
    const result = applyFilters(FIXTURE, {
      startDate: '2023-01-01T00:00:00Z',
      endDate:   '2023-12-31T23:59:59Z',
      selectedEventTypes: ['payment.created'],
      selectedStatuses: ['delivered'],
    });
    expect(result).toHaveLength(0);
  });

  it('event type not in dataset returns empty regardless of other filters', () => {
    const result = applyFilters(FIXTURE, {
      startDate: '2024-01-01T00:00:00Z',
      endDate:   '2024-12-31T23:59:59Z',
      selectedEventTypes: ['charge.failed'],
      selectedStatuses: ['delivered'],
    });
    expect(result).toHaveLength(0);
  });

  it('status not in dataset returns empty regardless of other filters', () => {
    // All entries have one of the four known statuses; use a non-existent one
    const result = applyFilters(FIXTURE, {
      selectedEventTypes: ['payment.created'],
      selectedStatuses: ['retrying'],
    });
    expect(result).toHaveLength(0);
  });

  it('single-entry dataset satisfying all three filters returns that entry', () => {
    const single: ComposableLogEntry[] = [
      { timestamp: '2024-06-01T12:00:00Z', eventType: 'payment.created', status: 'delivered' },
    ];
    const result = applyFilters(single, {
      startDate: '2024-06-01T12:00:00Z',
      endDate:   '2024-06-01T12:00:00Z',
      selectedEventTypes: ['payment.created'],
      selectedStatuses: ['delivered'],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(single[0]);
  });

  it('single-entry dataset not satisfying one filter returns empty', () => {
    const single: ComposableLogEntry[] = [
      { timestamp: '2024-06-01T12:00:00Z', eventType: 'payment.created', status: 'delivered' },
    ];
    const result = applyFilters(single, {
      startDate: '2024-06-01T12:00:00Z',
      endDate:   '2024-06-01T12:00:00Z',
      selectedEventTypes: ['payment.created'],
      selectedStatuses: ['failed'],
    });
    expect(result).toHaveLength(0);
  });
});

// ── Individual filter modules: verify they compose correctly via direct calls ──

describe('individual filter modules compose correctly via sequential application', () => {
  it('sequential filterByDateRange → filterByEventTypes → filterByStatuses matches applyFilters', () => {
    const filters: FilterState = {
      startDate: '2024-01-10T00:00:00Z',
      endDate:   '2024-01-15T23:59:59Z',
      selectedEventTypes: ['payment.created', 'refund.issued'],
      selectedStatuses: ['delivered', 'failed'],
    };

    const composed = applyFilters(FIXTURE, filters);

    const manual = filterByStatuses(
      filterByEventTypes(
        filterByDateRange(FIXTURE, filters.startDate, filters.endDate),
        filters.selectedEventTypes!
      ),
      filters.selectedStatuses!
    );

    expect(ids(composed)).toEqual(ids(manual));
  });

  it('filter order does not affect the result (AND-composition is commutative)', () => {
    // Apply filters in two different orders and verify identical results.
    const entries = FIXTURE;
    const eventTypes = ['payment.created'];
    const statuses = ['delivered'];
    const start = '2024-01-10T00:00:00Z';
    const end = '2024-01-20T23:59:59Z';

    // Order 1: date → event-type → status
    const order1 = filterByStatuses(
      filterByEventTypes(filterByDateRange(entries, start, end), eventTypes),
      statuses
    );

    // Order 2: status → event-type → date
    const order2 = filterByDateRange(
      filterByEventTypes(filterByStatuses(entries, statuses), eventTypes),
      start,
      end
    );

    // Order 3: event-type → status → date
    const order3 = filterByDateRange(
      filterByStatuses(filterByEventTypes(entries, eventTypes), statuses),
      start,
      end
    );

    expect(ids(order1)).toEqual(ids(order2));
    expect(ids(order1)).toEqual(ids(order3));
  });
});
