/**
 * Unit tests for Issue #257: Event log attempt logging.
 *
 * Verifies that each logged delivery attempt correctly captures and displays:
 *   - timestamp (AC1)
 *   - HTTP status code (AC2)
 *   - response body excerpt (AC3)
 *
 * Covers:
 *   AC4 – at least one successful (HTTP 200) and one failed (HTTP 500) attempt
 *   AC5 – graceful rendering when response body excerpt is empty/null
 *   AC6 – multiple attempts are all rendered, not just the first
 *   AC7 – all tests pass without modifying existing production source code
 *
 * Spec ref: spec § "Webhook delivery & retries — Event log"
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { DeliveryEvent } from '../src/delivery-events';
import { DeliveryEventStore } from '../src/delivery-event-store';
import { renderEventLog, renderEventLogRow, mountEventLog } from '../src/event-log';

// ── Fixture helpers ───────────────────────────────────────────────────────────

/** Build a complete DeliveryEvent with sensible defaults; override as needed. */
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

/** A successful delivery attempt (HTTP 200). */
const SUCCESS_EVENT = makeEvent({
  webhookId: 'wh_success',
  eventType: 'payment.created',
  status: 'delivered',
  attempt: 1,
  timestamp: '2026-01-15T10:30:00.000Z',
  httpStatus: 200,
  responseBodyExcerpt: '{"ok":true}',
});

/** A failed delivery attempt (HTTP 500). */
const FAILURE_EVENT = makeEvent({
  webhookId: 'wh_failure',
  eventType: 'refund.issued',
  status: 'failed',
  attempt: 1,
  timestamp: '2026-02-20T14:45:30.500Z',
  httpStatus: 500,
  responseBodyExcerpt: '{"error":"internal_server_error"}',
});

/** A failed attempt with HTTP 503 (upstream unavailable). */
const UPSTREAM_FAILURE_EVENT = makeEvent({
  webhookId: 'wh_upstream',
  eventType: 'payout.paid',
  status: 'exhausted',
  attempt: 3,
  timestamp: '2026-03-01T08:00:00.000Z',
  httpStatus: 503,
  responseBodyExcerpt: '{"error":"upstream_unavailable"}',
});

// ── AC1: Timestamp is rendered correctly ──────────────────────────────────────

describe('AC1 – timestamp is rendered correctly in the UI', () => {
  it('renderEventLogRow renders the ISO-8601 timestamp verbatim', () => {
    const row = renderEventLogRow(SUCCESS_EVENT);
    const cell = row.querySelector('[data-col-timestamp]');
    expect(cell).not.toBeNull();
    expect(cell!.textContent).toBe('2026-01-15T10:30:00.000Z');
  });

  it('renderEventLog renders the timestamp for a successful attempt', () => {
    const section = renderEventLog([SUCCESS_EVENT]);
    const cell = section.querySelector('tbody [data-col-timestamp]');
    expect(cell).not.toBeNull();
    expect(cell!.textContent).toBe('2026-01-15T10:30:00.000Z');
  });

  it('renderEventLog renders the timestamp for a failed attempt', () => {
    const section = renderEventLog([FAILURE_EVENT]);
    const cell = section.querySelector('tbody [data-col-timestamp]');
    expect(cell).not.toBeNull();
    expect(cell!.textContent).toBe('2026-02-20T14:45:30.500Z');
  });

  it('timestamp cell preserves sub-second precision (milliseconds)', () => {
    const event = makeEvent({
      webhookId: 'wh_ms',
      eventType: 'payment.created',
      timestamp: '2026-06-01T12:00:00.123Z',
    });
    const row = renderEventLogRow(event);
    const cell = row.querySelector('[data-col-timestamp]');
    expect(cell!.textContent).toBe('2026-06-01T12:00:00.123Z');
  });

  it('timestamp cell is present for every row in a multi-event log', () => {
    const events = [SUCCESS_EVENT, FAILURE_EVENT, UPSTREAM_FAILURE_EVENT];
    const section = renderEventLog(events);
    const cells = section.querySelectorAll('[data-col-timestamp]');
    // One cell per data row (header th + tbody tds).
    const dataCells = [...cells].filter((c) => c.tagName.toLowerCase() === 'td');
    expect(dataCells).toHaveLength(3);
    expect(dataCells[0].textContent).toBe(SUCCESS_EVENT.timestamp);
    expect(dataCells[1].textContent).toBe(FAILURE_EVENT.timestamp);
    expect(dataCells[2].textContent).toBe(UPSTREAM_FAILURE_EVENT.timestamp);
  });
});

// ── AC2: HTTP status code is rendered correctly ───────────────────────────────

