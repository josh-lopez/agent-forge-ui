/**
 * Supplemental unit tests for Issue #170: Active-filter indicator and
 * clear-all control for the date-range filter.
 *
 * These tests independently verify all 9 acceptance criteria using the
 * exported helpers from src/dateRangeFilter.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  isDateRangeFilterActive,
  clearDateRangeFilter,
  filterByDateRange,
  renderDateRangeFilterIndicator,
  type DateRange,
} from '../src/dateRangeFilter';

// ── AC1: indicator visible when start, end, or both are set ──────────────────

describe('AC1 – indicator visible when a date range is set', () => {
  it('renders indicator when only start is set', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T09:00', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('renders indicator when only end is set', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '2024-03-31T17:00' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('renders indicator when both start and end are set', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T09:00', end: '2024-03-31T17:00' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('indicator has visible (non-empty) text content', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T09:00', end: '2024-03-31T17:00' },
      onClearAll: vi.fn(),
    });
    const el = container.querySelector('[data-date-range-filter-indicator]');
    expect((el?.textContent ?? '').trim().length).toBeGreaterThan(0);
  });
});

// ── AC2: indicator not visible when both inputs are empty ─────────────────────

describe('AC2 – indicator hidden when both inputs are empty', () => {
  it('container is empty when both bounds are empty strings', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.innerHTML).toBe('');
  });

  it('no indicator element when filter is inactive', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
  });

  it('isDateRangeFilterActive returns false for empty range', () => {
    expect(isDateRangeFilterActive({ start: '', end: '' })).toBe(false);
  });
});

// ── AC3: clear-all control rendered alongside indicator ───────────────────────

describe('AC3 – clear-all control rendered when filter is active', () => {
  it('clear-all button is present when range is set', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T09:00', end: '2024-03-31T17:00' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).not.toBeNull();
  });

  it('clear-all control is a <button> element', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T09:00', end: '' },
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(btn?.tagName.toLowerCase()).toBe('button');
  });

  it('clear-all button is absent when filter is inactive', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).toBeNull();
  });
});

// ── AC4: clear-all resets both inputs in one action ───────────────────────────

describe('AC4 – clear-all resets both bounds in one action', () => {
  it('single click invokes onClearAll exactly once', () => {
    const onClearAll = vi.fn();
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T09:00', end: '2024-03-31T17:00' },
      onClearAll,
    });
    (container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement).click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('onClearAll receives a range with both bounds empty', () => {
    const onClearAll = vi.fn();
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T09:00', end: '2024-03-31T17:00' },
      onClearAll,
    });
    (container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement).click();
    expect(onClearAll).toHaveBeenCalledWith({ start: '', end: '' });
  });

  it('clearDateRangeFilter returns inactive range in one call', () => {
    const result = clearDateRangeFilter();
    expect(result).toEqual({ start: '', end: '' });
    expect(isDateRangeFilterActive(result)).toBe(false);
  });
});

// ── AC5: after clear-all, indicator disappears and full log restored ──────────

describe('AC5 – indicator disappears and log restored after clear', () => {
  it('re-rendering with empty range removes indicator', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T09:00', end: '2024-03-31T17:00' },
      onClearAll: vi.fn(),
    });
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
    expect(container.querySelector('[data-date-range-filter-clear-all]')).toBeNull();
  });

  it('filterByDateRange returns full list after clearing range', () => {
    const entries = [
      { timestamp: '2024-01-10T10:00', id: 1 },
      { timestamp: '2024-02-10T10:00', id: 2 },
      { timestamp: '2024-03-10T10:00', id: 3 },
    ];
    const filtered = filterByDateRange(entries, { start: '2024-02-01T00:00', end: '' });
    expect(filtered).toHaveLength(2);
    const restored = filterByDateRange(entries, clearDateRangeFilter());
    expect(restored).toHaveLength(3);
  });
});

// ── AC6: accessible ───────────────────────────────────────────────────────────

describe('AC6 – accessible: keyboard-focusable, labelled for screen readers', () => {
  it('clear-all button has a non-empty aria-label', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T09:00', end: '2024-03-31T17:00' },
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    const label = btn?.getAttribute('aria-label') ?? '';
    expect(label.trim().length).toBeGreaterThan(0);
  });

  it('indicator has role="status" for screen-reader announcements', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T09:00', end: '' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.getAttribute('role')).toBe('status');
  });

  it('indicator has aria-live="polite"', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '2024-03-31T17:00' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.getAttribute('aria-live')).toBe('polite');
  });

  it('clear-all button has type="button" (keyboard-safe)', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T09:00', end: '2024-03-31T17:00' },
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    expect(btn?.type).toBe('button');
  });
});

// ── AC7: clear-all does not affect event-type or status filter state ──────────

describe('AC7 – clear-all only resets date-range inputs', () => {
  it('clearDateRangeFilter does not mutate other filter dimensions', () => {
    const state = {
      selectedTypes: ['payment.created', 'refund.issued'],
      status: 'failed',
      range: { start: '2024-03-01T09:00', end: '2024-03-31T17:00' } as DateRange,
    };
    const newRange = clearDateRangeFilter();
    const newState = { ...state, range: newRange };
    expect(newState.range).toEqual({ start: '', end: '' });
    expect(newState.selectedTypes).toEqual(['payment.created', 'refund.issued']);
    expect(newState.status).toBe('failed');
  });

  it('onClearAll callback receives only the cleared date range', () => {
    let received: DateRange | null = null;
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T09:00', end: '2024-03-31T17:00' },
      onClearAll: (r) => { received = r; },
    });
    (container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement).click();
    expect(received).toEqual({ start: '', end: '' });
  });
});

// ── AC8: filter composition ───────────────────────────────────────────────────

describe('AC8 – date-range filter composes correctly with other filters', () => {
  const entries = [
    { timestamp: '2024-01-10T10:00', eventType: 'payment.created', status: 'delivered', id: 1 },
    { timestamp: '2024-02-10T10:00', eventType: 'refund.issued',   status: 'failed',    id: 2 },
    { timestamp: '2024-03-10T10:00', eventType: 'payment.created', status: 'failed',    id: 3 },
    { timestamp: '2024-04-10T10:00', eventType: 'refund.issued',   status: 'delivered', id: 4 },
  ];

  it('date-range filter + event-type filter compose correctly', () => {
    const dateFiltered = filterByDateRange(entries, { start: '2024-02-01T00:00', end: '2024-03-31T23:59' });
    const typeFiltered = dateFiltered.filter((e) => e.eventType === 'payment.created');
    expect(typeFiltered.map((e) => e.id)).toEqual([3]);
  });

  it('after clearing date range, event-type filter still works', () => {
    const dateFiltered = filterByDateRange(entries, clearDateRangeFilter());
    const typeFiltered = dateFiltered.filter((e) => e.eventType === 'refund.issued');
    expect(typeFiltered.map((e) => e.id)).toEqual([2, 4]);
  });

  it('date-range filter + status filter compose correctly', () => {
    const dateFiltered = filterByDateRange(entries, { start: '2024-01-01T00:00', end: '2024-03-31T23:59' });
    const statusFiltered = dateFiltered.filter((e) => e.status === 'failed');
    expect(statusFiltered.map((e) => e.id)).toEqual([2, 3]);
  });

  it('clearing date range leaves status filter unaffected', () => {
    const state = { status: 'delivered', range: { start: '2024-01-01T00:00', end: '2024-03-31T23:59' } };
    const newState = { ...state, range: clearDateRangeFilter() };
    const result = filterByDateRange(entries, newState.range).filter((e) => e.status === newState.status);
    expect(result.map((e) => e.id)).toEqual([1, 4]);
  });
});

// ── AC9: mandated unit-test cases ─────────────────────────────────────────────

describe('AC9 – mandated unit-test cases', () => {
  it('AC9a – indicator visible when range is set', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-06-01T00:00', end: '2024-06-30T23:59' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('AC9b – indicator hidden when range is cleared', () => {
    const container = document.createElement('div');
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-06-01T00:00', end: '2024-06-30T23:59' },
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
      range: { start: '2024-06-01T00:00', end: '2024-06-30T23:59' },
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
      range: { start: '2024-06-01T00:00', end: '2024-06-30T23:59' } as DateRange,
    };
    const newState = { ...state, range: clearDateRangeFilter() };
    expect(newState.selectedTypes).toEqual(['payment.created']);
    expect(newState.status).toBe('pending');
    expect(isDateRangeFilterActive(newState.range)).toBe(false);
  });
});
