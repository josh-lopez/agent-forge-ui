/**
 * Unit tests for Issue #143: Date-range filter for the delivery event log.
 *
 * Spec ref: spec § "Event log filtering — Date-range filter"
 *
 * Acceptance criteria covered:
 *   AC2  – selecting a range hides entries outside it (and shows entries inside)
 *   AC3  – boundary entries (timestamp == start or == end) are included
 *   AC4  – clearing both inputs restores the full unfiltered log
 *   AC5  – while a date range is active, a visible indicator is displayed
 *   AC6  – a clear-all control removes the active filter in one action
 *   AC7  – date-range filter composes with event-type filter
 *   AC8  – date-range filter composes with status filter
 *   AC9  – unit test: applying a range hides entries outside and shows inside
 *   AC10 – unit test: clearing the range restores all entries
 *   AC11 – unit test: boundary entries (== start and == end) are included
 *   AC12 – unit test: entries just outside the boundary are excluded
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

/** Build a minimal log entry with the given ISO timestamp. */
function entry(id: number, timestamp: string, eventType = 'payment.created', status = 'delivered') {
  return { id, timestamp, eventType, status };
}

// Representative fixture dataset used across multiple test groups.
const FIXTURE = [
  entry(1, '2024-03-01T10:00:00.000Z', 'payment.created', 'delivered'),
  entry(2, '2024-03-15T12:00:00.000Z', 'refund.issued',   'failed'),
  entry(3, '2024-03-31T23:59:59.000Z', 'payment.created', 'delivered'),
  entry(4, '2024-04-10T08:00:00.000Z', 'dispute.opened',  'pending'),
  entry(5, '2024-04-30T00:00:00.000Z', 'refund.issued',   'exhausted'),
];

// ── isDateRangeFilterActive ───────────────────────────────────────────────────

describe('isDateRangeFilterActive', () => {
  it('returns false for an empty range object {}', () => {
    expect(isDateRangeFilterActive({})).toBe(false);
  });

  it('returns false when both start and end are empty strings', () => {
    expect(isDateRangeFilterActive({ start: '', end: '' })).toBe(false);
  });

  it('returns false when both start and end are whitespace-only', () => {
    expect(isDateRangeFilterActive({ start: '   ', end: '   ' })).toBe(false);
  });

  it('returns true when start is set', () => {
    expect(isDateRangeFilterActive({ start: '2024-03-01T00:00' })).toBe(true);
  });

  it('returns true when end is set', () => {
    expect(isDateRangeFilterActive({ end: '2024-03-31T23:59' })).toBe(true);
  });

  it('returns true when both start and end are set', () => {
    expect(isDateRangeFilterActive({ start: '2024-03-01T00:00', end: '2024-03-31T23:59' })).toBe(true);
  });
});

// ── clearDateRangeFilter ──────────────────────────────────────────────────────

describe('clearDateRangeFilter', () => {
  it('returns an object with start and end set to empty strings', () => {
    const cleared = clearDateRangeFilter();
    expect(cleared.start).toBe('');
    expect(cleared.end).toBe('');
  });

  it('the returned range is immediately inactive', () => {
    expect(isDateRangeFilterActive(clearDateRangeFilter())).toBe(false);
  });

  it('returns a fresh object on every call (no shared reference)', () => {
    const a = clearDateRangeFilter();
    const b = clearDateRangeFilter();
    expect(a).not.toBe(b);
  });
});

// ── filterByDateRange — core filtering ───────────────────────────────────────

describe('filterByDateRange – no filter active', () => {
  it('returns the original array when range is {}', () => {
    const result = filterByDateRange(FIXTURE, {});
    expect(result).toBe(FIXTURE); // same reference — no copy made
  });

  it('returns the original array when both start and end are empty strings', () => {
    const result = filterByDateRange(FIXTURE, { start: '', end: '' });
    expect(result).toBe(FIXTURE);
  });

  it('returns all entries when range is cleared', () => {
    const result = filterByDateRange(FIXTURE, clearDateRangeFilter());
    expect(result).toHaveLength(FIXTURE.length);
  });
});