describe('AC2 – HTTP status code is rendered correctly in the UI', () => {
  it('renderEventLogRow renders HTTP 200 for a successful attempt', () => {
    const row = renderEventLogRow(SUCCESS_EVENT);
    const cell = row.querySelector('[data-col-http-status]');
    expect(cell).not.toBeNull();
    expect(cell!.textContent).toBe('200');
  });

  it('renderEventLogRow renders HTTP 500 for a failed attempt', () => {
    const row = renderEventLogRow(FAILURE_EVENT);
    const cell = row.querySelector('[data-col-http-status]');
    expect(cell).not.toBeNull();
    expect(cell!.textContent).toBe('500');
  });

  it('renderEventLogRow renders HTTP 503 for an upstream-failure attempt', () => {
    const row = renderEventLogRow(UPSTREAM_FAILURE_EVENT);
    const cell = row.querySelector('[data-col-http-status]');
    expect(cell!.textContent).toBe('503');
  });

  it('renderEventLog renders HTTP status for a successful attempt', () => {
    const section = renderEventLog([SUCCESS_EVENT]);
    const cell = section.querySelector('tbody [data-col-http-status]');
    expect(cell!.textContent).toBe('200');
  });

  it('renderEventLog renders HTTP status for a failed attempt', () => {
    const section = renderEventLog([FAILURE_EVENT]);
    const cell = section.querySelector('tbody [data-col-http-status]');
    expect(cell!.textContent).toBe('500');
  });

  it('HTTP status 0 (no response received) is rendered as "0"', () => {
    const event = makeEvent({
      webhookId: 'wh_timeout',
      eventType: 'payment.created',
      status: 'failed',
      httpStatus: 0,
      responseBodyExcerpt: '',
    });
    const row = renderEventLogRow(event);
    const cell = row.querySelector('[data-col-http-status]');
    expect(cell!.textContent).toBe('0');
  });

  it('HTTP status cell is present for every row in a multi-event log', () => {
    const events = [SUCCESS_EVENT, FAILURE_EVENT, UPSTREAM_FAILURE_EVENT];
    const section = renderEventLog(events);
    const dataCells = [...section.querySelectorAll('[data-col-http-status]')]
      .filter((c) => c.tagName.toLowerCase() === 'td');
    expect(dataCells).toHaveLength(3);
    expect(dataCells[0].textContent).toBe('200');
    expect(dataCells[1].textContent).toBe('500');
    expect(dataCells[2].textContent).toBe('503');
  });
});

// ── AC3: Response body excerpt is rendered correctly ─────────────────────────

describe('AC3 – response body excerpt is rendered correctly in the UI', () => {
  it('renderEventLogRow renders the response body excerpt for a successful attempt', () => {
    const row = renderEventLogRow(SUCCESS_EVENT);
    const cell = row.querySelector('[data-col-response-body]');
    expect(cell).not.toBeNull();
    expect(cell!.textContent).toBe('{"ok":true}');
  });

  it('renderEventLogRow renders the response body excerpt for a failed attempt', () => {
    const row = renderEventLogRow(FAILURE_EVENT);
    const cell = row.querySelector('[data-col-response-body]');
    expect(cell!.textContent).toBe('{"error":"internal_server_error"}');
  });

  it('renderEventLog renders the response body excerpt for a successful attempt', () => {
    const section = renderEventLog([SUCCESS_EVENT]);
    const cell = section.querySelector('tbody [data-col-response-body]');
    expect(cell!.textContent).toBe('{"ok":true}');
  });

  it('renderEventLog renders the response body excerpt for a failed attempt', () => {
    const section = renderEventLog([FAILURE_EVENT]);
    const cell = section.querySelector('tbody [data-col-response-body]');
    expect(cell!.textContent).toBe('{"error":"internal_server_error"}');
  });

  it('response body excerpt cell is present for every row in a multi-event log', () => {
    const events = [SUCCESS_EVENT, FAILURE_EVENT, UPSTREAM_FAILURE_EVENT];
    const section = renderEventLog(events);
    const dataCells = [...section.querySelectorAll('[data-col-response-body]')]
      .filter((c) => c.tagName.toLowerCase() === 'td');
    expect(dataCells).toHaveLength(3);
    expect(dataCells[0].textContent).toBe(SUCCESS_EVENT.responseBodyExcerpt);
    expect(dataCells[1].textContent).toBe(FAILURE_EVENT.responseBodyExcerpt);
    expect(dataCells[2].textContent).toBe(UPSTREAM_FAILURE_EVENT.responseBodyExcerpt);
  });
});

