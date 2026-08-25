// Integration tests for reactive metrics dashboard updates (Issue #159).
//
// The spec states: "Metrics recalculate automatically whenever the underlying
// delivery-event data changes (e.g. a new attempt is logged or a webhook
// transitions state); no manual refresh is required."
//
// These tests verify the reactive wiring between DeliveryEventStore and the
// metrics dashboard component — i.e. that the DOM updates synchronously in the
// same call as the data change, with no manual refresh step.
//
// AC coverage map:
//   AC1  – success rate recalculates on new delivery attempt (no manual refresh)
//   AC2  – avg retry count updates on state transition (failed → delivered/exhausted)
//   AC3  – TTD stats update when a successful delivery event is recorded
//   AC4  – metrics reflect latest data within the same render cycle as the change
//   AC5  – reactive updates work with simulator-produced data
//   AC6  – no Refresh/Reload button is present or required
//   AC7  – exhausted-alert indicator appears reactively when a webhook exhausts
//   AC8  – metrics only recalculate on delivery-event data changes (not unrelated changes)
//   AC9  – existing unit tests from #146 continue to pass (verified by running the suite)

import { describe, expect, it, beforeEach, vi } from 'vitest';

import { DeliveryEvent } from '../src/delivery-events';
import { DeliveryEventStore } from '../src/delivery-event-store';
import { mountMetricsDashboard } from '../src/metrics-dashboard';
import { generateSimulatedEvents, simulateWebhook } from '../src/webhook-simulator';

// ── Helpers ──────────────────────────────────────────────────────────────────

function ev(partial: Partial<DeliveryEvent> & Pick<DeliveryEvent, 'webhookId' | 'eventType'>): DeliveryEvent {
  return {
    status: 'delivered',
    attempt: 1,
    timestamp: '2026-01-01T00:00:00.000Z',
    httpStatus: 200,
    responseBodyExcerpt: '',
    ...partial,
  };
}

/** Reads the first metrics-card__value text (= aggregate success rate). */
function successRateText(container: HTMLElement): string {
  return container.querySelector('.metrics-card__value')?.textContent ?? '';
}

/** Reads the second metrics-card__value text (= avg retry count). */
function avgRetryText(container: HTMLElement): string {
  return container.querySelectorAll('.metrics-card__value')[1]?.textContent ?? '';
}

/** Reads the third metrics-card__value text (= median TTD). */
function medianTtdText(container: HTMLElement): string {
  return container.querySelectorAll('.metrics-card__value')[2]?.textContent ?? '';
}

/** Returns true if the exhausted-alert banner is present in the container. */
function hasExhaustedAlert(container: HTMLElement): boolean {
  return container.querySelector('.metrics-alert--exhausted') !== null;
}

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

// ── AC1: Success rate recalculates on new delivery attempt ────────────────────

describe('AC1 – success rate recalculates on new delivery attempt (no manual refresh)', () => {
  it('updates success rate immediately when a delivered event is added', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'failed', httpStatus: 503 }),
    ]);
    mountMetricsDashboard(container, store);

    // Before: 0 delivered / 1 total = 0.0%
    expect(successRateText(container)).toBe('0.0%');

    // Add a delivered attempt — no manual refresh step.
    store.add(ev({ webhookId: 'b', eventType: 'payment.created', status: 'delivered' }));

    // After: 1 delivered / 2 total = 50.0% — updated in the same call.
    expect(successRateText(container)).toBe('50.0%');
  });

  it('updates success rate when multiple events are added in a batch', () => {
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);

    expect(successRateText(container)).toBe('—'); // empty

    store.addMany([
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }),
      ev({ webhookId: 'b', eventType: 'payment.created', status: 'delivered' }),
      ev({ webhookId: 'c', eventType: 'payment.created', status: 'failed', httpStatus: 503 }),
    ]);

    // 2 delivered / 3 total = 66.7%
    expect(successRateText(container)).toBe('66.7%');
  });

  it('updates success rate when the store is reset with new events', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'failed', httpStatus: 503 }),
    ]);
    mountMetricsDashboard(container, store);

    expect(successRateText(container)).toBe('0.0%');

    store.reset([
      ev({ webhookId: 'x', eventType: 'payment.created', status: 'delivered' }),
      ev({ webhookId: 'y', eventType: 'payment.created', status: 'delivered' }),
    ]);

    expect(successRateText(container)).toBe('100.0%');
  });

  it('renders initial state immediately on mount without a separate refresh', () => {
    // subscribe() calls the listener immediately — the dashboard should be
    // populated right after mountMetricsDashboard returns, with no extra step.
    const store = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }),
    ]);
    mountMetricsDashboard(container, store);

    // Dashboard is populated synchronously.
    expect(container.querySelector('.metrics-dashboard')).not.toBeNull();
    expect(successRateText(container)).toBe('100.0%');
  });
});

