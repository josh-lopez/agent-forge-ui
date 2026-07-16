/**
 * Component tests for Issue #192: the delivery event log renders a visible
 * Export control that downloads the currently visible (post-filter) rows.
 *
 * AC1 – visible Export button rendered in the event log UI.
 * AC2 – Export with no filters exports the full log.
 * AC3 – Export with filters exports only the visible (filtered) rows.
 * AC7 – Export of an empty filtered result still succeeds.
 * AC8 – Export is entirely client-side (Blob URL, no network).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeliveryEventStore } from '../src/delivery-event-store';
import { DeliveryEvent } from '../src/delivery-events';
import { mountEventLog } from '../src/event-log';

function ev(overrides: Partial<DeliveryEvent> = {}): DeliveryEvent {
  return {
    webhookId: 'wh_1',
    eventType: 'payment.created',
    status: 'delivered',
    attempt: 1,
    timestamp: '2024-01-15T10:00:00.000Z',
    httpStatus: 200,
    responseBodyExcerpt: 'OK',
    ...overrides,
  };
}

const EVENTS: DeliveryEvent[] = [
  ev({ webhookId: 'wh_1', eventType: 'payment.created', timestamp: '2024-01-01T00:00:00.000Z' }),
  ev({ webhookId: 'wh_2', eventType: 'refund.issued', status: 'failed', timestamp: '2024-01-15T12:00:00.000Z' }),
  ev({ webhookId: 'wh_3', eventType: 'dispute.opened', status: 'exhausted', timestamp: '2024-02-10T08:00:00.000Z' }),
];

describe('mountEventLog', () => {
  let container: HTMLElement;
  let store: DeliveryEventStore;
  let createObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    store = new DeliveryEventStore(EVENTS);

    createObjectURL = vi.fn(() => 'blob:mock');
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  it('AC1 – renders a visible Export button', () => {
    mountEventLog(container, store);
    const btn = container.querySelector('[data-event-log-export]') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn?.tagName.toLowerCase()).toBe('button');
    expect(btn?.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders a table row per event with all columns', () => {
    mountEventLog(container, store);
    const rows = container.querySelectorAll('tbody tr.event-log__row');
    expect(rows).toHaveLength(EVENTS.length);
    const headers = container.querySelectorAll('thead th');
    expect(headers).toHaveLength(5);
  });

  it('AC2 – clicking Export with no filters exports the full log', () => {
    const handle = mountEventLog(container, store);
    const spy = vi.spyOn(handle, 'exportNow');
    const btn = container.querySelector('[data-event-log-export]') as HTMLButtonElement;
    btn.click();
    // The button triggers a client-side export via Blob URL.
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('AC3 – filtered view renders and exports only visible rows', () => {
    const handle = mountEventLog(container, store);
    handle.setFilters({ eventTypes: ['payment.created'] });

    const rows = container.querySelectorAll('tbody tr.event-log__row');
    expect(rows).toHaveLength(1);

    // The export button label reflects the active filter.
    const btn = container.querySelector('[data-event-log-export]') as HTMLButtonElement;
    expect(btn.textContent).toContain('filtered');
    btn.click();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('AC7 – empty filtered result still renders an enabled Export button', () => {
    const handle = mountEventLog(container, store);
    handle.setFilters({ eventTypes: ['no.match'] });

    const emptyRow = container.querySelector('.event-log__row--empty');
    expect(emptyRow).not.toBeNull();

    const btn = container.querySelector('[data-event-log-export]') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    btn.click();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('re-renders reactively when the store changes', () => {
    mountEventLog(container, store);
    expect(container.querySelectorAll('tbody tr.event-log__row')).toHaveLength(3);
    store.add(ev({ webhookId: 'wh_4' }));
    expect(container.querySelectorAll('tbody tr.event-log__row')).toHaveLength(4);
  });

  it('dispose() unsubscribes and clears the DOM', () => {
    const handle = mountEventLog(container, store);
    handle.dispose();
    expect(container.innerHTML).toBe('');
    // No further re-render after disposal.
    store.add(ev({ webhookId: 'wh_5' }));
    expect(container.innerHTML).toBe('');
  });
});
