/**
 * Supplemental unit tests for Issue #259: Date-range filter inputs wired into
 * the event log component.
 *
 * These tests complement the Dev-shipped tests/event-log.test.ts by covering
 * additional edge cases and scenarios for each acceptance criterion.
 *
 * Spec ref: spec § "Event log filtering — Date-range filter"
 *
 * Acceptance criteria covered:
 *   AC1 – start and end datetime inputs are rendered above/alongside the log
 *   AC2 – selecting a range immediately hides entries outside the range
 *   AC3 – boundary entries (timestamp == start or == end) are included
 *   AC4 – clearing both inputs restores the full unfiltered log
 *   AC5 – while a date range is active, a visible indicator is shown
 *   AC6 – a clear-all control removes the active date range in one action
 *   AC7 – date-range filter composes with event-type and status filters
 *   AC8 – implementation does not break existing event log behaviour
 *   AC9 – unit tests: boundary included, range applied, range cleared
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountEventLog } from '../src/event-log';
import { DeliveryEventStore } from '../src/delivery-event-store';
import { DeliveryEvent } from '../src/delivery-events';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeEvent(
  id: string,
  timestamp: string,
  eventType = 'payment.created',
  status: DeliveryEvent['status'] = 'delivered',
  attempt = 1,
): DeliveryEvent {
  return {
    webhookId: id,
    eventType,
    status,
    attempt,
    timestamp,
    httpStatus: status === 'delivered' ? 200 : 500,
    responseBodyExcerpt: `{"id":"${id}"}`,
  };
}

/** Fixture with events spanning a wide date range and varied types/statuses. */
const FIXTURE: DeliveryEvent[] = [
  makeEvent('w1', '2024-01-01T00:00:00.000Z', 'payment.created', 'delivered'),
  makeEvent('w2', '2024-02-14T09:30:00.000Z', 'refund.issued',   'failed'),
  makeEvent('w3', '2024-06-15T12:00:00.000Z', 'payment.created', 'pending'),
  makeEvent('w4', '2024-09-01T18:45:00.000Z', 'dispute.opened',  'exhausted'),
  makeEvent('w5', '2024-12-31T23:59:59.000Z', 'refund.issued',   'delivered'),
];

// ── Test setup ────────────────────────────────────────────────────────────────

let container: HTMLElement;
let store: DeliveryEventStore;
let dispose: () => void;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  store = new DeliveryEventStore(FIXTURE);
  dispose = mountEventLog(container, store);
});

