/**
 * Supplemental unit tests for Issue #289: Event-type filter clear/reset
 * behaviour — additional coverage for filter composition and boundary cases.
 *
 * Spec ref: spec § "Event log filtering — Event-type filter"
 *   "Filter composition: the event-type filter works correctly in combination
 *    with date-range and status filters."
 *   "Clear / reset: deselecting all types, or choosing 'All', restores the
 *    full unfiltered view for this dimension."
 *
 * Acceptance criteria covered:
 *   AC1 – deselecting all individually selected event types restores the full
 *          unfiltered log (all entries visible).
 *   AC2 – choosing the 'All' option (empty selectedTypes) restores the full
 *          unfiltered log.
 *   AC3 – after a clear/reset action, no active-filter indicator is shown for
 *          the event-type dimension.
 *   AC4 – after a clear/reset action, previously hidden log entries reappear.
 *
 * These tests complement tests/issue289-event-type-filter-clear-reset.test.ts
 * with filter-composition scenarios and additional boundary cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { filterByEventTypes } from '../src/eventTypeFilter';
import {
  isEventTypeFilterActive,
  clearEventTypeFilter,
  renderEventTypeFilterIndicator,
} from '../src/eventTypeFilterIndicator';
import { filterByDateRange, clearDateRangeFilter } from '../src/dateRangeFilter';

// ── Fixture ───────────────────────────────────────────────────────────────────

/**
 * Extended fixture: 9 entries across 3 event types and 3 status values,
 * spanning a 24-hour window. Designed to exercise filter composition.
 */
const FIXTURE = [
  { id: 1,  eventType: 'payment.created', status: 'delivered', timestamp: '2024-03-01T00:00:00Z' },
  { id: 2,  eventType: 'refund.issued',   status: 'failed',    timestamp: '2024-03-01T02:00:00Z' },
  { id: 3,  eventType: 'dispute.opened',  status: 'pending',   timestamp: '2024-03-01T04:00:00Z' },
  { id: 4,  eventType: 'payment.created', status: 'failed',    timestamp: '2024-03-01T08:00:00Z' },
  { id: 5,  eventType: 'refund.issued',   status: 'delivered', timestamp: '2024-03-01T10:00:00Z' },
  { id: 6,  eventType: 'dispute.opened',  status: 'delivered', timestamp: '2024-03-01T12:00:00Z' },
  { id: 7,  eventType: 'payment.created', status: 'pending',   timestamp: '2024-03-01T16:00:00Z' },
  { id: 8,  eventType: 'refund.issued',   status: 'pending',   timestamp: '2024-03-01T20:00:00Z' },
  { id: 9,  eventType: 'dispute.opened',  status: 'failed',    timestamp: '2024-03-01T23:00:00Z' },
];

// ── AC1 supplemental: deselecting all types — additional boundary cases ───────

describe('AC1 supplemental – deselecting all types: boundary and ordering', () => {
  it('restored result preserves original entry order', () => {
    // Apply a filter that reorders nothing but hides some entries
    const filtered = filterByEventTypes(FIXTURE, ['refund.issued']);
    expect(filtered.map((e) => e.id)).toEqual([2, 5, 8]);

    // Clear the filter — order must match the original fixture
    const restored = filterByEventTypes(FIXTURE, []);
    expect(restored.map((e) => e.id)).toEqual(FIXTURE.map((e) => e.id));
  });

  it('deselecting the only selected type when log has a single entry restores that entry', () => {
    const singleEntry = [FIXTURE[0]];
    const filtered = filterByEventTypes(singleEntry, ['payment.created']);
    expect(filtered).toHaveLength(1);

    const restored = filterByEventTypes(singleEntry, []);
    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe(1);
  });

  it('deselecting all types when no entries match the prior filter still returns all entries', () => {
    // Filter for a type that has no entries in the fixture
    const filtered = filterByEventTypes(FIXTURE, ['charge.disputed']);
    expect(filtered).toHaveLength(0);

    // Clear the filter — all original entries should be visible
    const restored = filterByEventTypes(FIXTURE, []);
    expect(restored).toHaveLength(FIXTURE.length);
  });

  it('isEventTypeFilterActive transitions from true to false when all types deselected', () => {
    let selectedTypes = ['payment.created', 'refund.issued'];
    expect(isEventTypeFilterActive(selectedTypes)).toBe(true);

    // Deselect one type
    selectedTypes = selectedTypes.filter((t) => t !== 'payment.created');
    expect(isEventTypeFilterActive(selectedTypes)).toBe(true); // still one type

    // Deselect the last type
    selectedTypes = selectedTypes.filter((t) => t !== 'refund.issued');
    expect(isEventTypeFilterActive(selectedTypes)).toBe(false); // now inactive
  });
});

