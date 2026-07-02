/**
 * Supplementary unit tests for Issue #171:
 * Active-filter indicator and clear-all control for the event-type filter.
 *
 * These tests complement the primary suite in eventTypeFilterIndicator.test.ts
 * with additional edge-case and integration coverage:
 *
 *   AC1  – indicator visible when ≥1 type selected (edge: large set, duplicates)
 *   AC2  – indicator NOT shown when no filter applied
 *   AC3  – clear-all control rendered alongside indicator
 *   AC4  – clear-all resets to default in one action (no confirmation)
 *   AC5  – after clear-all, indicator disappears and full log is restored
 *   AC6  – clearing event-type only does not affect date-range / status filters
 *   AC7  – mandated unit-test cases (≥1 selected, all cleared, clear-all resets)
 *   AC8  – clear-all button has aria-label; indicator has role/aria-live
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isEventTypeFilterActive,
  getActiveEventTypeCount,
  clearEventTypeFilter,
  renderEventTypeFilterIndicator,
} from '../src/eventTypeFilterIndicator';
import { filterByEventTypes } from '../src/eventTypeFilter';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContainer(): HTMLElement {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return div;
}

// ── AC1 / AC2 / AC7: isEventTypeFilterActive edge cases ──────────────────────

describe('isEventTypeFilterActive – edge cases (AC1/AC2/AC7)', () => {
  it('AC2/AC7b – returns false for an empty array (default / all-types state)', () => {
    expect(isEventTypeFilterActive([])).toBe(false);
  });

  it('AC1/AC7a – returns true for a single selected type', () => {
    expect(isEventTypeFilterActive(['payment.created'])).toBe(true);
  });

  it('AC1 – returns true for a large selection (10 types)', () => {
    const types = Array.from({ length: 10 }, (_, i) => `event.type${i}`);
    expect(isEventTypeFilterActive(types)).toBe(true);
  });

  it('AC1 – returns true even when the array contains duplicate entries', () => {
    // Callers should normalise duplicates, but the helper must not crash
    expect(isEventTypeFilterActive(['payment.created', 'payment.created'])).toBe(true);
  });
});

// ── getActiveEventTypeCount edge cases ────────────────────────────────────────

describe('getActiveEventTypeCount – edge cases', () => {
  it('returns 0 for an empty array', () => {
    expect(getActiveEventTypeCount([])).toBe(0);
  });

  it('returns the exact length of the array', () => {
    const types = ['a', 'b', 'c', 'd', 'e'];
    expect(getActiveEventTypeCount(types)).toBe(5);
  });
});

// ── clearEventTypeFilter – AC4/AC7c ──────────────────────────────────────────

describe('clearEventTypeFilter – AC4/AC7c', () => {
  it('AC7c – returns an empty array (the default state)', () => {
    expect(clearEventTypeFilter()).toEqual([]);
  });

  it('AC4 – result is immediately inactive (no confirmation step needed)', () => {
    const result = clearEventTypeFilter();
    expect(isEventTypeFilterActive(result)).toBe(false);
  });

  it('AC4 – does not mutate the previously selected array', () => {
    const before = ['payment.created', 'refund.issued'];
    const snapshot = [...before];
    clearEventTypeFilter();
    expect(before).toEqual(snapshot);
  });

  it('returns a fresh array on every call (no shared reference)', () => {
    const a = clearEventTypeFilter();
    const b = clearEventTypeFilter();
    expect(a).not.toBe(b);
  });
});

// ── DOM rendering: AC1 / AC2 / AC3 / AC5 / AC7 ───────────────────────────────

describe('renderEventTypeFilterIndicator – DOM rendering', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    container.remove();
  });

  // AC2 / AC7b ─────────────────────────────────────────────────────────────

  it('AC2/AC7b – container is empty when selectedTypes is empty', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(container.innerHTML).toBe('');
  });

  it('AC2 – no indicator element when filter is inactive', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).toBeNull();
  });

  it('AC2 – no clear-all button when filter is inactive', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-clear-all]')).toBeNull();
  });

  // AC1 / AC7a ─────────────────────────────────────────────────────────────

  it('AC1/AC7a – indicator element is present when one type is selected', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).not.toBeNull();
  });

  it('AC1 – indicator element is present when three types are selected', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued', 'dispute.opened'],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).not.toBeNull();
  });

  it('AC1 – indicator text includes the count (singular: "1 event type selected")', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-event-type-filter-indicator]');
    expect(indicator?.textContent).toMatch(/1\s+event\s+type\s+selected/);
  });

  it('AC1 – indicator text includes the count (plural: "3 event types selected")', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued', 'dispute.opened'],
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-event-type-filter-indicator]');
    expect(indicator?.textContent).toMatch(/3\s+event\s+types\s+selected/);
  });

  // AC3 ────────────────────────────────────────────────────────────────────

  it('AC3 – clear-all button is rendered alongside the indicator when active', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-event-type-filter-indicator]');
    const btn = container.querySelector('[data-event-type-filter-clear-all]');
    expect(indicator).not.toBeNull();
    expect(btn).not.toBeNull();
    // Both are children of the same container
    expect(container.contains(indicator)).toBe(true);
    expect(container.contains(btn)).toBe(true);
  });

  // AC5 ────────────────────────────────────────────────────────────────────

  it('AC5 – indicator disappears after re-render with empty selection', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    // Confirm it was there
    expect(container.querySelector('[data-event-type-filter-indicator]')).not.toBeNull();

    // Simulate caller re-rendering after clear-all
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).toBeNull();
    expect(container.querySelector('[data-event-type-filter-clear-all]')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('AC5 – full log is restored for event-type dimension after clear (filterByEventTypes)', () => {
    const entries = [
      { eventType: 'payment.created', id: 1 },
      { eventType: 'refund.issued', id: 2 },
      { eventType: 'dispute.opened', id: 3 },
    ];

    // With filter active
    const filtered = filterByEventTypes(entries, ['payment.created']);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(1);

    // After clear-all: empty selectedTypes → full list returned
    const cleared = clearEventTypeFilter();
    const restored = filterByEventTypes(entries, cleared);
    expect(restored).toHaveLength(3);
    expect(restored).toEqual(entries);
  });
});

// ── AC4 / AC7c: clear-all resets in one action ────────────────────────────────

describe('renderEventTypeFilterIndicator – clear-all action (AC4/AC7c)', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    container.remove();
  });

  it('AC4/AC7c – single click on clear-all calls onClearAll exactly once', () => {
    const onClearAll = vi.fn();
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued'],
      onClearAll,
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('AC4 – onClearAll receives an empty array (the default state)', () => {
    const onClearAll = vi.fn();
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll,
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(onClearAll).toHaveBeenCalledWith([]);
  });

  it('AC4 – result passed to onClearAll is inactive (isEventTypeFilterActive returns false)', () => {
    let received: string[] = ['sentinel'];
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: (newSel) => { received = newSel; },
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(isEventTypeFilterActive(received)).toBe(false);
  });

  it('AC4 – no second click / confirmation step is required to complete the reset', () => {
    // The reset must be a single action: one click, no dialog, no second button
    const onClearAll = vi.fn();
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued', 'dispute.opened'],
      onClearAll,
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    // onClearAll was called immediately — no pending confirmation
    expect(onClearAll).toHaveBeenCalledTimes(1);
    expect(onClearAll.mock.calls[0][0]).toEqual([]);
  });
});

// ── AC6: filter composition — clearing event-type does not affect other filters

describe('filter composition (AC6)', () => {
  it('AC6 – clearEventTypeFilter does not touch date-range filter state', () => {
    const state = {
      selectedTypes: ['payment.created'],
      dateRange: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
    };
    const newState = { ...state, selectedTypes: clearEventTypeFilter() };
    expect(newState.selectedTypes).toEqual([]);
    expect(newState.dateRange).toEqual(state.dateRange);
  });

  it('AC6 – clearEventTypeFilter does not touch status filter state', () => {
    const state = {
      selectedTypes: ['refund.issued'],
      status: 'failed' as const,
    };
    const newState = { ...state, selectedTypes: clearEventTypeFilter() };
    expect(newState.selectedTypes).toEqual([]);
    expect(newState.status).toBe('failed');
  });

  it('AC6 – clearing event-type while date-range is active: date-range entries still filtered', () => {
    const entries = [
      { eventType: 'payment.created', timestamp: '2024-01-15T10:00', id: 1 },
      { eventType: 'refund.issued',   timestamp: '2024-02-10T10:00', id: 2 },
      { eventType: 'payment.created', timestamp: '2024-02-20T10:00', id: 3 },
    ];

    // Simulate: event-type filter was ['payment.created'], now cleared
    const clearedTypes = clearEventTypeFilter();
    // filterByEventTypes with empty array returns all entries (no event-type filter)
    const afterEventTypeClear = filterByEventTypes(entries, clearedTypes);
    expect(afterEventTypeClear).toHaveLength(3);

    // Date-range filter is still applied independently by the caller
    const dateFiltered = afterEventTypeClear.filter(
      (e) => e.timestamp >= '2024-02-01T00:00' && e.timestamp <= '2024-02-28T23:59'
    );
    expect(dateFiltered).toHaveLength(2);
    expect(dateFiltered.map((e) => e.id)).toEqual([2, 3]);
  });

  it('AC6 – onClearAll callback receives only the event-type slice (empty array)', () => {
    const container = makeContainer();
    let capturedArg: unknown = 'not-called';
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: (newSel) => { capturedArg = newSel; },
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    // The callback receives only the new event-type selection — an empty array
    expect(capturedArg).toEqual([]);
    container.remove();
  });
});

// ── AC8: accessibility ────────────────────────────────────────────────────────

describe('accessibility (AC8)', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    container.remove();
  });

  it('AC8 – clear-all button is a native <button> (keyboard-focusable by default)', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]');
    expect(btn?.tagName.toLowerCase()).toBe('button');
  });

  it('AC8 – clear-all button has type="button" (prevents accidental form submission)', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement | null;
    expect(btn?.type).toBe('button');
  });

  it('AC8 – clear-all button has a non-empty aria-label (default)', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]');
    const label = btn?.getAttribute('aria-label');
    expect(label).toBeTruthy();
    expect(label!.length).toBeGreaterThan(0);
  });

  it('AC8 – clear-all button uses the caller-supplied aria-label', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
      clearAllAriaLabel: 'Remove active event-type filter',
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]');
    expect(btn?.getAttribute('aria-label')).toBe('Remove active event-type filter');
  });

  it('AC8 – indicator has role="status" for screen-reader announcements', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-event-type-filter-indicator]');
    expect(indicator?.getAttribute('role')).toBe('status');
  });

  it('AC8 – indicator has aria-live="polite" for non-intrusive announcements', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-event-type-filter-indicator]');
    expect(indicator?.getAttribute('aria-live')).toBe('polite');
  });
});

// ── Idempotency / re-render stability ─────────────────────────────────────────

describe('renderEventTypeFilterIndicator – idempotency', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    container.remove();
  });

  it('repeated renders with the same active state produce exactly one indicator', () => {
    const opts = { selectedTypes: ['payment.created'], onClearAll: vi.fn() };
    renderEventTypeFilterIndicator(container, opts);
    renderEventTypeFilterIndicator(container, opts);
    renderEventTypeFilterIndicator(container, opts);
    expect(container.querySelectorAll('[data-event-type-filter-indicator]')).toHaveLength(1);
  });

  it('repeated renders with the same active state produce exactly one clear-all button', () => {
    const opts = { selectedTypes: ['payment.created'], onClearAll: vi.fn() };
    renderEventTypeFilterIndicator(container, opts);
    renderEventTypeFilterIndicator(container, opts);
    expect(container.querySelectorAll('[data-event-type-filter-clear-all]')).toHaveLength(1);
  });

  it('toggling active → inactive → active produces correct DOM each time', () => {
    // Active
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).not.toBeNull();

    // Inactive
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).toBeNull();

    // Active again
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['refund.issued'],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).not.toBeNull();
    expect(container.querySelectorAll('[data-event-type-filter-indicator]')).toHaveLength(1);
  });
});
