/**
 * Supplemental unit tests for Issue #257: Event log attempt logging.
 *
 * These tests extend the primary coverage in event-log-attempt-logging.test.ts
 * with additional edge-case scenarios:
 *   - Empty log renders the empty-state row (not a data row)
 *   - Batch-add via store.addMany renders all entries
 *   - store.reset replaces all entries and re-renders correctly
 *   - Attempt number field is rendered alongside the three primary fields
 *   - Very long response body excerpt is rendered verbatim (no truncation by the component)
 *
 * Spec ref: spec § "Webhook delivery & retries — Event log"
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { DeliveryEvent } from '../src/delivery-events';
import { DeliveryEventStore } from '../src/delivery-event-store';
import { renderEventLog, renderEventLogRow, mountEventLog } from '../src/event-log';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeEvent(partial: Partial<DeliveryEvent> & Pick<DeliveryEvent, 'webhookId' | 'eventType'>): DeliveryEvent {
  return {
    status: 'delivered',
    attempt: 1,
    timestamp: '2026-01-15T10:30:00.000Z',
    httpStatus: 200,
    responseBodyExcerpt: '{"ok":true}',
    ...partial,
  };
}

const SUCCESS_EVENT = makeEvent({
  webhookId: 'wh_supp_success',
  eventType: 'payment.created',
  status: 'delivered',
  attempt: 1,
  timestamp: '2026-01-15T10:30:00.000Z',
  httpStatus: 200,
  responseBodyExcerpt: '{"ok":true}',
});

const FAILURE_EVENT = makeEvent({
  webhookId: 'wh_supp_failure',
  eventType: 'refund.issued',
  status: 'failed',
  attempt: 1,
  timestamp: '2026-02-20T14:45:30.500Z',
  httpStatus: 500,
  responseBodyExcerpt: '{"error":"internal_server_error"}',
});

// ── Empty log state ───────────────────────────────────────────────────────────

describe('AC1/AC2/AC3 – empty log renders empty-state, not a data row', () => {
  it('renderEventLog with no events shows the empty-state cell', () => {
    const section = renderEventLog([]);
    const emptyCell = section.querySelector('.event-log-cell--empty');
    expect(emptyCell).not.toBeNull();
    expect(emptyCell!.textContent).toContain('No delivery attempts');
  });

  it('renderEventLog with no events has no data-col-timestamp cells in tbody', () => {
    const section = renderEventLog([]);
    const dataCells = [...section.querySelectorAll('[data-col-timestamp]')]
      .filter((c) => c.tagName.toLowerCase() === 'td');
    expect(dataCells).toHaveLength(0);
  });

  it('renderEventLog with no events has no data-col-http-status cells in tbody', () => {
    const section = renderEventLog([]);
    const dataCells = [...section.querySelectorAll('[data-col-http-status]')]
      .filter((c) => c.tagName.toLowerCase() === 'td');
    expect(dataCells).toHaveLength(0);
  });

  it('renderEventLog with no events has no data-col-response-body cells in tbody', () => {
    const section = renderEventLog([]);
    const dataCells = [...section.querySelectorAll('[data-col-response-body]')]
      .filter((c) => c.tagName.toLowerCase() === 'td');
    expect(dataCells).toHaveLength(0);
  });
});

// ── Batch add via store.addMany ───────────────────────────────────────────────

describe('AC6 – store.addMany renders all entries reactively', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('addMany with two events renders both rows with correct timestamps', () => {
    const store = new DeliveryEventStore();
    mountEventLog(container, store);

    store.addMany([SUCCESS_EVENT, FAILURE_EVENT]);

    const dataCells = [...container.querySelectorAll('[data-col-timestamp]')]
      .filter((c) => c.tagName.toLowerCase() === 'td');
    expect(dataCells).toHaveLength(2);
    expect(dataCells[0].textContent).toBe(SUCCESS_EVENT.timestamp);
    expect(dataCells[1].textContent).toBe(FAILURE_EVENT.timestamp);
  });

  it('addMany with two events renders both rows with correct HTTP status codes', () => {
    const store = new DeliveryEventStore();
    mountEventLog(container, store);

    store.addMany([SUCCESS_EVENT, FAILURE_EVENT]);

    const dataCells = [...container.querySelectorAll('[data-col-http-status]')]
      .filter((c) => c.tagName.toLowerCase() === 'td');
    expect(dataCells).toHaveLength(2);
    expect(dataCells[0].textContent).toBe('200');
    expect(dataCells[1].textContent).toBe('500');
  });

  it('addMany with two events renders both rows with correct response body excerpts', () => {
    const store = new DeliveryEventStore();
    mountEventLog(container, store);

    store.addMany([SUCCESS_EVENT, FAILURE_EVENT]);

    const dataCells = [...container.querySelectorAll('[data-col-response-body]')]
      .filter((c) => c.tagName.toLowerCase() === 'td');
    expect(dataCells).toHaveLength(2);
    expect(dataCells[0].textContent).toBe(SUCCESS_EVENT.responseBodyExcerpt);
    expect(dataCells[1].textContent).toBe(FAILURE_EVENT.responseBodyExcerpt);
  });
});

// ── store.reset replaces all entries ─────────────────────────────────────────

describe('AC6 – store.reset replaces all entries and re-renders', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('reset with a new set of events replaces the rendered rows', () => {
    const store = new DeliveryEventStore([SUCCESS_EVENT]);
    mountEventLog(container, store);

    // Initially one row with HTTP 200.
    expect(
      [...container.querySelectorAll('[data-col-http-status]')]
        .filter((c) => c.tagName.toLowerCase() === 'td')[0].textContent,
    ).toBe('200');

    // Replace with a single failure event.
    store.reset([FAILURE_EVENT]);

    const dataCells = [...container.querySelectorAll('[data-col-http-status]')]
      .filter((c) => c.tagName.toLowerCase() === 'td');
    expect(dataCells).toHaveLength(1);
    expect(dataCells[0].textContent).toBe('500');
  });

  it('reset to empty shows the empty-state row', () => {
    const store = new DeliveryEventStore([SUCCESS_EVENT]);
    mountEventLog(container, store);

    store.reset([]);

    expect(container.querySelector('.event-log-cell--empty')).not.toBeNull();
    const dataCells = [...container.querySelectorAll('[data-col-timestamp]')]
      .filter((c) => c.tagName.toLowerCase() === 'td');
    expect(dataCells).toHaveLength(0);
  });
});

// ── Very long response body excerpt ──────────────────────────────────────────

describe('AC3/AC5 – long response body excerpt is rendered verbatim', () => {
  it('a 500-character excerpt is rendered verbatim without truncation by the component', () => {
    const longExcerpt = '{"data":"' + 'x'.repeat(490) + '"}';
    const event = makeEvent({
      webhookId: 'wh_long',
      eventType: 'payment.created',
      responseBodyExcerpt: longExcerpt,
    });
    const row = renderEventLogRow(event);
    const cell = row.querySelector('[data-col-response-body]');
    expect(cell!.textContent).toBe(longExcerpt);
  });
});

// ── Attempt number field rendered alongside the three primary fields ──────────

describe('AC1/AC2/AC3 – attempt number is rendered alongside timestamp, HTTP status, body excerpt', () => {
  it('attempt 1 is rendered in the attempt cell', () => {
    const row = renderEventLogRow(SUCCESS_EVENT);
    const cell = row.querySelector('[data-col-attempt]');
    expect(cell).not.toBeNull();
    expect(cell!.textContent).toBe('1');
  });

  it('attempt 3 is rendered in the attempt cell for a retry', () => {
    const event = makeEvent({
      webhookId: 'wh_retry3',
      eventType: 'payment.created',
      status: 'exhausted',
      attempt: 3,
      httpStatus: 503,
      responseBodyExcerpt: '{"error":"upstream"}',
    });
    const row = renderEventLogRow(event);
    expect(row.querySelector('[data-col-attempt]')!.textContent).toBe('3');
    // Primary fields still correct alongside attempt number.
    expect(row.querySelector('[data-col-http-status]')!.textContent).toBe('503');
    expect(row.querySelector('[data-col-response-body]')!.textContent).toBe('{"error":"upstream"}');
  });
});
