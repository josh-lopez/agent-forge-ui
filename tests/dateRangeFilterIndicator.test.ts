/**
 * Unit tests for Issue #83: Active-filter indicator and clear-all control
 * for the date-range filter.
 *
 * Spec ref: spec § "Event log filtering — Date-range filter"
 *   "Active-filter indicator: while a date range is set, a visible indicator
 *    confirms the filter is active; a clear-all control removes the range in
 *    one action."
 *
 * Acceptance criteria covered:
 *   AC1  – indicator rendered when both start and end inputs have values
 *   AC2  – clear-all control rendered alongside indicator when active
 *   AC3  – activating clear-all resets both inputs to empty in one action
 *   AC4  – after clear-all, full unfiltered log is restored
 *   AC5  – indicator NOT rendered when neither input has a value
 *   AC6  – clear-all control NOT rendered when neither input has a value
 *   AC7  – unit test: indicator shown when range active
 *   AC8  – unit test: indicator hidden after range cleared
 *   AC9  – unit test: clear-all resets both inputs and restores unfiltered log
 *   AC10 – indicator and clear-all NOT shown when only one input is populated
 *   AC11 – clear-all button is keyboard-accessible (native <button>)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isDateRangeFilterActive,
  clearDateRangeFilter,
  filterByDateRange,
  renderDateRangeFilterIndicator,
  type DateRange,
} from '../src/dateRangeFilterIndicator';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContainer(): HTMLElement {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return div;
}

const ACTIVE_RANGE: DateRange = {
  start: '2024-01-01T00:00',
  end: '2024-01-31T23:59',
};

// ── Pure helper: isDateRangeFilterActive ──────────────────────────────────────

describe('isDateRangeFilterActive', () => {
  it('returns false when both start and end are empty (default state)', () => {
    expect(isDateRangeFilterActive({ start: '', end: '' })).toBe(false);
  });

  it('returns false when only start is populated (partial range)', () => {
    expect(isDateRangeFilterActive({ start: '2024-01-01T00:00', end: '' })).toBe(false);
  });

  it('returns false when only end is populated (partial range)', () => {
    expect(isDateRangeFilterActive({ start: '', end: '2024-01-31T23:59' })).toBe(false);
  });

  it('returns true when both start and end are non-empty', () => {
    expect(isDateRangeFilterActive(ACTIVE_RANGE)).toBe(true);
  });

  it('returns false when start is whitespace-only', () => {
    expect(isDateRangeFilterActive({ start: '   ', end: '2024-01-31T23:59' })).toBe(false);
  });

  it('returns false when end is whitespace-only', () => {
    expect(isDateRangeFilterActive({ start: '2024-01-01T00:00', end: '   ' })).toBe(false);
  });
});

// ── Pure helper: clearDateRangeFilter ────────────────────────────────────────

describe('clearDateRangeFilter', () => {
  it('returns an object with empty start and end strings', () => {
    const result = clearDateRangeFilter();
    expect(result).toEqual({ start: '', end: '' });
  });

  it('result is immediately inactive (isDateRangeFilterActive returns false)', () => {
    expect(isDateRangeFilterActive(clearDateRangeFilter())).toBe(false);
  });

  it('returns a new object on each call (no shared reference)', () => {
    const a = clearDateRangeFilter();
    const b = clearDateRangeFilter();
    expect(a).not.toBe(b);
  });

  it('does not mutate the previously active range', () => {
    const before = { ...ACTIVE_RANGE };
    clearDateRangeFilter();
    expect(ACTIVE_RANGE).toEqual(before);
  });
});

// ── Pure helper: filterByDateRange ───────────────────────────────────────────

describe('filterByDateRange', () => {
  const entries = [
    { timestamp: '2024-01-10T10:00', id: 1 },
    { timestamp: '2024-01-20T12:00', id: 2 },
    { timestamp: '2024-02-05T08:00', id: 3 },
    { timestamp: '2024-02-15T16:00', id: 4 },
  ];

  it('returns all entries when range is inactive (both empty)', () => {
    const result = filterByDateRange(entries, { start: '', end: '' });
    expect(result).toHaveLength(4);
    expect(result).toEqual(entries);
  });

  it('returns all entries when range is inactive (partial: only start)', () => {
    const result = filterByDateRange(entries, { start: '2024-01-01T00:00', end: '' });
    expect(result).toHaveLength(4);
  });

  it('returns all entries when range is inactive (partial: only end)', () => {
    const result = filterByDateRange(entries, { start: '', end: '2024-01-31T23:59' });
    expect(result).toHaveLength(4);
  });

  it('filters entries within the active range', () => {
    const result = filterByDateRange(entries, {
      start: '2024-01-01T00:00',
      end: '2024-01-31T23:59',
    });
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual([1, 2]);
  });

  it('includes boundary entries (start boundary)', () => {
    const result = filterByDateRange(entries, {
      start: '2024-01-10T10:00',
      end: '2024-01-31T23:59',
    });
    expect(result.map((e) => e.id)).toContain(1);
  });

  it('includes boundary entries (end boundary)', () => {
    const result = filterByDateRange(entries, {
      start: '2024-01-01T00:00',
      end: '2024-01-20T12:00',
    });
    expect(result.map((e) => e.id)).toContain(2);
  });

  it('returns empty array when no entries fall within the range', () => {
    const result = filterByDateRange(entries, {
      start: '2025-01-01T00:00',
      end: '2025-12-31T23:59',
    });
    expect(result).toHaveLength(0);
  });

  it('returns all entries after clearing the range', () => {
    // First filter to a subset
    const filtered = filterByDateRange(entries, {
      start: '2024-01-01T00:00',
      end: '2024-01-31T23:59',
    });
    expect(filtered).toHaveLength(2);

    // After clear-all: full list restored
    const restored = filterByDateRange(entries, clearDateRangeFilter());
    expect(restored).toHaveLength(4);
    expect(restored).toEqual(entries);
  });
});

// ── DOM rendering ─────────────────────────────────────────────────────────────

describe('renderDateRangeFilterIndicator', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    container.remove();
  });

  // ── AC5 / AC6: indicator and clear-all NOT shown when no range set ─────────

  it('AC5 – container is empty when range is inactive (both empty)', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.innerHTML).toBe('');
  });

  it('AC5 – no indicator element when range is inactive', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
  });

  it('AC6 – no clear-all button when range is inactive', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).toBeNull();
  });

  // ── AC10: partial range (only one input) shows no indicator ───────────────

  it('AC10 – no indicator when only start is populated', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('AC10 – no clear-all button when only start is populated', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).toBeNull();
  });

  it('AC10 – no indicator when only end is populated', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('AC10 – no clear-all button when only end is populated', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).toBeNull();
  });

  // ── AC1: indicator rendered when both inputs have values ──────────────────

  it('AC1 – indicator element is present when both start and end are set', () => {
    renderDateRangeFilterIndicator(container, {
      range: ACTIVE_RANGE,
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('AC1 – indicator text is non-empty (visible to users)', () => {
    renderDateRangeFilterIndicator(container, {
      range: ACTIVE_RANGE,
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('AC1 – indicator text references the active range', () => {
    renderDateRangeFilterIndicator(container, {
      range: ACTIVE_RANGE,
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.textContent).toContain(ACTIVE_RANGE.start);
    expect(indicator?.textContent).toContain(ACTIVE_RANGE.end);
  });

  // ── AC2: clear-all control rendered alongside indicator ───────────────────

  it('AC2 – clear-all button is present when range is active', () => {
    renderDateRangeFilterIndicator(container, {
      range: ACTIVE_RANGE,
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).not.toBeNull();
  });

  it('AC2 – both indicator and clear-all button are children of the same container', () => {
    renderDateRangeFilterIndicator(container, {
      range: ACTIVE_RANGE,
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(container.contains(indicator)).toBe(true);
    expect(container.contains(btn)).toBe(true);
  });

  // ── AC3: clear-all resets both inputs to empty in one action ──────────────

  it('AC3 – clicking clear-all calls onClearAll exactly once', () => {
    const onClearAll = vi.fn();
    renderDateRangeFilterIndicator(container, {
      range: ACTIVE_RANGE,
      onClearAll,
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('AC3 – onClearAll receives a cleared range (both fields empty)', () => {
    const onClearAll = vi.fn();
    renderDateRangeFilterIndicator(container, {
      range: ACTIVE_RANGE,
      onClearAll,
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(onClearAll).toHaveBeenCalledWith({ start: '', end: '' });
  });

  it('AC3 – cleared range passed to onClearAll is immediately inactive', () => {
    let received: DateRange = ACTIVE_RANGE;
    renderDateRangeFilterIndicator(container, {
      range: ACTIVE_RANGE,
      onClearAll: (newRange) => { received = newRange; },
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(isDateRangeFilterActive(received)).toBe(false);
  });

  it('AC3 – no second click or confirmation step required (single action)', () => {
    const onClearAll = vi.fn();
    renderDateRangeFilterIndicator(container, {
      range: ACTIVE_RANGE,
      onClearAll,
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    // Fires synchronously on first click — no pending confirmation
    expect(onClearAll).toHaveBeenCalledTimes(1);
    expect(onClearAll.mock.calls[0][0]).toEqual({ start: '', end: '' });
  });

  // ── AC4: after clear-all, full unfiltered log is restored ─────────────────

  it('AC4 – re-rendering with cleared range removes the indicator', () => {
    renderDateRangeFilterIndicator(container, {
      range: ACTIVE_RANGE,
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();

    // Simulate caller re-rendering after clear-all
    renderDateRangeFilterIndicator(container, {
      range: clearDateRangeFilter(),
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('AC4 – filterByDateRange returns all entries after clear-all', () => {
    const entries = [
      { timestamp: '2024-01-10T10:00', id: 1 },
      { timestamp: '2024-02-05T08:00', id: 2 },
      { timestamp: '2024-03-15T16:00', id: 3 },
    ];

    // With active range: only January entries
    const filtered = filterByDateRange(entries, ACTIVE_RANGE);
    expect(filtered).toHaveLength(1);

    // After clear-all: all entries restored
    const restored = filterByDateRange(entries, clearDateRangeFilter());
    expect(restored).toHaveLength(3);
    expect(restored).toEqual(entries);
  });

  // ── AC7: unit test — indicator shown when range active ────────────────────

  it('AC7 – indicator is shown when both start and end inputs are populated', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-06-01T00:00', end: '2024-06-30T23:59' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator).not.toBeNull();
    expect(indicator?.textContent?.trim().length).toBeGreaterThan(0);
  });

  // ── AC8: unit test — indicator hidden after range cleared ─────────────────

  it('AC8 – indicator is hidden after the range is cleared via clear-all', () => {
    // Render with active range
    renderDateRangeFilterIndicator(container, {
      range: ACTIVE_RANGE,
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();

    // Re-render with cleared range (simulating caller response to onClearAll)
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
    expect(container.querySelector('[data-date-range-filter-clear-all]')).toBeNull();
  });

  it('AC8 – indicator is hidden after manual input reset (both inputs cleared)', () => {
    renderDateRangeFilterIndicator(container, {
      range: ACTIVE_RANGE,
      onClearAll: vi.fn(),
    });
    // Simulate user manually clearing both inputs
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.innerHTML).toBe('');
  });

  // ── AC9: unit test — clear-all resets both inputs and restores log ─────────

  it('AC9 – activating clear-all resets both inputs to empty', () => {
    const received: DateRange[] = [];
    renderDateRangeFilterIndicator(container, {
      range: ACTIVE_RANGE,
      onClearAll: (newRange) => received.push(newRange),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();

    expect(received).toHaveLength(1);
    expect(received[0].start).toBe('');
    expect(received[0].end).toBe('');
  });

  it('AC9 – after clear-all, filterByDateRange returns the full unfiltered log', () => {
    const entries = [
      { timestamp: '2024-01-10T10:00', id: 1 },
      { timestamp: '2024-02-05T08:00', id: 2 },
      { timestamp: '2024-03-15T16:00', id: 3 },
    ];

    let currentRange: DateRange = ACTIVE_RANGE;

    renderDateRangeFilterIndicator(container, {
      range: currentRange,
      onClearAll: (newRange) => { currentRange = newRange; },
    });

    // Before clear: only January entries
    expect(filterByDateRange(entries, currentRange)).toHaveLength(1);

    // Activate clear-all
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();

    // After clear: all entries restored
    expect(filterByDateRange(entries, currentRange)).toHaveLength(3);
  });

  // ── AC11: keyboard accessibility ──────────────────────────────────────────

  it('AC11 – clear-all control is a native <button> element (keyboard-focusable)', () => {
    renderDateRangeFilterIndicator(container, {
      range: ACTIVE_RANGE,
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(btn?.tagName.toLowerCase()).toBe('button');
  });

  it('AC11 – clear-all button has type="button" (prevents accidental form submission)', () => {
    renderDateRangeFilterIndicator(container, {
      range: ACTIVE_RANGE,
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement | null;
    expect(btn?.type).toBe('button');
  });

  it('AC11 – clear-all button has a non-empty default aria-label', () => {
    renderDateRangeFilterIndicator(container, {
      range: ACTIVE_RANGE,
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    const label = btn?.getAttribute('aria-label');
    expect(label).toBeTruthy();
    expect(label!.trim().length).toBeGreaterThan(0);
  });

  it('AC11 – default aria-label is "Clear date-range filter"', () => {
    renderDateRangeFilterIndicator(container, {
      range: ACTIVE_RANGE,
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(btn?.getAttribute('aria-label')).toBe('Clear date-range filter');
  });

  it('AC11 – caller-supplied clearAllAriaLabel overrides the default', () => {
    renderDateRangeFilterIndicator(container, {
      range: ACTIVE_RANGE,
      onClearAll: vi.fn(),
      clearAllAriaLabel: 'Remove active date filter',
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(btn?.getAttribute('aria-label')).toBe('Remove active date filter');
  });

  it('AC11 – indicator has role="status" for screen-reader announcements', () => {
    renderDateRangeFilterIndicator(container, {
      range: ACTIVE_RANGE,
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.getAttribute('role')).toBe('status');
  });

  it('AC11 – indicator has aria-live="polite" for non-intrusive announcements', () => {
    renderDateRangeFilterIndicator(container, {
      range: ACTIVE_RANGE,
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.getAttribute('aria-live')).toBe('polite');
  });

  // ── Idempotency ───────────────────────────────────────────────────────────

  it('re-rendering with the same active state is idempotent (no duplicate indicators)', () => {
    const opts = { range: ACTIVE_RANGE, onClearAll: vi.fn() };
    renderDateRangeFilterIndicator(container, opts);
    renderDateRangeFilterIndicator(container, opts);
    renderDateRangeFilterIndicator(container, opts);
    expect(container.querySelectorAll('[data-date-range-filter-indicator]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-date-range-filter-clear-all]')).toHaveLength(1);
  });

  // ── Filter composition: clear-all only clears date-range ─────────────────

  it('clear-all only resets date-range, not event-type or status filters', () => {
    const state = {
      range: ACTIVE_RANGE,
      selectedTypes: ['payment.created', 'refund.issued'],
      status: 'failed' as const,
    };

    let capturedNewRange: DateRange | null = null;
    renderDateRangeFilterIndicator(container, {
      range: state.range,
      onClearAll: (newRange) => { capturedNewRange = newRange; },
    });

    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();

    // Only the date-range slice is cleared
    expect(capturedNewRange).toEqual({ start: '', end: '' });

    // Other filter dimensions are untouched (caller's responsibility)
    expect(state.selectedTypes).toEqual(['payment.created', 'refund.issued']);
    expect(state.status).toBe('failed');
  });
});
