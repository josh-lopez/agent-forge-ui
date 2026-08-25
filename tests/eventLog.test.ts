/**
 * Unit tests for Issue #142: EventLog component and DeliveryEventStore.
 *
 * Covers:
 *   AC7  – empty log renders correctly (zero attempts)
 *   AC2  – single entry shows timestamp, HTTP status code, response body excerpt
 *   AC2  – multiple entries with mixed statuses
 *   AC3  – reactive addition of a new entry (no manual refresh)
 *   AC4  – component consumes the shared DeliveryEvent shape (no special-casing)
 *   AC5  – all delivery statuses (pending/delivered/failed/exhausted) render
 *   AC6  – entries are displayed most-recent first
 *   AC9  – data-* attributes expose the filtering interface
 *
 * Helper utilities (formatTimestamp, truncateExcerpt, renderEntry) are also
 * tested in isolation so regressions are caught at the unit level.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DeliveryEventStore } from '../src/DeliveryEventStore.ts';
import {
  mountEventLog,
  formatTimestamp,
  truncateExcerpt,
  renderEntry,
} from '../src/EventLog.ts';
import type { DeliveryEvent } from '../src/deliveryEvent.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<DeliveryEvent> = {}): DeliveryEvent {
  return {
    id: 'evt-001',
    eventType: 'payment.created',
    timestamp: '2024-06-15T10:30:00Z',
    status: 'delivered',
    httpStatusCode: 200,
    responseBodyExcerpt: '{"ok":true}',
    attemptNumber: 1,
    webhookUrl: 'https://example.com/webhook',
    ...overrides,
  };
}

// ── formatTimestamp ───────────────────────────────────────────────────────────

describe('formatTimestamp', () => {
  it('formats a valid ISO-8601 timestamp into YYYY-MM-DD HH:MM:SS', () => {
    // Use a UTC timestamp and check the formatted string contains the date parts.
    const result = formatTimestamp('2024-06-15T10:30:45Z');
    // The exact time depends on the local timezone in the test runner, but the
    // format must always be YYYY-MM-DD HH:MM:SS (19 chars).
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('returns the raw string when the timestamp is unparseable', () => {
    const bad = 'not-a-date';
    expect(formatTimestamp(bad)).toBe(bad);
  });

  it('handles a timestamp with milliseconds', () => {
    const result = formatTimestamp('2024-01-01T00:00:00.000Z');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

// ── truncateExcerpt ───────────────────────────────────────────────────────────

describe('truncateExcerpt', () => {
  it('returns an empty string for null', () => {
    expect(truncateExcerpt(null)).toBe('');
  });

  it('returns an empty string for undefined', () => {
    expect(truncateExcerpt(undefined)).toBe('');
  });

  it('returns an empty string for an empty string', () => {
    expect(truncateExcerpt('')).toBe('');
  });

  it('returns the string unchanged when it is within the limit', () => {
    const short = '{"ok":true}';
    expect(truncateExcerpt(short)).toBe(short);
  });

  it('truncates a string longer than 200 chars and appends "…"', () => {
    const long = 'x'.repeat(250);
    const result = truncateExcerpt(long);
    expect(result.endsWith('…')).toBe(true);
    // 200 chars of content + 1 ellipsis char = 201 chars total.
    expect(result.length).toBe(201);
  });

  it('does not truncate a string of exactly 200 chars', () => {
    const exact = 'a'.repeat(200);
    expect(truncateExcerpt(exact)).toBe(exact);
  });
});

// ── renderEntry ───────────────────────────────────────────────────────────────

describe('renderEntry', () => {
  it('includes the formatted timestamp', () => {
    const event = makeEvent({ timestamp: '2024-06-15T10:30:00Z' });
    const html = renderEntry(event);
    // The timestamp must appear somewhere in the rendered HTML.
    expect(html).toContain('2024-');
  });

  it('includes the HTTP status code', () => {
    const event = makeEvent({ httpStatusCode: 200 });
    const html = renderEntry(event);
    expect(html).toContain('200');
  });

  it('shows "—" when HTTP status code is null', () => {
    const event = makeEvent({ httpStatusCode: null, status: 'pending' });
    const html = renderEntry(event);
    expect(html).toContain('HTTP —');
  });

  it('includes the response body excerpt', () => {
    const event = makeEvent({ responseBodyExcerpt: '{"ok":true}' });
    const html = renderEntry(event);
    expect(html).toContain('entry-excerpt');
  });

  it('omits the excerpt span when responseBodyExcerpt is null', () => {
    const event = makeEvent({ responseBodyExcerpt: null });
    const html = renderEntry(event);
    expect(html).not.toContain('entry-excerpt');
  });

  it('includes the event type', () => {
    const event = makeEvent({ eventType: 'refund.issued' });
    const html = renderEntry(event);
    expect(html).toContain('refund.issued');
  });

  it('includes the delivery status', () => {
    const event = makeEvent({ status: 'failed' });
    const html = renderEntry(event);
    expect(html).toContain('failed');
  });

  it('includes the attempt number', () => {
    const event = makeEvent({ attemptNumber: 3 });
    const html = renderEntry(event);
    expect(html).toContain('attempt #3');
  });

  it('applies the correct CSS class for "delivered" status', () => {
    const html = renderEntry(makeEvent({ status: 'delivered' }));
    expect(html).toContain('status-delivered');
  });

  it('applies the correct CSS class for "failed" status', () => {
    const html = renderEntry(makeEvent({ status: 'failed' }));
    expect(html).toContain('status-failed');
  });

  it('applies the correct CSS class for "exhausted" status', () => {
    const html = renderEntry(makeEvent({ status: 'exhausted' }));
    expect(html).toContain('status-exhausted');
  });

  it('applies the correct CSS class for "pending" status', () => {
    const html = renderEntry(makeEvent({ status: 'pending' }));
    expect(html).toContain('status-pending');
  });

  it('exposes data-event-type attribute for filter compatibility (AC9)', () => {
    const event = makeEvent({ eventType: 'dispute.opened' });
    const html = renderEntry(event);
    expect(html).toContain('data-event-type="dispute.opened"');
  });

  it('exposes data-status attribute for filter compatibility (AC9)', () => {
    const event = makeEvent({ status: 'exhausted' });
    const html = renderEntry(event);
    expect(html).toContain('data-status="exhausted"');
  });

  it('exposes data-timestamp attribute for date-range filter compatibility (AC9)', () => {
    const event = makeEvent({ timestamp: '2024-06-15T10:30:00Z' });
    const html = renderEntry(event);
    expect(html).toContain('data-timestamp="2024-06-15T10:30:00Z"');
  });

  it('escapes HTML special characters in user-supplied fields', () => {
    const event = makeEvent({
      responseBodyExcerpt: '<script>alert("xss")</script>',
      eventType: 'payment.created',
    });
    const html = renderEntry(event);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

// ── DeliveryEventStore ────────────────────────────────────────────────────────

describe('DeliveryEventStore', () => {
  let store: DeliveryEventStore;

  beforeEach(() => {
    store = new DeliveryEventStore();
  });

  it('starts with an empty event list', () => {
    expect(store.events).toEqual([]);
  });

  it('add() prepends an event (most-recent first)', () => {
    const e1 = makeEvent({ id: 'e1', timestamp: '2024-01-01T00:00:00Z' });
    const e2 = makeEvent({ id: 'e2', timestamp: '2024-01-01T01:00:00Z' });
    store.add(e1);
    store.add(e2);
    expect(store.events[0].id).toBe('e2');
    expect(store.events[1].id).toBe('e1');
  });

  it('subscribe() calls the listener immediately with the current list', () => {
    const e1 = makeEvent({ id: 'e1' });
    store.add(e1);

    let received: DeliveryEvent[] | null = null;
    store.subscribe((events) => {
      received = events;
    });

    expect(received).not.toBeNull();
    expect((received as unknown as DeliveryEvent[]).length).toBe(1);
  });

  it('subscribe() calls the listener when a new event is added (reactive AC3)', () => {
    let callCount = 0;
    let lastEvents: DeliveryEvent[] = [];

    store.subscribe((events) => {
      callCount++;
      lastEvents = events;
    });

    expect(callCount).toBe(1); // Immediate call on subscribe.

    store.add(makeEvent({ id: 'new-event' }));
    expect(callCount).toBe(2);
    expect(lastEvents[0].id).toBe('new-event');
  });

  it('unsubscribe() stops the listener from receiving further updates', () => {
    let callCount = 0;
    const unsub = store.subscribe(() => {
      callCount++;
    });

    unsub();
    store.add(makeEvent());
    expect(callCount).toBe(1); // Only the initial call; no further calls.
  });

  it('clear() empties the store and notifies subscribers', () => {
    store.add(makeEvent({ id: 'e1' }));
    store.add(makeEvent({ id: 'e2' }));

    let received: DeliveryEvent[] = [];
    store.subscribe((events) => {
      received = events;
    });

    store.clear();
    expect(received).toEqual([]);
  });

  it('setAll() replaces the event list and notifies subscribers', () => {
    store.add(makeEvent({ id: 'old' }));

    const newEvents = [
      makeEvent({ id: 'new1' }),
      makeEvent({ id: 'new2' }),
    ];

    let received: DeliveryEvent[] = [];
    store.subscribe((events) => {
      received = events;
    });

    store.setAll(newEvents);
    expect(received.length).toBe(2);
    expect(received[0].id).toBe('new1');
  });

  it('addMany() prepends multiple events and notifies once', () => {
    let callCount = 0;
    store.subscribe(() => {
      callCount++;
    });
    // callCount is 1 after subscribe (immediate call).

    const batch = [
      makeEvent({ id: 'b1' }),
      makeEvent({ id: 'b2' }),
    ];
    store.addMany(batch);

    expect(callCount).toBe(2); // One more call for the batch.
    expect(store.events[0].id).toBe('b1');
    expect(store.events[1].id).toBe('b2');
  });
});

// ── mountEventLog ─────────────────────────────────────────────────────────────

describe('mountEventLog', () => {
  let container: HTMLDivElement;
  let store: DeliveryEventStore;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    store = new DeliveryEventStore();
  });

  // Clean up after each test.
  // (vitest resets the jsdom between describe blocks but not between its)
  function cleanup() {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }

  // ── AC7: Empty log ──────────────────────────────────────────────────────────

  it('AC7 – renders correctly when the log is empty (zero attempts)', () => {
    const unsub = mountEventLog(container, store);

    const list = container.querySelector('.event-log-list');
    expect(list).not.toBeNull();
    expect(list!.children.length).toBe(0);

    const emptyMsg = container.querySelector('.event-log-empty');
    expect(emptyMsg).not.toBeNull();
    // Empty message should be visible (not hidden).
    expect((emptyMsg as HTMLElement).style.display).not.toBe('none');

    unsub();
    cleanup();
  });

  // ── AC2: Single entry ───────────────────────────────────────────────────────

  it('AC2 – single entry shows timestamp, HTTP status code, and response body excerpt', () => {
    const unsub = mountEventLog(container, store);

    store.add(
      makeEvent({
        id: 'single',
        timestamp: '2024-06-15T10:30:00Z',
        httpStatusCode: 201,
        responseBodyExcerpt: 'Created successfully',
        status: 'delivered',
      }),
    );

    const list = container.querySelector('.event-log-list')!;
    expect(list.children.length).toBe(1);

    const entry = list.children[0] as HTMLElement;
    expect(entry.querySelector('.entry-timestamp')).not.toBeNull();
    expect(entry.querySelector('.entry-http-code')!.textContent).toContain('201');
    expect(entry.querySelector('.entry-excerpt')!.textContent).toContain('Created successfully');

    unsub();
    cleanup();
  });

  // ── AC2: Multiple entries with mixed statuses ───────────────────────────────

  it('AC2 – multiple entries with mixed statuses all render', () => {
    const unsub = mountEventLog(container, store);

    const events: DeliveryEvent[] = [
      makeEvent({ id: 'e1', status: 'delivered', httpStatusCode: 200 }),
      makeEvent({ id: 'e2', status: 'failed', httpStatusCode: 500 }),
      makeEvent({ id: 'e3', status: 'pending', httpStatusCode: null }),
      makeEvent({ id: 'e4', status: 'exhausted', httpStatusCode: 503 }),
    ];

    store.addMany(events);

    const list = container.querySelector('.event-log-list')!;
    expect(list.children.length).toBe(4);

    // Each status class must appear at least once.
    const html = list.innerHTML;
    expect(html).toContain('status-delivered');
    expect(html).toContain('status-failed');
    expect(html).toContain('status-pending');
    expect(html).toContain('status-exhausted');

    unsub();
    cleanup();
  });

  // ── AC3: Reactive addition ──────────────────────────────────────────────────

  it('AC3 – new delivery attempt appears without a manual page refresh', () => {
    const unsub = mountEventLog(container, store);

    // Initially empty.
    expect(container.querySelector('.event-log-list')!.children.length).toBe(0);

    // Add an event — the component must update reactively.
    store.add(makeEvent({ id: 'reactive-event', status: 'delivered' }));

    const list = container.querySelector('.event-log-list')!;
    expect(list.children.length).toBe(1);
    expect(list.innerHTML).toContain('reactive-event');

    // Add a second event.
    store.add(makeEvent({ id: 'reactive-event-2', status: 'failed' }));
    expect(list.children.length).toBe(2);

    unsub();
    cleanup();
  });

  // ── AC6: Most-recent first ordering ────────────────────────────────────────

  it('AC6 – entries are displayed most-recent first', () => {
    const unsub = mountEventLog(container, store);

    store.add(makeEvent({ id: 'first-added', timestamp: '2024-01-01T00:00:00Z' }));
    store.add(makeEvent({ id: 'second-added', timestamp: '2024-01-01T01:00:00Z' }));

    const list = container.querySelector('.event-log-list')!;
    const firstItem = list.children[0] as HTMLElement;
    const secondItem = list.children[1] as HTMLElement;

    // Most recently added event should be first in the list.
    expect(firstItem.getAttribute('data-event-id')).toBe('second-added');
    expect(secondItem.getAttribute('data-event-id')).toBe('first-added');

    unsub();
    cleanup();
  });

  // ── AC7: Empty message hidden when entries exist ────────────────────────────

  it('AC7 – empty message is hidden when entries are present', () => {
    const unsub = mountEventLog(container, store);

    store.add(makeEvent());

    const emptyMsg = container.querySelector<HTMLElement>('.event-log-empty')!;
    expect(emptyMsg.style.display).toBe('none');

    unsub();
    cleanup();
  });

  // ── AC7: Empty message reappears after clear ────────────────────────────────

  it('AC7 – empty message reappears after all entries are cleared', () => {
    const unsub = mountEventLog(container, store);

    store.add(makeEvent());
    store.clear();

    const emptyMsg = container.querySelector<HTMLElement>('.event-log-empty')!;
    expect(emptyMsg.style.display).not.toBe('none');

    unsub();
    cleanup();
  });

  // ── AC9: Filtering interface data attributes ────────────────────────────────

  it('AC9 – entries expose data-event-type for event-type filter', () => {
    const unsub = mountEventLog(container, store);

    store.add(makeEvent({ id: 'e1', eventType: 'refund.issued' }));

    const entry = container.querySelector('[data-event-type="refund.issued"]');
    expect(entry).not.toBeNull();

    unsub();
    cleanup();
  });

  it('AC9 – entries expose data-status for status filter', () => {
    const unsub = mountEventLog(container, store);

    store.add(makeEvent({ id: 'e1', status: 'exhausted' }));

    const entry = container.querySelector('[data-status="exhausted"]');
    expect(entry).not.toBeNull();

    unsub();
    cleanup();
  });

  it('AC9 – entries expose data-timestamp for date-range filter', () => {
    const unsub = mountEventLog(container, store);

    store.add(makeEvent({ id: 'e1', timestamp: '2024-06-15T10:30:00Z' }));

    const entry = container.querySelector('[data-timestamp="2024-06-15T10:30:00Z"]');
    expect(entry).not.toBeNull();

    unsub();
    cleanup();
  });

  // ── AC4: Shared delivery-event shape (no special-casing) ───────────────────

  it('AC4 – component renders events from the shared DeliveryEvent shape without branching', () => {
    const unsub = mountEventLog(container, store);

    // Simulate events as they would come from the simulator (all statuses).
    const simulatorEvents: DeliveryEvent[] = [
      makeEvent({ id: 's1', status: 'pending', httpStatusCode: null }),
      makeEvent({ id: 's2', status: 'failed', httpStatusCode: 500, responseBodyExcerpt: 'Internal Server Error' }),
      makeEvent({ id: 's3', status: 'delivered', httpStatusCode: 200, responseBodyExcerpt: 'OK' }),
      makeEvent({ id: 's4', status: 'exhausted', httpStatusCode: 503, responseBodyExcerpt: 'Service Unavailable' }),
    ];

    store.addMany(simulatorEvents);

    const list = container.querySelector('.event-log-list')!;
    expect(list.children.length).toBe(4);

    // All four entries must be present.
    expect(container.querySelector('[data-event-id="s1"]')).not.toBeNull();
    expect(container.querySelector('[data-event-id="s2"]')).not.toBeNull();
    expect(container.querySelector('[data-event-id="s3"]')).not.toBeNull();
    expect(container.querySelector('[data-event-id="s4"]')).not.toBeNull();

    unsub();
    cleanup();
  });

  // ── AC8: Large number of entries ───────────────────────────────────────────

  it('AC8 – renders correctly with a large number of entries (no crash)', () => {
    const unsub = mountEventLog(container, store);

    const manyEvents: DeliveryEvent[] = Array.from({ length: 200 }, (_, i) =>
      makeEvent({
        id: `bulk-${i}`,
        status: i % 2 === 0 ? 'delivered' : 'failed',
        httpStatusCode: i % 2 === 0 ? 200 : 500,
      }),
    );

    store.addMany(manyEvents);

    const list = container.querySelector('.event-log-list')!;
    expect(list.children.length).toBe(200);

    unsub();
    cleanup();
  });
});
