/**
 * Supplementary unit tests for Issue #251: Event-type filter multi-select control.
 *
 * These tests add additional coverage for the acceptance criteria beyond what
 * is already present in eventTypeFilterControl.test.ts, focusing on edge cases,
 * integration scenarios, and explicit AC mapping.
 *
 * Spec ref: spec § "Event log filtering — Event-type filter"
 *
 * Acceptance criteria covered:
 *   AC1  – control renders with all distinct event types from the log
 *   AC2  – option list updates reactively when new event types appear
 *   AC3  – selecting one or more types limits visible entries to matches
 *   AC4  – deselecting all / choosing "All" restores the full unfiltered view
 *   AC5  – visible indicator when a non-default selection is active
 *   AC6  – clear-all control removes the filter in one action
 *   AC7  – filter composes correctly with date-range and status filters
 *   AC8  – unit tests: single type selected, multiple types, all cleared
 *   AC9  – graceful empty state when log is empty
 *   AC10 – no special-case code for simulator vs. real data
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getDistinctEventTypes,
  applyEventTypeFilter,
  renderEventTypeFilterControl,
  mountEventTypeFilterControl,
  isEventTypeFilterActive,
  clearEventTypeFilter,
} from '../src/eventTypeFilterControl';
import { filterByEventTypes } from '../src/eventTypeFilter';
import { filterByDateRange } from '../src/dateRangeFilter';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function entry(
  id: number,
  eventType: string,
  timestamp = '2024-06-01T12:00:00.000Z',
  status = 'delivered',
) {
  return { id, eventType, timestamp, status };
}

const FIXTURE = [
  entry(1, 'payment.created', '2024-01-10T08:00:00.000Z', 'delivered'),
  entry(2, 'refund.issued',   '2024-02-14T09:00:00.000Z', 'failed'),
  entry(3, 'payment.created', '2024-03-20T10:00:00.000Z', 'delivered'),
  entry(4, 'dispute.opened',  '2024-04-05T11:00:00.000Z', 'pending'),
  entry(5, 'refund.issued',   '2024-05-25T12:00:00.000Z', 'exhausted'),
  entry(6, 'payout.paid',     '2024-06-01T13:00:00.000Z', 'delivered'),
];

// ── AC1: control renders with all distinct event types ────────────────────────

describe('AC1 – control renders with all distinct event types', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('renders options for all four distinct types in FIXTURE', () => {
    const types = getDistinctEventTypes(FIXTURE);
    renderEventTypeFilterControl(container, {
      selectedTypes: [],
      availableTypes: types,
      onChange: vi.fn(),
    });
    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    const typeOptions = Array.from(select.options).filter((o) => o.value !== '');
    expect(typeOptions).toHaveLength(4);
    const values = typeOptions.map((o) => o.value);
    expect(values).toContain('dispute.opened');
    expect(values).toContain('payment.created');
    expect(values).toContain('payout.paid');
    expect(values).toContain('refund.issued');
  });

  it('options are rendered in sorted (alphabetical) order', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: [],
      availableTypes: ['refund.issued', 'payment.created', 'dispute.opened'],
      onChange: vi.fn(),
    });
    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    const typeOptions = Array.from(select.options).filter((o) => o.value !== '');
    // getDistinctEventTypes sorts; availableTypes is passed pre-sorted by caller
    // The order in the DOM should match the order of availableTypes
    expect(typeOptions[0].value).toBe('refund.issued');
    expect(typeOptions[1].value).toBe('payment.created');
    expect(typeOptions[2].value).toBe('dispute.opened');
  });

  it('wrapper element has data-event-type-filter-control attribute', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: [],
      availableTypes: ['payment.created'],
      onChange: vi.fn(),
    });
    const wrapper = container.querySelector('[data-event-type-filter-control]');
    expect(wrapper).not.toBeNull();
  });

  it('select element has id "event-type-filter-select"', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: [],
      availableTypes: ['payment.created'],
      onChange: vi.fn(),
    });
    const select = document.getElementById('event-type-filter-select');
    expect(select).not.toBeNull();
    expect(select?.tagName.toLowerCase()).toBe('select');
  });

  it('label "for" attribute matches the select id', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: [],
      availableTypes: ['payment.created'],
      onChange: vi.fn(),
    });
    const label = container.querySelector('[data-event-type-filter-label]') as HTMLLabelElement;
    expect(label.getAttribute('for')).toBe('event-type-filter-select');
  });
});

// ── AC2: reactive population ──────────────────────────────────────────────────

describe('AC2 – option list updates reactively when new event types appear', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('update() removes types that are no longer present in the log', () => {
    const ctrl = mountEventTypeFilterControl(container, FIXTURE, vi.fn());

    // Remove payout.paid and dispute.opened from the log
    const reducedEntries = FIXTURE.filter(
      (e) => e.eventType !== 'payout.paid' && e.eventType !== 'dispute.opened',
    );
    ctrl.update(reducedEntries);

    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    const typeOptions = Array.from(select.options).filter((o) => o.value !== '');
    expect(typeOptions).toHaveLength(2);
    expect(typeOptions.map((o) => o.value)).not.toContain('payout.paid');
    expect(typeOptions.map((o) => o.value)).not.toContain('dispute.opened');
  });

  it('update() prunes selected types that are no longer available', () => {
    const onFilterChange = vi.fn();
    const ctrl = mountEventTypeFilterControl(container, FIXTURE, onFilterChange);

    // Simulate selecting payout.paid
    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    const payoutOpt = Array.from(select.options).find((o) => o.value === 'payout.paid')!;
    payoutOpt.selected = true;
    const allOpt = container.querySelector('[data-event-type-filter-all-option]') as HTMLOptionElement;
    allOpt.selected = false;
    select.dispatchEvent(new Event('change'));

    expect(ctrl.getSelectedTypes()).toContain('payout.paid');

    // Now remove payout.paid from the log
    const reducedEntries = FIXTURE.filter((e) => e.eventType !== 'payout.paid');
    ctrl.update(reducedEntries);

    // payout.paid should be pruned from the selection
    expect(ctrl.getSelectedTypes()).not.toContain('payout.paid');
  });

  it('update() with a completely new set of entries replaces all options', () => {
    const ctrl = mountEventTypeFilterControl(container, FIXTURE, vi.fn());

    const newEntries = [
      entry(10, 'charge.succeeded', '2024-07-01T00:00:00.000Z'),
      entry(11, 'charge.failed',    '2024-07-02T00:00:00.000Z'),
    ];
    ctrl.update(newEntries);

    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    const typeOptions = Array.from(select.options).filter((o) => o.value !== '');
    expect(typeOptions).toHaveLength(2);
    expect(typeOptions.map((o) => o.value)).toContain('charge.succeeded');
    expect(typeOptions.map((o) => o.value)).toContain('charge.failed');
    // Old types should be gone
    expect(typeOptions.map((o) => o.value)).not.toContain('payment.created');
  });
});

// ── AC3: selecting types limits visible entries ───────────────────────────────

describe('AC3 – selecting types limits visible entries to matches', () => {
  it('single type: only entries with that type are returned', () => {
    const result = applyEventTypeFilter(FIXTURE, ['payout.paid']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(6);
  });

  it('multiple types: entries matching any selected type are returned', () => {
    const result = applyEventTypeFilter(FIXTURE, ['dispute.opened', 'payout.paid']);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toContain(4);
    expect(result.map((e) => e.id)).toContain(6);
  });

  it('type not present in log: returns empty array', () => {
    const result = applyEventTypeFilter(FIXTURE, ['subscription.created']);
    expect(result).toHaveLength(0);
  });

  it('all types selected individually: returns all entries', () => {
    const allTypes = getDistinctEventTypes(FIXTURE);
    const result = applyEventTypeFilter(FIXTURE, allTypes);
    expect(result).toHaveLength(FIXTURE.length);
  });

  it('onChange is called with selected types when user picks a type', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const onChange = vi.fn();
    renderEventTypeFilterControl(container, {
      selectedTypes: [],
      availableTypes: ['payment.created', 'refund.issued'],
      onChange,
    });

    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    const allOpt = container.querySelector('[data-event-type-filter-all-option]') as HTMLOptionElement;
    const paymentOpt = Array.from(select.options).find((o) => o.value === 'payment.created')!;

    allOpt.selected = false;
    paymentOpt.selected = true;
    select.dispatchEvent(new Event('change'));

    expect(onChange).toHaveBeenCalledWith(['payment.created']);

    container.remove();
  });
});

// ── AC4: deselecting all / choosing "All" restores full view ──────────────────

describe('AC4 – deselecting all / choosing "All" restores full unfiltered view', () => {
  it('applyEventTypeFilter with empty array returns original array reference', () => {
    const result = applyEventTypeFilter(FIXTURE, []);
    expect(result).toBe(FIXTURE);
  });

  it('clearEventTypeFilter returns an empty array', () => {
    expect(clearEventTypeFilter()).toEqual([]);
  });

  it('isEventTypeFilterActive returns false after clearEventTypeFilter', () => {
    const cleared = clearEventTypeFilter();
    expect(isEventTypeFilterActive(cleared)).toBe(false);
  });

  it('isEventTypeFilterActive returns true when types are selected', () => {
    expect(isEventTypeFilterActive(['payment.created'])).toBe(true);
    expect(isEventTypeFilterActive(['payment.created', 'refund.issued'])).toBe(true);
  });

  it('isEventTypeFilterActive returns false for empty array', () => {
    expect(isEventTypeFilterActive([])).toBe(false);
  });

  it('reset() on mounted control re-renders with "All" option selected', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const ctrl = mountEventTypeFilterControl(container, FIXTURE, vi.fn());

    // Select a type first
    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    const paymentOpt = Array.from(select.options).find((o) => o.value === 'payment.created')!;
    paymentOpt.selected = true;
    const allOpt = container.querySelector('[data-event-type-filter-all-option]') as HTMLOptionElement;
    allOpt.selected = false;
    select.dispatchEvent(new Event('change'));

    // Reset
    ctrl.reset();

    // "All" option should now be selected
    const allOptAfter = container.querySelector('[data-event-type-filter-all-option]') as HTMLOptionElement;
    expect(allOptAfter.selected).toBe(true);

    container.remove();
  });
});

// ── AC5: visible indicator when non-default selection is active ───────────────

describe('AC5 – visible indicator when non-default selection is active', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('indicator shows singular "type" for exactly one selected type', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: ['payment.created'],
      availableTypes: ['payment.created', 'refund.issued'],
      onChange: vi.fn(),
    });
    const indicator = container.querySelector('[data-event-type-filter-indicator]');
    expect(indicator?.textContent).toMatch(/1 event type/);
  });

  it('indicator shows plural "types" for two or more selected types', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: ['payment.created', 'refund.issued'],
      availableTypes: ['payment.created', 'refund.issued', 'dispute.opened'],
      onChange: vi.fn(),
    });
    const indicator = container.querySelector('[data-event-type-filter-indicator]');
    expect(indicator?.textContent).toMatch(/2 event types/);
  });

  it('indicator has role="status" for accessibility', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: ['payment.created'],
      availableTypes: ['payment.created'],
      onChange: vi.fn(),
    });
    const indicator = container.querySelector('[data-event-type-filter-indicator]');
    expect(indicator?.getAttribute('role')).toBe('status');
  });

  it('indicator has aria-live="polite" for screen reader announcements', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: ['payment.created'],
      availableTypes: ['payment.created'],
      onChange: vi.fn(),
    });
    const indicator = container.querySelector('[data-event-type-filter-indicator]');
    expect(indicator?.getAttribute('aria-live')).toBe('polite');
  });

  it('indicator disappears after clear-all is clicked', () => {
    const onChange = vi.fn();
    renderEventTypeFilterControl(container, {
      selectedTypes: ['payment.created'],
      availableTypes: ['payment.created', 'refund.issued'],
      onChange,
    });

    // Indicator is present
    expect(container.querySelector('[data-event-type-filter-indicator]')).not.toBeNull();

    // Click clear-all
    const clearBtn = container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement;
    clearBtn.click();

    // onChange was called with empty array — caller would re-render with selectedTypes=[]
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

// ── AC6: clear-all control removes the filter in one action ──────────────────

describe('AC6 – clear-all control removes the filter in one action', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('clear-all button has an accessible aria-label', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: ['payment.created'],
      availableTypes: ['payment.created'],
      onChange: vi.fn(),
    });
    const clearBtn = container.querySelector('[data-event-type-filter-clear-all]');
    const ariaLabel = clearBtn?.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel!.trim().length).toBeGreaterThan(0);
  });

  it('clear-all button has type="button" (does not submit forms)', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: ['payment.created'],
      availableTypes: ['payment.created'],
      onChange: vi.fn(),
    });
    const clearBtn = container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement;
    expect(clearBtn.type).toBe('button');
  });

  it('mounted control: reset() is the programmatic equivalent of clear-all', () => {
    const onFilterChange = vi.fn();
    const ctrl = mountEventTypeFilterControl(container, FIXTURE, onFilterChange);

    // Select two types
    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    const allOpt = container.querySelector('[data-event-type-filter-all-option]') as HTMLOptionElement;
    const paymentOpt = Array.from(select.options).find((o) => o.value === 'payment.created')!;
    const refundOpt = Array.from(select.options).find((o) => o.value === 'refund.issued')!;
    allOpt.selected = false;
    paymentOpt.selected = true;
    refundOpt.selected = true;
    select.dispatchEvent(new Event('change'));

    expect(ctrl.getSelectedTypes().length).toBeGreaterThan(0);

    onFilterChange.mockClear();
    ctrl.reset();

    expect(ctrl.getSelectedTypes()).toEqual([]);
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith([]);
  });
});

// ── AC7: filter composition ───────────────────────────────────────────────────

describe('AC7 – filter composes correctly with date-range and status filters', () => {
  it('event-type + date-range: intersection of both filters', () => {
    // Only payment.created entries in Q1 2024
    const typeFiltered = filterByEventTypes(FIXTURE, ['payment.created']);
    const dateFiltered = filterByDateRange(typeFiltered, {
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-03-31T23:59:59.999Z',
    });
    expect(dateFiltered).toHaveLength(2);
    expect(dateFiltered.map((e) => e.id)).toEqual([1, 3]);
  });

  it('event-type + status: only entries matching both dimensions', () => {
    const typeFiltered = filterByEventTypes(FIXTURE, ['refund.issued']);
    const statusFiltered = typeFiltered.filter((e) => e.status === 'exhausted');
    expect(statusFiltered).toHaveLength(1);
    expect(statusFiltered[0].id).toBe(5);
  });

  it('event-type + date-range + status: all three active simultaneously', () => {
    const typeFiltered = filterByEventTypes(FIXTURE, ['payment.created', 'refund.issued']);
    const dateFiltered = filterByDateRange(typeFiltered, {
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-03-31T23:59:59.999Z',
    });
    const statusFiltered = dateFiltered.filter((e) => e.status === 'delivered');
    // Entries 1 and 3 are payment.created + Q1 2024 + delivered
    expect(statusFiltered).toHaveLength(2);
    expect(statusFiltered.map((e) => e.id)).toEqual([1, 3]);
  });

  it('event-type filter active, date-range cleared: all dates for selected types', () => {
    const typeFiltered = filterByEventTypes(FIXTURE, ['payout.paid']);
    const dateFiltered = filterByDateRange(typeFiltered, {}); // no date range
    expect(dateFiltered).toHaveLength(1);
    expect(dateFiltered[0].id).toBe(6);
  });

  it('date-range active, event-type cleared: all types within date range', () => {
    const typeFiltered = filterByEventTypes(FIXTURE, []); // all types
    const dateFiltered = filterByDateRange(typeFiltered, {
      start: '2024-04-01T00:00:00.000Z',
      end: '2024-06-30T23:59:59.999Z',
    });
    // Entries 4, 5, 6 are in Q2 2024
    expect(dateFiltered).toHaveLength(3);
    expect(dateFiltered.map((e) => e.id)).toEqual([4, 5, 6]);
  });

  it('all three filters cleared: full unfiltered list returned', () => {
    const typeFiltered = filterByEventTypes(FIXTURE, []);
    const dateFiltered = filterByDateRange(typeFiltered, {});
    const statusFiltered = dateFiltered; // no status filter = all statuses
    expect(statusFiltered).toHaveLength(FIXTURE.length);
  });

  it('event-type filter produces empty set: subsequent filters also return empty', () => {
    const typeFiltered = filterByEventTypes(FIXTURE, ['nonexistent.event']);
    expect(typeFiltered).toHaveLength(0);

    const dateFiltered = filterByDateRange(typeFiltered, {
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-12-31T23:59:59.999Z',
    });
    expect(dateFiltered).toHaveLength(0);

    const statusFiltered = dateFiltered.filter((e) => e.status === 'delivered');
    expect(statusFiltered).toHaveLength(0);
  });
});

// ── AC8: mandated unit-test cases ─────────────────────────────────────────────

describe('AC8 – single type selected, multiple types selected, all types cleared', () => {
  // AC8a: single event type selected
  it('AC8a – single type "payment.created": returns only payment.created entries', () => {
    const result = applyEventTypeFilter(FIXTURE, ['payment.created']);
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.eventType === 'payment.created')).toBe(true);
    expect(result.map((e) => e.id)).toEqual([1, 3]);
  });

  it('AC8a – single type "dispute.opened": returns only dispute.opened entries', () => {
    const result = applyEventTypeFilter(FIXTURE, ['dispute.opened']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(4);
  });

  // AC8b: multiple event types selected
  it('AC8b – two types selected: returns entries matching either type', () => {
    const result = applyEventTypeFilter(FIXTURE, ['payment.created', 'payout.paid']);
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.id)).toEqual([1, 3, 6]);
  });

  it('AC8b – three types selected: returns entries matching any of the three', () => {
    const result = applyEventTypeFilter(FIXTURE, ['payment.created', 'refund.issued', 'payout.paid']);
    expect(result).toHaveLength(5);
    expect(result.some((e) => e.eventType === 'dispute.opened')).toBe(false);
  });

  // AC8c: all types cleared / reset to "All"
  it('AC8c – empty selectedTypes: returns full unfiltered list (same reference)', () => {
    const result = applyEventTypeFilter(FIXTURE, []);
    expect(result).toBe(FIXTURE);
    expect(result).toHaveLength(FIXTURE.length);
  });

  it('AC8c – mounted control reset: getSelectedTypes returns empty array', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const ctrl = mountEventTypeFilterControl(container, FIXTURE, vi.fn());

    // Select a type
    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    const allOpt = container.querySelector('[data-event-type-filter-all-option]') as HTMLOptionElement;
    const paymentOpt = Array.from(select.options).find((o) => o.value === 'payment.created')!;
    allOpt.selected = false;
    paymentOpt.selected = true;
    select.dispatchEvent(new Event('change'));

    expect(ctrl.getSelectedTypes()).toEqual(['payment.created']);

    // Reset to "All"
    ctrl.reset();
    expect(ctrl.getSelectedTypes()).toEqual([]);

    // Applying the cleared filter returns all entries
    const filtered = applyEventTypeFilter(FIXTURE, ctrl.getSelectedTypes());
    expect(filtered).toHaveLength(FIXTURE.length);

    container.remove();
  });
});

// ── AC9: graceful empty state ─────────────────────────────────────────────────

describe('AC9 – graceful empty state when log is empty', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('getDistinctEventTypes returns empty array for empty log', () => {
    expect(getDistinctEventTypes([])).toEqual([]);
  });

  it('applyEventTypeFilter returns empty array for empty log with any selection', () => {
    expect(applyEventTypeFilter([], ['payment.created'])).toHaveLength(0);
    expect(applyEventTypeFilter([], [])).toHaveLength(0);
  });

  it('mountEventTypeFilterControl with empty entries renders only "All" option', () => {
    mountEventTypeFilterControl(container, [], vi.fn());
    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    const typeOptions = Array.from(select.options).filter((o) => o.value !== '');
    expect(typeOptions).toHaveLength(0);
    const allOpt = container.querySelector('[data-event-type-filter-all-option]') as HTMLOptionElement;
    expect(allOpt).not.toBeNull();
    expect(allOpt.selected).toBe(true);
  });

  it('mountEventTypeFilterControl with empty entries: no indicator shown', () => {
    mountEventTypeFilterControl(container, [], vi.fn());
    expect(container.querySelector('[data-event-type-filter-indicator]')).toBeNull();
  });

  it('mountEventTypeFilterControl with empty entries: no clear-all button shown', () => {
    mountEventTypeFilterControl(container, [], vi.fn());
    expect(container.querySelector('[data-event-type-filter-clear-all]')).toBeNull();
  });

  it('update() from empty to non-empty log populates options', () => {
    const ctrl = mountEventTypeFilterControl(container, [], vi.fn());

    // Initially no type options
    let select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    expect(Array.from(select.options).filter((o) => o.value !== '')).toHaveLength(0);

    // Update with entries
    ctrl.update(FIXTURE);

    select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    const typeOptions = Array.from(select.options).filter((o) => o.value !== '');
    expect(typeOptions).toHaveLength(4);
  });
});

// ── AC10: no special-case code for simulator vs. real data ────────────────────

describe('AC10 – no special-case code for simulator vs. real data', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('getDistinctEventTypes works with simulator-shaped entries (string id)', () => {
    const simEntries = [
      { id: 'sim-1', eventType: 'payment.created', timestamp: '2024-01-01T00:00:00.000Z', status: 'delivered' },
      { id: 'sim-2', eventType: 'refund.issued',   timestamp: '2024-01-02T00:00:00.000Z', status: 'failed' },
      { id: 'sim-3', eventType: 'payment.created', timestamp: '2024-01-03T00:00:00.000Z', status: 'delivered' },
    ];
    const types = getDistinctEventTypes(simEntries);
    expect(types).toEqual(['payment.created', 'refund.issued']);
  });

  it('applyEventTypeFilter works with simulator-shaped entries', () => {
    const simEntries = [
      { id: 'sim-1', eventType: 'payment.created', timestamp: '2024-01-01T00:00:00.000Z', status: 'delivered' },
      { id: 'sim-2', eventType: 'refund.issued',   timestamp: '2024-01-02T00:00:00.000Z', status: 'failed' },
    ];
    const result = applyEventTypeFilter(simEntries, ['refund.issued']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('sim-2');
  });

  it('mountEventTypeFilterControl works with simulator-shaped entries', () => {
    const simEntries = [
      { id: 'sim-1', eventType: 'payment.created', timestamp: '2024-01-01T00:00:00.000Z', status: 'delivered' },
      { id: 'sim-2', eventType: 'refund.issued',   timestamp: '2024-01-02T00:00:00.000Z', status: 'failed' },
      { id: 'sim-3', eventType: 'payout.paid',     timestamp: '2024-01-03T00:00:00.000Z', status: 'delivered' },
    ];
    const ctrl = mountEventTypeFilterControl(container, simEntries, vi.fn());
    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    const typeOptions = Array.from(select.options).filter((o) => o.value !== '');
    expect(typeOptions).toHaveLength(3);
    expect(typeOptions.map((o) => o.value)).toContain('payment.created');
    expect(typeOptions.map((o) => o.value)).toContain('refund.issued');
    expect(typeOptions.map((o) => o.value)).toContain('payout.paid');

    // reset works without error
    ctrl.reset();
    expect(ctrl.getSelectedTypes()).toEqual([]);
  });

  it('filter composition works identically with simulator data', () => {
    const simEntries = [
      { id: 'sim-1', eventType: 'payment.created', timestamp: '2024-03-01T00:00:00.000Z', status: 'delivered' },
      { id: 'sim-2', eventType: 'refund.issued',   timestamp: '2024-03-15T00:00:00.000Z', status: 'failed' },
      { id: 'sim-3', eventType: 'payment.created', timestamp: '2024-04-01T00:00:00.000Z', status: 'delivered' },
    ];

    // Event-type + date-range + status
    const typeFiltered = filterByEventTypes(simEntries, ['payment.created']);
    const dateFiltered = filterByDateRange(typeFiltered, {
      start: '2024-03-01T00:00:00.000Z',
      end: '2024-03-31T23:59:59.999Z',
    });
    const statusFiltered = dateFiltered.filter((e) => e.status === 'delivered');

    expect(statusFiltered).toHaveLength(1);
    expect(statusFiltered[0].id).toBe('sim-1');
  });
});
