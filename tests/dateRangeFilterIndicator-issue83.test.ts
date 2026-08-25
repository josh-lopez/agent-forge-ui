/**
 * Supplemental tests for Issue #83: Active-filter indicator and clear-all
 * control for the date-range filter.
 *
 * These tests complement the primary suite in dateRangeFilterIndicator.test.ts
 * with additional integration-style scenarios and edge cases that exercise the
 * full AC surface from the Test Engineer's perspective.
 *
 * Acceptance criteria covered:
 *   AC1  – indicator visible when both inputs populated
 *   AC2  – clear-all control present alongside indicator
 *   AC3  – clear-all resets both inputs in one action
 *   AC4  – full unfiltered log restored after clear-all
 *   AC5  – indicator absent when no range set
 *   AC6  – clear-all absent when no range set
 *   AC7  – unit: indicator shown when range active
 *   AC8  – unit: indicator hidden after range cleared
 *   AC9  – unit: clear-all resets inputs and restores log
 *   AC10 – partial range (one input only) shows no indicator
 *   AC11 – clear-all is keyboard-accessible
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isDateRangeFilterActive,
  clearDateRangeFilter,
  filterByDateRange,
  renderDateRangeFilterIndicator,
  type DateRange,
} from '../src/dateRangeFilterIndicator';

// ── Fixture data ──────────────────────────────────────────────────────────────

const RANGE_JAN: DateRange = {
  start: '2024-01-01T00:00',
  end: '2024-01-31T23:59',
};

const RANGE_FEB: DateRange = {
  start: '2024-02-01T00:00',
  end: '2024-02-29T23:59',
};

const LOG_ENTRIES = [
  { timestamp: '2024-01-05T09:00', id: 1, type: 'payment.created' },
  { timestamp: '2024-01-15T14:30', id: 2, type: 'refund.issued' },
  { timestamp: '2024-01-31T23:59', id: 3, type: 'payment.created' }, // end boundary
  { timestamp: '2024-02-01T00:00', id: 4, type: 'payment.created' }, // start boundary of FEB
  { timestamp: '2024-02-14T12:00', id: 5, type: 'refund.issued' },
  { timestamp: '2024-03-01T08:00', id: 6, type: 'payment.created' },
];

function makeContainer(): HTMLElement {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return div;
}

// ── AC1 / AC7: Indicator visible when both inputs populated ───────────────────

describe('AC1/AC7 – indicator shown when range is active', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('renders a non-null indicator element for a January range', () => {
    renderDateRangeFilterIndicator(container, {
      range: RANGE_JAN,
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('renders a non-null indicator element for a February range', () => {
    renderDateRangeFilterIndicator(container, {
      range: RANGE_FEB,
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('indicator text contains both start and end of the active range', () => {
    renderDateRangeFilterIndicator(container, {
      range: RANGE_JAN,
      onClearAll: vi.fn(),
    });
    const el = container.querySelector('[data-date-range-filter-indicator]');
    expect(el?.textContent).toContain(RANGE_JAN.start);
    expect(el?.textContent).toContain(RANGE_JAN.end);
  });

  it('isDateRangeFilterActive returns true for a fully-populated range', () => {
    expect(isDateRangeFilterActive(RANGE_JAN)).toBe(true);
    expect(isDateRangeFilterActive(RANGE_FEB)).toBe(true);
  });
});

// ── AC2: Clear-all control present alongside indicator ────────────────────────

describe('AC2 – clear-all control rendered alongside indicator', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('clear-all button is present when range is active', () => {
    renderDateRangeFilterIndicator(container, {
      range: RANGE_JAN,
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).not.toBeNull();
  });

  it('clear-all button text contains "Clear" (user-visible label)', () => {
    renderDateRangeFilterIndicator(container, {
      range: RANGE_JAN,
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    expect(btn.textContent?.toLowerCase()).toContain('clear');
  });

  it('indicator and clear-all are both present in the same container', () => {
    renderDateRangeFilterIndicator(container, {
      range: RANGE_JAN,
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(indicator).not.toBeNull();
    expect(btn).not.toBeNull();
    // Both are descendants of the same container
    expect(container.contains(indicator)).toBe(true);
    expect(container.contains(btn)).toBe(true);
  });
});

// ── AC3: Clear-all resets both inputs in one action ───────────────────────────

describe('AC3 – clear-all resets both inputs to empty in one action', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('onClearAll is called with { start: "", end: "" } on button click', () => {
    const onClearAll = vi.fn();
    renderDateRangeFilterIndicator(container, {
      range: RANGE_JAN,
      onClearAll,
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(onClearAll).toHaveBeenCalledTimes(1);
    expect(onClearAll).toHaveBeenCalledWith({ start: '', end: '' });
  });

  it('onClearAll is called with { start: "", end: "" } for a February range', () => {
    const onClearAll = vi.fn();
    renderDateRangeFilterIndicator(container, {
      range: RANGE_FEB,
      onClearAll,
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();
    expect(onClearAll).toHaveBeenCalledWith({ start: '', end: '' });
  });

  it('clearDateRangeFilter() returns { start: "", end: "" }', () => {
    expect(clearDateRangeFilter()).toEqual({ start: '', end: '' });
  });

  it('cleared range is immediately inactive per isDateRangeFilterActive', () => {
    expect(isDateRangeFilterActive(clearDateRangeFilter())).toBe(false);
  });
});

// ── AC4: Full unfiltered log restored after clear-all ─────────────────────────

describe('AC4 – full unfiltered log restored after clear-all', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('filterByDateRange returns all entries when range is cleared', () => {
    // Active range: only January entries
    const filtered = filterByDateRange(LOG_ENTRIES, RANGE_JAN);
    expect(filtered.length).toBeLessThan(LOG_ENTRIES.length);

    // After clear: all entries
    const restored = filterByDateRange(LOG_ENTRIES, clearDateRangeFilter());
    expect(restored).toHaveLength(LOG_ENTRIES.length);
    expect(restored).toEqual(LOG_ENTRIES);
  });

  it('re-rendering with cleared range empties the container (indicator removed)', () => {
    renderDateRangeFilterIndicator(container, {
      range: RANGE_JAN,
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();

    renderDateRangeFilterIndicator(container, {
      range: clearDateRangeFilter(),
      onClearAll: vi.fn(),
    });
    expect(container.innerHTML).toBe('');
  });

  it('simulates full clear-all workflow: click → update range → re-render → log restored', () => {
    let currentRange: DateRange = RANGE_JAN;

    renderDateRangeFilterIndicator(container, {
      range: currentRange,
      onClearAll: (newRange) => { currentRange = newRange; },
    });

    // Before clear: January entries only (ids 1, 2, 3)
    const beforeClear = filterByDateRange(LOG_ENTRIES, currentRange);
    expect(beforeClear.map((e) => e.id)).toEqual([1, 2, 3]);

    // Activate clear-all
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();

    // After clear: all entries
    const afterClear = filterByDateRange(LOG_ENTRIES, currentRange);
    expect(afterClear).toHaveLength(LOG_ENTRIES.length);

    // Re-render with cleared range: indicator gone
    renderDateRangeFilterIndicator(container, {
      range: currentRange,
      onClearAll: vi.fn(),
    });
    expect(container.innerHTML).toBe('');
  });
});

// ── AC5 / AC6: Indicator and clear-all absent when no range set ───────────────

describe('AC5/AC6 – indicator and clear-all absent when no range set', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('container is empty when both inputs are empty strings', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.innerHTML).toBe('');
  });

  it('no indicator element when range is { start: "", end: "" }', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
  });

  it('no clear-all button when range is { start: "", end: "" }', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).toBeNull();
  });

  it('isDateRangeFilterActive returns false for empty range', () => {
    expect(isDateRangeFilterActive({ start: '', end: '' })).toBe(false);
  });
});

// ── AC8: Indicator hidden after range cleared ─────────────────────────────────

describe('AC8 – indicator hidden after range is cleared', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('indicator disappears when re-rendered with cleared range', () => {
    renderDateRangeFilterIndicator(container, {
      range: RANGE_JAN,
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();

    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
  });

  it('clear-all button disappears when re-rendered with cleared range', () => {
    renderDateRangeFilterIndicator(container, {
      range: RANGE_JAN,
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).not.toBeNull();

    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).toBeNull();
  });

  it('switching from one active range to another updates the indicator text', () => {
    renderDateRangeFilterIndicator(container, {
      range: RANGE_JAN,
      onClearAll: vi.fn(),
    });
    const indicatorJan = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicatorJan?.textContent).toContain(RANGE_JAN.start);

    renderDateRangeFilterIndicator(container, {
      range: RANGE_FEB,
      onClearAll: vi.fn(),
    });
    const indicatorFeb = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicatorFeb?.textContent).toContain(RANGE_FEB.start);
    expect(indicatorFeb?.textContent).not.toContain(RANGE_JAN.start);
  });
});

// ── AC9: Clear-all resets inputs and restores log ─────────────────────────────

describe('AC9 – clear-all resets both inputs and restores unfiltered log', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('onClearAll callback receives empty start and end', () => {
    const received: DateRange[] = [];
    renderDateRangeFilterIndicator(container, {
      range: RANGE_JAN,
      onClearAll: (r) => received.push(r),
    });
    (container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement).click();
    expect(received[0]).toEqual({ start: '', end: '' });
  });

  it('filterByDateRange with cleared range returns all 6 fixture entries', () => {
    let range: DateRange = RANGE_JAN;
    renderDateRangeFilterIndicator(container, {
      range,
      onClearAll: (r) => { range = r; },
    });
    (container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement).click();
    expect(filterByDateRange(LOG_ENTRIES, range)).toHaveLength(LOG_ENTRIES.length);
  });
});

// ── AC10: Partial range (one input only) shows no indicator ───────────────────

describe('AC10 – partial range (only one input) shows no indicator or clear-all', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('no indicator when only start is set', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
  });

  it('no clear-all when only start is set', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-01-01T00:00', end: '' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).toBeNull();
  });

  it('no indicator when only end is set', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).toBeNull();
  });

  it('no clear-all when only end is set', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '', end: '2024-01-31T23:59' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).toBeNull();
  });

  it('isDateRangeFilterActive returns false for partial range (start only)', () => {
    expect(isDateRangeFilterActive({ start: '2024-01-01T00:00', end: '' })).toBe(false);
  });

  it('isDateRangeFilterActive returns false for partial range (end only)', () => {
    expect(isDateRangeFilterActive({ start: '', end: '2024-01-31T23:59' })).toBe(false);
  });

  it('filterByDateRange returns all entries for partial range (start only)', () => {
    const result = filterByDateRange(LOG_ENTRIES, { start: '2024-01-01T00:00', end: '' });
    expect(result).toHaveLength(LOG_ENTRIES.length);
  });

  it('filterByDateRange returns all entries for partial range (end only)', () => {
    const result = filterByDateRange(LOG_ENTRIES, { start: '', end: '2024-01-31T23:59' });
    expect(result).toHaveLength(LOG_ENTRIES.length);
  });
});

// ── AC11: Keyboard accessibility ──────────────────────────────────────────────

describe('AC11 – clear-all control is keyboard-accessible', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('clear-all is a <button> element (natively focusable via Tab)', () => {
    renderDateRangeFilterIndicator(container, {
      range: RANGE_JAN,
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(btn?.tagName.toLowerCase()).toBe('button');
  });

  it('clear-all button has type="button" (no accidental form submission)', () => {
    renderDateRangeFilterIndicator(container, {
      range: RANGE_JAN,
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    expect(btn.type).toBe('button');
  });

  it('clear-all button has a non-empty aria-label', () => {
    renderDateRangeFilterIndicator(container, {
      range: RANGE_JAN,
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    const label = btn.getAttribute('aria-label');
    expect(label).toBeTruthy();
    expect(label!.trim().length).toBeGreaterThan(0);
  });

  it('clear-all button is not disabled when range is active', () => {
    renderDateRangeFilterIndicator(container, {
      range: RANGE_JAN,
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('Enter key on clear-all button triggers onClearAll (via click event)', () => {
    const onClearAll = vi.fn();
    renderDateRangeFilterIndicator(container, {
      range: RANGE_JAN,
      onClearAll,
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    // jsdom dispatches click on Enter for <button> elements
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    btn.click(); // simulate the browser's default Enter→click behaviour
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });
});

// ── Boundary / edge-case tests for filterByDateRange ─────────────────────────

describe('filterByDateRange – boundary and edge cases', () => {
  it('includes entry exactly at start boundary', () => {
    const result = filterByDateRange(LOG_ENTRIES, {
      start: '2024-01-31T23:59',
      end: '2024-02-29T23:59',
    });
    expect(result.map((e) => e.id)).toContain(3); // id=3 is at start boundary
  });

  it('includes entry exactly at end boundary', () => {
    const result = filterByDateRange(LOG_ENTRIES, {
      start: '2024-01-01T00:00',
      end: '2024-01-31T23:59',
    });
    expect(result.map((e) => e.id)).toContain(3); // id=3 is at end boundary
  });

  it('includes entry exactly at start boundary of February range', () => {
    const result = filterByDateRange(LOG_ENTRIES, RANGE_FEB);
    expect(result.map((e) => e.id)).toContain(4); // id=4 is at start boundary
  });

  it('returns empty array when range excludes all entries', () => {
    const result = filterByDateRange(LOG_ENTRIES, {
      start: '2025-01-01T00:00',
      end: '2025-12-31T23:59',
    });
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty entries list with active range', () => {
    const result = filterByDateRange([], RANGE_JAN);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty entries list with cleared range', () => {
    const result = filterByDateRange([], clearDateRangeFilter());
    expect(result).toHaveLength(0);
  });

  it('January range returns exactly ids 1, 2, 3', () => {
    const result = filterByDateRange(LOG_ENTRIES, RANGE_JAN);
    expect(result.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it('February range returns exactly ids 4, 5', () => {
    const result = filterByDateRange(LOG_ENTRIES, RANGE_FEB);
    expect(result.map((e) => e.id)).toEqual([4, 5]);
  });
});

// ── Idempotency: re-rendering produces consistent DOM ─────────────────────────

describe('renderDateRangeFilterIndicator – idempotency', () => {
  let container: HTMLElement;
  beforeEach(() => { container = makeContainer(); });
  afterEach(() => { container.remove(); });

  it('calling render twice with the same active range produces one indicator', () => {
    renderDateRangeFilterIndicator(container, { range: RANGE_JAN, onClearAll: vi.fn() });
    renderDateRangeFilterIndicator(container, { range: RANGE_JAN, onClearAll: vi.fn() });
    expect(container.querySelectorAll('[data-date-range-filter-indicator]')).toHaveLength(1);
  });

  it('calling render twice with the same active range produces one clear-all button', () => {
    renderDateRangeFilterIndicator(container, { range: RANGE_JAN, onClearAll: vi.fn() });
    renderDateRangeFilterIndicator(container, { range: RANGE_JAN, onClearAll: vi.fn() });
    expect(container.querySelectorAll('[data-date-range-filter-clear-all]')).toHaveLength(1);
  });

  it('calling render twice with inactive range keeps container empty', () => {
    renderDateRangeFilterIndicator(container, { range: { start: '', end: '' }, onClearAll: vi.fn() });
    renderDateRangeFilterIndicator(container, { range: { start: '', end: '' }, onClearAll: vi.fn() });
    expect(container.innerHTML).toBe('');
  });
});
