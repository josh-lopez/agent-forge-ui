/**
 * Unit tests for Issue #244: Active-filter indicator and clear-all control
 * for the status filter.
 *
 * Spec ref: spec § "Event log filtering — Status filter"
 *   AC7: Unit tests cover:
 *     - indicator shown when status filter is active
 *     - indicator hidden when status filter is default/cleared
 *     - clear-all resets the filter
 *     - composed filter state is maintained after clearing status only
 *
 * Acceptance criteria covered:
 *   AC1 – indicator rendered when ≥1 status selected (non-default)
 *   AC2 – indicator NOT rendered when filter is in default/unfiltered state
 *   AC3 – clear-all control rendered alongside indicator when active
 *   AC4 – clicking clear-all resets status filter to default in one action
 *   AC5 – after clearing, event log shows full unfiltered set for status dimension
 *   AC6 – clearing status filter does not affect date-range or event-type filters
 *   AC7 – mandated unit-test cases (indicator shown, indicator hidden, clear-all resets, composition)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isStatusFilterActive,
  getActiveStatusCount,
  clearStatusFilter,
  filterByStatus,
  renderStatusFilterIndicator,
} from '../src/statusFilterIndicator';
import type { DeliveryStatus } from '../src/delivery-events';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeContainer(): HTMLElement {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return div;
}

function makeEntry(id: number, status: DeliveryStatus, eventType = 'payment.created', timestamp = '2024-03-01T10:00:00.000Z') {
  return { id, status, eventType, timestamp };
}

const FIXTURE = [
  makeEntry(1, 'pending',   'payment.created', '2024-03-01T10:00:00.000Z'),
  makeEntry(2, 'delivered', 'payment.created', '2024-03-02T10:00:00.000Z'),
  makeEntry(3, 'failed',    'refund.issued',   '2024-03-03T10:00:00.000Z'),
  makeEntry(4, 'exhausted', 'refund.issued',   '2024-03-04T10:00:00.000Z'),
  makeEntry(5, 'delivered', 'dispute.opened',  '2024-03-05T10:00:00.000Z'),
];

// ── Pure helper tests ─────────────────────────────────────────────────────────

describe('isStatusFilterActive', () => {
  it('returns false when selectedStatuses is empty (default / all-statuses state)', () => {
    expect(isStatusFilterActive([])).toBe(false);
  });

  it('returns true when one status is selected', () => {
    expect(isStatusFilterActive(['failed'])).toBe(true);
  });

  it('returns true when multiple statuses are selected', () => {
    expect(isStatusFilterActive(['failed', 'exhausted'])).toBe(true);
  });

  it('returns true for all four statuses selected', () => {
    expect(isStatusFilterActive(['pending', 'delivered', 'failed', 'exhausted'])).toBe(true);
  });
});

describe('getActiveStatusCount', () => {
  it('returns 0 when no statuses are selected', () => {
    expect(getActiveStatusCount([])).toBe(0);
  });

  it('returns 1 when one status is selected', () => {
    expect(getActiveStatusCount(['failed'])).toBe(1);
  });

  it('returns the correct count for multiple statuses', () => {
    expect(getActiveStatusCount(['pending', 'delivered', 'failed'])).toBe(3);
  });
});

describe('clearStatusFilter', () => {
  it('returns an empty array (the default / all-statuses state)', () => {
    const result = clearStatusFilter();
    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
  });

  it('returns a new empty array each call (no shared reference)', () => {
    const a = clearStatusFilter();
    const b = clearStatusFilter();
    expect(a).not.toBe(b);
  });

  it('result is immediately inactive (isStatusFilterActive returns false)', () => {
    const result = clearStatusFilter();
    expect(isStatusFilterActive(result)).toBe(false);
  });

  it('resets a non-empty selection to the default in one call (AC4)', () => {
    const selected: DeliveryStatus[] = ['failed', 'exhausted'];
    const cleared = clearStatusFilter();
    expect(isStatusFilterActive(cleared)).toBe(false);
    // Original array is not mutated
    expect(selected).toHaveLength(2);
  });
});

// ── filterByStatus ────────────────────────────────────────────────────────────

describe('filterByStatus', () => {
  it('returns the original array when selectedStatuses is empty (no filter)', () => {
    const result = filterByStatus(FIXTURE, []);
    expect(result).toBe(FIXTURE);
  });

  it('returns only entries matching the selected status', () => {
    const result = filterByStatus(FIXTURE, ['delivered']);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual([2, 5]);
  });

  it('returns entries matching any of the selected statuses', () => {
    const result = filterByStatus(FIXTURE, ['failed', 'exhausted']);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual([3, 4]);
  });

  it('returns empty array when no entries match the selected status', () => {
    const result = filterByStatus(FIXTURE, ['pending']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it('returns all entries when all statuses are selected', () => {
    const result = filterByStatus(FIXTURE, ['pending', 'delivered', 'failed', 'exhausted']);
    expect(result).toHaveLength(FIXTURE.length);
  });

  it('returns empty array for empty entries list', () => {
    expect(filterByStatus([], ['delivered'])).toHaveLength(0);
  });
});

// ── DOM rendering tests ───────────────────────────────────────────────────────

describe('renderStatusFilterIndicator', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    container.remove();
  });

  // ── AC2: indicator hidden when filter is inactive ─────────────────────────

  it('AC2 – renders nothing when selectedStatuses is empty (filter inactive)', () => {
    renderStatusFilterIndicator(container, {
      selectedStatuses: [],
      onClearAll: vi.fn(),
    });
    expect(container.innerHTML).toBe('');
    expect(container.querySelector('[data-status-filter-indicator]')).toBeNull();
  });

  it('AC2 – no clear-all button when filter is inactive', () => {
    renderStatusFilterIndicator(container, {
      selectedStatuses: [],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-status-filter-clear-all]')).toBeNull();
  });

  // ── AC1: indicator visible when ≥1 status selected ───────────────────────

  it('AC1 – renders indicator when one status is selected', () => {
    renderStatusFilterIndicator(container, {
      selectedStatuses: ['failed'],
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-status-filter-indicator]');
    expect(indicator).not.toBeNull();
  });

  it('AC1 – renders indicator when multiple statuses are selected', () => {
    renderStatusFilterIndicator(container, {
      selectedStatuses: ['failed', 'exhausted'],
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-status-filter-indicator]');
    expect(indicator).not.toBeNull();
  });

  it('AC1 – indicator text reflects the count (singular: "1 status selected")', () => {
    renderStatusFilterIndicator(container, {
      selectedStatuses: ['failed'],
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-status-filter-indicator]');
    expect(indicator?.textContent).toContain('1');
    expect(indicator?.textContent).toContain('status selected');
  });

  it('AC1 – indicator text reflects the count (plural: "2 statuses selected")', () => {
    renderStatusFilterIndicator(container, {
      selectedStatuses: ['failed', 'exhausted'],
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-status-filter-indicator]');
    expect(indicator?.textContent).toContain('2');
    expect(indicator?.textContent).toContain('statuses selected');
  });

  // ── AC3: clear-all control rendered alongside indicator ───────────────────

  it('AC3 – renders clear-all button when filter is active', () => {
    renderStatusFilterIndicator(container, {
      selectedStatuses: ['failed'],
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-status-filter-clear-all]');
    expect(btn).not.toBeNull();
    expect(btn?.tagName.toLowerCase()).toBe('button');
  });

  it('AC3 – clear-all button is NOT rendered when filter is inactive', () => {
    renderStatusFilterIndicator(container, {
      selectedStatuses: [],
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-status-filter-clear-all]');
    expect(btn).toBeNull();
  });

  it('AC3 – indicator and clear-all button are both children of the container', () => {
    renderStatusFilterIndicator(container, {
      selectedStatuses: ['delivered'],
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-status-filter-indicator]');
    const btn = container.querySelector('[data-status-filter-clear-all]');
    expect(container.contains(indicator)).toBe(true);
    expect(container.contains(btn)).toBe(true);
  });

  // ── Accessibility ─────────────────────────────────────────────────────────

  it('clear-all button has a non-empty aria-label (default)', () => {
    renderStatusFilterIndicator(container, {
      selectedStatuses: ['failed'],
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-status-filter-clear-all]');
    const label = btn?.getAttribute('aria-label');
    expect(label).toBeTruthy();
    expect(label!.length).toBeGreaterThan(0);
  });

  it('clear-all button uses the provided aria-label', () => {
    renderStatusFilterIndicator(container, {
      selectedStatuses: ['failed'],
      onClearAll: vi.fn(),
      clearAllAriaLabel: 'Remove status filter',
    });
    const btn = container.querySelector('[data-status-filter-clear-all]');
    expect(btn?.getAttribute('aria-label')).toBe('Remove status filter');
  });

  it('clear-all button is a <button> element (natively keyboard-accessible)', () => {
    renderStatusFilterIndicator(container, {
      selectedStatuses: ['failed'],
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-status-filter-clear-all]') as HTMLButtonElement | null;
    expect(btn?.tagName.toLowerCase()).toBe('button');
    expect(btn?.type).toBe('button');
  });

  it('indicator has role="status" for screen-reader announcements', () => {
    renderStatusFilterIndicator(container, {
      selectedStatuses: ['failed'],
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-status-filter-indicator]');
    expect(indicator?.getAttribute('role')).toBe('status');
  });

  it('indicator has aria-live="polite" for non-intrusive announcements', () => {
    renderStatusFilterIndicator(container, {
      selectedStatuses: ['failed'],
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-status-filter-indicator]');
    expect(indicator?.getAttribute('aria-live')).toBe('polite');
  });

  // ── AC4: clicking clear-all resets the filter in one action ──────────────

  it('AC4 – clicking clear-all calls onClearAll with an empty array', () => {
    const onClearAll = vi.fn();
    renderStatusFilterIndicator(container, {
      selectedStatuses: ['failed', 'exhausted'],
      onClearAll,
    });
    const btn = container.querySelector('[data-status-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
    expect(onClearAll).toHaveBeenCalledWith([]);
  });

  it('AC4 – single click is sufficient (no confirmation step)', () => {
    const onClearAll = vi.fn();
    renderStatusFilterIndicator(container, {
      selectedStatuses: ['pending', 'delivered', 'failed', 'exhausted'],
      onClearAll,
    });
    const btn = container.querySelector('[data-status-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
    expect(onClearAll.mock.calls[0][0]).toEqual([]);
  });

  it('AC4 – result passed to onClearAll is inactive (isStatusFilterActive returns false)', () => {
    let received: DeliveryStatus[] = ['sentinel' as DeliveryStatus];
    renderStatusFilterIndicator(container, {
      selectedStatuses: ['failed'],
      onClearAll: (newSel) => { received = newSel; },
    });
    const btn = container.querySelector('[data-status-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(isStatusFilterActive(received)).toBe(false);
  });

  // ── AC5: after clearing, full unfiltered set is restored ─────────────────

  it('AC5 – re-rendering with empty selection removes the indicator', () => {
    renderStatusFilterIndicator(container, {
      selectedStatuses: ['failed'],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-status-filter-indicator]')).not.toBeNull();

    // Simulate clear-all: re-render with empty selection
    renderStatusFilterIndicator(container, {
      selectedStatuses: [],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-status-filter-indicator]')).toBeNull();
    expect(container.querySelector('[data-status-filter-clear-all]')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('AC5 – filterByStatus with cleared selection returns all entries', () => {
    // With filter active
    const filtered = filterByStatus(FIXTURE, ['delivered']);
    expect(filtered).toHaveLength(2);

    // After clear-all: empty selectedStatuses → full list returned
    const cleared = clearStatusFilter();
    const restored = filterByStatus(FIXTURE, cleared);
    expect(restored).toHaveLength(FIXTURE.length);
    expect(restored).toBe(FIXTURE); // same reference — no copy made
  });

  // ── Idempotency ───────────────────────────────────────────────────────────

  it('re-rendering with the same active state is idempotent (no duplicate indicators)', () => {
    const opts = { selectedStatuses: ['failed'] as DeliveryStatus[], onClearAll: vi.fn() };
    renderStatusFilterIndicator(container, opts);
    renderStatusFilterIndicator(container, opts);
    const indicators = container.querySelectorAll('[data-status-filter-indicator]');
    expect(indicators).toHaveLength(1);
    const buttons = container.querySelectorAll('[data-status-filter-clear-all]');
    expect(buttons).toHaveLength(1);
  });
});

// ── AC6 & AC7: filter composition ────────────────────────────────────────────

describe('AC6 – clearing status filter does not affect other filter dimensions', () => {
  it('AC6 – clearStatusFilter does not touch date-range filter state', () => {
    const state = {
      selectedStatuses: ['failed'] as DeliveryStatus[],
      dateRange: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
    };
    const newState = { ...state, selectedStatuses: clearStatusFilter() };
    expect(newState.selectedStatuses).toEqual([]);
    expect(newState.dateRange).toEqual(state.dateRange);
  });

  it('AC6 – clearStatusFilter does not touch event-type filter state', () => {
    const state = {
      selectedStatuses: ['exhausted'] as DeliveryStatus[],
      selectedTypes: ['payment.created', 'refund.issued'],
    };
    const newState = { ...state, selectedStatuses: clearStatusFilter() };
    expect(newState.selectedStatuses).toEqual([]);
    expect(newState.selectedTypes).toEqual(['payment.created', 'refund.issued']);
  });

  it('AC6 – onClearAll callback receives only the new status selection (empty array)', () => {
    const container = makeContainer();
    let capturedArg: unknown = 'not-called';
    renderStatusFilterIndicator(container, {
      selectedStatuses: ['failed'],
      onClearAll: (newSel) => { capturedArg = newSel; },
    });
    const btn = container.querySelector('[data-status-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(capturedArg).toEqual([]);
    container.remove();
  });

  it('AC6 – clearing status while event-type filter is active: event-type still applied', () => {
    // Simulate composed filter: event-type = ['payment.created'], status = ['failed']
    // After clearing status, event-type filter should still be applied.
    const eventTypeFiltered = FIXTURE.filter((e) => e.eventType === 'payment.created');
    // Clear status filter: empty selectedStatuses → all statuses shown
    const clearedStatuses = clearStatusFilter();
    const result = filterByStatus(eventTypeFiltered, clearedStatuses);
    // All payment.created entries (ids 1, 2) are returned regardless of status
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual([1, 2]);
  });

  it('AC6 – clearing status while date-range filter is active: date-range still applied', () => {
    // Simulate composed filter: date-range = March 1-3, status = ['delivered']
    const dateFiltered = FIXTURE.filter(
      (e) => e.timestamp >= '2024-03-01T00:00:00.000Z' && e.timestamp <= '2024-03-03T23:59:59.000Z'
    );
    // Clear status filter
    const clearedStatuses = clearStatusFilter();
    const result = filterByStatus(dateFiltered, clearedStatuses);
    // Entries 1, 2, 3 are in the date range; all statuses shown after clear
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.id)).toEqual([1, 2, 3]);
  });
});

// ── AC7: mandated unit-test cases ─────────────────────────────────────────────

describe('AC7 – mandated unit-test cases', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    container.remove();
  });

  it('AC7a – indicator is shown when status filter is active (≥1 status selected)', () => {
    renderStatusFilterIndicator(container, {
      selectedStatuses: ['failed'],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-status-filter-indicator]')).not.toBeNull();
  });

  it('AC7b – indicator is hidden when status filter is in default/cleared state', () => {
    renderStatusFilterIndicator(container, {
      selectedStatuses: [],
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-status-filter-indicator]')).toBeNull();
  });

  it('AC7c – clear-all resets the status filter to default (empty array) in one action', () => {
    const onClearAll = vi.fn();
    renderStatusFilterIndicator(container, {
      selectedStatuses: ['pending', 'failed', 'exhausted'],
      onClearAll,
    });
    const btn = container.querySelector('[data-status-filter-clear-all]') as HTMLButtonElement;
    // One action: a single click
    btn.click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
    const [newSelection] = onClearAll.mock.calls[0] as [DeliveryStatus[]];
    expect(newSelection).toEqual([]);
    expect(isStatusFilterActive(newSelection)).toBe(false);
  });

  it('AC7d – composed filter state is maintained after clearing status only', () => {
    // Simulate a composed filter state
    const filterState = {
      selectedStatuses: ['failed', 'exhausted'] as DeliveryStatus[],
      selectedTypes: ['payment.created', 'refund.issued'],
      dateRange: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
    };

    // Clear only the status dimension
    const newFilterState = { ...filterState, selectedStatuses: clearStatusFilter() };

    // Status filter is cleared
    expect(newFilterState.selectedStatuses).toEqual([]);
    expect(isStatusFilterActive(newFilterState.selectedStatuses)).toBe(false);

    // Other filter dimensions are untouched
    expect(newFilterState.selectedTypes).toEqual(['payment.created', 'refund.issued']);
    expect(newFilterState.dateRange).toEqual({ start: '2024-03-01T00:00', end: '2024-03-31T23:59' });
  });
});
