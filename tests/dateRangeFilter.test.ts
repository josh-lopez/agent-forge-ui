/**
 * Unit tests for Issue #170: Active-filter indicator and clear-all control
 * for the date-range filter.
 *
 * Spec ref: spec § "Event log filtering — Date-range filter"
 *   "Active-filter indicator: while a date range is set, a visible indicator
 *    confirms the filter is active; a clear-all control removes the range in
 *    one action."
 *
 * AC9 mandated unit-test cases:
 *   - indicator visible when range is set
 *   - indicator hidden when range is cleared
 *   - clear-all resets both inputs in one action
 *   - other filter dimensions are unaffected by clear-all
 *
 * Additional coverage:
 *   AC1  – indicator rendered when start, end, or both are set
 *   AC2  – indicator NOT rendered when both inputs are empty
 *   AC3  – clear-all control rendered alongside indicator when active
 *   AC4  – clear-all resets both bounds in one action, no confirmation
 *   AC5  – after clear-all, indicator disappears and full log is restored
 *   AC6  – accessible (button element, aria-label)
 *   AC7  – clear-all does not affect event-type or status filter state
 *   AC8  – filter composition: other filters remain active after clearing date range
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isDateRangeFilterActive,
  clearDateRangeFilter,
  filterByDateRange,
  renderDateRangeFilterIndicator,
  type DateRange,
} from '../src/dateRangeFilter';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContainer(): HTMLElement {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return div;
}

// ── isDateRangeFilterActive ───────────────────────────────────────────────────

describe('isDateRangeFilterActive', () => {
  it('returns false when both start and end are empty strings (default state)', () => {
    expect(isDateRangeFilterActive({ start: '', end: '' })).toBe(false);
  });

  it('returns true when only start is set', () => {
    expect(isDateRangeFilterActive({ start: '2024-01-01T00:00', end: '' })).toBe(true);
  });

  it('returns true when only end is set', () => {
    expect(isDateRangeFilterActive({ start: '', end: '2024-01-31T23:59' })).toBe(true);
  });

  it('returns true when both start and end are set', () => {
    expect(isDateRangeFilterActive({ start: '2024-01-01T00:00', end: '2024-01-31T23:59' })).toBe(true);
  });

  it('returns false when both values are whitespace-only', () => {
    expect(isDateRangeFilterActive({ start: '   ', end: '   ' })).toBe(false);
  });
});

// ── clearDateRangeFilter ──────────────────────────────────────────────────────

describe('clearDateRangeFilter', () => {
  it('returns an object with both start and end as empty strings', () => {
    const result = clearDateRangeFilter();
    expect(result).toEqual({ start: '', end: '' });
  });

  it('result is immediately inactive (isDateRangeFilterActive returns false)', () => {
    expect(isDateRangeFilterActive(clearDateRangeFilter())).toBe(false);
  });

  it('returns a fresh object on every call (no shared reference)', () => {
    const a = clearDateRangeFilter();
    const b = clearDateRangeFilter();
    expect(a).not.toBe(b);
  });

  it('does not mutate a previously active range', () => {
    const before: DateRange = { start: '2024-01-01T00:00', end: '2024-01-31T23:59' };
    const snapshot = { ...before };
    clearDateRangeFilter();
    expect(before).toEqual(snapshot);
  });
});

// ── filterByDateRange ─────────────────────────────────────────────────────────

describe('filterByDateRange', () => {
  const entries = [
    { timestamp: '2024-01-10T10:00', id: 1 },
    { timestamp: '2024-01-20T10:00', id: 2 },
    { timestamp: '2024-02-05T10:00', id: 3 },
    { timestamp: '2024-02-15T10:00', id: 4 },
  ];

  it('returns all entries when both bounds are empty (no filter active)', () => {
    const result = filterByDateRange(entries, { start: '', end: '' });
    expect(result).toHaveLength(4);
    expect(result).toEqual(entries);
  });

  it('filters by start bound only (open-ended end)', () => {
    const result = filterByDateRange(entries, { start: '2024-02-01T00:00', end: '' });
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual([3, 4]);
  });

  it('filters by end bound only (open-ended start)', () => {
    const result = filterByDateRange(entries, { start: '', end: '2024-01-31T23:59' });
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual([1, 2]);
  });

  it('filters by both bounds (inclusive)', () => {
    const result = filterByDateRange(entries, {
      start: '2024-01-20T10:00',
      end: '2024-02-05T10:00',
    });
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual([2, 3]);
  });

  it('includes boundary entries (exactly equal to start or end)', () => {
    const result = filterByDateRange(entries, {
      start: '2024-01-10T10:00',
      end: '2024-01-10T10:00',
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it('returns empty array when no entries fall within the range', () => {
    const result = filterByDateRange(entries, {
      start: '2025-01-01T00:00',
      end: '2025-12-31T23:59',
    });
    expect(result).toHaveLength(0);
  });

  it('returns all entries after clearing the filter', () => {
    const filtered = filterByDateRange(entries, { start: '2024-02-01T00:00', end: '' });
    expect(filtered).toHaveLength(2);

    const restored = filterByDateRange(entries, clearDateRangeFilter());
    expect(restored).toHaveLength(4);
    expect(restored).toEqual(entries);
  });

  // Regression: datetime-local inputs have minute precision and no timezone
  // (e.g. "2024-01-01T00:00"), while delivery-event timestamps are full ISO
  // strings with seconds/millis and a `Z` suffix (e.g. the simulator emits
  // `new Date(...).toISOString()`). Comparison must be numeric, not
  // lexicographic, and the end bound must include the whole selected minute so
  // boundary entries are kept per the spec.
  const isoEntries = [
    { timestamp: '2024-01-10T10:00:00.000Z', id: 1 },
    { timestamp: '2024-01-10T10:00:45.500Z', id: 2 },
    { timestamp: '2024-01-10T10:01:30.000Z', id: 3 },
    { timestamp: '2024-01-09T23:59:59.999Z', id: 4 },
  ];

  it('includes full-ISO event timestamps within a minute-precision end bound (boundary inclusion)', () => {
    // End bound "2024-01-10T10:00" must include an event at 10:00:45.500Z
    // (same minute) but exclude one at 10:01:30 (next minute).
    const result = filterByDateRange(isoEntries, {
      start: '2024-01-10T10:00',
      end: '2024-01-10T10:00',
    });
    expect(result.map((e) => e.id).sort()).toEqual([1, 2]);
  });

  it('includes a full-ISO event exactly on the start bound (boundary inclusion)', () => {
    const result = filterByDateRange(isoEntries, {
      start: '2024-01-10T10:00',
      end: '',
    });
    // Excludes id 4 (previous day, before start), keeps 1, 2, 3.
    expect(result.map((e) => e.id).sort()).toEqual([1, 2, 3]);
  });

  it('does not silently drop entries with unparseable timestamps', () => {
    const mixed = [
      { timestamp: 'not-a-date', id: 1 },
      { timestamp: '2024-06-01T10:00:00.000Z', id: 2 },
    ];
    const result = filterByDateRange(mixed, {
      start: '2024-01-01T00:00',
      end: '2024-12-31T23:59',
    });
    // The parseable in-range entry is kept; the unparseable one is not dropped.
    expect(result.map((e) => e.id).sort()).toEqual([1, 2]);
  });
});

// ── renderDateRangeFilterIndicator – inactive state ───────────────────────────

describe('renderDateRangeFilterIndicator – inactive state (AC2)', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('AC2 – container is empty when both bounds are empty', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.innerHTML).toBe('');
  });

  it('AC2 – no indicator element when filter is inactive', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
  });

  it('AC2 – no clear-all button when filter is inactive', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).toBeNull();
  });
});

// ── renderDateRangeFilterIndicator – active state ─────────────────────────────

describe('renderDateRangeFilterIndicator – active state (AC1)', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('AC1 – indicator rendered when only start is set', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('AC1 – indicator rendered when only end is set', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('AC1 – indicator rendered when both start and end are set', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('AC1 – indicator text is non-empty (visible to users)', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('AC1 – indicator text mentions the start date when set', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.textContent).toContain('2024-01-01T00:00');
  });

  it('AC1 – indicator text mentions the end date when set', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.textContent).toContain('2024-01-31T23:59');
  });
});

// ── renderDateRangeFilterIndicator – clear-all control (AC3) ──────────────────

describe('renderDateRangeFilterIndicator – clear-all control (AC3)', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('AC3 – clear-all button is rendered when filter is active', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).not.toBeNull();
  });

  it('AC3 – clear-all button is a <button> element', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '' },
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(btn?.tagName.toLowerCase()).toBe('button');
  });

  it('AC3 – both indicator and clear-all button are children of the same container', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(container.contains(indicator)).toBe(true);
    expect(container.contains(btn)).toBe(true);
  });
});

// ── AC4: clear-all resets both bounds in one action ───────────────────────────

describe('renderDateRangeFilterIndicator – clear-all action (AC4)', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('AC4 – single click on clear-all calls onClearAll exactly once', () => {
    const onClearAll = vi.fn();
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll,
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('AC4 – onClearAll receives a cleared range (both bounds empty)', () => {
    const onClearAll = vi.fn();
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll,
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(onClearAll).toHaveBeenCalledWith({ start: '', end: '' });
  });

  it('AC4 – result passed to onClearAll is inactive (isDateRangeFilterActive returns false)', () => {
    let received: DateRange = { start: 'sentinel', end: 'sentinel' };
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll: (newRange) => { received = newRange; },
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(isDateRangeFilterActive(received)).toBe(false);
  });

  it('AC4 – no second click or confirmation is required (fires synchronously on first click)', () => {
    const onClearAll = vi.fn();
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll,
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
    expect(onClearAll.mock.calls[0][0]).toEqual({ start: '', end: '' });
  });
});

// ── AC5: after clear-all, indicator disappears ────────────────────────────────

describe('renderDateRangeFilterIndicator – indicator disappears after clear (AC5)', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('AC5 – re-rendering with empty range removes the indicator element', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();

    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
  });

  it('AC5 – re-rendering with empty range removes the clear-all button', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
    });
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).toBeNull();
  });

  it('AC5 – container is empty after re-render with empty range', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
    });
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.innerHTML).toBe('');
  });

  it('AC5 – full log is restored after clearing the date-range filter', () => {
    const entries = [
      { timestamp: '2024-01-10T10:00', id: 1 },
      { timestamp: '2024-02-10T10:00', id: 2 },
      { timestamp: '2024-03-10T10:00', id: 3 },
    ];
    const filtered = filterByDateRange(entries, { start: '2024-02-01T00:00', end: '' });
    expect(filtered).toHaveLength(2);

    const restored = filterByDateRange(entries, clearDateRangeFilter());
    expect(restored).toHaveLength(3);
    expect(restored).toEqual(entries);
  });
});

// ── AC6: accessibility ────────────────────────────────────────────────────────

describe('renderDateRangeFilterIndicator – accessibility (AC6)', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('AC6 – clear-all button is a native <button> (keyboard-focusable by default)', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(btn?.tagName.toLowerCase()).toBe('button');
  });

  it('AC6 – clear-all button has type="button" (prevents accidental form submission)', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement | null;
    expect(btn?.type).toBe('button');
  });

  it('AC6 – clear-all button has a non-empty default aria-label', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    const label = btn?.getAttribute('aria-label');
    expect(label).toBeTruthy();
    expect(label!.trim().length).toBeGreaterThan(0);
  });

  it('AC6 – default aria-label is "Clear date range filter"', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(btn?.getAttribute('aria-label')).toBe('Clear date range filter');
  });

  it('AC6 – caller-supplied clearAllAriaLabel overrides the default', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
      clearAllAriaLabel: 'Remove date range filter',
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(btn?.getAttribute('aria-label')).toBe('Remove date range filter');
  });

  it('AC6 – indicator has role="status" for screen-reader announcements', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.getAttribute('role')).toBe('status');
  });

  it('AC6 – indicator has aria-live="polite" for non-intrusive announcements', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.getAttribute('aria-live')).toBe('polite');
  });
});

// ── AC7: clear-all does not affect event-type or status filter state ───────────

describe('filter composition – clear-all does not affect other filters (AC7/AC8)', () => {
  it('AC7 – clearDateRangeFilter does not touch event-type filter state', () => {
    const state = {
      selectedTypes: ['payment.created', 'refund.issued'],
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
    };
    const newState = { ...state, range: clearDateRangeFilter() };
    expect(newState.range).toEqual({ start: '', end: '' });
    expect(newState.selectedTypes).toEqual(['payment.created', 'refund.issued']);
  });

  it('AC7 – clearDateRangeFilter does not touch status filter state', () => {
    const state = {
      status: 'failed' as const,
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
    };
    const newState = { ...state, range: clearDateRangeFilter() };
    expect(newState.range).toEqual({ start: '', end: '' });
    expect(newState.status).toBe('failed');
  });

  it('AC7 – onClearAll callback receives only the date-range slice (cleared range)', () => {
    const container = makeContainer();
    let capturedArg: unknown = undefined;
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll: (newRange) => { capturedArg = newRange; },
    });
    (container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement).click();
    expect(capturedArg).toEqual({ start: '', end: '' });
    container.remove();
  });

  it('AC8 – event-type filter continues to work after date-range is cleared', () => {
    const entries = [
      { timestamp: '2024-01-10T10:00', eventType: 'payment.created', id: 1 },
      { timestamp: '2024-02-10T10:00', eventType: 'refund.issued', id: 2 },
      { timestamp: '2024-02-20T10:00', eventType: 'payment.created', id: 3 },
    ];

    // Clear date-range filter → all entries visible for date dimension
    const afterDateClear = filterByDateRange(entries, clearDateRangeFilter());
    expect(afterDateClear).toHaveLength(3);

    // Event-type filter still applied independently
    const typeFiltered = afterDateClear.filter((e) => e.eventType === 'payment.created');
    expect(typeFiltered).toHaveLength(2);
    expect(typeFiltered.map((e) => e.id)).toEqual([1, 3]);
  });
});

// ── AC9: mandated unit-test cases ─────────────────────────────────────────────

describe('AC9 – mandated unit-test cases', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('AC9a – indicator is visible when a date range is set (both bounds)', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('AC9a – indicator is visible when only start is set (partial range)', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('AC9b – indicator is hidden when both inputs are cleared', () => {
    // First render with active filter
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();

    // Re-render with cleared range
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
  });

  it('AC9c – clear-all resets both start and end inputs in one action', () => {
    const onClearAll = vi.fn();
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll,
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    // One action: a single click
    btn.click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
    const [newRange] = onClearAll.mock.calls[0] as [DateRange];
    expect(newRange.start).toBe('');
    expect(newRange.end).toBe('');
    expect(isDateRangeFilterActive(newRange)).toBe(false);
  });

  it('AC9d – other filter dimensions are unaffected by clear-all', () => {
    const state = {
      selectedTypes: ['payment.created'],
      status: 'failed' as const,
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
    };
    // Apply clear-all to only the date-range dimension
    const newRange = clearDateRangeFilter();
    const newState = { ...state, range: newRange };

    // Date-range is cleared
    expect(newState.range).toEqual({ start: '', end: '' });
    expect(isDateRangeFilterActive(newState.range)).toBe(false);

    // Other filter dimensions are untouched
    expect(newState.selectedTypes).toEqual(['payment.created']);
    expect(newState.status).toBe('failed');
  });
});

// ── Idempotency ───────────────────────────────────────────────────────────────

describe('renderDateRangeFilterIndicator – idempotency', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('repeated renders with the same active state produce exactly one indicator', () => {
    const opts = {
      range: { start: '2024-01-01T00:00', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
    };
    renderDateRangeFilterIndicator(container, opts);
    renderDateRangeFilterIndicator(container, opts);
    renderDateRangeFilterIndicator(container, opts);
    expect(container.querySelectorAll('[data-date-range-filter-indicator]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-date-range-filter-clear-all]')).toHaveLength(1);
  });

  it('repeated renders with inactive state keep the container empty', () => {
    const opts = { range: { start: '', end: '' }, onClearAll: vi.fn() };
    renderDateRangeFilterIndicator(container, opts);
    renderDateRangeFilterIndicator(container, opts);
    expect(container.innerHTML).toBe('');
  });
});
