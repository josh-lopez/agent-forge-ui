/**
 * Supplemental unit tests for Issue #291: Date-range filter active-filter
 * indicator — additional coverage beyond the primary test file.
 *
 * Spec ref: spec § "Event log filtering — Date-range filter"
 *   "Active-filter indicator: while a date range is set, a visible indicator
 *    confirms the filter is active; a clear-all control removes the range in
 *    one action."
 *
 * These tests extend the primary issue291-date-range-indicator.test.ts with:
 *   - Full DOM round-trip: inputs → indicator → clear-all → inputs reset (AC4)
 *   - Indicator text content reflects the active range values (AC1)
 *   - Idempotency: multiple sequential renders produce consistent DOM (AC1/AC2)
 *   - Custom clearAllAriaLabel override (AC3)
 *   - Edge cases: zero entries, all-failed, single-attempt (AC8 edge cases)
 *   - Three-way filter composition: date-range + event-type + status (AC7)
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

function entry(
  id: number,
  timestamp: string,
  eventType = 'payment.created',
  status = 'delivered',
) {
  return { id, timestamp, eventType, status };
}

const FIXTURE = [
  entry(1, '2024-03-01T10:00:00.000Z', 'payment.created', 'delivered'),
  entry(2, '2024-03-15T12:00:00.000Z', 'refund.issued',   'failed'),
  entry(3, '2024-03-31T23:59:59.000Z', 'payment.created', 'delivered'),
  entry(4, '2024-04-10T08:00:00.000Z', 'dispute.opened',  'pending'),
  entry(5, '2024-04-30T00:00:00.000Z', 'refund.issued',   'exhausted'),
];

// ── AC1 supplemental: indicator text content reflects active range ─────────────

describe('AC1 supplemental – indicator text content reflects the active range', () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => { container.remove(); });

  it('indicator text mentions the start value when only start is set', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.textContent).toContain('2024-03-01T00:00');
  });

  it('indicator text mentions the end value when only end is set', () => {
    renderDateRangeFilterIndicator(container, {
      range: { end: '2024-03-31T23:59' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.textContent).toContain('2024-03-31T23:59');
  });

  it('indicator text mentions both start and end when both are set', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.textContent).toContain('2024-03-01T00:00');
    expect(indicator?.textContent).toContain('2024-03-31T23:59');
  });

  it('indicator has role="status" for accessibility', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.getAttribute('role')).toBe('status');
  });
});

// ── AC2 supplemental: idempotency across multiple sequential renders ───────────

describe('AC2 supplemental – idempotency: multiple renders produce consistent DOM', () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => { container.remove(); });

  it('rendering active range twice leaves exactly one indicator element', () => {
    const opts = {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    };
    renderDateRangeFilterIndicator(container, opts);
    renderDateRangeFilterIndicator(container, opts);
    expect(container.querySelectorAll('[data-date-range-filter-indicator]')).toHaveLength(1);
  });

  it('rendering active range twice leaves exactly one clear-all button', () => {
    const opts = {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    };
    renderDateRangeFilterIndicator(container, opts);
    renderDateRangeFilterIndicator(container, opts);
    expect(container.querySelectorAll('[data-date-range-filter-clear-all]')).toHaveLength(1);
  });

  it('rendering inactive range after active range leaves container empty', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    renderDateRangeFilterIndicator(container, {
      range: {},
      onClearAll: vi.fn(),
    });
    expect(container.innerHTML).toBe('');
  });

  it('rendering active range after inactive range shows the indicator', () => {
    renderDateRangeFilterIndicator(container, {
      range: {},
      onClearAll: vi.fn(),
    });
    renderDateRangeFilterIndicator(container, {
      range: { end: '2024-04-30T00:00' },
      onClearAll: vi.fn(),
    });
    expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
  });

  it('rendering with updated range values reflects the new values in indicator text', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-04-01T00:00' },
      onClearAll: vi.fn(),
    });
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.textContent).toContain('2024-04-01T00:00');
    expect(indicator?.textContent).not.toContain('2024-03-01T00:00');
  });
});

// ── AC3 supplemental: custom clearAllAriaLabel override ───────────────────────

describe('AC3 supplemental – custom clearAllAriaLabel override', () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => { container.remove(); });

  it('uses the default aria-label when clearAllAriaLabel is not supplied', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(btn?.getAttribute('aria-label')).toBeTruthy();
  });

  it('uses the caller-supplied clearAllAriaLabel when provided', () => {
    renderDateRangeFilterIndicator(container, {
      range: { start: '2024-03-01T00:00' },
      onClearAll: vi.fn(),
      clearAllAriaLabel: 'Remove date filter',
    });
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    expect(btn?.getAttribute('aria-label')).toBe('Remove date filter');
  });

  it('custom aria-label is not applied when filter is inactive (no button rendered)', () => {
    renderDateRangeFilterIndicator(container, {
      range: {},
      onClearAll: vi.fn(),
      clearAllAriaLabel: 'Remove date filter',
    });
    expect(container.querySelector('[data-date-range-filter-clear-all]')).toBeNull();
  });
});

// ── AC4 supplemental: full DOM round-trip with renderDateRangeFilterInputs ────

describe('AC4 supplemental – full DOM round-trip: inputs → indicator → clear-all → reset', () => {
  let inputContainer: HTMLElement;
  let indicatorContainer: HTMLElement;

  beforeEach(() => {
    inputContainer = document.createElement('div');
    indicatorContainer = document.createElement('div');
    document.body.appendChild(inputContainer);
    document.body.appendChild(indicatorContainer);
  });
  afterEach(() => {
    inputContainer.remove();
    indicatorContainer.remove();
  });

  it('inputs are rendered with correct initial values from the range', () => {
    renderDateRangeFilterInputs(inputContainer, {
      range: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
      onChange: vi.fn(),
    });
    const startInput = inputContainer.querySelector('[data-date-range-start]') as HTMLInputElement | null;
    const endInput   = inputContainer.querySelector('[data-date-range-end]')   as HTMLInputElement | null;
    expect(startInput?.value).toBe('2024-03-01T00:00');
    expect(endInput?.value).toBe('2024-03-31T23:59');
  });

  it('inputs are rendered with empty values when range is cleared', () => {
    renderDateRangeFilterInputs(inputContainer, {
      range: clearDateRangeFilter(),
      onChange: vi.fn(),
    });
    const startInput = inputContainer.querySelector('[data-date-range-start]') as HTMLInputElement | null;
    const endInput   = inputContainer.querySelector('[data-date-range-end]')   as HTMLInputElement | null;
    expect(startInput?.value).toBe('');
    expect(endInput?.value).toBe('');
  });

  it('clear-all callback receives a range that makes inputs render as empty', () => {
    let capturedRange: DateRange = { start: 'sentinel', end: 'sentinel' };

    renderDateRangeFilterIndicator(indicatorContainer, {
      range: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
      onClearAll: (newRange) => { capturedRange = newRange; },
    });

    const btn = indicatorContainer.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();

    // Simulate the caller re-rendering inputs with the cleared range.
    renderDateRangeFilterInputs(inputContainer, {
      range: capturedRange,
      onChange: vi.fn(),
    });

    const startInput = inputContainer.querySelector('[data-date-range-start]') as HTMLInputElement | null;
    const endInput   = inputContainer.querySelector('[data-date-range-end]')   as HTMLInputElement | null;
    expect(startInput?.value).toBe('');
    expect(endInput?.value).toBe('');
  });

  it('after clear-all, re-rendering indicator with cleared range removes it', () => {
    let capturedRange: DateRange = { start: 'sentinel', end: 'sentinel' };

    renderDateRangeFilterIndicator(indicatorContainer, {
      range: { start: '2024-03-01T00:00', end: '2024-03-31T23:59' },
      onClearAll: (newRange) => { capturedRange = newRange; },
    });

    expect(indicatorContainer.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();

    const btn = indicatorContainer.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();

    // Simulate the caller re-rendering the indicator with the cleared range.
    renderDateRangeFilterIndicator(indicatorContainer, {
      range: capturedRange,
      onClearAll: vi.fn(),
    });

    expect(indicatorContainer.querySelector('[data-date-range-filter-indicator]')).toBeNull();
    expect(indicatorContainer.querySelector('[data-date-range-filter-clear-all]')).toBeNull();
    expect(indicatorContainer.innerHTML).toBe('');
  });
});

// ── AC5 supplemental: full unfiltered log restored after clear ────────────────

describe('AC5 supplemental – full unfiltered log restored after clear', () => {
  it('filterByDateRange with start-only cleared returns all entries', () => {
    const filtered = filterByDateRange(FIXTURE, { start: '2024-04-01T00:00:00.000Z' });
    expect(filtered).toHaveLength(2);

    const restored = filterByDateRange(FIXTURE, clearDateRangeFilter());
    expect(restored).toHaveLength(FIXTURE.length);
  });

  it('filterByDateRange with end-only cleared returns all entries', () => {
    const filtered = filterByDateRange(FIXTURE, { end: '2024-03-31T23:59:59.999Z' });
    expect(filtered).toHaveLength(3);

    const restored = filterByDateRange(FIXTURE, clearDateRangeFilter());
    expect(restored).toHaveLength(FIXTURE.length);
  });
});

// ── AC6 supplemental: boundary edge cases ─────────────────────────────────────

describe('AC6 supplemental – boundary edge cases', () => {
  it('open-ended start (no end): entry at exact start timestamp is included', () => {
    const ts = '2024-03-15T12:00:00.000Z';
    const result = filterByDateRange(FIXTURE, { start: ts });
    expect(result.some((e) => e.id === 2)).toBe(true);
  });

  it('open-ended end (no start): entry at exact end timestamp is included', () => {
    const ts = '2024-03-15T12:00:00.000Z';
    const result = filterByDateRange(FIXTURE, { end: ts });
    expect(result.some((e) => e.id === 2)).toBe(true);
  });

  it('open-ended start: entry 1 ms before start is excluded', () => {
    const startTs = '2024-03-15T12:00:00.000Z';
    const justBefore = new Date(new Date(startTs).getTime() - 1).toISOString();
    const entries = [entry(10, justBefore), entry(11, startTs)];
    const result = filterByDateRange(entries, { start: startTs });
    expect(result.some((e) => e.id === 10)).toBe(false);
    expect(result.some((e) => e.id === 11)).toBe(true);
  });

  it('open-ended end: entry 1 ms after end is excluded', () => {
    const endTs = '2024-03-31T23:59:59.000Z';
    const justAfter = new Date(new Date(endTs).getTime() + 1).toISOString();
    const entries = [entry(20, endTs), entry(21, justAfter)];
    const result = filterByDateRange(entries, { end: endTs });
    expect(result.some((e) => e.id === 20)).toBe(true);
    expect(result.some((e) => e.id === 21)).toBe(false);
  });
});

// ── AC7 supplemental: three-way filter composition ────────────────────────────

describe('AC7 supplemental – three-way filter composition: date-range + event-type + status', () => {
  it('all three filters active: only entries matching all three are shown', () => {
    const range: DateRange = {
      start: '2024-03-01T00:00:00.000Z',
      end:   '2024-04-30T23:59:59.999Z',
    };
    const dateFiltered  = filterByDateRange(FIXTURE, range);
    const typeFiltered  = filterByEventTypes(dateFiltered, ['payment.created']);
    const statusFiltered = typeFiltered.filter((e) => e.status === 'delivered');
    // Only entries 1 and 3 are payment.created + delivered in the date range.
    expect(statusFiltered).toHaveLength(2);
    expect(statusFiltered.map((e) => e.id)).toEqual([1, 3]);
  });

  it('clearing date-range while event-type and status filters are active: both still applied', () => {
    const typeFiltered   = filterByEventTypes(FIXTURE, ['refund.issued']);
    const statusFiltered = typeFiltered.filter((e) => e.status === 'failed');
    const result         = filterByDateRange(statusFiltered, clearDateRangeFilter());
    // Only entry 2 is refund.issued + failed.
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it('date-range + event-type + status: no entries match → empty result', () => {
    const range: DateRange = {
      start: '2024-03-01T00:00:00.000Z',
      end:   '2024-03-31T23:59:59.999Z',
    };
    const dateFiltered   = filterByDateRange(FIXTURE, range);
    const typeFiltered   = filterByEventTypes(dateFiltered, ['dispute.opened']);
    const statusFiltered = typeFiltered.filter((e) => e.status === 'delivered');
    // No dispute.opened entries in March.
    expect(statusFiltered).toHaveLength(0);
  });

  it('isDateRangeFilterActive is independent of event-type and status filter state', () => {
    const activeRange: DateRange = { start: '2024-03-01T00:00', end: '2024-03-31T23:59' };
    const clearedRange = clearDateRangeFilter();

    // Simulate a combined filter state object.
    const state = {
      dateRange: activeRange,
      selectedTypes: ['payment.created'],
      status: 'delivered',
    };

    expect(isDateRangeFilterActive(state.dateRange)).toBe(true);

    const newState = { ...state, dateRange: clearedRange };
    expect(isDateRangeFilterActive(newState.dateRange)).toBe(false);
    // Other filter dimensions are unchanged.
    expect(newState.selectedTypes).toEqual(['payment.created']);
    expect(newState.status).toBe('delivered');
  });
});

// ── AC8 supplemental: edge cases (zero deliveries, 100% failure, single attempt) ──

describe('AC8 supplemental – edge cases: zero deliveries, 100% failure, single attempt', () => {
  it('zero deliveries: filterByDateRange on empty array returns empty array', () => {
    const range: DateRange = {
      start: '2024-01-01T00:00:00.000Z',
      end:   '2024-12-31T23:59:59.999Z',
    };
    expect(filterByDateRange([], range)).toHaveLength(0);
    expect(filterByDateRange([], clearDateRangeFilter())).toHaveLength(0);
  });

  it('zero deliveries: isDateRangeFilterActive is unaffected by empty entry list', () => {
    expect(isDateRangeFilterActive({ start: '2024-01-01T00:00' })).toBe(true);
    expect(isDateRangeFilterActive({})).toBe(false);
  });

  it('100% failure: all-failed entries are filtered correctly by date range', () => {
    const allFailed = [
      entry(1, '2024-03-01T10:00:00.000Z', 'payment.created', 'failed'),
      entry(2, '2024-03-15T12:00:00.000Z', 'refund.issued',   'failed'),
      entry(3, '2024-04-10T08:00:00.000Z', 'dispute.opened',  'failed'),
    ];
    const range: DateRange = {
      start: '2024-03-01T00:00:00.000Z',
      end:   '2024-03-31T23:59:59.999Z',
    };
    const result = filterByDateRange(allFailed, range);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual([1, 2]);
  });

  it('100% failure: clearing date-range restores all failed entries', () => {
    const allFailed = [
      entry(1, '2024-03-01T10:00:00.000Z', 'payment.created', 'failed'),
      entry(2, '2024-03-15T12:00:00.000Z', 'refund.issued',   'failed'),
      entry(3, '2024-04-10T08:00:00.000Z', 'dispute.opened',  'failed'),
    ];
    const result = filterByDateRange(allFailed, clearDateRangeFilter());
    expect(result).toHaveLength(3);
    expect(result).toBe(allFailed); // same reference — no copy
  });

  it('single attempt: single-entry list filtered correctly when entry is in range', () => {
    const single = [entry(1, '2024-03-15T12:00:00.000Z', 'payment.created', 'delivered')];
    const range: DateRange = {
      start: '2024-03-01T00:00:00.000Z',
      end:   '2024-03-31T23:59:59.999Z',
    };
    const result = filterByDateRange(single, range);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it('single attempt: single-entry list filtered correctly when entry is outside range', () => {
    const single = [entry(1, '2024-05-01T00:00:00.000Z', 'payment.created', 'delivered')];
    const range: DateRange = {
      start: '2024-03-01T00:00:00.000Z',
      end:   '2024-03-31T23:59:59.999Z',
    };
    const result = filterByDateRange(single, range);
    expect(result).toHaveLength(0);
  });

  it('single attempt: single-entry list at exact boundary is included', () => {
    const ts = '2024-03-15T12:00:00.000Z';
    const single = [entry(1, ts)];
    const result = filterByDateRange(single, { start: ts, end: ts });
    expect(result).toHaveLength(1);
  });

  it('indicator renders correctly for a zero-entry scenario (filter state independent of entries)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    try {
      renderDateRangeFilterIndicator(container, {
        range: { start: '2024-03-01T00:00' },
        onClearAll: vi.fn(),
      });
      // Indicator should still appear even when there are no log entries.
      expect(container.querySelector('[data-date-range-filter-indicator]')).not.toBeNull();
      expect(container.querySelector('[data-date-range-filter-clear-all]')).not.toBeNull();
    } finally {
      container.remove();
    }
  });
});