// ── AC2: Avg retry count updates on state transition ─────────────────────────

describe('AC2 – avg retry count updates on webhook state transition', () => {
  it('updates avg retry count when a failed webhook transitions to delivered', () => {
    // wh_a: 1 failed attempt so far → 0 retries counted (only 1 attempt)
    const store = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'failed', attempt: 1, httpStatus: 503 }),
    ]);
    mountMetricsDashboard(container, store);

    // 1 attempt, 0 retries → avg = 0.00
    expect(avgRetryText(container)).toBe('0.00');

    // Webhook transitions: failed → delivered on 2nd attempt (1 retry).
    store.add(ev({ webhookId: 'a', eventType: 'payment.created', status: 'delivered', attempt: 2 }));

    // Now: 1 webhook with 1 retry → avg = 1.00
    expect(avgRetryText(container)).toBe('1.00');
  });

  it('updates avg retry count when a failed webhook transitions to exhausted', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'failed', attempt: 1, httpStatus: 503 }),
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'failed', attempt: 2, httpStatus: 503 }),
    ]);
    mountMetricsDashboard(container, store);

    // 1 webhook, 2 attempts so far → 1 retry
    expect(avgRetryText(container)).toBe('1.00');

    // Webhook transitions to exhausted on 3rd attempt.
    store.add(ev({ webhookId: 'a', eventType: 'payment.created', status: 'exhausted', attempt: 3, httpStatus: 503 }));

    // Now: 1 webhook, 3 attempts → 2 retries → avg = 2.00
    expect(avgRetryText(container)).toBe('2.00');
  });

  it('updates per-event-type retry breakdown when a new event type is added', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'delivered', attempt: 1 }),
    ]);
    mountMetricsDashboard(container, store);

    // Only payment.created row exists.
    let typeCells = [...container.querySelectorAll('.metrics-cell--type')].map((c) => c.textContent ?? '');
    expect(typeCells).not.toContain('refund.issued');

    // Add a refund.issued webhook with 1 retry.
    store.addMany([
      ev({ webhookId: 'b', eventType: 'refund.issued', status: 'failed', attempt: 1, httpStatus: 503 }),
      ev({ webhookId: 'b', eventType: 'refund.issued', status: 'delivered', attempt: 2 }),
    ]);

    typeCells = [...container.querySelectorAll('.metrics-cell--type')].map((c) => c.textContent ?? '');
    expect(typeCells).toContain('refund.issued');

    // refund.issued row: 1 webhook, 1 retry → avg = 1.00
    const refundRow = [...container.querySelectorAll('.metrics-cell--type')]
      .find((c) => c.textContent === 'refund.issued')
      ?.closest('tr');
    expect(refundRow).not.toBeNull();
    const cells = refundRow!.querySelectorAll('.metrics-cell');
    expect(cells[2]?.textContent).toBe('1.00');
  });
});

// ── AC3: TTD stats update when a successful delivery is recorded ──────────────