// ── AC2 supplemental: 'All' option — additional scenarios ────────────────────

describe("AC2 supplemental – 'All' option: additional scenarios", () => {
  it("'All' after a filter that matched zero entries still returns all entries", () => {
    // Filter for a non-existent type
    const filtered = filterByEventTypes(FIXTURE, ['nonexistent.type']);
    expect(filtered).toHaveLength(0);

    // Choose 'All'
    const restored = filterByEventTypes(FIXTURE, []);
    expect(restored).toHaveLength(FIXTURE.length);
  });

  it("'All' is equivalent to never having applied a filter (referential equality)", () => {
    // When no filter is active, filterByEventTypes returns the original array
    const noFilter = filterByEventTypes(FIXTURE, []);
    expect(noFilter).toBe(FIXTURE); // same reference — no copy

    // After applying and clearing a filter, the same short-circuit applies
    const afterClear = filterByEventTypes(FIXTURE, clearEventTypeFilter());
    expect(afterClear).toBe(FIXTURE);
  });

  it("clearEventTypeFilter() always returns a fresh empty array (no shared state)", () => {
    const a = clearEventTypeFilter();
    const b = clearEventTypeFilter();
    // Both are empty arrays but not the same reference
    expect(a).toEqual([]);
    expect(b).toEqual([]);
    expect(a).not.toBe(b);
    // Mutating one does not affect the other
    a.push('payment.created');
    expect(b).toHaveLength(0);
  });

  it("'All' works correctly when the fixture has duplicate event types", () => {
    const withDuplicates = [
      { id: 1, eventType: 'payment.created', status: 'delivered', timestamp: '2024-01-01T00:00:00Z' },
      { id: 2, eventType: 'payment.created', status: 'failed',    timestamp: '2024-01-01T01:00:00Z' },
      { id: 3, eventType: 'payment.created', status: 'pending',   timestamp: '2024-01-01T02:00:00Z' },
    ];
    const filtered = filterByEventTypes(withDuplicates, ['refund.issued']);
    expect(filtered).toHaveLength(0);

    const restored = filterByEventTypes(withDuplicates, []);
    expect(restored).toHaveLength(3);
  });
});

// ── AC3 supplemental: indicator state transitions ─────────────────────────────

describe('AC3 supplemental – indicator state transitions', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('indicator transitions: inactive → active → inactive (full round-trip)', () => {
    // Step 1: inactive (no filter)
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).toBeNull();

    // Step 2: active (filter applied)
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).not.toBeNull();

    // Step 3: inactive again (filter cleared)
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('indicator transitions: active with 1 type → active with 2 types → cleared', () => {
    // 1 type selected
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    let indicator = container.querySelector('[data-event-type-filter-indicator]');
    expect(indicator?.textContent).toContain('1');

    // 2 types selected
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued'],
      onClearAll: vi.fn(),
    });
    indicator = container.querySelector('[data-event-type-filter-indicator]');
    expect(indicator?.textContent).toContain('2');

    // Cleared
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).toBeNull();
  });

  it('clear-all button calls onClearAll with [] regardless of how many types were selected', () => {
    const onClearAll = vi.fn();
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued', 'dispute.opened'],
      onClearAll,
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
    expect(onClearAll).toHaveBeenCalledWith([]);
  });

  it('after clear-all, isEventTypeFilterActive is false for the value passed to onClearAll', () => {
    let receivedSelection: string[] = ['placeholder'];
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['dispute.opened'],
      onClearAll: (newSel) => { receivedSelection = newSel; },
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(isEventTypeFilterActive(receivedSelection)).toBe(false);
  });
});

// ── AC4 supplemental: filter composition — event-type + date-range ────────────

