/**
 * Unit tests for Issue #289: Event-type filter clear/reset behaviour.
 *
 * Spec ref: spec § "Event log filtering — Event-type filter"
 *   "Clear / reset: deselecting all types, or choosing 'All', restores the
 *    full unfiltered view for this dimension."
 *   "Active-filter indicator: while a non-default selection is active, a
 *    visible indicator confirms the filter is active; a clear-all control
 *    removes it in one action."
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
 * These tests are intentionally scoped to the clear/reset path only.
 * Selection behaviour (single type, multiple types) is covered by #144/#166.
 * Filter composition (date-range + event-type + status) is out of scope.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { filterByEventTypes } from '../src/eventTypeFilter';
import {
  isEventTypeFilterActive,
  clearEventTypeFilter,
  renderEventTypeFilterIndicator,
} from '../src/eventTypeFilterIndicator';

// ── Fixture ───────────────────────────────────────────────────────────────────

/**
 * Representative log fixture: 6 entries across 3 event types.
 * Chosen so that filtering by any single type hides at least 2 entries,
 * making the "previously hidden entries reappear" assertion meaningful.
 */
const FIXTURE = [
  { id: 1, eventType: 'payment.created', status: 'delivered', timestamp: '2024-01-01T00:00:00Z' },
  { id: 2, eventType: 'refund.issued',   status: 'delivered', timestamp: '2024-01-01T01:00:00Z' },
  { id: 3, eventType: 'payment.created', status: 'failed',    timestamp: '2024-01-01T02:00:00Z' },
  { id: 4, eventType: 'dispute.opened',  status: 'pending',   timestamp: '2024-01-01T03:00:00Z' },
  { id: 5, eventType: 'refund.issued',   status: 'failed',    timestamp: '2024-01-01T04:00:00Z' },
  { id: 6, eventType: 'dispute.opened',  status: 'delivered', timestamp: '2024-01-01T05:00:00Z' },
];

// ── AC1: Deselecting all individually selected types restores the full log ────

describe('AC1 – deselecting all individually selected types restores the full log', () => {
  it('after deselecting a single selected type, all entries are visible', () => {
    // Start: one type selected → only 2 of 6 entries visible
    const filtered = filterByEventTypes(FIXTURE, ['payment.created']);
    expect(filtered).toHaveLength(2);

    // Deselect that type (remove it from the selection → empty array)
    const afterDeselect = filterByEventTypes(FIXTURE, []);
    expect(afterDeselect).toHaveLength(FIXTURE.length);
  });

  it('after deselecting two individually selected types, all entries are visible', () => {
    // Start: two types selected → 4 of 6 entries visible
    const filtered = filterByEventTypes(FIXTURE, ['payment.created', 'refund.issued']);
    expect(filtered).toHaveLength(4);

    // Deselect both types one by one until the selection is empty
    const afterDeselect = filterByEventTypes(FIXTURE, []);
    expect(afterDeselect).toHaveLength(FIXTURE.length);
  });

  it('after deselecting all three individually selected types, all entries are visible', () => {
    // Start: all three types explicitly selected
    const allThree = ['payment.created', 'refund.issued', 'dispute.opened'];
    const filtered = filterByEventTypes(FIXTURE, allThree);
    expect(filtered).toHaveLength(FIXTURE.length); // all visible when all selected

    // Deselect all three → empty selection → still all visible (no filter active)
    const afterDeselect = filterByEventTypes(FIXTURE, []);
    expect(afterDeselect).toHaveLength(FIXTURE.length);
  });

  it('deselecting all types produces the same result as never having filtered', () => {
    // Apply a filter, then clear it
    const filtered = filterByEventTypes(FIXTURE, ['dispute.opened']);
    expect(filtered).toHaveLength(2); // only dispute.opened entries

    const restored = filterByEventTypes(FIXTURE, []);
    // Restored result is identical to the unfiltered fixture
    expect(restored).toEqual(FIXTURE);
  });

  it('isEventTypeFilterActive returns false after all types are deselected', () => {
    // Simulate: user had types selected, then deselected all
    const selectedTypes: string[] = []; // result of deselecting all
    expect(isEventTypeFilterActive(selectedTypes)).toBe(false);
  });
});

