/**
 * Verification tests for Issue #171: Active-filter indicator and clear-all
 * control for the event-type filter.
 *
 * These tests provide independent, focused coverage of each acceptance
 * criterion, complementing the broader suites in:
 *   - tests/eventTypeFilterIndicator.test.ts
 *   - tests/issue171-active-filter-indicator.test.ts
 *
 * Spec ref: spec § "Event log filtering — Event-type filter"
 *   "Active-filter indicator: while a non-default selection is active, a
 *    visible indicator confirms the filter is active; a clear-all control
 *    removes it in one action."
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
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

// ── AC1: Visible indicator rendered when ≥1 event types selected ──────────────

describe('AC1 – visible indicator when ≥1 event types selected', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('indicator element exists in the DOM when exactly one type is selected', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).not.toBeNull();
  });

  it('indicator element exists in the DOM when two types are selected', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued'],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).not.toBeNull();
  });

  it('indicator text is non-empty (visible to users)', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-event-type-filter-indicator]');
    expect(indicator?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('indicator text mentions the count of selected types', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued', 'dispute.opened'],
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-event-type-filter-indicator]');
    expect(indicator?.textContent).toContain('3');
  });

  it('isEventTypeFilterActive returns true for any non-empty selection', () => {
    expect(isEventTypeFilterActive(['payment.created'])).toBe(true);
    expect(isEventTypeFilterActive(['a', 'b', 'c'])).toBe(true);
  });
});

// ── AC2: Indicator NOT shown when no filter applied ───────────────────────────

describe('AC2 – indicator NOT shown when no filter applied', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('container is completely empty when selectedTypes is []', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(container.innerHTML).toBe('');
  });

  it('no indicator element in DOM when selectedTypes is []', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).toBeNull();
  });

  it('isEventTypeFilterActive returns false for empty array', () => {
    expect(isEventTypeFilterActive([])).toBe(false);
  });

  it('getActiveEventTypeCount returns 0 for empty array', () => {
    expect(getActiveEventTypeCount([])).toBe(0);
  });
});

// ── AC3: Clear-all control rendered alongside indicator when active ────────────

describe('AC3 – clear-all control rendered alongside indicator when active', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('clear-all button is present in the DOM when filter is active', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-clear-all]')).not.toBeNull();
  });

  it('clear-all button is absent when filter is inactive', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-clear-all]')).toBeNull();
  });

  it('both indicator and clear-all button are children of the same container', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-event-type-filter-indicator]');
    const btn = container.querySelector('[data-event-type-filter-clear-all]');
    expect(container.contains(indicator)).toBe(true);
    expect(container.contains(btn)).toBe(true);
  });
});

// ── AC4: Clear-all resets to default in one action, no confirmation ───────────

describe('AC4 – clear-all resets to default in one action', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('a single click on the clear-all button triggers onClearAll', () => {
    const onClearAll = vi.fn();
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll,
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('onClearAll is called with an empty array (the default state)', () => {
    const onClearAll = vi.fn();
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued'],
      onClearAll,
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(onClearAll).toHaveBeenCalledWith([]);
  });

  it('clearEventTypeFilter() returns an empty array (the default state)', () => {
    expect(clearEventTypeFilter()).toEqual([]);
  });

  it('the result of clearEventTypeFilter() is immediately inactive', () => {
    expect(isEventTypeFilterActive(clearEventTypeFilter())).toBe(false);
  });

  it('no second click or confirmation is needed — onClearAll fires on first click', () => {
    const onClearAll = vi.fn();
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll,
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement;
    // One click is sufficient
    btn.click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
    // No pending state — the call happened synchronously
    expect(onClearAll.mock.calls[0][0]).toEqual([]);
  });
});

// ── AC5: After clear-all, indicator disappears and full log restored ───────────

describe('AC5 – after clear-all, indicator disappears and full log restored', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('re-rendering with empty selection removes the indicator element', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    // Confirm indicator was rendered
    expect(container.querySelector('[data-event-type-filter-indicator]')).not.toBeNull();

    // Caller re-renders after clear-all
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).toBeNull();
  });

  it('re-rendering with empty selection removes the clear-all button', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-clear-all]')).toBeNull();
  });

  it('container is empty after re-render with empty selection', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(container.innerHTML).toBe('');
  });

  it('filterByEventTypes returns all entries when selectedTypes is cleared to []', () => {
    const entries = [
      { eventType: 'payment.created', id: 1 },
      { eventType: 'refund.issued', id: 2 },
      { eventType: 'dispute.opened', id: 3 },
    ];
    // Before clear: only payment.created entries
    const filtered = filterByEventTypes(entries, ['payment.created']);
    expect(filtered).toHaveLength(1);

    // After clear: all entries returned
    const restored = filterByEventTypes(entries, clearEventTypeFilter());
    expect(restored).toHaveLength(3);
  });
});

// ── AC6: Clearing event-type only does not affect other active filters ─────────

describe('AC6 – clearing event-type filter does not affect other filters', () => {
  it('clearEventTypeFilter does not mutate or return date-range state', () => {
    const dateRange = { start: '2024-01-01T00:00', end: '2024-01-31T23:59' };
    const state = { selectedTypes: ['payment.created'], dateRange };
    const newState = { ...state, selectedTypes: clearEventTypeFilter() };
    expect(newState.selectedTypes).toEqual([]);
    expect(newState.dateRange).toStrictEqual(dateRange);
  });

  it('clearEventTypeFilter does not mutate or return status filter state', () => {
    const state = { selectedTypes: ['refund.issued'], status: 'failed' as const };
    const newState = { ...state, selectedTypes: clearEventTypeFilter() };
    expect(newState.selectedTypes).toEqual([]);
    expect(newState.status).toBe('failed');
  });

  it('onClearAll callback receives only the event-type slice (empty array)', () => {
    const container = makeContainer();
    let capturedArg: unknown = undefined;
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: (newSel) => { capturedArg = newSel; },
    });
    (container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement).click();
    // Only the event-type selection is passed — an empty array
    expect(capturedArg).toEqual([]);
    container.remove();
  });

  it('date-range filter continues to work after event-type filter is cleared', () => {
    const entries = [
      { eventType: 'payment.created', timestamp: '2024-01-15T10:00', id: 1 },
      { eventType: 'refund.issued',   timestamp: '2024-02-10T10:00', id: 2 },
      { eventType: 'payment.created', timestamp: '2024-02-20T10:00', id: 3 },
    ];
    // Clear event-type filter → all entries visible for event-type dimension
    const afterClear = filterByEventTypes(entries, clearEventTypeFilter());
    expect(afterClear).toHaveLength(3);

    // Date-range filter still applied independently
    const dateFiltered = afterClear.filter(
      (e) => e.timestamp >= '2024-02-01T00:00' && e.timestamp <= '2024-02-28T23:59'
    );
    expect(dateFiltered).toHaveLength(2);
    expect(dateFiltered.map((e) => e.id)).toEqual([2, 3]);
  });
});

// ── AC7: Mandated unit-test cases ─────────────────────────────────────────────

describe('AC7 – mandated unit-test cases', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('AC7a – indicator is visible when ≥1 type is selected', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).not.toBeNull();
  });

  it('AC7b – indicator is hidden when all types are cleared (empty selection)', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).toBeNull();
  });

  it('AC7c – clear-all resets selection to default (empty array) in one action', () => {
    const onClearAll = vi.fn();
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued'],
      onClearAll,
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
    const [newSelection] = onClearAll.mock.calls[0] as [string[]];
    expect(newSelection).toEqual([]);
    expect(isEventTypeFilterActive(newSelection)).toBe(false);
  });
});

// ── AC8: Keyboard-accessible clear-all with appropriate aria-label ─────────────

describe('AC8 – keyboard-accessible clear-all with aria-label', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('clear-all control is a native <button> element (keyboard-focusable by default)', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]');
    expect(btn?.tagName.toLowerCase()).toBe('button');
  });

  it('clear-all button has type="button" (prevents accidental form submission)', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement | null;
    expect(btn?.type).toBe('button');
  });

  it('clear-all button has a non-empty default aria-label', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]');
    const label = btn?.getAttribute('aria-label');
    expect(label).toBeTruthy();
    expect(label!.trim().length).toBeGreaterThan(0);
  });

  it('default aria-label is "Clear event-type filter"', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]');
    expect(btn?.getAttribute('aria-label')).toBe('Clear event-type filter');
  });

  it('caller-supplied clearAllAriaLabel overrides the default', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
      clearAllAriaLabel: 'Remove active event-type filter',
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]');
    expect(btn?.getAttribute('aria-label')).toBe('Remove active event-type filter');
  });

  it('indicator has role="status" for screen-reader announcements', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-event-type-filter-indicator]');
    expect(indicator?.getAttribute('role')).toBe('status');
  });

  it('indicator has aria-live="polite" for non-intrusive announcements', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-event-type-filter-indicator]');
    expect(indicator?.getAttribute('aria-live')).toBe('polite');
  });
});