// ── AC9: applying a range hides entries outside and shows entries inside ──────

describe('AC9 – applying a date range filters entries correctly', () => {
  it('hides entries outside the range and shows entries inside it', () => {
    const range: DateRange = {
      start: '2024-03-01T00:00:00.000Z',
      end:   '2024-03-31T23:59:59.999Z',
    };
    const result = filterByDateRange(FIXTURE, range);
    // Entries 1, 2, 3 fall within March 2024; entries 4 and 5 are in April.
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it('returns an empty array when no entries fall within the range', () => {
    const range: DateRange = {
      start: '2025-01-01T00:00:00.000Z',
      end:   '2025-12-31T23:59:59.999Z',
    };
    const result = filterByDateRange(FIXTURE, range);
    expect(result).toHaveLength(0);
  });

  it('returns all entries when the range spans the entire fixture', () => {
    const range: DateRange = {
      start: '2024-01-01T00:00:00.000Z',
      end:   '2024-12-31T23:59:59.999Z',
    };
    const result = filterByDateRange(FIXTURE, range);
    expect(result).toHaveLength(FIXTURE.length);
  });

  it('filters correctly with only a start date (open-ended upper bound)', () => {
    const range: DateRange = { start: '2024-04-01T00:00:00.000Z' };
    const result = filterByDateRange(FIXTURE, range);
    // Entries 4 and 5 are in April 2024.
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual([4, 5]);
  });

  it('filters correctly with only an end date (open-ended lower bound)', () => {
    const range: DateRange = { end: '2024-03-15T12:00:00.000Z' };
    const result = filterByDateRange(FIXTURE, range);
    // Entries 1 and 2 are on or before 2024-03-15T12:00:00.000Z.
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual([1, 2]);
  });
});

// ── AC10: clearing the range restores all entries ─────────────────────────────

describe('AC10 – clearing the date range restores all entries', () => {
  it('restores all entries after clearing a previously active range', () => {
    const range: DateRange = {
      start: '2024-03-01T00:00:00.000Z',
      end:   '2024-03-31T23:59:59.999Z',
    };
    // Apply filter
    const filtered = filterByDateRange(FIXTURE, range);
    expect(filtered).toHaveLength(3);

    // Clear filter
    const cleared = clearDateRangeFilter();
    const restored = filterByDateRange(FIXTURE, cleared);
    expect(restored).toHaveLength(FIXTURE.length);
  });

  it('filterByDateRange with cleared range returns the same reference as input', () => {
    const cleared = clearDateRangeFilter();
    const result = filterByDateRange(FIXTURE, cleared);
    expect(result).toBe(FIXTURE);
  });
});

// ── AC11: boundary entries are included ───────────────────────────────────────

describe('AC11 – boundary entries (timestamp == start or == end) are included', () => {
  // Use exact timestamps from the fixture for boundary tests.
  const START_TS = '2024-03-15T12:00:00.000Z'; // entry 2
  const END_TS   = '2024-03-31T23:59:59.000Z'; // entry 3

  it('entry whose timestamp exactly equals start is included', () => {
    const range: DateRange = { start: START_TS, end: END_TS };
    const result = filterByDateRange(FIXTURE, range);
    expect(result.some((e) => e.id === 2)).toBe(true);
  });

  it('entry whose timestamp exactly equals end is included', () => {
    const range: DateRange = { start: START_TS, end: END_TS };
    const result = filterByDateRange(FIXTURE, range);
    expect(result.some((e) => e.id === 3)).toBe(true);
  });

  it('both boundary entries are included in the result', () => {
    const range: DateRange = { start: START_TS, end: END_TS };
    const result = filterByDateRange(FIXTURE, range);
    expect(result.map((e) => e.id)).toContain(2);
    expect(result.map((e) => e.id)).toContain(3);
  });

  it('a single-entry range (start === end) includes that entry', () => {
    const ts = '2024-03-15T12:00:00.000Z';
    const range: DateRange = { start: ts, end: ts };
    const result = filterByDateRange(FIXTURE, range);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });
});

// ── AC12: entries just outside the boundary are excluded ──────────────────────

describe('AC12 – entries just outside the boundary are excluded', () => {
  // Boundary: start = entry 2 timestamp, end = entry 3 timestamp.
  const START_MS = new Date('2024-03-15T12:00:00.000Z').getTime();
  const END_MS   = new Date('2024-03-31T23:59:59.000Z').getTime();

  // Construct timestamps 1 ms outside each boundary.
  const BEFORE_START = new Date(START_MS - 1).toISOString(); // 1 ms before entry 2
  const AFTER_END    = new Date(END_MS   + 1).toISOString(); // 1 ms after entry 3

  it('entry with timestamp 1 ms before start is excluded', () => {
    const entries = [
      entry(10, BEFORE_START),
      entry(11, '2024-03-15T12:00:00.000Z'), // exactly at start — included
    ];
    const range: DateRange = {
      start: '2024-03-15T12:00:00.000Z',
      end:   '2024-03-31T23:59:59.000Z',
    };
    const result = filterByDateRange(entries, range);
    expect(result.some((e) => e.id === 10)).toBe(false);
    expect(result.some((e) => e.id === 11)).toBe(true);
  });

  it('entry with timestamp 1 ms after end is excluded', () => {
    const entries = [
      entry(20, '2024-03-31T23:59:59.000Z'), // exactly at end — included
      entry(21, AFTER_END),
    ];
    const range: DateRange = {
      start: '2024-03-15T12:00:00.000Z',
      end:   '2024-03-31T23:59:59.000Z',
    };
    const result = filterByDateRange(entries, range);
    expect(result.some((e) => e.id === 20)).toBe(true);
    expect(result.some((e) => e.id === 21)).toBe(false);
  });

  it('entries 1 ms outside both boundaries are excluded while boundary entries are included', () => {
    const entries = [
      entry(30, BEFORE_START),
      entry(31, '2024-03-15T12:00:00.000Z'), // start boundary
      entry(32, '2024-03-31T23:59:59.000Z'), // end boundary
      entry(33, AFTER_END),
    ];
    const range: DateRange = {
      start: '2024-03-15T12:00:00.000Z',
      end:   '2024-03-31T23:59:59.000Z',
    };
    const result = filterByDateRange(entries, range);
    expect(result.map((e) => e.id)).toEqual([31, 32]);
  });
});

// ── AC7: filter composition with event-type filter ────────────────────────────

describe('AC7 – date-range filter composes with event-type filter', () => {
  it('both filters active: only entries matching both are shown', () => {
    // Apply date-range first, then event-type (order should not matter).
    const range: DateRange = {
      start: '2024-03-01T00:00:00.000Z',
      end:   '2024-03-31T23:59:59.999Z',
    };
    const dateFiltered = filterByDateRange(FIXTURE, range);
    // dateFiltered = entries 1, 2, 3 (all in March)
    const result = filterByEventTypes(dateFiltered, ['payment.created']);
    // Only entries 1 and 3 are payment.created in March.
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual([1, 3]);
  });

  it('event-type filter applied first, then date-range: same result', () => {
    const typeFiltered = filterByEventTypes(FIXTURE, ['payment.created']);
    const range: DateRange = {
      start: '2024-03-01T00:00:00.000Z',
      end:   '2024-03-31T23:59:59.999Z',
    };
    const result = filterByDateRange(typeFiltered, range);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual([1, 3]);
  });

  it('clearing date-range while event-type filter is active: event-type still applied', () => {
    const typeFiltered = filterByEventTypes(FIXTURE, ['refund.issued']);
    const result = filterByDateRange(typeFiltered, clearDateRangeFilter());
    // All refund.issued entries (2 and 5) are returned.
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
    // Entries 4 and 5 are in April.
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual([4, 5]);
  });
});

// ── AC8: filter composition with status filter ────────────────────────────────

describe('AC8 – date-range filter composes with status filter', () => {
  it('both filters active: only entries matching both are shown', () => {
    const range: DateRange = {
      start: '2024-03-01T00:00:00.000Z',
      end:   '2024-04-30T23:59:59.999Z',
    };
    const dateFiltered = filterByDateRange(FIXTURE, range);
    // Apply status filter (pure inline — no separate module needed for status)
    const result = dateFiltered.filter((e) => e.status === 'failed');
    // Only entry 2 (refund.issued, failed, March) matches both.
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it('clearing date-range while status filter is active: status still applied', () => {
    const allDelivered = FIXTURE.filter((e) => e.status === 'delivered');
    const result = filterByDateRange(allDelivered, clearDateRangeFilter());
    // Entries 1 and 3 are delivered.
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual([1, 3]);
  });

  it('clearing status while date-range filter is active: date-range still applied', () => {
    const range: DateRange = {
      start: '2024-04-01T00:00:00.000Z',
      end:   '2024-04-30T23:59:59.999Z',
    };
    const dateFiltered = filterByDateRange(FIXTURE, range);
    // No status filter (all statuses) — just date-range.
    expect(dateFiltered).toHaveLength(2);
    expect(dateFiltered.map((e) => e.id)).toEqual([4, 5]);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('filterByDateRange – edge cases', () => {
  it('returns empty array for empty entries list with an active range', () => {
    const range: DateRange = {
      start: '2024-01-01T00:00:00.000Z',
      end:   '2024-12-31T23:59:59.999Z',
    };
    expect(filterByDateRange([], range)).toHaveLength(0);
  });

  it('returns empty array for empty entries list with no range', () => {
    expect(filterByDateRange([], {})).toHaveLength(0);
  });

  it('excludes entries with unparseable timestamps', () => {
    const entries = [
      entry(1, 'not-a-date'),
      entry(2, '2024-03-15T12:00:00.000Z'),
    ];
    const range: DateRange = {
      start: '2024-01-01T00:00:00.000Z',
      end:   '2024-12-31T23:59:59.999Z',
    };
    const result = filterByDateRange(entries, range);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });
});

// ── DOM: renderDateRangeFilterIndicator ───────────────────────────────────────

describe('renderDateRangeFilterIndicator', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  // AC5: visible indicator when filter is active ────────────────────────────

  it('AC5 – renders indicator when start is set', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('AC5 – renders indicator when end is set', () => {
    renderDateRangeFilterIndicator(container, {
      range: { end: '2024-03-31T23:59' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('AC5 – renders indicator when both start and end are set', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('AC5 – indicator text is non-empty and visible', () => {
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
    expect(container.innerHTML).toBe('');
  });

  it('indicator is NOT rendered when range is {}', () => {
    renderDateRangeFilterIndicator(container, {
      range: {},
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
  });

  // AC6: clear-all control ──────────────────────────────────────────────────

  it('AC6 – clear-all button is rendered when filter is active', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).not.toBeNull();
  });

  it('AC6 – clear-all button is absent when filter is inactive', () => {
    renderDateRangeFilterIndicator(container, {
      range: {},
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).toBeNull();
  });

  it('AC6 – single click on clear-all calls onClearAll exactly once', () => {
    const onClearAll = vi.fn();
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
      onClearAll,
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('AC6 – onClearAll receives a cleared range (both fields empty)', () => {
    const onClearAll = vi.fn();
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
      onClearAll,
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    const [newRange] = onClearAll.mock.calls[0] as [DateRange];
    expect(isDateRangeFilterActive(newRange)).toBe(false);
  });

  it('AC6 – clear-all button is a native <button> element', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(btn?.tagName.toLowerCase()).toBe('button');
  });

  it('AC6 – clear-all button has type="button"', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement | null;
    expect(btn?.type).toBe('button');
  });

  it('AC6 – clear-all button has a non-empty default aria-label', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    const label = btn?.getAttribute('aria-label');
    expect(label).toBeTruthy();
    expect(label!.trim().length).toBeGreaterThan(0);
  });

  it('AC6 – caller-supplied clearAllAriaLabel overrides the default', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
      clearAllAriaLabel: 'Remove date filter',
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(btn?.getAttribute('aria-label')).toBe('Remove date filter');
  });

  it('indicator has role="status" for screen-reader announcements', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.getAttribute('role')).toBe('status');
  });

  it('indicator has aria-live="polite"', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.getAttribute('aria-live')).toBe('polite');
  });

  it('re-rendering with empty range removes the indicator (idempotent clear)', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();

    renderDateRangeFilterIndicator(container, {
      range: {},
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('repeated renders with the same active state produce exactly one indicator', () => {
    const opts = {
      range: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
      onClearAll: vi.fn(),
    };
    renderDateRangeFilterIndicator(container, opts);
    renderDateRangeFilterIndicator(container, opts);
    renderDateRangeFilterIndicator(container, opts);
    expect(container.querySelectorAll('[data-date-range-filter-indicator]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-date-range-filter-clear-all]')).toHaveLength(1);
  });
});

// ── DOM: renderDateRangeFilterInputs (AC1) ────────────────────────────────────

describe('renderDateRangeFilterInputs – AC1 (inputs rendered above/alongside log)', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('AC1 – renders a start datetime-local input', () => {
    renderDateRangeFilterInputs(container, {
      range: {},
      onChange: vi.fn(),
    });
    const input = container.querySelector('[data-date-range-start]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input?.type).toBe('datetime-local');
  });

  it('AC1 – renders an end datetime-local input', () => {
    renderDateRangeFilterInputs(container, {
      range: {},
      onChange: vi.fn(),
    });
    const input = container.querySelector('[data-date-range-end]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input?.type).toBe('datetime-local');
  });

  it('start input is pre-populated with the current range.start value', () => {
    renderDateRangeFilterInputs(container, {
      range: { start: '2024-03-01T10:00', end: '' },
      onChange: vi.fn(),
    });
    const input = container.querySelector('[data-date-range-start]') as HTMLInputElement;
    expect(input.value).toBe('2024-03-01T10:00');
  });

  it('end input is pre-populated with the current range.end value', () => {
    renderDateRangeFilterInputs(container, {
      range: { start: '', end: '2024-03-31T23:59' },
      onChange: vi.fn(),
    });
    const input = container.querySelector('[data-date-range-end]') as HTMLInputElement;
    expect(input.value).toBe('2024-03-31T23:59');
  });

  it('changing the start input calls onChange with the updated range', () => {
    const onChange = vi.fn();
    renderDateRangeFilterInputs(container, {
      range: { start: '', end: '2024-03-31T23:59' },
      onChange,
    });
    const input = container.querySelector('[data-date-range-start]') as HTMLInputElement;
    input.value = '2024-03-01T00:00';
    input.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const [newRange] = onChange.mock.calls[0] as [DateRange];
    expect(newRange.start).toBe('2024-03-01T00:00');
    expect(newRange.end).toBe('2024-03-31T23:59'); // end preserved
  });

  it('changing the end input calls onChange with the updated range', () => {
    const onChange = vi.fn();
    renderDateRangeFilterInputs(container, {
      range: { start: '2024-03-01T00:00', end: '' },
      onChange,
    });
    const input = container.querySelector('[data-date-range-end]') as HTMLInputElement;
    input.value = '2024-03-31T23:59';
    input.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const [newRange] = onChange.mock.calls[0] as [DateRange];
    expect(newRange.end).toBe('2024-03-31T23:59');
    expect(newRange.start).toBe('2024-03-01T00:00'); // start preserved
  });

  it('start input has an accessible aria-label', () => {
    renderDateRangeFilterInputs(container, { range: {}, onChange: vi.fn() });
    const input = container.querySelector('[data-date-range-start]');
    expect(input?.getAttribute('aria-label')).toBeTruthy();
  });

  it('end input has an accessible aria-label', () => {
    renderDateRangeFilterInputs(container, { range: {}, onChange: vi.fn() });
    const input = container.querySelector('[data-date-range-end]');
    expect(input?.getAttribute('aria-label')).toBeTruthy();
  });
});
