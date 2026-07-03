/**
 * Supplemental tests for Issue #170: Active-filter indicator and clear-all
 * control for the date-range filter.
 *
 * These tests provide additional explicit coverage of all 9 acceptance
 * criteria, complementing the existing tests in dateRangeFilter.test.ts and
 * issue170-date-range-indicator.test.ts.
 *
 * Spec ref: spec § "Event log filtering — Date-range filter"
 *   "Active-filter indicator: while a date range is set, a visible indicator
 *    confirms the filter is active; a clear-all control removes the range in
 *    one action."
 */

import { describe, it, expect, vi } from 'vitest';
import {
  isDateRangeFilterActive,
  clearDateRangeFilter,
  filterByDateRange,
  renderDateRangeFilterIndicator,
  type DateRange,
} from '../src/dateRangeFilter';

// ── AC1: Indicator visible when start, end, or both are set ──────────────────

describe('AC1 – active-filter indicator is visible when a date range is set', () => {
  it('isDateRangeFilterActive returns true when only start is set', () => {
    expect(isDateRangeFilterActive({ start: '2024-06-01T08:00', end: '' })).toBe(true);
  });

  it('isDateRangeFilterActive returns true when only end is set', () => {
    expect(isDateRangeFilterActive({ start: '', end: '2024-06-30T18:00' })).toBe(true);
  });

  it('isDateRangeFilterActive returns true when both bounds are set', () => {
    expect(isDateRangeFilterActive({ start: '2024-06-01T08:00', end: '2024-06-30T18:00' })).toBe(true);
  });

  it('DOM: indicator element is rendered when start only is set', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-06-01T08:00', end: '' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator).not.toBeNull();
    expect((indicator?.textContent ?? '').trim().length).toBeGreaterThan(0);
  });

  it('DOM: indicator element is rendered when end only is set', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '2024-06-30T18:00' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('DOM: indicator element is rendered when both bounds are set', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-06-01T08:00', end: '2024-06-30T18:00' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });
});

// ── AC2: Indicator not visible when both inputs are empty ─────────────────────

describe('AC2 – active-filter indicator is hidden when both inputs are empty', () => {
  it('isDateRangeFilterActive returns false when both bounds are empty', () => {
    expect(isDateRangeFilterActive({ start: '', end: '' })).toBe(false);
  });

  it('DOM: container is empty when both bounds are empty', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.innerHTML).toBe('');
  });

  it('DOM: no indicator element when filter is inactive', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
  });
});

// ── AC3: Clear-all control rendered alongside indicator ───────────────────────

describe('AC3 – clear-all control is rendered when filter is active', () => {
  it('DOM: clear-all button is present when start is set', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-06-01T08:00', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).not.toBeNull();
  });

  it('DOM: clear-all control is a <button> element', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-06-01T08:00', end: '2024-06-30T18:00' },
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(btn?.tagName.toLowerCase()).toBe('button');
  });

  it('DOM: clear-all button is absent when filter is inactive', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).toBeNull();
  });
});

// ── AC4: Clicking clear-all removes both values in one action ─────────────────

describe('AC4 – clear-all resets both date-range inputs in one action', () => {
  it('single click invokes onClearAll exactly once', () => {
    const onClearAll = vi.fn();
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-06-01T08:00', end: '2024-06-30T18:00' },
      onClearAll,
    });
    (container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement).click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('onClearAll receives a range with both bounds empty', () => {
    const onClearAll = vi.fn();
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-06-01T08:00', end: '2024-06-30T18:00' },
      onClearAll,
    });
    (container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement).click();
    expect(onClearAll).toHaveBeenCalledWith({ start: '', end: '' });
  });

  it('clearDateRangeFilter returns both bounds as empty strings', () => {
    const result = clearDateRangeFilter();
    expect(result).toEqual({ start: '', end: '' });
  });

  it('clearDateRangeFilter result is immediately inactive', () => {
    expect(isDateRangeFilterActive(clearDateRangeFilter())).toBe(false);
  });
});

// ── AC5: After clear-all, indicator disappears and full log is restored ───────

describe('AC5 – indicator disappears and full log is restored after clear-all', () => {
  it('re-rendering with empty range removes the indicator', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-06-01T08:00', end: '2024-06-30T18:00' },
      onClearAll: vi.fn(),
    });
    renderDateRangeFilterIndicator(container, {
      range: clearDateRangeFilter(),
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
    expect(container.querySelector('[data-date-range-filter-clear-all]')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('filterByDateRange returns full list after clearing the range', () => {
    const entries = [
      { timestamp: '2024-01-10T10:00', id: 1 },
      { timestamp: '2024-04-10T10:00', id: 2 },
      { timestamp: '2024-07-10T10:00', id: 3 },
    ];
    const filtered = filterByDateRange(entries, { start: '2024-04-01T00:00', end: '' });
    expect(filtered).toHaveLength(2);
    const restored = filterByDateRange(entries, clearDateRangeFilter());
    expect(restored).toHaveLength(3);
  });
});

// ── AC6: Accessible (keyboard-focusable, labelled for screen readers) ─────────

describe('AC6 – indicator and clear-all control are accessible', () => {
  it('clear-all button has a non-empty aria-label', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-06-01T08:00', end: '2024-06-30T18:00' },
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect((btn?.getAttribute('aria-label') ?? '').trim().length).toBeGreaterThan(0);
  });

  it('clear-all button has type="button" (keyboard-safe, no form submission)', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-06-01T08:00', end: '2024-06-30T18:00' },
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    expect(btn?.type).toBe('button');
  });

  it('indicator has role="status" for screen-reader announcements', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-06-01T08:00', end: '' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.getAttribute('role')).toBe('status');
  });

  it('indicator has aria-live="polite"', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '2024-06-30T18:00' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.getAttribute('aria-live')).toBe('polite');
  });

  it('custom clearAllAriaLabel is applied to the button', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-06-01T08:00', end: '2024-06-30T18:00' },
      onClearAll: vi.fn(),
      clearAllAriaLabel: 'Remove the active date filter',
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(btn?.getAttribute('aria-label')).toBe('Remove the active date filter');
  });
});