describe('AC3 – TTD stats update when a successful delivery event is recorded', () => {
  it('median TTD updates from "—" to a value when the first delivered event arrives', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'failed', attempt: 1, httpStatus: 503,
           timestamp: '2026-01-01T00:00:00.000Z' }),
    ]);
    mountMetricsDashboard(container, store);

    // No delivered webhooks yet → TTD is "—".
    expect(medianTtdText(container)).toBe('—');

    // Webhook delivers on 2nd attempt, 60 s later.
    store.add(ev({
      webhookId: 'a',
      eventType: 'payment.created',
      status: 'delivered',
      attempt: 2,
      timestamp: '2026-01-01T00:01:00.000Z',
    }));

    // TTD = 60 s (from first attempt to first delivery).
    expect(medianTtdText(container)).toBe('1.0 min');
  });

  it('p95 TTD card updates when a second delivered webhook is recorded', () => {
    // Start with one delivered webhook (TTD = 0 ms).
    const store = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'delivered', attempt: 1,
           timestamp: '2026-01-01T00:00:00.000Z' }),
    ]);
    mountMetricsDashboard(container, store);

    const p95Before = container.querySelectorAll('.metrics-card__value')[3]?.textContent ?? '';
    expect(p95Before).toBe('0 ms');

    // Add a second webhook with TTD = 60 s.
    store.addMany([
      ev({ webhookId: 'b', eventType: 'payment.created', status: 'failed', attempt: 1, httpStatus: 503,
           timestamp: '2026-01-01T00:00:00.000Z' }),
      ev({ webhookId: 'b', eventType: 'payment.created', status: 'delivered', attempt: 2,
           timestamp: '2026-01-01T00:01:00.000Z' }),
    ]);

    // p95 of [0, 60_000] = 60_000 ms = 1.0 min
    const p95After = container.querySelectorAll('.metrics-card__value')[3]?.textContent ?? '';
    expect(p95After).toBe('1.0 min');
  });

  it('per-event-type TTD row updates when a delivered event is added for that type', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'refund.issued', status: 'failed', attempt: 1, httpStatus: 503,
           timestamp: '2026-01-01T00:00:00.000Z' }),
    ]);
    mountMetricsDashboard(container, store);

    // refund.issued row: TTD = "—" (no delivered webhooks).
    const refundRowBefore = [...container.querySelectorAll('.metrics-cell--type')]
      .find((c) => c.textContent === 'refund.issued')
      ?.closest('tr');
    expect(refundRowBefore!.querySelectorAll('.metrics-cell')[3]?.textContent).toBe('—');

    // Deliver the webhook.
    store.add(ev({
      webhookId: 'a',
      eventType: 'refund.issued',
      status: 'delivered',
      attempt: 2,
      timestamp: '2026-01-01T00:00:30.000Z', // 30 s later
    }));

    const refundRowAfter = [...container.querySelectorAll('.metrics-cell--type')]
      .find((c) => c.textContent === 'refund.issued')
      ?.closest('tr');
    expect(refundRowAfter!.querySelectorAll('.metrics-cell')[3]?.textContent).toBe('30.0 s');
  });
});

// ── AC4: Metrics reflect latest data within the same render cycle ─────────────

describe('AC4 – metrics reflect latest data within the same render cycle as the change', () => {
  it('DOM is updated synchronously in the same call as store.add()', () => {
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);

    // Capture the DOM state immediately after add() returns — no await, no tick.
    store.add(ev({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }));

    // The DOM must already reflect the new event.
    expect(successRateText(container)).toBe('100.0%');
    expect(container.querySelector('.metrics-cell--empty')).toBeNull();
  });

  it('DOM is updated synchronously in the same call as store.addMany()', () => {
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);

    store.addMany([
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }),
      ev({ webhookId: 'b', eventType: 'payment.created', status: 'failed', httpStatus: 503 }),
    ]);

    // 1 delivered / 2 total = 50.0% — no async tick needed.
    expect(successRateText(container)).toBe('50.0%');
  });

  it('DOM is updated synchronously in the same call as store.reset()', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'failed', httpStatus: 503 }),
    ]);
    mountMetricsDashboard(container, store);

    expect(successRateText(container)).toBe('0.0%');

    store.reset([ev({ webhookId: 'z', eventType: 'refund.issued', status: 'delivered' })]);

    // Immediately after reset() the DOM shows the new data.
    expect(successRateText(container)).toBe('100.0%');
    const typeCells = [...container.querySelectorAll('.metrics-cell--type')].map((c) => c.textContent ?? '');
    expect(typeCells).toContain('refund.issued');
    expect(typeCells).not.toContain('payment.created');
  });

  it('multiple sequential adds each update the DOM immediately', () => {
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);

    store.add(ev({ webhookId: 'a', eventType: 'payment.created', status: 'failed', httpStatus: 503 }));
    expect(successRateText(container)).toBe('0.0%');

    store.add(ev({ webhookId: 'b', eventType: 'payment.created', status: 'delivered' }));
    expect(successRateText(container)).toBe('50.0%');

    store.add(ev({ webhookId: 'c', eventType: 'payment.created', status: 'delivered' }));
    // 2 delivered / 3 total = 66.7%
    expect(successRateText(container)).toBe('66.7%');
  });
});