// ── AC2: Choosing 'All' (empty selectedTypes) restores the full log ───────────

describe("AC2 – choosing 'All' restores the full unfiltered log", () => {
  it("'All' (empty selectedTypes) returns every entry regardless of prior filter", () => {
    // Prior filter: only refund.issued entries
    const filtered = filterByEventTypes(FIXTURE, ['refund.issued']);
    expect(filtered).toHaveLength(2);

    // Choose 'All' → empty selectedTypes
    const allEntries = filterByEventTypes(FIXTURE, []);
    expect(allEntries).toHaveLength(FIXTURE.length);
  });

  it("'All' returns the same reference as the input array (no copy overhead)", () => {
    // filterByEventTypes short-circuits and returns the original array when
    // selectedTypes is empty — this is the documented behaviour.
    const result = filterByEventTypes(FIXTURE, []);
    expect(result).toBe(FIXTURE);
  });

  it("clearEventTypeFilter() produces the 'All' state (empty array)", () => {
    const allState = clearEventTypeFilter();
    expect(allState).toEqual([]);
    expect(isEventTypeFilterActive(allState)).toBe(false);
  });

  it("filterByEventTypes with clearEventTypeFilter() result returns all entries", () => {
    // Simulate: user clicks 'All' → clearEventTypeFilter() is called
    const allState = clearEventTypeFilter();
    const result = filterByEventTypes(FIXTURE, allState);
    expect(result).toHaveLength(FIXTURE.length);
  });

  it("'All' works correctly after a multi-type selection", () => {
    // Prior filter: two types
    const filtered = filterByEventTypes(FIXTURE, ['payment.created', 'dispute.opened']);
    expect(filtered).toHaveLength(4);

    // Choose 'All'
    const restored = filterByEventTypes(FIXTURE, clearEventTypeFilter());
    expect(restored).toHaveLength(FIXTURE.length);
  });

  it("'All' works correctly on an empty log (edge case: zero deliveries)", () => {
    const result = filterByEventTypes([], []);
    expect(result).toHaveLength(0);
  });
});

// ── AC3: No active-filter indicator shown after clear/reset ───────────────────

describe('AC3 – no active-filter indicator shown after clear/reset', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('indicator is absent when selectedTypes is empty (default / all-types state)', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).toBeNull();
  });

  it('clear-all button is absent when selectedTypes is empty', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-clear-all]')).toBeNull();
  });

  it('container is completely empty after re-render with empty selection', () => {
    // First render: filter active
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    expect(container.innerHTML).not.toBe('');

    // Re-render after clear/reset
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(container.innerHTML).toBe('');
  });

  it('clicking the clear-all button and re-rendering removes the indicator', () => {
    let currentSelection = ['payment.created', 'refund.issued'];

    const onClearAll = vi.fn((newSel: string[]) => {
      currentSelection = newSel;
    });

    // Render with active filter
    renderEventTypeFilterIndicator(container, {
      selectedTypes: currentSelection,
      onClearAll,
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).not.toBeNull();

    // User clicks clear-all
    const btn = container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(onClearAll).toHaveBeenCalledWith([]);

    // Caller re-renders with the new (empty) selection
    renderEventTypeFilterIndicator(container, {
      selectedTypes: currentSelection, // now []
      onClearAll,
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).toBeNull();
    expect(container.querySelector('[data-event-type-filter-clear-all]')).toBeNull();
  });

  it('isEventTypeFilterActive returns false after clearEventTypeFilter()', () => {
    const cleared = clearEventTypeFilter();
    expect(isEventTypeFilterActive(cleared)).toBe(false);
  });
});

// ── AC4: Previously hidden log entries reappear after clear/reset ─────────────