// ── AC7: Clear-all does not affect event-type or status filter state ──────────

describe('AC7 – clear-all only resets date-range inputs, not other filter dimensions', () => {
  it('clearDateRangeFilter does not touch event-type or status state', () => {
    const state = {
      selectedTypes: ['payment.created', 'refund.issued'],
      status: 'failed',
      range: { start: '2024-06-01T08:00', end: '2024-06-30T18:00' } as DateRange,
    };
    const newState = { ...state, range: clearDateRangeFilter() };
    expect(newState.range).toEqual({ start: '', end: '' });
    expect(newState.selectedTypes).toEqual(['payment.created', 'refund.issued']);
    expect(newState.status).toBe('failed');
  });

  it('onClearAll callback only delivers the cleared date range', () => {
    let received: DateRange | null = null;
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-06-01T08:00', end: '2024-06-30T18:00' },
      onClearAll: (r) => { received = r; },
    });
    (container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement).click();
    expect(received).toEqual({ start: '', end: '' });
  });
});

// ── AC8: Filter composition ───────────────────────────────────────────────────

describe('AC8 – date-range filter composes correctly with event-type and status filters', () => {
  const entries = [
    { timestamp: '2024-01-10T10:00', eventType: 'payment.created', status: 'delivered', id: 1 },
    { timestamp: '2024-02-10T10:00', eventType: 'refund.issued',   status: 'failed',    id: 2 },
    { timestamp: '2024-03-10T10:00', eventType: 'payment.created', status: 'failed',    id: 3 },
    { timestamp: '2024-04-10T10:00', eventType: 'refund.issued',   status: 'delivered', id: 4 },
  ];

  it('date-range + event-type filters compose correctly', () => {
    const byDate = filterByDateRange(entries, { start: '2024-02-01T00:00', end: '2024-03-31T23:59' });
    const byType = byDate.filter((e) => e.eventType === 'payment.created');
    expect(byType.map((e) => e.id)).toEqual([3]);
  });

  it('date-range + status filters compose correctly', () => {
    const byDate = filterByDateRange(entries, { start: '2024-01-01T00:00', end: '2024-03-31T23:59' });
    const byStatus = byDate.filter((e) => e.status === 'failed');
    expect(byStatus.map((e) => e.id)).toEqual([2, 3]);
  });

  it('clearing date range leaves event-type filter unaffected', () => {
    const byDate = filterByDateRange(entries, clearDateRangeFilter());
    const byType = byDate.filter((e) => e.eventType === 'refund.issued');
    expect(byType.map((e) => e.id)).toEqual([2, 4]);
  });

  it('clearing date range leaves status filter unaffected', () => {
    const state = { status: 'delivered', range: { start: '2024-01-01T00:00', end: '2024-03-31T23:59' } };
    const newState = { ...state, range: clearDateRangeFilter() };
    const result = filterByDateRange(entries, newState.range).filter((e) => e.status === newState.status);
    expect(result.map((e) => e.id)).toEqual([1, 4]);
  });
});

// ── AC9: Mandated unit-test cases ─────────────────────────────────────────────

describe('AC9 – mandated unit-test cases', () => {
  it('AC9a – indicator visible when range is set', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-09-01T00:00', end: '2024-09-30T23:59' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('AC9b – indicator hidden when range is cleared', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-09-01T00:00', end: '2024-09-30T23:59' },
      onClearAll: vi.fn(),
    });
    renderDateRangeFilterIndicator(container, {
      range: clearDateRangeFilter(),
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
  });

  it('AC9c – clear-all resets both inputs in one action', () => {
    const onClearAll = vi.fn();
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-09-01T00:00', end: '2024-09-30T23:59' },
      onClearAll,
    });
    (container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement).click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
    expect(onClearAll).toHaveBeenCalledWith({ start: '', end: '' });
  });

  it('AC9d – other filter dimensions are unaffected by clear-all', () => {
    const state = {
      selectedTypes: ['payment.created'],
      status: 'pending',
      range: { start: '2024-09-01T00:00', end: '2024-09-30T23:59' } as DateRange,
    };
    const newState = { ...state, range: clearDateRangeFilter() };
    expect(newState.selectedTypes).toEqual(['payment.created']);
    expect(newState.status).toBe('pending');
    expect(isDateRangeFilterActive(newState.range)).toBe(false);
  });
});