// ── AC5: Reactive updates work with simulator-produced data ───────────────────

describe('AC5 – reactive updates work with simulator-produced data', () => {
  it('dashboard updates reactively when simulator events are added to the store', () => {
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);

    // Initially empty.
    expect(container.querySelector('.metrics-cell--empty')).not.toBeNull();

    // Generate simulator events and add them to the store.
    let seed = 42;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const events = generateSimulatedEvents({ count: 6, successRate: 0.8, random: rng, startTime: 0 });
    expect(events.length).toBeGreaterThan(0);

    store.addMany(events);

    // Dashboard updated reactively — no empty state, no NaN.
    expect(container.querySelector('.metrics-cell--empty')).toBeNull();
    expect(container.textContent).not.toContain('NaN');
    expect(container.querySelector('.metrics-dashboard')).not.toBeNull();
  });

  it('dashboard updates reactively when simulator events are added one at a time', () => {
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);

    let seed = 7;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    // Simulate a single webhook and add its events one by one.
    const events = simulateWebhook('wh_sim', 'payment.created', {
      successRate: 1.0,
      maxAttempts: 3,
      random: rng,
      startTime: 0,
    });

    for (const event of events) {
      store.add(event);
      // After each add the DOM is updated — no stale reads.
      expect(container.querySelector('.metrics-dashboard')).not.toBeNull();
      expect(container.textContent).not.toContain('NaN');
    }

    // Final state: at least one delivered event.
    expect(successRateText(container)).not.toBe('—');
  });

  it('simulator data with 0% success rate shows 0.0% and no TTD', () => {
    let seed = 99;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const events = generateSimulatedEvents({
      count: 4,
      successRate: 0.0,
      maxAttempts: 2,
      random: rng,
      startTime: 0,
    });

    const store = new DeliveryEventStore(events);
    mountMetricsDashboard(container, store);

    expect(successRateText(container)).toBe('0.0%');
    expect(medianTtdText(container)).toBe('—');
    expect(container.textContent).not.toContain('NaN');
  });

  it('simulator data with 100% success rate shows 100.0%', () => {
    let seed = 13;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const events = generateSimulatedEvents({
      count: 4,
      successRate: 1.0,
      random: rng,
      startTime: 0,
    });

    const store = new DeliveryEventStore(events);
    mountMetricsDashboard(container, store);

    expect(successRateText(container)).toBe('100.0%');
  });
});

// ── AC6: No Refresh/Reload button is present or required ─────────────────────

describe('AC6 – no Refresh or Reload button is present or required', () => {
  it('the dashboard contains no button with "refresh" or "reload" text', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }),
    ]);
    mountMetricsDashboard(container, store);

    const buttons = [...container.querySelectorAll('button')];
    const refreshButtons = buttons.filter((b) =>
      /refresh|reload/i.test(b.textContent ?? ''),
    );
    expect(refreshButtons).toHaveLength(0);
  });

  it('the dashboard contains no element with role="button" labelled refresh/reload', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }),
    ]);
    mountMetricsDashboard(container, store);

    const roleButtons = [...container.querySelectorAll('[role="button"]')];
    const refreshRoleButtons = roleButtons.filter((b) =>
      /refresh|reload/i.test(b.textContent ?? b.getAttribute('aria-label') ?? ''),
    );
    expect(refreshRoleButtons).toHaveLength(0);
  });

  it('metrics update without any user interaction after store changes', () => {
    // This test verifies the reactive contract: no click/interaction needed.
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);

    // Programmatic store mutation (simulating a background delivery event) —
    // no simulated user interaction.
    store.add(ev({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }));

    // Metrics are updated without any button click or manual refresh.
    expect(successRateText(container)).toBe('100.0%');
  });
});

// ── AC7: Exhausted-alert indicator appears reactively ────────────────────────