// ── AC4: Successful (HTTP 200) and failed (HTTP 500) attempts ─────────────────

describe('AC4 – covers both successful (HTTP 200) and failed (HTTP 500) attempts', () => {
  it('successful attempt (HTTP 200) renders all three fields correctly', () => {
    const row = renderEventLogRow(SUCCESS_EVENT);

    expect(row.querySelector('[data-col-timestamp]')!.textContent).toBe(SUCCESS_EVENT.timestamp);
    expect(row.querySelector('[data-col-http-status]')!.textContent).toBe('200');
    expect(row.querySelector('[data-col-response-body]')!.textContent).toBe(SUCCESS_EVENT.responseBodyExcerpt);
  });

  it('failed attempt (HTTP 500) renders all three fields correctly', () => {
    const row = renderEventLogRow(FAILURE_EVENT);

    expect(row.querySelector('[data-col-timestamp]')!.textContent).toBe(FAILURE_EVENT.timestamp);
    expect(row.querySelector('[data-col-http-status]')!.textContent).toBe('500');
    expect(row.querySelector('[data-col-response-body]')!.textContent).toBe(FAILURE_EVENT.responseBodyExcerpt);
  });

  it('row for successful attempt carries the delivered status class', () => {
    const row = renderEventLogRow(SUCCESS_EVENT);
    expect(row.classList.contains('event-log-row--delivered')).toBe(true);
  });

  it('row for failed attempt carries the failed status class', () => {
    const row = renderEventLogRow(FAILURE_EVENT);
    expect(row.classList.contains('event-log-row--failed')).toBe(true);
  });

  it('log with both success and failure renders both rows with correct HTTP statuses', () => {
    const section = renderEventLog([SUCCESS_EVENT, FAILURE_EVENT]);
    const dataCells = [...section.querySelectorAll('[data-col-http-status]')]
      .filter((c) => c.tagName.toLowerCase() === 'td');
    expect(dataCells).toHaveLength(2);
    expect(dataCells[0].textContent).toBe('200');
    expect(dataCells[1].textContent).toBe('500');
  });
});

// ── AC5: Empty / null response body excerpt renders gracefully ────────────────

describe('AC5 – empty or null response body excerpt renders gracefully', () => {
  it('empty string excerpt renders as an empty cell (not "null" or "undefined")', () => {
    const event = makeEvent({
      webhookId: 'wh_empty',
      eventType: 'payment.created',
      responseBodyExcerpt: '',
    });
    const row = renderEventLogRow(event);
    const cell = row.querySelector('[data-col-response-body]');
    expect(cell).not.toBeNull();
    expect(cell!.textContent).toBe('');
    expect(cell!.textContent).not.toBe('null');
    expect(cell!.textContent).not.toBe('undefined');
  });

  it('null-like excerpt (cast to empty string) renders as empty cell', () => {
    // The DeliveryEvent type declares responseBodyExcerpt as string, but
    // defensive rendering should handle null/undefined from real-world data.
    const event = makeEvent({
      webhookId: 'wh_null',
      eventType: 'payment.created',
      responseBodyExcerpt: (null as unknown) as string,
    });
    const row = renderEventLogRow(event);
    const cell = row.querySelector('[data-col-response-body]');
    expect(cell!.textContent).toBe('');
    expect(cell!.textContent).not.toBe('null');
  });

  it('renderEventLog with empty excerpt does not throw', () => {
    const event = makeEvent({
      webhookId: 'wh_empty2',
      eventType: 'refund.issued',
      responseBodyExcerpt: '',
    });
    expect(() => renderEventLog([event])).not.toThrow();
  });

  it('empty excerpt alongside non-empty timestamp and HTTP status renders all three', () => {
    const event = makeEvent({
      webhookId: 'wh_empty3',
      eventType: 'payout.paid',
      timestamp: '2026-05-01T09:00:00.000Z',
      httpStatus: 204,
      responseBodyExcerpt: '',
    });
    const row = renderEventLogRow(event);
    expect(row.querySelector('[data-col-timestamp]')!.textContent).toBe('2026-05-01T09:00:00.000Z');
    expect(row.querySelector('[data-col-http-status]')!.textContent).toBe('204');
    expect(row.querySelector('[data-col-response-body]')!.textContent).toBe('');
  });

  it('HTTP status 0 with empty excerpt (no response received) renders gracefully', () => {
    const event = makeEvent({
      webhookId: 'wh_no_response',
      eventType: 'payment.created',
      status: 'failed',
      httpStatus: 0,
      responseBodyExcerpt: '',
    });
    const row = renderEventLogRow(event);
    expect(row.querySelector('[data-col-http-status]')!.textContent).toBe('0');
    expect(row.querySelector('[data-col-response-body]')!.textContent).toBe('');
  });
});

