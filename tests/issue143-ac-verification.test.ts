/**
 * Supplemental acceptance-criterion verification tests for Issue #143:
 * Date-range filter for the delivery event log.
 *
 * These tests provide independent, focused coverage of each acceptance
 * criterion, complementing the broader suite in tests/dateRangeFilter.test.ts.
 *
 * Spec ref: spec § "Event log filtering — Date-range filter"
 *
 * Acceptance criteria covered:
 *   AC1  – start and end datetime inputs are rendered above/alongside the log
 *   AC2  – selecting a range immediately hides entries outside the range
 *   AC3  – boundary entries (timestamp == start or == end) are included
 *   AC4  – clearing both inputs restores the full unfiltered log
 *   AC5  – while a date range is active, a visible indicator is displayed
 *   AC6  – a clear-all control removes the active filter in one action
 *   AC7  – date-range filter composes with event-type filter
 *   AC8  – date-range filter composes with status filter
 *   AC9  – unit test: applying a range hides entries outside and shows inside
 *   AC10 – unit test: clearing the range restores all entries
 *   AC11 – unit test: boundary entries (== start and == end) are included
 *   AC12 – unit test: entries just outside the boundary (start-1ms, end+1ms) are excluded
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  filterByDateRange,
  isDateRangeFilterActive,
  clearDateRangeFilter,
  renderDateRangeFilterIndicator,
  renderDateRangeFilterInputs,
  type DateRange,
} from '../src/dateRangeFilter';
import { filterByEventTypes } from '../src/eventTypeFilter';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function entry(id: number, timestamp: string, eventType = 'payment.created', status = 'delivered') {
  return { id, timestamp, eventType, status };
}

/** Five entries spanning March–April 2024 with varied event types and statuses. */
const FIXTURE = [
  entry(1, '2024-03-01T10:00:00.000Z', 'payment.created', 'delivered'),
  entry(2, '2024-03-15T12:00:00.000Z', 'refund.issued',   'failed'),
  entry(3, '2024-03-31T23:59:59.000Z', 'payment.created', 'delivered'),
  entry(4, '2024-04-10T08:00:00.000Z', 'dispute.opened',  'pending'),
  entry(5, '2024-04-30T00:00:00.000Z', 'refund.issued',   'exhausted'),
];

// ── AC1: start and end datetime inputs are rendered ───────────────────────────