describe('AC7 – exhausted-alert indicator appears reactively when a webhook exhausts', () => {
  it('no alert is shown when there are no exhausted webhooks', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }),
      ev({ webhookId: 'b', eventType: 'payment.created', status: 'failed', httpStatus: 503 }),
    ]);
    mountMetricsDashboard(container, store);

    expect(hasExhaustedAlert(container)).toBe(false);
  });

  it('alert appears immediately when an exhausted event is added — no manual interaction', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'failed', attempt: 1, httpStatus: 503 }),
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'failed', attempt: 2, httpStatus: 503 }),
    ]);
    mountMetricsDashboard(container, store);

    // No exhausted events yet.
    expect(hasExhaustedAlert(container)).toBe(false);

    // Webhook transitions to exhausted.
    store.add(ev({
      webhookId: 'a',
      eventType: 'payment.created',
      status: 'exhausted',
      attempt: 3,
      httpStatus: 503,
    }));

    // Alert is now visible — no manual interaction required.
    expect(hasExhaustedAlert(container)).toBe(true);
  });

  it('alert is prominent: has role="alert" for accessibility', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'exhausted', attempt: 1, httpStatus: 503 }),
    ]);
    mountMetricsDashboard(container, store);

    const alertEl = container.querySelector('.metrics-alert--exhausted');
    expect(alertEl).not.toBeNull();
    expect(alertEl!.getAttribute('role')).toBe('alert');
  });

  it('alert disappears when the store is reset to events with no exhausted webhooks', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'exhausted', attempt: 1, httpStatus: 503 }),
    ]);
    mountMetricsDashboard(container, store);

    expect(hasExhaustedAlert(container)).toBe(true);

    // Reset to a clean set of delivered events.
    store.reset([
      ev({ webhookId: 'x', eventType: 'payment.created', status: 'delivered' }),
    ]);

    expect(hasExhaustedAlert(container)).toBe(false);
  });

  it('alert appears when simulator produces an exhausted webhook', () => {
    // Force all attempts to fail so the simulator produces exhausted events.
    let seed = 5;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const events = generateSimulatedEvents({
      count: 3,
      successRate: 0.0,
      maxAttempts: 2,
      random: rng,
      startTime: 0,
    });

    const store = new DeliveryEventStore(events);
    mountMetricsDashboard(container, store);

    // All webhooks exhausted → alert must be shown.
    expect(hasExhaustedAlert(container)).toBe(true);
  });

  it('alert contains a meaningful message for the merchant', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'exhausted', attempt: 1, httpStatus: 503 }),
    ]);
    mountMetricsDashboard(container, store);

    const alertEl = container.querySelector('.metrics-alert--exhausted');
    expect(alertEl).not.toBeNull();
    // The message should mention exhausted/retry so merchants understand the situation.
    expect(alertEl!.textContent?.toLowerCase()).toMatch(/exhaust|retr/);
  });
});

// ── AC8: Metrics only recalculate on delivery-event data changes ──────────────