// ── AC6: Multiple attempts are all rendered ───────────────────────────────────

describe('AC6 – multiple attempts are all rendered, not just the first', () => {
  /** Three attempts for the same webhook: failed → failed → exhausted. */
  const RETRY_SEQUENCE: DeliveryEvent[] = [
    makeEvent({
      webhookId: 'wh_retry',
      eventType: 'payment.created',
      status: 'failed',
      attempt: 1,
      timestamp: '2026-04-01T00:00:00.000Z',
      httpStatus: 503,
      responseBodyExcerpt: '{"error":"upstream_unavailable"}',
    }),
    makeEvent({
      webhookId: 'wh_retry',
      eventType: 'payment.created',
      status: 'failed',
      attempt: 2,
      timestamp: '2026-04-01T00:01:00.000Z',
      httpStatus: 503,
      responseBodyExcerpt: '{"error":"upstream_unavailable"}',
    }),
    makeEvent({
      webhookId: 'wh_retry',
      eventType: 'payment.created',
      status: 'exhausted',
      attempt: 3,
      timestamp: '2026-04-01T00:06:00.000Z',
      httpStatus: 503,
      responseBodyExcerpt: '{"error":"upstream_unavailable"}',
    }),
  ];

  it('all three retry-sequence rows are rendered', () => {
    const section = renderEventLog(RETRY_SEQUENCE);
    const rows = section.querySelectorAll('tbody tr.event-log-row:not(.event-log-row--empty)');
    expect(rows).toHaveLength(3);
  });

  it('each row has the correct timestamp', () => {
    const section = renderEventLog(RETRY_SEQUENCE);
    const dataCells = [...section.querySelectorAll('[data-col-timestamp]')]
      .filter((c) => c.tagName.toLowerCase() === 'td');
    expect(dataCells[0].textContent).toBe('2026-04-01T00:00:00.000Z');
    expect(dataCells[1].textContent).toBe('2026-04-01T00:01:00.000Z');
    expect(dataCells[2].textContent).toBe('2026-04-01T00:06:00.000Z');
  });

  it('each row has the correct HTTP status code', () => {
    const section = renderEventLog(RETRY_SEQUENCE);
    const dataCells = [...section.querySelectorAll('[data-col-http-status]')]
      .filter((c) => c.tagName.toLowerCase() === 'td');
    expect(dataCells).toHaveLength(3);
    for (const cell of dataCells) {
      expect(cell.textContent).toBe('503');
    }
  });

  it('each row has the correct response body excerpt', () => {
    const section = renderEventLog(RETRY_SEQUENCE);
    const dataCells = [...section.querySelectorAll('[data-col-response-body]')]
      .filter((c) => c.tagName.toLowerCase() === 'td');
    expect(dataCells).toHaveLength(3);
    for (const cell of dataCells) {
      expect(cell.textContent).toBe('{"error":"upstream_unavailable"}');
    }
  });

  it('a mixed log of 5 events renders all 5 rows', () => {
    const events = [
      SUCCESS_EVENT,
      FAILURE_EVENT,
      UPSTREAM_FAILURE_EVENT,
      ...RETRY_SEQUENCE.slice(0, 2),
    ];
    const section = renderEventLog(events);
    const rows = section.querySelectorAll('tbody tr.event-log-row:not(.event-log-row--empty)');
    expect(rows).toHaveLength(5);
  });

  it('row order matches the input array order', () => {
    const events = [SUCCESS_EVENT, FAILURE_EVENT, UPSTREAM_FAILURE_EVENT];
    const section = renderEventLog(events);
    const dataCells = [...section.querySelectorAll('[data-col-timestamp]')]
      .filter((c) => c.tagName.toLowerCase() === 'td');
    expect(dataCells[0].textContent).toBe(SUCCESS_EVENT.timestamp);
    expect(dataCells[1].textContent).toBe(FAILURE_EVENT.timestamp);
    expect(dataCells[2].textContent).toBe(UPSTREAM_FAILURE_EVENT.timestamp);
  });
});

// ── Empty state ───────────────────────────────────────────────────────────────

describe('empty state – no delivery attempts yet', () => {
  it('renders an empty-state row when the event list is empty', () => {
    const section = renderEventLog([]);
    const emptyCell = section.querySelector('.event-log-cell--empty');
    expect(emptyCell).not.toBeNull();
    expect(emptyCell!.textContent).toContain('No delivery attempts yet.');
  });

  it('does not render any data rows when the event list is empty', () => {
    const section = renderEventLog([]);
    const rows = section.querySelectorAll('tbody tr.event-log-row:not(.event-log-row--empty)');
    expect(rows).toHaveLength(0);
  });
});