describe('AC1 – start and end datetime inputs are rendered', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('renders a start input of type datetime-local', () => {
    renderDateRangeFilterInputs(container, { range: {}, onChange: vi.fn() });
    const input = container.querySelector('[data-date-range-start]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input?.type).toBe('datetime-local');
  });

  it('renders an end input of type datetime-local', () => {
    renderDateRangeFilterInputs(container, { range: {}, onChange: vi.fn() });
    const input = container.querySelector('[data-date-range-end]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input?.type).toBe('datetime-local');
  });

  it('both inputs are present in the same container', () => {
    renderDateRangeFilterInputs(container, { range: {}, onChange: vi.fn() });
    expect(container.querySelector('[data-date-range-start]')).not.toBeNull();
    expect(container.querySelector('[data-date-range-end]')).not.toBeNull();
  });

  it('start input reflects the current range.start value', () => {
    renderDateRangeFilterInputs(container, {
      range: { start: '2024-03-01T10:00' },
      onChange: vi.fn(),
    });
    const input = container.querySelector('[data-date-range-start]') as HTMLInputElement;
    expect(input.value).toBe('2024-03-01T10:00');
  });

  it('end input reflects the current range.end value', () => {
    renderDateRangeFilterInputs(container, {
      range: { end: '2024-03-31T23:59' },
      onChange: vi.fn(),
    });
    const input = container.querySelector('[data-date-range-end]') as HTMLInputElement;
    expect(input.value).toBe('2024-03-31T23:59');
  });

  it('start input has an accessible aria-label', () => {
    renderDateRangeFilterInputs(container, { range: {}, onChange: vi.fn() });
    const input = container.querySelector('[data-date-range-start]');
    const label = input?.getAttribute('aria-label');
    expect(label).toBeTruthy();
    expect(label!.trim().length).toBeGreaterThan(0);
  });

  it('end input has an accessible aria-label', () => {
    renderDateRangeFilterInputs(container, { range: {}, onChange: vi.fn() });
    const input = container.querySelector('[data-date-range-end]');
    const label = input?.getAttribute('aria-label');
    expect(label).toBeTruthy();
    expect(label!.trim().length).toBeGreaterThan(0);
  });

  it('onChange is called with updated start when start input changes', () => {
    const onChange = vi.fn();
    renderDateRangeFilterInputs(container, {
      range: { start: '', end: '' },
      onChange,
    });
    const input = container.querySelector('[data-date-range-start]') as HTMLInputElement;
    input.value = '2024-03-01T00:00';
    input.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({ start: '2024-03-01T00:00' });
  });

  it('onChange is called with updated end when end input changes', () => {
    const onChange = vi.fn();
    renderDateRangeFilterInputs(container, {
      range: { start: '', end: '' },
      onChange,
    });
    const input = container.querySelector('[data-date-range-end]') as HTMLInputElement;
    input.value = '2024-03-31T23:59';
    input.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({ end: '2024-03-31T23:59' });
  });

  it('re-rendering is idempotent: still exactly one start and one end input', () => {
    const opts = { range: {}, onChange: vi.fn() };
    renderDateRangeFilterInputs(container, opts);
    renderDateRangeFilterInputs(container, opts);
    expect(container.querySelectorAll('[data-date-range-start]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-date-range-end]')).toHaveLength(1);
  });
});

// ── AC2 / AC9: applying a range hides entries outside and shows entries inside ─

describe('AC2 / AC9 – applying a date range filters entries correctly', () => {
  it('hides entries outside the range and shows entries inside it', () => {
    const range: DateRange = {
      start: '2024-03-01T00:00:00.000Z',
      end:   '2024-03-31T23:59:59.999Z',
    };
    const result = filterByDateRange(FIXTURE, range);
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it('returns an empty array when no entries fall within the range', () => {
    const range: DateRange = {
      start: '2025-01-01T00:00:00.000Z',
      end:   '2025-12-31T23:59:59.999Z',
    };
    expect(filterByDateRange(FIXTURE, range)).toHaveLength(0);
  });

  it('open-ended start: only entries on or after start are returned', () => {
    const range: DateRange = { start: '2024-04-01T00:00:00.000Z' };
    const result = filterByDateRange(FIXTURE, range);
    expect(result.map((e) => e.id)).toEqual([4, 5]);
  });

  it('open-ended end: only entries on or before end are returned', () => {
    const range: DateRange = { end: '2024-03-15T12:00:00.000Z' };
    const result = filterByDateRange(FIXTURE, range);
    expect(result.map((e) => e.id)).toEqual([1, 2]);
  });
});

// ── AC3 / AC11: boundary entries are included ─────────────────────────────────

describe('AC3 / AC11 – boundary entries (timestamp == start or == end) are included', () => {
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

  it('a single-entry range (start === end) includes exactly that entry', () => {
    const ts = '2024-03-15T12:00:00.000Z';
    const result = filterByDateRange(FIXTURE, { start: ts, end: ts });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });
});

// ── AC4 / AC10: clearing the range restores all entries ───────────────────────

describe('AC4 / AC10 – clearing the date range restores all entries', () => {
  it('restores all entries after clearing a previously active range', () => {
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
    expect(filterByDateRange(FIXTURE, clearDateRangeFilter())).toBe(FIXTURE);
  });

  it('clearDateRangeFilter produces an inactive range', () => {
    expect(isDateRangeFilterActive(clearDateRangeFilter())).toBe(false);
  });
});

// ── AC5: visible indicator while date range is active ────────────────────────

describe('AC5 – visible indicator while date range is active', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('indicator element is present when start is set', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('indicator element is present when end is set', () => {
    renderDateRangeFilterIndicator(container, {
      range: { end: '2024-03-31T23:59' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('indicator element is present when both start and end are set', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('indicator text is non-empty (visible to users)', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('indicator is NOT rendered when range is inactive (both empty)', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
  });

  it('indicator has role="status" for screen-reader announcements', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.getAttribute('role')).toBe('status');
  });

  it('indicator has aria-live="polite" for non-intrusive announcements', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.getAttribute('aria-live')).toBe('polite');
  });

  it('re-rendering with inactive range removes the indicator', () => {
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
  });
});

// ── AC6: clear-all control removes the active filter in one action ────────────

describe('AC6 – clear-all control removes the active filter in one action', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('clear-all button is rendered when filter is active', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).not.toBeNull();
  });

  it('clear-all button is absent when filter is inactive', () => {
    renderDateRangeFilterIndicator(container, {
      range: {},
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).toBeNull();
  });

  it('a single click on the clear-all button calls onClearAll exactly once', () => {
    const onClearAll = vi.fn();
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
      onClearAll,
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('onClearAll receives a cleared range (both fields empty strings)', () => {
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
    expect(isDateRangeFilterActive(newRange)).toBe(false);
  });

  it('clear-all button is a native <button> element (keyboard-accessible)', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(btn?.tagName.toLowerCase()).toBe('button');
  });

  it('clear-all button has type="button" (prevents accidental form submission)', () => {
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
    const label = btn?.getAttribute('aria-label');
    expect(label).toBeTruthy();
    expect(label!.trim().length).toBeGreaterThan(0);
  });

  it('caller-supplied clearAllAriaLabel overrides the default', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
      clearAllAriaLabel: 'Remove date filter',
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(btn?.getAttribute('aria-label')).toBe('Remove date filter');
  });
});

// ── AC7: date-range filter composes with event-type filter ────────────────────

describe('AC7 – date-range filter composes with event-type filter', () => {
  it('both filters active: only entries matching both are shown', () => {
    const range: DateRange = {
      start: '2024-03-01T00:00:00.000Z',
      end:   '2024-03-31T23:59:59.999Z',
    };
    const dateFiltered = filterByDateRange(FIXTURE, range);
    const result = filterByEventTypes(dateFiltered, ['payment.created']);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual([1, 3]);
  });

  it('filter order is commutative: event-type first then date-range gives same result', () => {
    const range: DateRange = {
      start: '2024-03-01T00:00:00.000Z',
      end:   '2024-03-31T23:59:59.999Z',
    };
    const typeFirst = filterByDateRange(
      filterByEventTypes(FIXTURE, ['payment.created']),
      range,
    );
    const dateFirst = filterByEventTypes(
      filterByDateRange(FIXTURE, range),
      ['payment.created'],
    );
    expect(typeFirst.map((e) => e.id)).toEqual(dateFirst.map((e) => e.id));
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

  it('no entries match when date-range and event-type filters are mutually exclusive', () => {
    // Only April entries exist for dispute.opened; restrict to March.
    const range: DateRange = {
      start: '2024-03-01T00:00:00.000Z',
      end:   '2024-03-31T23:59:59.999Z',
    };
    const dateFiltered = filterByDateRange(FIXTURE, range);
    const result = filterByEventTypes(dateFiltered, ['dispute.opened']);
    expect(result).toHaveLength(0);
  });
});

// ── AC8: date-range filter composes with status filter ────────────────────────

describe('AC8 – date-range filter composes with status filter', () => {
  it('both filters active: only entries matching both are shown', () => {
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

  it('clearing status while date-range filter is active: date-range still applied', () => {
    const range: DateRange = {
      start: '2024-04-01T00:00:00.000Z',
      end:   '2024-04-30T23:59:59.999Z',
    };
    const dateFiltered = filterByDateRange(FIXTURE, range);
    expect(dateFiltered).toHaveLength(2);
    expect(dateFiltered.map((e) => e.id)).toEqual([4, 5]);
  });

  it('no entries match when date-range and status filters are mutually exclusive', () => {
    // No delivered entries exist in April.
    const range: DateRange = {
      start: '2024-04-01T00:00:00.000Z',
      end:   '2024-04-30T23:59:59.999Z',
    };
    const dateFiltered = filterByDateRange(FIXTURE, range);
    const result = dateFiltered.filter((e) => e.status === 'delivered');
    expect(result).toHaveLength(0);
  });
});

// ── AC12: entries just outside the boundary are excluded ──────────────────────

describe('AC12 – entries just outside the boundary (start-1ms, end+1ms) are excluded', () => {
  const START_MS = new Date('2024-03-15T12:00:00.000Z').getTime();
  const END_MS   = new Date('2024-03-31T23:59:59.000Z').getTime();

  const BEFORE_START = new Date(START_MS - 1).toISOString();
  const AFTER_END    = new Date(END_MS   + 1).toISOString();

  it('entry 1 ms before start is excluded', () => {
    const entries = [
      entry(10, BEFORE_START),
      entry(11, '2024-03-15T12:00:00.000Z'), // exactly at start
    ];
    const result = filterByDateRange(entries, {
      start: '2024-03-15T12:00:00.000Z',
      end:   '2024-03-31T23:59:59.000Z',
    });
    expect(result.some((e) => e.id === 10)).toBe(false);
    expect(result.some((e) => e.id === 11)).toBe(true);
  });

  it('entry 1 ms after end is excluded', () => {
    const entries = [
      entry(20, '2024-03-31T23:59:59.000Z'), // exactly at end
      entry(21, AFTER_END),
    ];
    const result = filterByDateRange(entries, {
      start: '2024-03-15T12:00:00.000Z',
      end:   '2024-03-31T23:59:59.000Z',
    });
    expect(result.some((e) => e.id === 20)).toBe(true);
    expect(result.some((e) => e.id === 21)).toBe(false);
  });

  it('entries 1 ms outside both boundaries are excluded; boundary entries are included', () => {
    const entries = [
      entry(30, BEFORE_START),
      entry(31, '2024-03-15T12:00:00.000Z'), // start boundary
      entry(32, '2024-03-31T23:59:59.000Z'), // end boundary
      entry(33, AFTER_END),
    ];
    const result = filterByDateRange(entries, {
      start: '2024-03-15T12:00:00.000Z',
      end:   '2024-03-31T23:59:59.000Z',
    });
    expect(result.map((e) => e.id)).toEqual([31, 32]);
  });

  it('a range of exactly 1 ms includes only the entry at that exact millisecond', () => {
    const exactMs = new Date('2024-03-15T12:00:00.000Z').getTime();
    const exactTs = new Date(exactMs).toISOString();
    const entries = [
      entry(40, new Date(exactMs - 1).toISOString()), // 1 ms before
      entry(41, exactTs),                              // exact match
      entry(42, new Date(exactMs + 1).toISOString()), // 1 ms after
    ];
    const result = filterByDateRange(entries, { start: exactTs, end: exactTs });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(41);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('filterByDateRange – edge cases', () => {
  it('returns empty array for empty entries list with an active range', () => {
    expect(filterByDateRange([], {
      start: '2024-01-01T00:00:00.000Z',
      end:   '2024-12-31T23:59:59.999Z',
    })).toHaveLength(0);
  });

  it('returns empty array for empty entries list with no range', () => {
    expect(filterByDateRange([], {})).toHaveLength(0);
  });

  it('excludes entries with unparseable timestamps', () => {
    const entries = [entry(1, 'not-a-date'), entry(2, '2024-03-15T12:00:00.000Z')];
    const result = filterByDateRange(entries, {
      start: '2024-01-01T00:00:00.000Z',
      end:   '2024-12-31T23:59:59.999Z',
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it('isDateRangeFilterActive returns false for whitespace-only values', () => {
    expect(isDateRangeFilterActive({ start: '   ', end: '   ' })).toBe(false);
  });

  it('isDateRangeFilterActive returns true when only start is set', () => {
    expect(isDateRangeFilterActive({ start: '2024-03-01T00:00' })).toBe(true);
  });

  it('isDateRangeFilterActive returns true when only end is set', () => {
    expect(isDateRangeFilterActive({ end: '2024-03-31T23:59' })).toBe(true);
  });
});