describe('AC8 – metrics only recalculate on delivery-event data changes', () => {
  it('subscribe listener is called exactly once per store mutation', () => {
    const store = new DeliveryEventStore();
    const renderSpy = vi.fn();
    store.subscribe(renderSpy);

    // Initial call on subscribe.
    expect(renderSpy).toHaveBeenCalledTimes(1);

    store.add(ev({ webhookId: 'a', eventType: 'payment.created' }));
    expect(renderSpy).toHaveBeenCalledTimes(2);

    store.addMany([
      ev({ webhookId: 'b', eventType: 'payment.created' }),
      ev({ webhookId: 'c', eventType: 'payment.created' }),
    ]);
    // addMany is a single notification regardless of how many events are added.
    expect(renderSpy).toHaveBeenCalledTimes(3);

    store.reset([]);
    expect(renderSpy).toHaveBeenCalledTimes(4);
  });

  it('addMany with zero events does not trigger a re-render', () => {
    const store = new DeliveryEventStore();
    const renderSpy = vi.fn();
    store.subscribe(renderSpy);

    expect(renderSpy).toHaveBeenCalledTimes(1); // initial

    store.addMany([]); // no-op per store contract
    expect(renderSpy).toHaveBeenCalledTimes(1); // no extra call
  });

  it('unsubscribed listener is not called after disposal', () => {
    const store = new DeliveryEventStore();
    const dispose = mountMetricsDashboard(container, store);

    // Capture the DOM state before disposal.
    store.add(ev({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }));
    expect(successRateText(container)).toBe('100.0%');

    // Dispose the dashboard.
    dispose();

    // After disposal, further store mutations must not update the (now-cleared) container.
    store.add(ev({ webhookId: 'b', eventType: 'payment.created', status: 'failed', httpStatus: 503 }));
    expect(container.querySelector('.metrics-dashboard')).toBeNull();
  });

  it('a second independent store does not affect the first dashboard', () => {
    const storeA = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }),
    ]);
    const containerA = document.createElement('div');
    document.body.appendChild(containerA);
    mountMetricsDashboard(containerA, storeA);

    const storeB = new DeliveryEventStore();
    const containerB = document.createElement('div');
    document.body.appendChild(containerB);
    mountMetricsDashboard(containerB, storeB);

    // storeA shows 100.0%, storeB shows "—".
    expect(containerA.querySelector('.metrics-card__value')?.textContent).toBe('100.0%');
    expect(containerB.querySelector('.metrics-card__value')?.textContent).toBe('—');

    // Mutating storeB does not affect containerA.
    storeB.add(ev({ webhookId: 'z', eventType: 'refund.issued', status: 'failed', httpStatus: 503 }));
    expect(containerA.querySelector('.metrics-card__value')?.textContent).toBe('100.0%');
    expect(containerB.querySelector('.metrics-card__value')?.textContent).toBe('0.0%');
  });
});

// ── AC9: Existing unit tests from #146 continue to pass ──────────────────────
//
// This is verified by running the full test suite (npm test). The tests in
// tests/metrics.test.ts and tests/metrics-dashboard.test.ts are the #146 tests;
// they are not modified here. The following test confirms the calculation module
// is still importable and produces correct results after the reactive wiring
// changes introduced in this issue.

describe('AC9 – existing calculation tests unaffected by reactive wiring', () => {
  it('calculateMetrics still produces correct results after reactive wiring changes', async () => {
    const { calculateMetrics } = await import('../src/metrics');

    const events: DeliveryEvent[] = [
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'failed', attempt: 1, httpStatus: 503,
           timestamp: '2026-01-01T00:00:00.000Z' }),
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'delivered', attempt: 2,
           timestamp: '2026-01-01T00:01:00.000Z' }),
      ev({ webhookId: 'b', eventType: 'payment.created', status: 'delivered', attempt: 1,
           timestamp: '2026-01-01T00:00:00.000Z' }),
    ];

    const report = calculateMetrics(events);

    // 2 delivered / 3 total = 66.7%
    expect(report.overall.successRate).toBeCloseTo(2 / 3, 10);
    // wh_a: 1 retry, wh_b: 0 retries → avg = 0.5
    expect(report.overall.averageRetryCount).toBeCloseTo(0.5, 10);
    // TTD: wh_a = 60_000 ms, wh_b = 0 ms → median = 30_000 ms
    expect(report.overall.timeToDelivery.medianMs).toBe(30_000);
  });

  it('DeliveryEventStore subscribe/unsubscribe contract is unchanged', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'payment.created' }),
    ]);

    const received: number[] = [];
    const unsub = store.subscribe((events) => received.push(events.length));

    // Immediate call on subscribe.
    expect(received).toEqual([1]);

    store.add(ev({ webhookId: 'b', eventType: 'payment.created' }));
    expect(received).toEqual([1, 2]);

    unsub();
    store.add(ev({ webhookId: 'c', eventType: 'payment.created' }));
    // No more calls after unsubscribe.
    expect(received).toEqual([1, 2]);
  });

  it('mountMetricsDashboard disposer clears the container and stops updates', () => {
    const store = new DeliveryEventStore();
    const dispose = mountMetricsDashboard(container, store);

    store.add(ev({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }));
    expect(container.querySelector('.metrics-dashboard')).not.toBeNull();

    dispose();

    // Container is cleared.
    expect(container.querySelector('.metrics-dashboard')).toBeNull();
    expect(container.children.length).toBe(0);

    // Further mutations do not re-populate the container.
    store.add(ev({ webhookId: 'b', eventType: 'payment.created', status: 'delivered' }));
    expect(container.querySelector('.metrics-dashboard')).toBeNull();
  });
});