// ── Reactive mountEventLog ────────────────────────────────────────────────────

describe('mountEventLog – reactive rendering', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders initial events from the store immediately', () => {
    const store = new DeliveryEventStore([SUCCESS_EVENT]);
    mountEventLog(container, store);
    const cell = container.querySelector('tbody [data-col-http-status]');
    expect(cell!.textContent).toBe('200');
  });

  it('re-renders when a new event is added to the store', () => {
    const store = new DeliveryEventStore([SUCCESS_EVENT]);
    mountEventLog(container, store);

    // Initially one row.
    expect(container.querySelectorAll('tbody tr.event-log-row:not(.event-log-row--empty)')).toHaveLength(1);

    store.add(FAILURE_EVENT);

    // After reactive update, two rows.
    expect(container.querySelectorAll('tbody tr.event-log-row:not(.event-log-row--empty)')).toHaveLength(2);
  });

  it('new row shows the correct timestamp, HTTP status, and body excerpt after reactive update', () => {
    const store = new DeliveryEventStore();
    mountEventLog(container, store);

    store.add(FAILURE_EVENT);

    const dataCells = {
      timestamp: [...container.querySelectorAll('[data-col-timestamp]')].filter((c) => c.tagName.toLowerCase() === 'td'),
      httpStatus: [...container.querySelectorAll('[data-col-http-status]')].filter((c) => c.tagName.toLowerCase() === 'td'),
      responseBody: [...container.querySelectorAll('[data-col-response-body]')].filter((c) => c.tagName.toLowerCase() === 'td'),
    };

    expect(dataCells.timestamp[0].textContent).toBe(FAILURE_EVENT.timestamp);
    expect(dataCells.httpStatus[0].textContent).toBe('500');
    expect(dataCells.responseBody[0].textContent).toBe(FAILURE_EVENT.responseBodyExcerpt);
  });

  it('disposer stops updates and clears the container', () => {
    const store = new DeliveryEventStore([SUCCESS_EVENT]);
    const dispose = mountEventLog(container, store);

    expect(container.querySelector('.event-log')).not.toBeNull();

    dispose();

    expect(container.querySelector('.event-log')).toBeNull();

    // Adding an event after disposal should not re-render.
    store.add(FAILURE_EVENT);
    expect(container.querySelector('.event-log')).toBeNull();
  });

  it('starts with empty state and transitions to populated on first add', () => {
    const store = new DeliveryEventStore();
    mountEventLog(container, store);

    expect(container.querySelector('.event-log-cell--empty')).not.toBeNull();

    store.add(SUCCESS_EVENT);

    expect(container.querySelector('.event-log-cell--empty')).toBeNull();
    expect(container.querySelector('tbody [data-col-http-status]')!.textContent).toBe('200');
  });
});

// ── Simulator-produced data ───────────────────────────────────────────────────

describe('simulator-produced data – all three fields present', () => {
  it('renders timestamp, HTTP status, and body excerpt for simulator events', async () => {
    const { simulateWebhook } = await import('../src/webhook-simulator');

    let seed = 42;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    const events = simulateWebhook('wh_sim', 'payment.created', {
      successRate: 0.5,
      maxAttempts: 3,
      random,
      startTime: 0,
    });

    expect(events.length).toBeGreaterThan(0);

    const section = renderEventLog(events);

    // Every data row must have a non-empty timestamp cell.
    const tsCells = [...section.querySelectorAll('[data-col-timestamp]')]
      .filter((c) => c.tagName.toLowerCase() === 'td');
    expect(tsCells.length).toBe(events.length);
    for (const cell of tsCells) {
      expect(cell.textContent!.trim().length).toBeGreaterThan(0);
    }

    // Every data row must have an HTTP status cell that is a valid number string.
    const httpCells = [...section.querySelectorAll('[data-col-http-status]')]
      .filter((c) => c.tagName.toLowerCase() === 'td');
    expect(httpCells.length).toBe(events.length);
    for (const cell of httpCells) {
      expect(Number.isNaN(Number(cell.textContent))).toBe(false);
    }

    // Every data row must have a response body excerpt cell (may be empty string).
    const bodyCells = [...section.querySelectorAll('[data-col-response-body]')]
      .filter((c) => c.tagName.toLowerCase() === 'td');
    expect(bodyCells.length).toBe(events.length);
    for (const cell of bodyCells) {
      expect(cell.textContent).not.toBe('null');
      expect(cell.textContent).not.toBe('undefined');
    }
  });
});