describe('AC4 – previously hidden log entries reappear after clear/reset', () => {
  it('entries hidden by a single-type filter reappear after clearing to empty', () => {
    // Apply filter: only payment.created visible
    const filtered = filterByEventTypes(FIXTURE, ['payment.created']);
    const hiddenIds = FIXTURE
      .filter((e) => e.eventType !== 'payment.created')
      .map((e) => e.id);
    expect(hiddenIds).toHaveLength(4); // 4 entries were hidden

    // Confirm they are absent from the filtered result
    const filteredIds = filtered.map((e) => e.id);
    for (const id of hiddenIds) {
      expect(filteredIds).not.toContain(id);
    }

    // Clear the filter → all entries visible again
    const restored = filterByEventTypes(FIXTURE, []);
    const restoredIds = restored.map((e) => e.id);
    for (const id of hiddenIds) {
      expect(restoredIds).toContain(id);
    }
  });

  it('entries hidden by a multi-type filter reappear after clearing to empty', () => {
    // Apply filter: payment.created + refund.issued visible; dispute.opened hidden
    const filtered = filterByEventTypes(FIXTURE, ['payment.created', 'refund.issued']);
    const hiddenEntries = FIXTURE.filter((e) => e.eventType === 'dispute.opened');
    expect(hiddenEntries).toHaveLength(2);

    // Confirm dispute.opened entries are absent from filtered result
    expect(filtered.some((e) => e.eventType === 'dispute.opened')).toBe(false);

    // Clear the filter
    const restored = filterByEventTypes(FIXTURE, []);
    // dispute.opened entries are now visible
    expect(restored.some((e) => e.eventType === 'dispute.opened')).toBe(true);
    expect(restored.filter((e) => e.eventType === 'dispute.opened')).toHaveLength(2);
  });

  it('all specific entry IDs that were hidden are present in the restored result', () => {
    // Filter to a single type, record which IDs were hidden
    const selectedType = 'refund.issued';
    const filtered = filterByEventTypes(FIXTURE, [selectedType]);
    const visibleBeforeClear = filtered.map((e) => e.id);
    const hiddenBeforeClear = FIXTURE
      .filter((e) => !visibleBeforeClear.includes(e.id))
      .map((e) => e.id);

    expect(hiddenBeforeClear.length).toBeGreaterThan(0); // sanity check

    // Clear the filter
    const restored = filterByEventTypes(FIXTURE, clearEventTypeFilter());
    const restoredIds = restored.map((e) => e.id);

    // Every previously hidden entry is now present
    for (const id of hiddenBeforeClear) {
      expect(restoredIds).toContain(id);
    }
  });

  it('the restored result contains exactly the same entries as the original fixture', () => {
    // Apply a filter that hides some entries
    const filtered = filterByEventTypes(FIXTURE, ['dispute.opened']);
    expect(filtered.length).toBeLessThan(FIXTURE.length);

    // Clear the filter
    const restored = filterByEventTypes(FIXTURE, []);

    // Restored result is identical to the original fixture (same entries, same order)
    expect(restored).toHaveLength(FIXTURE.length);
    expect(restored.map((e) => e.id)).toEqual(FIXTURE.map((e) => e.id));
  });

  it('entries reappear after choosing All via clearEventTypeFilter()', () => {
    // Simulate the full user journey:
    // 1. User selects 'payment.created' → some entries hidden
    const step1 = filterByEventTypes(FIXTURE, ['payment.created']);
    expect(step1.length).toBeLessThan(FIXTURE.length);

    // 2. User clicks 'All' → clearEventTypeFilter() is called
    const allState = clearEventTypeFilter();

    // 3. Log is re-filtered with the new state
    const step3 = filterByEventTypes(FIXTURE, allState);

    // 4. All entries are visible again
    expect(step3).toHaveLength(FIXTURE.length);
    // Including entries that were previously hidden
    const previouslyHiddenTypes = ['refund.issued', 'dispute.opened'];
    for (const type of previouslyHiddenTypes) {
      expect(step3.some((e) => e.eventType === type)).toBe(true);
    }
  });

  it('edge case: clearing a filter on an empty log returns an empty array', () => {
    const filtered = filterByEventTypes([], ['payment.created']);
    expect(filtered).toHaveLength(0);

    const restored = filterByEventTypes([], []);
    expect(restored).toHaveLength(0);
  });

  it('edge case: clearing a filter when all entries matched still returns all entries', () => {
    // Filter that matches all entries (all three types selected)
    const allTypes = ['payment.created', 'refund.issued', 'dispute.opened'];
    const filtered = filterByEventTypes(FIXTURE, allTypes);
    expect(filtered).toHaveLength(FIXTURE.length);

    // Clear the filter → still all entries
    const restored = filterByEventTypes(FIXTURE, []);
    expect(restored).toHaveLength(FIXTURE.length);
  });
});
