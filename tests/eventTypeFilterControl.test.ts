/**
 * Unit tests for Issue #251: Event-type filter multi-select control.
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
} from '../src/eventTypeFilterControl';
import { filterByEventTypes } from '../src/eventTypeFilter';
import { filterByDateRange } from '../src/dateRangeFilter';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function entry(
  id: number,
  eventType: string,
  timestamp = '2024-03-15T12:00:00.000Z',
  status = 'delivered',
) {
  return { id, eventType, timestamp, status };
}

const FIXTURE = [
  entry(1, 'payment.created', '2024-03-01T10:00:00.000Z', 'delivered'),
  entry(2, 'refund.issued',   '2024-03-15T12:00:00.000Z', 'failed'),
  entry(3, 'payment.created', '2024-03-31T23:59:59.000Z', 'delivered'),
  entry(4, 'dispute.opened',  '2024-04-10T08:00:00.000Z', 'pending'),
  entry(5, 'refund.issued',   '2024-04-30T00:00:00.000Z', 'exhausted'),
];

// ── getDistinctEventTypes ─────────────────────────────────────────────────────

describe('getDistinctEventTypes', () => {
  it('returns an empty array for an empty log (AC9 – graceful empty state)', () => {
    expect(getDistinctEventTypes([])).toEqual([]);
  });

  it('returns a single type when all entries share the same type', () => {
    const entries = [
      entry(1, 'payment.created'),
      entry(2, 'payment.created'),
    ];
    expect(getDistinctEventTypes(entries)).toEqual(['payment.created']);
  });

  it('returns all distinct types from the fixture, sorted', () => {
    const types = getDistinctEventTypes(FIXTURE);
    expect(types).toEqual(['dispute.opened', 'payment.created', 'refund.issued']);
  });

  it('deduplicates repeated event types', () => {
    const entries = [
      entry(1, 'payment.created'),
      entry(2, 'refund.issued'),
      entry(3, 'payment.created'),
      entry(4, 'refund.issued'),
    ];
    const types = getDistinctEventTypes(entries);
    expect(types).toHaveLength(2);
    expect(types).toContain('payment.created');
    expect(types).toContain('refund.issued');
  });

  it('returns types in sorted (alphabetical) order', () => {
    const entries = [
      entry(1, 'refund.issued'),
      entry(2, 'payment.created'),
      entry(3, 'dispute.opened'),
    ];
    const types = getDistinctEventTypes(entries);
    expect(types).toEqual(['dispute.opened', 'payment.created', 'refund.issued']);
  });
});

// ── applyEventTypeFilter ──────────────────────────────────────────────────────

describe('applyEventTypeFilter', () => {
  // AC8a: single event type selected
  it('AC8a – single type selected: returns only matching entries', () => {
    const result = applyEventTypeFilter(FIXTURE, ['payment.created']);
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.eventType === 'payment.created')).toBe(true);
  });

  // AC8b: multiple event types selected
  it('AC8b – multiple types selected: returns entries matching any selected type', () => {
    const result = applyEventTypeFilter(FIXTURE, ['payment.created', 'refund.issued']);
    expect(result).toHaveLength(4);
    expect(result.every((e) => ['payment.created', 'refund.issued'].includes(e.eventType))).toBe(true);
    expect(result.some((e) => e.eventType === 'dispute.opened')).toBe(false);
  });

  // AC8c: all types cleared
  it('AC8c – all types cleared (empty array): returns full unfiltered list', () => {
    const result = applyEventTypeFilter(FIXTURE, []);
    expect(result).toHaveLength(FIXTURE.length);
    expect(result).toBe(FIXTURE); // same reference — no copy
  });

  it('returns empty array when no entries match the selected type', () => {
    const result = applyEventTypeFilter(FIXTURE, ['charge.failed']);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty log regardless of selection', () => {
    expect(applyEventTypeFilter([], ['payment.created'])).toHaveLength(0);
    expect(applyEventTypeFilter([], [])).toHaveLength(0);
  });
});

// ── renderEventTypeFilterControl – DOM rendering ──────────────────────────────

describe('renderEventTypeFilterControl', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  // AC1: control renders with all distinct event types ──────────────────────

  it('AC1 – renders a select element with data-event-type-filter-select', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: [],
      availableTypes: ['payment.created', 'refund.issued'],
      onChange: vi.fn(),
    });
    const select = container.querySelector('[data-event-type-filter-select]');
    expect(select).not.toBeNull();
    expect(select?.tagName.toLowerCase()).toBe('select');
  });

  it('AC1 – select is a multi-select (multiple attribute)', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: [],
      availableTypes: ['payment.created', 'refund.issued'],
      onChange: vi.fn(),
    });
    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    expect(select.multiple).toBe(true);
  });

  it('AC1 – renders an option for each available event type', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: [],
      availableTypes: ['payment.created', 'refund.issued', 'dispute.opened'],
      onChange: vi.fn(),
    });
    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    const typeOptions = Array.from(select.options).filter((o) => o.value !== '');
    expect(typeOptions).toHaveLength(3);
    const values = typeOptions.map((o) => o.value);
    expect(values).toContain('payment.created');
    expect(values).toContain('refund.issued');
    expect(values).toContain('dispute.opened');
  });

  it('AC1 – renders an "All" option at the top of the list', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: [],
      availableTypes: ['payment.created'],
      onChange: vi.fn(),
    });
    const allOpt = container.querySelector('[data-event-type-filter-all-option]') as HTMLOptionElement | null;
    expect(allOpt).not.toBeNull();
    expect(allOpt?.value).toBe('');
  });

  it('AC1 – "All" option is selected when selectedTypes is empty', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: [],
      availableTypes: ['payment.created', 'refund.issued'],
      onChange: vi.fn(),
    });
    const allOpt = container.querySelector('[data-event-type-filter-all-option]') as HTMLOptionElement;
    expect(allOpt.selected).toBe(true);
  });

  it('AC1 – renders a label element for the control', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: [],
      availableTypes: ['payment.created'],
      onChange: vi.fn(),
    });
    const label = container.querySelector('[data-event-type-filter-label]');
    expect(label).not.toBeNull();
    expect(label?.tagName.toLowerCase()).toBe('label');
  });

  it('AC1 – select has an aria-label for accessibility', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: [],
      availableTypes: ['payment.created'],
      onChange: vi.fn(),
    });
    const select = container.querySelector('[data-event-type-filter-select]');
    const ariaLabel = select?.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel!.trim().length).toBeGreaterThan(0);
  });

  it('AC1 – caller-supplied selectAriaLabel overrides the default', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: [],
      availableTypes: ['payment.created'],
      onChange: vi.fn(),
      selectAriaLabel: 'Choose event types to filter',
    });
    const select = container.querySelector('[data-event-type-filter-select]');
    expect(select?.getAttribute('aria-label')).toBe('Choose event types to filter');
  });

  // AC3: selecting types limits visible entries ──────────────────────────────

  it('AC3 – selected types are reflected in the select options', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: ['payment.created'],
      availableTypes: ['payment.created', 'refund.issued'],
      onChange: vi.fn(),
    });
    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    const paymentOpt = Array.from(select.options).find((o) => o.value === 'payment.created');
    const refundOpt = Array.from(select.options).find((o) => o.value === 'refund.issued');
    expect(paymentOpt?.selected).toBe(true);
    expect(refundOpt?.selected).toBe(false);
  });

  it('AC3 – multiple selected types are all reflected in the select', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: ['payment.created', 'refund.issued'],
      availableTypes: ['payment.created', 'refund.issued', 'dispute.opened'],
      onChange: vi.fn(),
    });
    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    const paymentOpt = Array.from(select.options).find((o) => o.value === 'payment.created');
    const refundOpt = Array.from(select.options).find((o) => o.value === 'refund.issued');
    const disputeOpt = Array.from(select.options).find((o) => o.value === 'dispute.opened');
    expect(paymentOpt?.selected).toBe(true);
    expect(refundOpt?.selected).toBe(true);
    expect(disputeOpt?.selected).toBe(false);
  });

  it('AC3 – "All" option is NOT selected when specific types are chosen', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: ['payment.created'],
      availableTypes: ['payment.created', 'refund.issued'],
      onChange: vi.fn(),
    });
    const allOpt = container.querySelector('[data-event-type-filter-all-option]') as HTMLOptionElement;
    expect(allOpt.selected).toBe(false);
  });

  // AC4: deselecting all / choosing "All" restores full view ────────────────

  it('AC4 – onChange called with empty array when "All" option is selected', () => {
    const onChange = vi.fn();
    renderEventTypeFilterControl(container, {
      selectedTypes: ['payment.created'],
      availableTypes: ['payment.created', 'refund.issued'],
      onChange,
    });
    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    const allOpt = container.querySelector('[data-event-type-filter-all-option]') as HTMLOptionElement;

    // Simulate selecting "All"
    allOpt.selected = true;
    // Deselect other options
    Array.from(select.options).forEach((o) => {
      if (o.value !== '') o.selected = false;
    });
    select.dispatchEvent(new Event('change'));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('AC4 – onChange called with empty array when no options are selected', () => {
    const onChange = vi.fn();
    renderEventTypeFilterControl(container, {
      selectedTypes: ['payment.created'],
      availableTypes: ['payment.created', 'refund.issued'],
      onChange,
    });
    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;

    // Deselect everything
    Array.from(select.options).forEach((o) => { o.selected = false; });
    select.dispatchEvent(new Event('change'));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  // AC5: visible indicator when non-default selection is active ─────────────

  it('AC5 – indicator is rendered when selectedTypes is non-empty', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: ['payment.created'],
      availableTypes: ['payment.created', 'refund.issued'],
      onChange: vi.fn(),
    });
    const indicator = container.querySelector('[data-event-type-filter-indicator]');
    expect(indicator).not.toBeNull();
  });

  it('AC5 – indicator is NOT rendered when selectedTypes is empty', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: [],
      availableTypes: ['payment.created', 'refund.issued'],
      onChange: vi.fn(),
    });
    const indicator = container.querySelector('[data-event-type-filter-indicator]');
    expect(indicator).toBeNull();
  });

  it('AC5 – indicator text mentions the count of selected types', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: ['payment.created', 'refund.issued'],
      availableTypes: ['payment.created', 'refund.issued', 'dispute.opened'],
      onChange: vi.fn(),
    });
    const indicator = container.querySelector('[data-event-type-filter-indicator]');
    expect(indicator?.textContent).toContain('2');
  });

  // AC6: clear-all control removes the filter in one action ─────────────────

  it('AC6 – clear-all button is rendered when filter is active', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: ['payment.created'],
      availableTypes: ['payment.created', 'refund.issued'],
      onChange: vi.fn(),
    });
    const clearBtn = container.querySelector('[data-event-type-filter-clear-all]');
    expect(clearBtn).not.toBeNull();
  });

  it('AC6 – clear-all button is NOT rendered when filter is inactive', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: [],
      availableTypes: ['payment.created', 'refund.issued'],
      onChange: vi.fn(),
    });
    const clearBtn = container.querySelector('[data-event-type-filter-clear-all]');
    expect(clearBtn).toBeNull();
  });

  it('AC6 – clicking clear-all calls onChange with empty array', () => {
    const onChange = vi.fn();
    renderEventTypeFilterControl(container, {
      selectedTypes: ['payment.created'],
      availableTypes: ['payment.created', 'refund.issued'],
      onChange,
    });
    const clearBtn = container.querySelector('[data-event-type-filter-clear-all]') as HTMLButtonElement;
    clearBtn.click();
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('AC6 – clear-all is a native <button> element (keyboard-accessible)', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: ['payment.created'],
      availableTypes: ['payment.created'],
      onChange: vi.fn(),
    });
    const clearBtn = container.querySelector('[data-event-type-filter-clear-all]');
    expect(clearBtn?.tagName.toLowerCase()).toBe('button');
  });

  // AC9: graceful empty state ────────────────────────────────────────────────

  it('AC9 – renders correctly when availableTypes is empty (no event types in log)', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: [],
      availableTypes: [],
      onChange: vi.fn(),
    });
    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    expect(select).not.toBeNull();
    // Only the "All" option should be present
    const typeOptions = Array.from(select.options).filter((o) => o.value !== '');
    expect(typeOptions).toHaveLength(0);
    // "All" option is present and selected
    const allOpt = container.querySelector('[data-event-type-filter-all-option]') as HTMLOptionElement;
    expect(allOpt).not.toBeNull();
    expect(allOpt.selected).toBe(true);
  });

  it('AC9 – no indicator shown when log is empty', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: [],
      availableTypes: [],
      onChange: vi.fn(),
    });
    expect(container.querySelector('[data-event-type-filter-indicator]')).toBeNull();
  });

  // Idempotency ─────────────────────────────────────────────────────────────

  it('re-rendering with the same state is idempotent (no duplicate controls)', () => {
    const opts = {
      selectedTypes: ['payment.created'],
      availableTypes: ['payment.created', 'refund.issued'],
      onChange: vi.fn(),
    };
    renderEventTypeFilterControl(container, opts);
    renderEventTypeFilterControl(container, opts);
    const selects = container.querySelectorAll('[data-event-type-filter-select]');
    expect(selects).toHaveLength(1);
  });

  // Custom "All" label ───────────────────────────────────────────────────────

  it('caller-supplied allOptionLabel overrides the default', () => {
    renderEventTypeFilterControl(container, {
      selectedTypes: [],
      availableTypes: ['payment.created'],
      onChange: vi.fn(),
      allOptionLabel: 'Show all',
    });
    const allOpt = container.querySelector('[data-event-type-filter-all-option]') as HTMLOptionElement;
    expect(allOpt.textContent).toBe('Show all');
  });
});

// ── mountEventTypeFilterControl – reactive mount ──────────────────────────────

describe('mountEventTypeFilterControl', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('mounts the control with options derived from initial entries', () => {
    mountEventTypeFilterControl(container, FIXTURE, vi.fn());
    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    expect(select).not.toBeNull();
    const typeOptions = Array.from(select.options).filter((o) => o.value !== '');
    expect(typeOptions).toHaveLength(3); // dispute.opened, payment.created, refund.issued
  });

  it('getSelectedTypes returns empty array initially (no filter active)', () => {
    const ctrl = mountEventTypeFilterControl(container, FIXTURE, vi.fn());
    expect(ctrl.getSelectedTypes()).toEqual([]);
  });

  // AC2: reactive population ────────────────────────────────────────────────

  it('AC2 – update() adds new event types to the option list', () => {
    const ctrl = mountEventTypeFilterControl(container, FIXTURE, vi.fn());

    // Add a new event type
    const newEntries = [
      ...FIXTURE,
      entry(6, 'payout.paid', '2024-05-01T00:00:00.000Z'),
    ];
    ctrl.update(newEntries);

    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    const typeOptions = Array.from(select.options).filter((o) => o.value !== '');
    expect(typeOptions).toHaveLength(4);
    expect(typeOptions.map((o) => o.value)).toContain('payout.paid');
  });

  it('AC2 – update() preserves the current selection when types are added', () => {
    const onFilterChange = vi.fn();
    const ctrl = mountEventTypeFilterControl(container, FIXTURE, onFilterChange);

    // Simulate user selecting payment.created
    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    const paymentOpt = Array.from(select.options).find((o) => o.value === 'payment.created')!;
    paymentOpt.selected = true;
    const allOpt = container.querySelector('[data-event-type-filter-all-option]') as HTMLOptionElement;
    allOpt.selected = false;
    select.dispatchEvent(new Event('change'));

    // Now update with new entries
    const newEntries = [...FIXTURE, entry(6, 'payout.paid', '2024-05-01T00:00:00.000Z')];
    ctrl.update(newEntries);

    // Selection should be preserved
    expect(ctrl.getSelectedTypes()).toEqual(['payment.created']);
  });

  it('AC2 – update() with same types does not cause unnecessary re-render', () => {
    const ctrl = mountEventTypeFilterControl(container, FIXTURE, vi.fn());
    const selectBefore = container.querySelector('[data-event-type-filter-select]');

    // Update with same entries (same distinct types)
    ctrl.update(FIXTURE);

    // The select element should be the same (no re-render)
    const selectAfter = container.querySelector('[data-event-type-filter-select]');
    expect(selectBefore).toBe(selectAfter);
  });

  // reset() ─────────────────────────────────────────────────────────────────

  it('reset() clears the selection and calls onFilterChange with empty array', () => {
    const onFilterChange = vi.fn();
    const ctrl = mountEventTypeFilterControl(container, FIXTURE, onFilterChange);

    // Simulate selecting a type first
    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    const paymentOpt = Array.from(select.options).find((o) => o.value === 'payment.created')!;
    paymentOpt.selected = true;
    const allOpt = container.querySelector('[data-event-type-filter-all-option]') as HTMLOptionElement;
    allOpt.selected = false;
    select.dispatchEvent(new Event('change'));

    onFilterChange.mockClear();

    // Reset
    ctrl.reset();
    expect(ctrl.getSelectedTypes()).toEqual([]);
    expect(onFilterChange).toHaveBeenCalledWith([]);
  });

  // AC8: mandated unit-test cases ───────────────────────────────────────────

  describe('AC8 – mandated unit-test cases', () => {
    // AC8a: single event type selected
    it('AC8a – single type selected: applyEventTypeFilter returns only matching entries', () => {
      const result = applyEventTypeFilter(FIXTURE, ['payment.created']);
      expect(result).toHaveLength(2);
      expect(result.every((e) => e.eventType === 'payment.created')).toBe(true);
    });

    // AC8b: multiple event types selected
    it('AC8b – multiple types selected: applyEventTypeFilter returns entries matching any', () => {
      const result = applyEventTypeFilter(FIXTURE, ['payment.created', 'refund.issued']);
      expect(result).toHaveLength(4);
      expect(result.some((e) => e.eventType === 'payment.created')).toBe(true);
      expect(result.some((e) => e.eventType === 'refund.issued')).toBe(true);
      expect(result.some((e) => e.eventType === 'dispute.opened')).toBe(false);
    });

    // AC8c: all types cleared / reset to "All"
    it('AC8c – all types cleared: applyEventTypeFilter returns full unfiltered list', () => {
      const result = applyEventTypeFilter(FIXTURE, []);
      expect(result).toHaveLength(FIXTURE.length);
    });

    it('AC8c – reset() restores full unfiltered view', () => {
      const onFilterChange = vi.fn();
      const ctrl = mountEventTypeFilterControl(container, FIXTURE, onFilterChange);

      // Select a type
      const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
      const paymentOpt = Array.from(select.options).find((o) => o.value === 'payment.created')!;
      paymentOpt.selected = true;
      const allOpt = container.querySelector('[data-event-type-filter-all-option]') as HTMLOptionElement;
      allOpt.selected = false;
      select.dispatchEvent(new Event('change'));

      // Reset to "All"
      ctrl.reset();
      expect(ctrl.getSelectedTypes()).toEqual([]);

      // Applying the cleared filter returns all entries
      const filtered = applyEventTypeFilter(FIXTURE, ctrl.getSelectedTypes());
      expect(filtered).toHaveLength(FIXTURE.length);
    });
  });

  // AC7: filter composition ─────────────────────────────────────────────────

  describe('AC7 – filter composition with date-range and status filters', () => {
    it('event-type + date-range: only entries matching both are shown', () => {
      // Event-type filter: payment.created only
      const typeFiltered = filterByEventTypes(FIXTURE, ['payment.created']);
      // Date-range filter: March 2024 only
      const dateFiltered = filterByDateRange(typeFiltered, {
        start: '2024-03-01T00:00:00.000Z',
        end: '2024-03-31T23:59:59.999Z',
      });
      // Only entries 1 and 3 are payment.created in March
      expect(dateFiltered).toHaveLength(2);
      expect(dateFiltered.map((e) => e.id)).toEqual([1, 3]);
    });

    it('event-type + status: only entries matching both are shown', () => {
      // Event-type filter: refund.issued
      const typeFiltered = filterByEventTypes(FIXTURE, ['refund.issued']);
      // Status filter: failed
      const statusFiltered = typeFiltered.filter((e) => e.status === 'failed');
      // Only entry 2 is refund.issued + failed
      expect(statusFiltered).toHaveLength(1);
      expect(statusFiltered[0].id).toBe(2);
    });

    it('event-type + date-range + status: all three active simultaneously', () => {
      // All three filters active
      const typeFiltered = filterByEventTypes(FIXTURE, ['payment.created', 'refund.issued']);
      const dateFiltered = filterByDateRange(typeFiltered, {
        start: '2024-03-01T00:00:00.000Z',
        end: '2024-03-31T23:59:59.999Z',
      });
      const statusFiltered = dateFiltered.filter((e) => e.status === 'delivered');
      // Entries 1 and 3 are payment.created + March + delivered
      expect(statusFiltered).toHaveLength(2);
      expect(statusFiltered.map((e) => e.id)).toEqual([1, 3]);
    });

    it('clearing event-type filter while date-range is active: date-range still applied', () => {
      const dateFiltered = filterByDateRange(FIXTURE, {
        start: '2024-04-01T00:00:00.000Z',
        end: '2024-04-30T23:59:59.999Z',
      });
      // Clear event-type filter (empty = all types)
      const result = filterByEventTypes(dateFiltered, []);
      // Entries 4 and 5 are in April
      expect(result).toHaveLength(2);
      expect(result.map((e) => e.id)).toEqual([4, 5]);
    });

    it('clearing date-range while event-type filter is active: event-type still applied', () => {
      const typeFiltered = filterByEventTypes(FIXTURE, ['dispute.opened']);
      // Clear date-range (empty range = all dates)
      const result = filterByDateRange(typeFiltered, {});
      // Only entry 4 is dispute.opened
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(4);
    });
  });

  // AC10: no special-case code for simulator vs. real data ──────────────────

  it('AC10 – works with simulator-produced data (same DeliveryEvent shape)', () => {
    // Simulate data produced by the webhook simulator
    const simulatorEntries = [
      { id: 's1', eventType: 'payment.created', timestamp: '2024-03-01T10:00:00.000Z', status: 'delivered' },
      { id: 's2', eventType: 'refund.issued',   timestamp: '2024-03-15T12:00:00.000Z', status: 'failed' },
      { id: 's3', eventType: 'payout.paid',     timestamp: '2024-04-01T08:00:00.000Z', status: 'delivered' },
    ];

    // getDistinctEventTypes works with simulator data
    const types = getDistinctEventTypes(simulatorEntries);
    expect(types).toEqual(['payment.created', 'payout.paid', 'refund.issued']);

    // applyEventTypeFilter works with simulator data
    const filtered = applyEventTypeFilter(simulatorEntries, ['payment.created']);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('s1');

    // mountEventTypeFilterControl works with simulator data
    const ctrl = mountEventTypeFilterControl(container, simulatorEntries, vi.fn());
    const select = container.querySelector('[data-event-type-filter-select]') as HTMLSelectElement;
    const typeOptions = Array.from(select.options).filter((o) => o.value !== '');
    expect(typeOptions).toHaveLength(3);
    ctrl.reset(); // no-op, just ensure no crash
  });
});
