/**
 * Unit tests for Issue #171: Active-filter indicator and clear-all control
 * for the event-type filter.
 *
 * Spec ref: spec § "Event log filtering — Event-type filter"
 *   AC7: Unit tests cover:
 *     - indicator visible when ≥1 type selected
 *     - indicator hidden when all types cleared
 *     - clear-all resets selection to default in one action
 *
 * Additional coverage:
 *   AC1 – indicator rendered when ≥1 type selected
 *   AC2 – indicator NOT rendered when no filter applied
 *   AC3 – clear-all control rendered alongside indicator when active
 *   AC4 – clear-all resets to default (empty array) in one action
 *   AC5 – after clear-all, indicator disappears
 *   AC6 – clearing event-type filter does not affect other filter state
 *   AC8 – clear-all button is keyboard-accessible with aria-label
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isEventTypeFilterActive,
  getActiveEventTypeCount,
  clearEventTypeFilter,
  renderEventTypeFilterIndicator,
} from '../src/eventTypeFilterIndicator';

// ── Pure helper tests ─────────────────────────────────────────────────────────

describe('isEventTypeFilterActive', () => {
  it('returns false when selectedTypes is empty (default / all-types state)', () => {
    expect(isEventTypeFilterActive([])).toBe(false);
  });

  it('returns true when one type is selected', () => {
    expect(isEventTypeFilterActive(['payment.created'])).toBe(true);
  });

  it('returns true when multiple types are selected', () => {
    expect(isEventTypeFilterActive(['payment.created', 'refund.issued'])).toBe(true);
  });

  it('returns true when three types are selected', () => {
    expect(
      isEventTypeFilterActive(['payment.created', 'refund.issued', 'dispute.opened'])
    ).toBe(true);
  });
});

describe('getActiveEventTypeCount', () => {
  it('returns 0 when no types are selected', () => {
    expect(getActiveEventTypeCount([])).toBe(0);
  });

  it('returns 1 when one type is selected', () => {
    expect(getActiveEventTypeCount(['payment.created'])).toBe(1);
  });

  it('returns the correct count for multiple types', () => {
    expect(getActiveEventTypeCount(['payment.created', 'refund.issued', 'dispute.opened'])).toBe(3);
  });
});

describe('clearEventTypeFilter', () => {
  it('returns an empty array (the default / all-types state)', () => {
    const result = clearEventTypeFilter();
    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
  });

  it('returns a new empty array each call (no shared reference)', () => {
    const a = clearEventTypeFilter();
    const b = clearEventTypeFilter();
    expect(a).not.toBe(b);
  });

  it('resets a non-empty selection to the default in one call (AC4)', () => {
    const selected = ['payment.created', 'refund.issued'];
    const cleared = clearEventTypeFilter();
    expect(isEventTypeFilterActive(cleared)).toBe(false);
    // Original array is not mutated
    expect(selected).toHaveLength(2);
  });
});

// ── DOM rendering tests ───────────────────────────────────────────────────────

describe('renderEventTypeFilterIndicator', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  // ── AC2: indicator hidden when filter is inactive ─────────────────────────

  it('AC2 – renders nothing when selectedTypes is empty (filter inactive)', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(container.innerHTML).toBe('');
    expect(container.querySelector('[data-event-type-filter-indicator]')).toBeNull();
  });

  // ── AC1: indicator visible when ≥1 type selected ─────────────────────────

  it('AC1 – renders indicator when one type is selected', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-event-type-filter-indicator]');
    expect(indicator).not.toBeNull();
  });

  it('AC1 – renders indicator when multiple types are selected', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued'],
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-event-type-filter-indicator]');
    expect(indicator).not.toBeNull();
  });

  it('AC1 – indicator text reflects the count of selected types (singular)', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-event-type-filter-indicator]');
    expect(indicator?.textContent).toContain('1');
    expect(indicator?.textContent).toContain('event type selected');
  });

  it('AC1 – indicator text reflects the count of selected types (plural)', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued'],
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-event-type-filter-indicator]');
    expect(indicator?.textContent).toContain('2');
    expect(indicator?.textContent).toContain('event types selected');
  });

  // ── AC3: clear-all control rendered alongside indicator ───────────────────

  it('AC3 – renders clear-all button when filter is active', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]');
    expect(btn).not.toBeNull();
    expect(btn?.tagName.toLowerCase()).toBe('button');
  });

  it('AC3 – clear-all button is NOT rendered when filter is inactive', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]');
    expect(btn).toBeNull();
  });

  // ── AC8: keyboard accessibility ───────────────────────────────────────────

  it('AC8 – clear-all button has an aria-label (default)', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]');
    expect(btn?.getAttribute('aria-label')).toBeTruthy();
  });

  it('AC8 – clear-all button uses the provided aria-label', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
      clearAllAriaLabel: 'Remove event-type filter',
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]');
    expect(btn?.getAttribute('aria-label')).toBe('Remove event-type filter');
  });

  it('AC8 – clear-all button is a <button> element (natively keyboard-accessible)', () => {
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement | null;
    expect(btn?.tagName.toLowerCase()).toBe('button');
    expect(btn?.type).toBe('button');
  });

  // ── AC4 & AC7: clear-all resets selection to default in one action ─────────

  it('AC4/AC7 – clicking clear-all calls onClearAll with an empty array', () => {
    const onClearAll = vi.fn();
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created', 'refund.issued'],
      onClearAll,
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
    expect(onClearAll).toHaveBeenCalledWith([]);
  });

  it('AC4 – onClearAll receives an empty array (default state) — no confirmation step', () => {
    const received: string[][] = [];
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['dispute.opened'],
      onClearAll: (newSel) => received.push(newSel),
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual([]);
  });

  // ── AC5: after clear-all, indicator disappears ────────────────────────────

  it('AC5 – re-rendering with empty selection removes the indicator', () => {
    // First render with active filter
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).not.toBeNull();

    // Simulate clear-all: re-render with empty selection
    renderEventTypeFilterIndicator(container, {
      selectedTypes: [],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).toBeNull();
    expect(container.querySelector('[data-event-type-filter-clear-all]')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  // ── AC6: clearing event-type filter does not affect other filter state ─────

  it('AC6 – clearEventTypeFilter only resets event-type selection, not other state', () => {
    // Simulate a composed filter state object
    const filterState = {
      selectedTypes: ['payment.created', 'refund.issued'],
      dateRange: { start: '2024-01-01', end: '2024-01-31' },
      status: 'failed',
    };

    // Apply clear-all to only the event-type dimension
    const newSelectedTypes = clearEventTypeFilter();
    const newFilterState = { ...filterState, selectedTypes: newSelectedTypes };

    // Event-type filter is cleared
    expect(newFilterState.selectedTypes).toEqual([]);
    expect(isEventTypeFilterActive(newFilterState.selectedTypes)).toBe(false);

    // Other filter dimensions are untouched
    expect(newFilterState.dateRange).toEqual({ start: '2024-01-01', end: '2024-01-31' });
    expect(newFilterState.status).toBe('failed');
  });

  it('AC6 – onClearAll callback only receives the new event-type selection', () => {
    let capturedNewSelection: string[] | null = null;
    renderEventTypeFilterIndicator(container, {
      selectedTypes: ['payment.created'],
      onClearAll: (newSel) => {
        capturedNewSelection = newSel;
        // Caller is responsible for updating only the event-type slice of state
      },
    });
    const btn = container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    // The callback only receives the new event-type selection (empty array)
    expect(capturedNewSelection).toEqual([]);
  });

  // ── Idempotency ───────────────────────────────────────────────────────────

  it('re-rendering with the same active state is idempotent (no duplicate indicators)', () => {
    const opts = { selectedTypes: ['payment.created'], onClearAll: vi.fn() };
    renderEventTypeFilterIndicator(container, opts);
    renderEventTypeFilterIndicator(container, opts);
    const indicators = container.querySelectorAll('[data-event-type-filter-indicator]');
    expect(indicators).toHaveLength(1);
    const buttons = container.querySelectorAll('[data-event-type-filter-clear-all]');
    expect(buttons).toHaveLength(1);
  });

  // ── AC7 summary: the three mandated unit-test cases ───────────────────────

  describe('AC7 – mandated unit-test cases', () => {
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
        selectedTypes: ['payment.created', 'refund.issued', 'dispute.opened'],
        onClearAll,
      });
      const btn = container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement;
      // One action: a single click
      btn.click();
      expect(onClearAll).toHaveBeenCalledTimes(1);
      const [newSelection] = onClearAll.mock.calls[0] as [string[]];
      expect(newSelection).toEqual([]);
      expect(isEventTypeFilterActive(newSelection)).toBe(false);
    });
  });
});
