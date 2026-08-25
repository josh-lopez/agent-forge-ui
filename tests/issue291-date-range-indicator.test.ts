/**
 * Unit tests for Issue #291: Date-range filter active-filter indicator
 * implementation.
 *
 * Spec ref: spec § "Event log filtering — Date-range filter"
 *   "Active-filter indicator: while a date range is set, a visible indicator
 *    confirms the filter is active; a clear-all control removes the range in
 *    one action."
 *
 * Acceptance criteria covered:
 *   AC1  – visible indicator rendered when start and/or end is set
 *   AC2  – indicator NOT rendered when both inputs are empty/cleared
 *   AC3  – clear-all control present alongside the indicator
 *   AC4  – clicking clear-all resets both inputs and removes the indicator
 *   AC5  – after clearing, the full unfiltered event log is restored
 *   AC6  – boundary entries (timestamp == start or == end) are included
 *   AC7  – date-range indicator/clear-all works with event-type and status filters
 *   AC8  – unit tests: indicator appears/disappears, clear-all resets inputs,
 *           boundary entries included/excluded
 *
 * Reviewed by Test Engineer for issue #291 — all 8 ACs verified green.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  filterByDateRange,
  isDateRangeFilterActive,
  clearDateRangeFilter,
  renderDateRangeFilterIndicator,
  type DateRange,
} from '../src/dateRangeFilter';
import { filterByEventTypes } from '../src/eventTypeFilter';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function entry(id: number, timestamp: string, eventType = 'payment.created', status = 'delivered') {
  return { id, timestamp, eventType, status };
}

const FIXTURE = [
  entry(1, '2024-03-01T10:00:00.000Z', 'payment.created', 'delivered'),
  entry(2, '2024-03-15T12:00:00.000Z', 'refund.issued',   'failed'),
  entry(3, '2024-03-31T23:59:59.000Z', 'payment.created', 'delivered'),
  entry(4, '2024-04-10T08:00:00.000Z', 'dispute.opened',  'pending'),
  entry(5, '2024-04-30T00:00:00.000Z', 'refund.issued',   'exhausted'),
];

// ── AC1: Indicator rendered when date range is active ─────────────────────────

describe('AC1 – visible indicator rendered when date range is active', () => {
  let container: HTMLElement;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
  afterEach(() => { container.remove(); });

  it('renders indicator element when start is set', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('renders indicator element when end is set', () => {
    renderDateRangeFilterIndicator(container, {
      range: { end: '2024-03-31T23:59' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('renders indicator element when both start and end are set', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('indicator text is non-empty (visible to users)', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('isDateRangeFilterActive returns true when start is set', () => {
    expect(isDateRangeFilterActive({ start: '2024-03-01T00:00' })).toBe(true);
  });

  it('isDateRangeFilterActive returns true when end is set', () => {
    expect(isDateRangeFilterActive({ end: '2024-03-31T23:59' })).toBe(true);
  });

  it('isDateRangeFilterActive returns true when both are set', () => {
    expect(isDateRangeFilterActive({ start: '2024-03-01T00:00', end: '2024-03-31T23:59' })).toBe(true);
  });
});

// ── AC2: Indicator NOT rendered when both inputs are empty/cleared ─────────────

describe('AC2 – indicator not rendered when both inputs are empty/cleared', () => {
  let container: HTMLElement;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
  afterEach(() => { container.remove(); });

  it('container is empty when range is {}', () => {
    renderDateRangeFilterIndicator(container, {
      range: {},
      onClearAll: vi.fn(),
    });
    expect(container.innerHTML).toBe('');
  });

  it('container is empty when both start and end are empty strings', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.innerHTML).toBe('');
  });

  it('no indicator element when range is cleared', () => {
    renderDateRangeFilterIndicator(container, {
      range: clearDateRangeFilter(),
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
  });

  it('isDateRangeFilterActive returns false for empty range', () => {
    expect(isDateRangeFilterActive({})).toBe(false);
    expect(isDateRangeFilterActive({ start: '', end: '' })).toBe(false);
    expect(isDateRangeFilterActive(clearDateRangeFilter())).toBe(false);
  });
});

// ── AC3: Clear-all control present alongside the indicator ────────────────────

describe('AC3 – clear-all control present alongside the indicator', () => {
  let container: HTMLElement;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
  afterEach(() => { container.remove(); });

  it('clear-all button is rendered when filter is active', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).not.toBeNull();
  });

  it('clear-all button is a <button> element', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(btn?.tagName.toLowerCase()).toBe('button');
  });

  it('clear-all button has type="button"', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement | null;
    expect(btn?.type).toBe('button');
  });

  it('clear-all button has a non-empty aria-label', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(btn?.getAttribute('aria-label')).toBeTruthy();
  });

  it('clear-all button is NOT rendered when filter is inactive', () => {
    renderDateRangeFilterIndicator(container, {
      range: {},
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).toBeNull();
  });

  it('both indicator and clear-all button are children of the same container', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(container.contains(indicator)).toBe(true);
    expect(container.contains(btn)).toBe(true);
  });
});

// ── AC4: Clicking clear-all resets both inputs and removes the indicator ───────

describe('AC4 – clicking clear-all resets both inputs and removes the indicator', () => {
  let container: HTMLElement;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
  afterEach(() => { container.remove(); });

  it('a single click on clear-all calls onClearAll exactly once', () => {
    const onClearAll = vi.fn();
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
      onClearAll,
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('onClearAll receives a cleared range with both start and end as empty strings', () => {
    const onClearAll = vi.fn();
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
      onClearAll,
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    const [newRange] = onClearAll.mock.calls[0] as [DateRange];
    expect(newRange.start).toBe('');
    expect(newRange.end).toBe('');
  });

  it('the cleared range passed to onClearAll is immediately inactive', () => {
    let received: DateRange = { start: 'sentinel', end: 'sentinel' };
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: (r) => { received = r; },
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(isDateRangeFilterActive(received)).toBe(false);
  });

  it('re-rendering with cleared range removes the indicator from the DOM', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();

    // Simulate caller re-rendering after clear-all
    renderDateRangeFilterIndicator(container, {
      range: clearDateRangeFilter(),
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
    expect(container.querySelector('[data-date-range-filter-clear-all]')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('clearDateRangeFilter returns an object with both fields as empty strings', () => {
    const cleared = clearDateRangeFilter();
    expect(cleared.start).toBe('');
    expect(cleared.end).toBe('');
  });
});

// ── AC5: After clearing, the full unfiltered event log is restored ─────────────

describe('AC5 – after clearing, the full unfiltered event log is restored', () => {
  it('filterByDateRange with cleared range returns all entries', () => {
    const range: DateRange = {
      start: '2024-03-01T00:00:00.000Z',
      end:   '2024-03-31T23:59:59.999Z',
    };
    const filtered = filterByDateRange(FIXTURE, range);
    expect(filtered).toHaveLength(3);

    const restored = filterByDateRange(FIXTURE, clearDateRangeFilter());
    expect(restored).toHaveLength(FIXTURE.length);
  });

  it('filterByDateRange with cleared range returns the same reference as input', () => {
    const result = filterByDateRange(FIXTURE, clearDateRangeFilter());
    expect(result).toBe(FIXTURE);
  });

  it('filterByDateRange with empty range {} returns all entries', () => {
    const result = filterByDateRange(FIXTURE, {});
    expect(result).toBe(FIXTURE);
  });
});

// ── AC6: Boundary entries (timestamp == start or == end) are included ──────────

describe('AC6 – boundary entries included; entries just outside excluded', () => {
  const START_TS = '2024-03-15T12:00:00.000Z'; // entry 2
  const END_TS   = '2024-03-31T23:59:59.000Z'; // entry 3

  it('entry whose timestamp exactly equals start is included', () => {
    const result = filterByDateRange(FIXTURE, { start: START_TS, end: END_TS });
    expect(result.some((e) => e.id === 2)).toBe(true);
  });

  it('entry whose timestamp exactly equals end is included', () => {
    const result = filterByDateRange(FIXTURE, { start: START_TS, end: END_TS });
    expect(result.some((e) => e.id === 3)).toBe(true);
  });

  it('entry 1 ms before start is excluded', () => {
    const beforeStart = new Date(new Date(START_TS).getTime() - 1).toISOString();
    const entries = [entry(10, beforeStart), entry(11, START_TS)];
    const result = filterByDateRange(entries, { start: START_TS, end: END_TS });
    expect(result.some((e) => e.id === 10)).toBe(false);
    expect(result.some((e) => e.id === 11)).toBe(true);
  });

  it('entry 1 ms after end is excluded', () => {
    const afterEnd = new Date(new Date(END_TS).getTime() + 1).toISOString();
    const entries = [entry(20, END_TS), entry(21, afterEnd)];
    const result = filterByDateRange(entries, { start: START_TS, end: END_TS });
    expect(result.some((e) => e.id === 20)).toBe(true);
    expect(result.some((e) => e.id === 21)).toBe(false);
  });

  it('single-entry range (start === end) includes that entry', () => {
    const result = filterByDateRange(FIXTURE, { start: START_TS, end: START_TS });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });
});

// ── AC7: Filter composition (date-range + event-type + status) ────────────────

describe('AC7 – date-range indicator/clear-all works with event-type and status filters', () => {
  it('date-range + event-type: only entries matching both are shown', () => {
    const range: DateRange = {
      start: '2024-03-01T00:00:00.000Z',
      end:   '2024-03-31T23:59:59.999Z',
    };
    const dateFiltered = filterByDateRange(FIXTURE, range);
    const result = filterByEventTypes(dateFiltered, ['payment.created']);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual([1, 3]);
  });

  it('clearing date-range while event-type filter is active: event-type still applied', () => {
    const typeFiltered = filterByEventTypes(FIXTURE, ['refund.issued']);
    const result = filterByDateRange(typeFiltered, clearDateRangeFilter());
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual([2, 5]);
  });

  it('clearing event-type while date-range filter is active: date-range still applied', () => {
    const range: DateRange = {
      start: '2024-04-01T00:00:00.000Z',
      end:   '2024-04-30T23:59:59.999Z',
    };
    const dateFiltered = filterByDateRange(FIXTURE, range);
    const result = filterByEventTypes(dateFiltered, []); // empty = all types
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual([4, 5]);
  });

  it('date-range + status: only entries matching both are shown', () => {
    const range: DateRange = {
      start: '2024-03-01T00:00:00.000Z',
      end:   '2024-04-30T23:59:59.999Z',
    };
    const dateFiltered = filterByDateRange(FIXTURE, range);
    const result = dateFiltered.filter((e) => e.status === 'failed');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it('clearing date-range while status filter is active: status still applied', () => {
    const allDelivered = FIXTURE.filter((e) => e.status === 'delivered');
    const result = filterByDateRange(allDelivered, clearDateRangeFilter());
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual([1, 3]);
  });

  it('clearDateRangeFilter does not affect event-type filter state', () => {
    const state = {
      dateRange: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
      selectedTypes: ['payment.created'],
      status: 'failed',
    };
    const newState = { ...state, dateRange: clearDateRangeFilter() };
    expect(isDateRangeFilterActive(newState.dateRange)).toBe(false);
    expect(newState.selectedTypes).toEqual(['payment.created']);
    expect(newState.status).toBe('failed');
  });
});

// ── AC8: Mandated unit-test cases ─────────────────────────────────────────────

describe('AC8 – mandated unit-test cases', () => {
  let container: HTMLElement;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
  afterEach(() => { container.remove(); });

  it('AC8a – indicator appears when range is set (start only)', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('AC8a – indicator appears when range is set (end only)', () => {
    renderDateRangeFilterIndicator(container, {
      range: { end: '2024-03-31T23:59' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('AC8a – indicator appears when range is set (both start and end)', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('AC8b – indicator disappears when range is cleared', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();

    renderDateRangeFilterIndicator(container, {
      range: clearDateRangeFilter(),
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('AC8c – clear-all resets both start and end inputs to empty', () => {
    const onClearAll = vi.fn();
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
      onClearAll,
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
    const [newRange] = onClearAll.mock.calls[0] as [DateRange];
    expect(newRange.start).toBe('');
    expect(newRange.end).toBe('');
    expect(isDateRangeFilterActive(newRange)).toBe(false);
  });

  it('AC8d – boundary entry (timestamp == start) is included', () => {
    const ts = '2024-03-15T12:00:00.000Z';
    const result = filterByDateRange(FIXTURE, { start: ts, end: '2024-03-31T23:59:59.000Z' });
    expect(result.some((e) => e.id === 2)).toBe(true);
  });

  it('AC8d – boundary entry (timestamp == end) is included', () => {
    const ts = '2024-03-31T23:59:59.000Z';
    const result = filterByDateRange(FIXTURE, { start: '2024-03-01T10:00:00.000Z', end: ts });
    expect(result.some((e) => e.id === 3)).toBe(true);
  });

  it('AC8d – entry 1 ms before start is excluded', () => {
    const startTs = '2024-03-15T12:00:00.000Z';
    const justBefore = new Date(new Date(startTs).getTime() - 1).toISOString();
    const entries = [entry(99, justBefore), entry(100, startTs)];
    const result = filterByDateRange(entries, { start: startTs });
    expect(result.some((e) => e.id === 99)).toBe(false);
    expect(result.some((e) => e.id === 100)).toBe(true);
  });

  it('AC8d – entry 1 ms after end is excluded', () => {
    const endTs = '2024-03-31T23:59:59.000Z';
    const justAfter = new Date(new Date(endTs).getTime() + 1).toISOString();
    const entries = [entry(99, endTs), entry(100, justAfter)];
    const result = filterByDateRange(entries, { end: endTs });
    expect(result.some((e) => e.id === 99)).toBe(true);
    expect(result.some((e) => e.id === 100)).toBe(false);
  });
});