afterEach(() => {
  dispose();
  container.remove();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRows(): NodeListOf<Element> {
  return container.querySelectorAll('[data-event-log-row]');
}

function getStartInput(): HTMLInputElement {
  return container.querySelector('[data-date-range-start]') as HTMLInputElement;
}

function getEndInput(): HTMLInputElement {
  return container.querySelector('[data-date-range-end]') as HTMLInputElement;
}

function setStart(value: string): void {
  const input = getStartInput();
  input.value = value;
  input.dispatchEvent(new Event('change'));
}

function setEnd(value: string): void {
  const input = getEndInput();
  input.value = value;
  input.dispatchEvent(new Event('change'));
}

// ── AC1: inputs are rendered ──────────────────────────────────────────────────

describe('AC1 (supplemental) – start and end datetime inputs are rendered', () => {
  it('start input initial value is empty (no pre-set filter)', () => {
    expect(getStartInput().value).toBe('');
  });

  it('end input initial value is empty (no pre-set filter)', () => {
    expect(getEndInput().value).toBe('');
  });

  it('start input has id "date-range-start"', () => {
    expect(getStartInput().id).toBe('date-range-start');
  });

  it('end input has id "date-range-end"', () => {
    expect(getEndInput().id).toBe('date-range-end');
  });

  it('start input is a child of the date-range-inputs-container', () => {
    const inputsContainer = container.querySelector('[data-date-range-inputs-container]');
    expect(inputsContainer).not.toBeNull();
    const startInput = inputsContainer!.querySelector('[data-date-range-start]');
    expect(startInput).not.toBeNull();
  });

  it('end input is a child of the date-range-inputs-container', () => {
    const inputsContainer = container.querySelector('[data-date-range-inputs-container]');
    expect(inputsContainer).not.toBeNull();
    const endInput = inputsContainer!.querySelector('[data-date-range-end]');
    expect(endInput).not.toBeNull();
  });

  it('date-range-inputs-container appears before the event log content', () => {
    const inputsContainer = container.querySelector('[data-date-range-inputs-container]');
    const tableContent = container.querySelector('[data-event-log-content]');
    expect(inputsContainer).not.toBeNull();
    expect(tableContent).not.toBeNull();
    // compareDocumentPosition: DOCUMENT_POSITION_FOLLOWING = 4
    const position = inputsContainer!.compareDocumentPosition(tableContent!);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// ── AC2: immediate filtering ──────────────────────────────────────────────────

describe('AC2 (supplemental) – selecting a range immediately hides entries outside it', () => {
  it('start-only filter: entries before start are hidden, entries after are shown', () => {
    // Set start to mid-year; only w3, w4, w5 should remain
    setStart('2024-06-01T00:00:00');
    expect(getRows().length).toBe(3);
  });

  it('end-only filter: entries after end are hidden, entries before are shown', () => {
    // Set end to end of February; only w1, w2 should remain
    setEnd('2024-02-28T23:59:59');
    expect(getRows().length).toBe(2);
  });

  it('narrow range: only entries within the range are shown', () => {
    // Range covers only June–September 2024: w3 and w4
    setStart('2024-06-01T00:00:00');
    setEnd('2024-09-30T23:59:59');
    expect(getRows().length).toBe(2);
  });

  it('range that matches no entries shows empty state', () => {
    setStart('2023-01-01T00:00:00');
    setEnd('2023-12-31T23:59:59');
    expect(getRows().length).toBe(0);
    expect(container.querySelector('[data-event-log-empty]')).not.toBeNull();
  });

  it('changing start multiple times re-filters each time', () => {
    setStart('2024-06-01T00:00:00');
    expect(getRows().length).toBe(3); // w3, w4, w5

    setStart('2024-09-01T00:00:00');
    expect(getRows().length).toBe(2); // w4, w5

    setStart('2024-12-01T00:00:00');
    expect(getRows().length).toBe(1); // w5 only
  });

  it('changing end multiple times re-filters each time', () => {
    setEnd('2024-12-31T23:59:59');
    expect(getRows().length).toBe(5); // all

    setEnd('2024-06-30T23:59:59');
    expect(getRows().length).toBe(3); // w1, w2, w3

    setEnd('2024-01-31T23:59:59');
    expect(getRows().length).toBe(1); // w1 only
  });
});

// ── AC3: boundary entries are included ───────────────────────────────────────

describe('AC3 (supplemental) – boundary entries are included', () => {
  it('entry at exact start boundary (ISO Z suffix) is included', () => {
    // w1 timestamp: 2024-01-01T00:00:00.000Z
    // datetime-local format (no Z): 2024-01-01T00:00:00
    setStart('2024-01-01T00:00:00');
    setEnd('2024-06-30T23:59:59');
    const rows = getRows();
    // w1 (boundary start), w2, w3 should all be included
    expect(rows.length).toBe(3);
  });

  it('entry at exact end boundary (ISO Z suffix) is included', () => {
    // w5 timestamp: 2024-12-31T23:59:59.000Z
    setStart('2024-12-01T00:00:00');
    setEnd('2024-12-31T23:59:59');
    const rows = getRows();
    // Only w5 matches (boundary end)
    expect(rows.length).toBe(1);
  });

  it('range spanning exactly two boundary events includes both', () => {
    // w2: 2024-02-14T09:30:00.000Z, w3: 2024-06-15T12:00:00.000Z
    setStart('2024-02-14T09:30:00');
    setEnd('2024-06-15T12:00:00');
    const rows = getRows();
    expect(rows.length).toBe(2);
  });

  it('start set to 1 second after an event excludes that event', () => {
    // w2: 2024-02-14T09:30:00.000Z → set start to 09:30:01
    setStart('2024-02-14T09:30:01');
    setEnd('2024-12-31T23:59:59');
    const rows = getRows();
    // w2 should be excluded; w3, w4, w5 remain
    expect(rows.length).toBe(3);
  });

  it('end set to 1 second before an event excludes that event', () => {
    // w3: 2024-06-15T12:00:00.000Z → set end to 11:59:59
    setStart('2024-01-01T00:00:00');
    setEnd('2024-06-15T11:59:59');
    const rows = getRows();
    // w3 should be excluded; w1, w2 remain
    expect(rows.length).toBe(2);
  });
});

// ── AC4: clearing inputs restores full log ────────────────────────────────────

describe('AC4 (supplemental) – clearing both inputs restores the full unfiltered log', () => {
  it('after clearing start, all events before the former start reappear', () => {
    setStart('2024-06-01T00:00:00');
    expect(getRows().length).toBe(3);

    setStart('');
    expect(getRows().length).toBe(5);
  });

  it('after clearing end, all events after the former end reappear', () => {
    setEnd('2024-06-30T23:59:59');
    expect(getRows().length).toBe(3);

    setEnd('');
    expect(getRows().length).toBe(5);
  });

  it('clearing start while end is still set: end filter remains active', () => {
    setStart('2024-06-01T00:00:00');
    setEnd('2024-09-30T23:59:59');
    expect(getRows().length).toBe(2); // w3, w4

    setStart('');
    // End filter still active: w1, w2, w3, w4 (everything up to Sep 30)
    expect(getRows().length).toBe(4);
  });

  it('clearing end while start is still set: start filter remains active', () => {
    setStart('2024-06-01T00:00:00');
    setEnd('2024-09-30T23:59:59');
    expect(getRows().length).toBe(2); // w3, w4

    setEnd('');
    // Start filter still active: w3, w4, w5 (everything from Jun 1 onwards)
    expect(getRows().length).toBe(3);
  });

  it('empty state disappears when range is cleared', () => {
    setStart('2025-01-01T00:00:00');
    expect(container.querySelector('[data-event-log-empty]')).not.toBeNull();

    setStart('');
    expect(container.querySelector('[data-event-log-empty]')).toBeNull();
    expect(getRows().length).toBe(5);
  });
});

// ── AC5: active-filter indicator ─────────────────────────────────────────────

describe('AC5 (supplemental) – visible indicator while date range is active', () => {
  it('indicator container exists in the DOM at all times', () => {
    expect(container.querySelector('[data-date-range-indicator-container]')).not.toBeNull();
  });

  it('indicator container is empty when no filter is active', () => {
    const indicatorContainer = container.querySelector('[data-date-range-indicator-container]');
    expect(indicatorContainer!.children.length).toBe(0);
  });

  it('indicator container is non-empty when start is set', () => {
    setStart('2024-06-01T00:00:00');
    const indicatorContainer = container.querySelector('[data-date-range-indicator-container]');
    expect(indicatorContainer!.children.length).toBeGreaterThan(0);
  });

  it('indicator has role="status" for accessibility', () => {
    setStart('2024-06-01T00:00:00');
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.getAttribute('role')).toBe('status');
  });

  it('indicator text mentions the active start value', () => {
    setStart('2024-06-01T00:00:00');
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.textContent).toContain('2024-06-01');
  });

  it('indicator text mentions the active end value', () => {
    setEnd('2024-09-30T23:59:59');
    const indicator = container.querySelector('[data-date-range-filter-indicator]');
    expect(indicator?.textContent).toContain('2024-09-30');
  });

  it('indicator updates when start value changes', () => {
    setStart('2024-06-01T00:00:00');
    const indicatorBefore = container.querySelector('[data-date-range-filter-indicator]')?.textContent;

    setStart('2024-08-01T00:00:00');
    const indicatorAfter = container.querySelector('[data-date-range-filter-indicator]')?.textContent;

    expect(indicatorBefore).not.toBe(indicatorAfter);
    expect(indicatorAfter).toContain('2024-08-01');
  });
});

// ── AC6: clear-all control ────────────────────────────────────────────────────

describe('AC6 (supplemental) – clear-all control removes the active date range in one action', () => {
  it('clear-all button has an aria-label for accessibility', () => {
    setStart('2024-06-01T00:00:00');
    const btn = container.querySelector('[data-date-range-filter-clear-all]');
    const ariaLabel = btn?.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel!.trim().length).toBeGreaterThan(0);
  });

  it('clear-all button has type="button" (does not submit forms)', () => {
    setStart('2024-06-01T00:00:00');
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    expect(btn.type).toBe('button');
  });

  it('after clear-all, start input value is empty', () => {
    setStart('2024-06-01T00:00:00');
    setEnd('2024-09-30T23:59:59');

    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();

    expect(getStartInput().value).toBe('');
  });

  it('after clear-all, end input value is empty', () => {
    setStart('2024-06-01T00:00:00');
    setEnd('2024-09-30T23:59:59');

    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();

    expect(getEndInput().value).toBe('');
  });

  it('after clear-all, clear-all button itself disappears', () => {
    setStart('2024-06-01T00:00:00');
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();

    expect(container.querySelector('[data-date-range-filter-clear-all]')).toBeNull();
  });

  it('clear-all can be triggered multiple times without error', () => {
    setStart('2024-06-01T00:00:00');
    const btn = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    btn.click();

    // After first click, button is gone; re-set and clear again
    setEnd('2024-09-30T23:59:59');
    const btn2 = container.querySelector('[data-date-range-filter-clear-all]') as HTMLButtonElement;
    expect(() => btn2.click()).not.toThrow();
    expect(getRows().length).toBe(5);
  });
});

// ── AC7: filter composition ───────────────────────────────────────────────────

describe('AC7 (supplemental) – date-range filter composes with event-type and status filters', () => {
  it('date-range + status=failed: only failed entries in range are shown', () => {
    // w2 is the only failed entry; it's in Feb 2024
    setStart('2024-01-01T00:00:00');
    setEnd('2024-06-30T23:59:59');

    const statusSelect = container.querySelector('[data-status-select]') as HTMLSelectElement;
    statusSelect.value = 'failed';
    statusSelect.dispatchEvent(new Event('change'));

    expect(getRows().length).toBe(1);
  });

  it('date-range + status=exhausted: only exhausted entries in range are shown', () => {
    // w4 is the only exhausted entry; it's in Sep 2024
    setStart('2024-07-01T00:00:00');
    setEnd('2024-12-31T23:59:59');

    const statusSelect = container.querySelector('[data-status-select]') as HTMLSelectElement;
    statusSelect.value = 'exhausted';
    statusSelect.dispatchEvent(new Event('change'));

    expect(getRows().length).toBe(1);
  });

  it('date-range + event-type=dispute.opened: only dispute entries in range', () => {
    // w4 is the only dispute.opened entry; it's in Sep 2024
    setStart('2024-01-01T00:00:00');
    setEnd('2024-12-31T23:59:59');

    const typeSelect = container.querySelector('[data-event-type-select]') as HTMLSelectElement;
    for (const opt of Array.from(typeSelect.options)) {
      opt.selected = opt.value === 'dispute.opened';
    }
    typeSelect.dispatchEvent(new Event('change'));

    expect(getRows().length).toBe(1);
  });

  it('all three filters: narrow range + specific type + specific status → 0 results', () => {
    // Range: Jan only; type: refund.issued; status: delivered
    // w2 (refund.issued, failed) is in Feb — outside range
    // No refund.issued+delivered entry exists in Jan
    setStart('2024-01-01T00:00:00');
    setEnd('2024-01-31T23:59:59');

    const typeSelect = container.querySelector('[data-event-type-select]') as HTMLSelectElement;
    for (const opt of Array.from(typeSelect.options)) {
      opt.selected = opt.value === 'refund.issued';
    }
    typeSelect.dispatchEvent(new Event('change'));

    const statusSelect = container.querySelector('[data-status-select]') as HTMLSelectElement;
    statusSelect.value = 'delivered';
    statusSelect.dispatchEvent(new Event('change'));

    expect(getRows().length).toBe(0);
  });

  it('clearing status filter while date-range is active: date-range still applied', () => {
    setStart('2024-06-01T00:00:00');
    setEnd('2024-09-30T23:59:59');

    const statusSelect = container.querySelector('[data-status-select]') as HTMLSelectElement;
    statusSelect.value = 'exhausted';
    statusSelect.dispatchEvent(new Event('change'));
    expect(getRows().length).toBe(1); // only w4

    // Clear status filter
    statusSelect.value = '';
    statusSelect.dispatchEvent(new Event('change'));
    // Date range still active: w3 and w4 should be visible
    expect(getRows().length).toBe(2);
  });

  it('clearing event-type filter while date-range is active: date-range still applied', () => {
    setStart('2024-06-01T00:00:00');
    setEnd('2024-09-30T23:59:59');

    const typeSelect = container.querySelector('[data-event-type-select]') as HTMLSelectElement;
    for (const opt of Array.from(typeSelect.options)) {
      opt.selected = opt.value === 'payment.created';
    }
    typeSelect.dispatchEvent(new Event('change'));
    expect(getRows().length).toBe(1); // only w3

    // Clear event-type filter (select "All")
    for (const opt of Array.from(typeSelect.options)) {
      opt.selected = opt.value === '';
    }
    typeSelect.dispatchEvent(new Event('change'));
    // Date range still active: w3 and w4 should be visible
    expect(getRows().length).toBe(2);
  });
});

// ── AC8: does not break existing event log behaviour ─────────────────────────

describe('AC8 (supplemental) – does not break existing event log behaviour', () => {
  it('event log renders with an empty store (zero events)', () => {
    dispose();
    container.remove();

    const emptyContainer = document.createElement('div');
    document.body.appendChild(emptyContainer);
    const emptyStore = new DeliveryEventStore([]);
    const emptyDispose = mountEventLog(emptyContainer, emptyStore);

    expect(emptyContainer.querySelector('[data-event-log-empty]')).not.toBeNull();
    expect(emptyContainer.querySelectorAll('[data-event-log-row]').length).toBe(0);

    emptyDispose();
    emptyContainer.remove();
  });

  it('event log renders with a single event', () => {
    dispose();
    container.remove();

    const singleContainer = document.createElement('div');
    document.body.appendChild(singleContainer);
    const singleStore = new DeliveryEventStore([
      makeEvent('only', '2024-06-01T00:00:00.000Z'),
    ]);
    const singleDispose = mountEventLog(singleContainer, singleStore);

    expect(singleContainer.querySelectorAll('[data-event-log-row]').length).toBe(1);

    singleDispose();
    singleContainer.remove();
  });

  it('event log table has correct column headers', () => {
    const headers = Array.from(container.querySelectorAll('.event-log__th')).map(
      (th) => th.textContent,
    );
    expect(headers).toContain('Timestamp');
    expect(headers).toContain('Event type');
    expect(headers).toContain('Status');
  });

  it('event log rows have status-specific CSS class', () => {
    const deliveredRows = container.querySelectorAll('.event-log__row--delivered');
    expect(deliveredRows.length).toBeGreaterThan(0);
  });

  it('adding events to the store while a date filter is active: new events are filtered', () => {
    // Set filter to only show 2024 events
    setStart('2024-01-01T00:00:00');
    setEnd('2024-12-31T23:59:59');
    expect(getRows().length).toBe(5);

    // Add an event outside the range
    store.add(makeEvent('w6', '2025-01-01T00:00:00.000Z', 'payment.created', 'delivered'));
    // New event is outside the range, so still 5 rows
    expect(getRows().length).toBe(5);

    // Add an event inside the range
    store.add(makeEvent('w7', '2024-07-04T12:00:00.000Z', 'payment.created', 'delivered'));
    // New event is inside the range, so 6 rows
    expect(getRows().length).toBe(6);
  });

  it('multiple mountEventLog calls on different containers are independent', () => {
    const container2 = document.createElement('div');
    document.body.appendChild(container2);
    const store2 = new DeliveryEventStore([makeEvent('x1', '2024-06-01T00:00:00.000Z')]);
    const dispose2 = mountEventLog(container2, store2);

    // container has 5 rows, container2 has 1 row
    expect(getRows().length).toBe(5);
    expect(container2.querySelectorAll('[data-event-log-row]').length).toBe(1);

    dispose2();
    container2.remove();
  });
});

// ── AC9: explicit boundary/range/clear regression tests ──────────────────────

describe('AC9 (supplemental) – boundary included, range applied, range cleared', () => {
  it('AC9-range: applying a range filters correctly', () => {
    // Before: all 5 events
    expect(getRows().length).toBe(5);

    // Apply range covering only H2 2024
    setStart('2024-07-01T00:00:00');
    setEnd('2024-12-31T23:59:59');

    // Only w4 (Sep) and w5 (Dec) are in H2 2024
    expect(getRows().length).toBe(2);
  });

  it('AC9-clear: clearing the range restores all events', () => {
    setStart('2024-07-01T00:00:00');
    setEnd('2024-12-31T23:59:59');
    expect(getRows().length).toBe(2);

    setStart('');
    setEnd('');
    expect(getRows().length).toBe(5);
  });

  it('AC9-boundary-start: entry exactly at start is included', () => {
    // w3 timestamp: 2024-06-15T12:00:00.000Z
    setStart('2024-06-15T12:00:00');
    setEnd('2024-12-31T23:59:59');
    // w3, w4, w5 should all be included (w3 is at the boundary)
    expect(getRows().length).toBe(3);
  });

  it('AC9-boundary-end: entry exactly at end is included', () => {
    // w3 timestamp: 2024-06-15T12:00:00.000Z
    setStart('2024-01-01T00:00:00');
    setEnd('2024-06-15T12:00:00');
    // w1, w2, w3 should all be included (w3 is at the boundary)
    expect(getRows().length).toBe(3);
  });

  it('AC9-boundary-excluded: entry 1 minute before start is excluded', () => {
    // w3: 2024-06-15T12:00:00.000Z → set start to 12:01:00
    setStart('2024-06-15T12:01:00');
    setEnd('2024-12-31T23:59:59');
    // w3 should be excluded; w4, w5 remain
    expect(getRows().length).toBe(2);
  });

  it('AC9-boundary-excluded: entry 1 minute after end is excluded', () => {
    // w3: 2024-06-15T12:00:00.000Z → set end to 11:59:00
    setStart('2024-01-01T00:00:00');
    setEnd('2024-06-15T11:59:00');
    // w3 should be excluded; w1, w2 remain
    expect(getRows().length).toBe(2);
  });

  it('AC9-zero-deliveries: empty store with range active shows empty state', () => {
    dispose();
    container.remove();

    const emptyContainer = document.createElement('div');
    document.body.appendChild(emptyContainer);
    const emptyStore = new DeliveryEventStore([]);
    const emptyDispose = mountEventLog(emptyContainer, emptyStore);

    const startInput = emptyContainer.querySelector('[data-date-range-start]') as HTMLInputElement;
    startInput.value = '2024-01-01T00:00:00';
    startInput.dispatchEvent(new Event('change'));

    expect(emptyContainer.querySelectorAll('[data-event-log-row]').length).toBe(0);
    expect(emptyContainer.querySelector('[data-event-log-empty]')).not.toBeNull();

    emptyDispose();
    emptyContainer.remove();
  });
});