describe('AC4 supplemental – filter composition: event-type clear/reset with date-range filter', () => {
  it('clearing event-type filter while date-range filter is active restores all event types within the date range', () => {
    // Apply date-range filter: entries from 08:00 to 16:00
    const dateFiltered = filterByDateRange(FIXTURE, {
      start: '2024-03-01T08:00:00Z',
      end: '2024-03-01T16:00:00Z',
    });
    // IDs 4 (08:00), 5 (10:00), 6 (12:00), 7 (16:00) — 4 entries
    expect(dateFiltered.map((e) => e.id)).toEqual([4, 5, 6, 7]);

    // Additionally filter by event type within that date range
    const bothFiltered = filterByEventTypes(dateFiltered, ['payment.created']);
    // Only IDs 4 and 7 are payment.created within the date range
    expect(bothFiltered.map((e) => e.id)).toEqual([4, 7]);

    // Clear the event-type filter (keep date-range filter active)
    const eventTypeCleared = filterByEventTypes(dateFiltered, clearEventTypeFilter());
    // All 4 entries within the date range are now visible again
    expect(eventTypeCleared.map((e) => e.id)).toEqual([4, 5, 6, 7]);
    // Including the previously hidden refund.issued and dispute.opened entries
    expect(eventTypeCleared.some((e) => e.eventType === 'refund.issued')).toBe(true);
    expect(eventTypeCleared.some((e) => e.eventType === 'dispute.opened')).toBe(true);
  });

  it('clearing event-type filter does not affect the date-range filter state', () => {
    const dateRange = { start: '2024-03-01T08:00:00Z', end: '2024-03-01T16:00:00Z' };

    // Simulate composed filter state
    let filterState = {
      selectedTypes: ['payment.created'],
      dateRange,
    };

    // Clear only the event-type dimension
    filterState = { ...filterState, selectedTypes: clearEventTypeFilter() };

    // Event-type filter is cleared
    expect(isEventTypeFilterActive(filterState.selectedTypes)).toBe(false);

    // Date-range filter is unchanged
    expect(filterState.dateRange).toEqual(dateRange);
    expect(filterState.dateRange.start).toBe('2024-03-01T08:00:00Z');
    expect(filterState.dateRange.end).toBe('2024-03-01T16:00:00Z');
  });

  it('clearing date-range filter does not affect the event-type filter state', () => {
    // Simulate composed filter state
    let filterState = {
      selectedTypes: ['payment.created', 'refund.issued'],
      dateRange: { start: '2024-03-01T08:00:00Z', end: '2024-03-01T16:00:00Z' },
    };

    // Clear only the date-range dimension
    filterState = { ...filterState, dateRange: clearDateRangeFilter() };

    // Date-range filter is cleared
    expect(filterState.dateRange).toEqual({ start: '', end: '' });

    // Event-type filter is unchanged
    expect(filterState.selectedTypes).toEqual(['payment.created', 'refund.issued']);
    expect(isEventTypeFilterActive(filterState.selectedTypes)).toBe(true);
  });

  it('clearing both filters independently restores the full unfiltered log', () => {
    // Simulate a stateful filter pipeline: the caller always re-applies all
    // active filters to the original FIXTURE on each state change.
    let activeTypes = ['payment.created'];
    let activeDateRange = { start: '2024-03-01T08:00:00Z', end: '2024-03-01T16:00:00Z' };

    // Both filters active: apply date-range then event-type to FIXTURE
    const bothFiltered = filterByEventTypes(
      filterByDateRange(FIXTURE, activeDateRange),
      activeTypes
    );
    expect(bothFiltered.length).toBeLessThan(FIXTURE.length);

    // Clear event-type filter (keep date-range active)
    activeTypes = clearEventTypeFilter();
    const eventTypeCleared = filterByEventTypes(
      filterByDateRange(FIXTURE, activeDateRange),
      activeTypes
    );
    expect(eventTypeCleared.length).toBeGreaterThan(bothFiltered.length);
    expect(isEventTypeFilterActive(activeTypes)).toBe(false);

    // Clear date-range filter too
    activeDateRange = clearDateRangeFilter();
    const fullyRestored = filterByEventTypes(
      filterByDateRange(FIXTURE, activeDateRange),
      activeTypes
    );
    expect(fullyRestored).toHaveLength(FIXTURE.length);
    expect(fullyRestored.map((e) => e.id)).toEqual(FIXTURE.map((e) => e.id));
  });

  it('previously hidden entries (by event-type filter) reappear when event-type is cleared, even with date-range active', () => {
    // Date range covers the full fixture
    const dateFiltered = filterByDateRange(FIXTURE, {
      start: '2024-03-01T00:00:00Z',
      end: '2024-03-01T23:59:59Z',
    });
    expect(dateFiltered).toHaveLength(FIXTURE.length);

    // Apply event-type filter: only dispute.opened
    const eventFiltered = filterByEventTypes(dateFiltered, ['dispute.opened']);
    const hiddenIds = FIXTURE
      .filter((e) => e.eventType !== 'dispute.opened')
      .map((e) => e.id);
    expect(hiddenIds.length).toBeGreaterThan(0);

    // Confirm hidden entries are absent
    const visibleIds = eventFiltered.map((e) => e.id);
    for (const id of hiddenIds) {
      expect(visibleIds).not.toContain(id);
    }

    // Clear event-type filter
    const restored = filterByEventTypes(dateFiltered, clearEventTypeFilter());

    // Previously hidden entries are now visible
    const restoredIds = restored.map((e) => e.id);
    for (const id of hiddenIds) {
      expect(restoredIds).toContain(id);
    }
  });
});

// ── AC1–AC4 combined: full user journey simulation ────────────────────────────

describe('AC1–AC4 combined – full user journey: select, filter, clear, verify', () => {
  it('simulates a complete select → filter → clear → restore cycle', () => {
    // Step 1: No filter active — all entries visible (AC2 baseline)
    let visibleEntries = filterByEventTypes(FIXTURE, []);
    expect(visibleEntries).toHaveLength(FIXTURE.length);
    expect(isEventTypeFilterActive([])).toBe(false);

    // Step 2: User selects 'payment.created' — some entries hidden (AC4 setup)
    const selectedTypes = ['payment.created'];
    visibleEntries = filterByEventTypes(FIXTURE, selectedTypes);
    expect(visibleEntries.length).toBeLessThan(FIXTURE.length);
    expect(isEventTypeFilterActive(selectedTypes)).toBe(true);

    // Record which entries were hidden
    const hiddenIds = FIXTURE
      .filter((e) => !visibleEntries.some((v) => v.id === e.id))
      .map((e) => e.id);
    expect(hiddenIds.length).toBeGreaterThan(0);

    // Step 3: User deselects all types (AC1) — full log restored (AC4)
    const clearedTypes = clearEventTypeFilter(); // AC2: 'All' state
    visibleEntries = filterByEventTypes(FIXTURE, clearedTypes);
    expect(visibleEntries).toHaveLength(FIXTURE.length);
    expect(isEventTypeFilterActive(clearedTypes)).toBe(false); // AC3

    // Step 4: Previously hidden entries are now visible (AC4)
    const restoredIds = visibleEntries.map((e) => e.id);
    for (const id of hiddenIds) {
      expect(restoredIds).toContain(id);
    }
  });

  it('simulates multiple select/clear cycles without state leakage', () => {
    // Cycle 1: select payment.created, then clear
    let types = ['payment.created'];
    let filtered = filterByEventTypes(FIXTURE, types);
    expect(filtered.length).toBeLessThan(FIXTURE.length);
    let cleared = filterByEventTypes(FIXTURE, clearEventTypeFilter());
    expect(cleared).toHaveLength(FIXTURE.length);

    // Cycle 2: select refund.issued, then clear
    types = ['refund.issued'];
    filtered = filterByEventTypes(FIXTURE, types);
    expect(filtered.length).toBeLessThan(FIXTURE.length);
    cleared = filterByEventTypes(FIXTURE, clearEventTypeFilter());
    expect(cleared).toHaveLength(FIXTURE.length);

    // Cycle 3: select all three types, then clear
    types = ['payment.created', 'refund.issued', 'dispute.opened'];
    filtered = filterByEventTypes(FIXTURE, types);
    expect(filtered).toHaveLength(FIXTURE.length); // all types selected = all visible
    cleared = filterByEventTypes(FIXTURE, clearEventTypeFilter());
    expect(cleared).toHaveLength(FIXTURE.length);

    // After all cycles, the fixture is unchanged
    expect(FIXTURE).toHaveLength(9);
  });
});
