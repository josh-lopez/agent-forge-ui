// Supplemental integration tests for reactive metrics dashboard (Issue #159).
//
// These tests complement tests/metrics-reactive-issue159.test.ts with
// additional edge-case and integration coverage for the reactive wiring
// between DeliveryEventStore and the metrics dashboard component.
//
// AC coverage:
//   AC1  – success rate recalculates on new delivery attempt
//   AC2  – avg retry count updates on state transition
//   AC3  – TTD stats update when a successful delivery is recorded
//   AC4  – metrics reflect latest data within the same render cycle
//   AC5  – reactive updates work with simulator-produced data
//   AC6  – no Refresh/Reload button required or present
//   AC7  – exhausted-alert indicator appears reactively
//   AC8  – metrics only recalculate on delivery-event data changes
//   AC9  – existing unit tests continue to pass

import { describe, expect, it, beforeEach, vi } from 'vitest';

import { DeliveryEvent } from '../src/delivery-events';
import { DeliveryEventStore } from '../src/delivery-event-store';
import { mountMetricsDashboard, renderMetricsDashboard } from '../src/metrics-dashboard';
import { calculateMetrics } from '../src/metrics';
import { generateSimulatedEvents, simulateWebhook, RETRY_SCHEDULE_MS } from '../src/webhook-simulator';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(
  partial: Partial<DeliveryEvent> & Pick<DeliveryEvent, 'webhookId' | 'eventType'>,
): DeliveryEvent {
  return {
    status: 'delivered',
    attempt: 1,
    timestamp: '2026-06-01T00:00:00.000Z',
    httpStatus: 200,
    responseBodyExcerpt: '',
    ...partial,
  };
}

/** Returns the text of the nth .metrics-card__value (0-indexed). */
function cardValue(container: HTMLElement, index: number): string {
  return container.querySelectorAll('.metrics-card__value')[index]?.textContent ?? '';
}

const successRateCard = (c: HTMLElement) => cardValue(c, 0);
const avgRetryCard = (c: HTMLElement) => cardValue(c, 1);
const medianTtdCard = (c: HTMLElement) => cardValue(c, 2);
const p95TtdCard = (c: HTMLElement) => cardValue(c, 3);

function hasExhaustedAlert(container: HTMLElement): boolean {
  return container.querySelector('.metrics-alert--exhausted') !== null;
}

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

// ── AC1: Success rate edge cases ──────────────────────────────────────────────

describe('AC1 – success rate edge cases', () => {
  it('shows "—" for success rate when the store is empty', () => {
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);
    expect(successRateCard(container)).toBe('—');
  });

  it('shows 100.0% when all events are delivered', () => {
    const store = new DeliveryEventStore([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }),
      makeEvent({ webhookId: 'b', eventType: 'payment.created', status: 'delivered' }),
    ]);
    mountMetricsDashboard(container, store);
    expect(successRateCard(container)).toBe('100.0%');
  });

  it('transitions from 100% to 50% when a failed event is added', () => {
    const store = new DeliveryEventStore([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }),
    ]);
    mountMetricsDashboard(container, store);
    expect(successRateCard(container)).toBe('100.0%');

    store.add(makeEvent({ webhookId: 'b', eventType: 'payment.created', status: 'failed', httpStatus: 503 }));
    expect(successRateCard(container)).toBe('50.0%');
  });

  it('transitions from 0% to 100% when store is reset to all-delivered events', () => {
    const store = new DeliveryEventStore([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'failed', httpStatus: 503 }),
    ]);
    mountMetricsDashboard(container, store);
    expect(successRateCard(container)).toBe('0.0%');

    store.reset([
      makeEvent({ webhookId: 'x', eventType: 'payment.created', status: 'delivered' }),
    ]);
    expect(successRateCard(container)).toBe('100.0%');
  });

  it('shows 0.0% when all events are exhausted (none delivered)', () => {
    const store = new DeliveryEventStore([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'exhausted', httpStatus: 503 }),
      makeEvent({ webhookId: 'b', eventType: 'payment.created', status: 'exhausted', httpStatus: 503 }),
    ]);
    mountMetricsDashboard(container, store);
    expect(successRateCard(container)).toBe('0.0%');
  });
});

// ── AC2: Avg retry count edge cases ──────────────────────────────────────────

describe('AC2 – avg retry count edge cases', () => {
  it('shows "—" for avg retry count when the store is empty', () => {
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);
    expect(avgRetryCard(container)).toBe('—');
  });

  it('shows 0.00 when every webhook delivered on the first attempt', () => {
    const store = new DeliveryEventStore([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'delivered', attempt: 1 }),
      makeEvent({ webhookId: 'b', eventType: 'payment.created', status: 'delivered', attempt: 1 }),
    ]);
    mountMetricsDashboard(container, store);
    expect(avgRetryCard(container)).toBe('0.00');
  });

  it('updates avg retry count reactively across multiple event types', () => {
    const store = new DeliveryEventStore([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'delivered', attempt: 1 }),
    ]);
    mountMetricsDashboard(container, store);
    // 1 webhook, 1 attempt → 0 retries
    expect(avgRetryCard(container)).toBe('0.00');

    // Add a refund.issued webhook with 2 attempts (1 retry)
    store.addMany([
      makeEvent({ webhookId: 'b', eventType: 'refund.issued', status: 'failed', attempt: 1, httpStatus: 503 }),
      makeEvent({ webhookId: 'b', eventType: 'refund.issued', status: 'delivered', attempt: 2 }),
    ]);

    // Overall: 2 webhooks, total attempts = 1+2 = 3, retries = 3-2 = 1, avg = 0.50
    expect(avgRetryCard(container)).toBe('0.50');
  });
});

// ── AC3: TTD stats edge cases ─────────────────────────────────────────────────

describe('AC3 – TTD stats edge cases', () => {
  it('shows "—" for median and p95 TTD when no webhooks have delivered', () => {
    const store = new DeliveryEventStore([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'failed', httpStatus: 503 }),
    ]);
    mountMetricsDashboard(container, store);
    expect(medianTtdCard(container)).toBe('—');
    expect(p95TtdCard(container)).toBe('—');
  });

  it('shows 0 ms TTD when a webhook delivers on its first attempt', () => {
    const store = new DeliveryEventStore([
      makeEvent({
        webhookId: 'a',
        eventType: 'payment.created',
        status: 'delivered',
        attempt: 1,
        timestamp: '2026-06-01T00:00:00.000Z',
      }),
    ]);
    mountMetricsDashboard(container, store);
    expect(medianTtdCard(container)).toBe('0 ms');
  });

  it('TTD updates from "—" to a value when the first delivered event is added', () => {
    const store = new DeliveryEventStore([
      makeEvent({
        webhookId: 'a',
        eventType: 'payment.created',
        status: 'failed',
        attempt: 1,
        httpStatus: 503,
        timestamp: '2026-06-01T00:00:00.000Z',
      }),
    ]);
    mountMetricsDashboard(container, store);
    expect(medianTtdCard(container)).toBe('—');

    // Deliver 2 minutes later
    store.add(makeEvent({
      webhookId: 'a',
      eventType: 'payment.created',
      status: 'delivered',
      attempt: 2,
      timestamp: '2026-06-01T00:02:00.000Z',
    }));

    expect(medianTtdCard(container)).toBe('2.0 min');
  });

  it('TTD disappears when store is reset to events with no delivered webhooks', () => {
    const store = new DeliveryEventStore([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'delivered', attempt: 1 }),
    ]);
    mountMetricsDashboard(container, store);
    expect(medianTtdCard(container)).toBe('0 ms');

    store.reset([
      makeEvent({ webhookId: 'b', eventType: 'payment.created', status: 'failed', httpStatus: 503 }),
    ]);
    expect(medianTtdCard(container)).toBe('—');
  });
});

// ── AC4: Same-render-cycle synchrony ─────────────────────────────────────────

describe('AC4 – same render cycle synchrony', () => {
  it('the metrics-dashboard section is present immediately after mountMetricsDashboard', () => {
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);
    // No async tick — the section must exist synchronously.
    expect(container.querySelector('.metrics-dashboard')).not.toBeNull();
  });

  it('all four summary cards are present immediately after mount', () => {
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);
    expect(container.querySelectorAll('.metrics-card').length).toBe(4);
  });

  it('the table header row is present immediately after mount', () => {
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);
    const ths = container.querySelectorAll('.metrics-th');
    expect(ths.length).toBeGreaterThan(0);
  });

  it('the aggregate row is always present (even with no events)', () => {
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);
    const aggregateRow = container.querySelector('.metrics-row--aggregate');
    expect(aggregateRow).not.toBeNull();
    expect(aggregateRow!.textContent).toContain('All event types');
  });

  it('the empty-state row disappears synchronously when the first event is added', () => {
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);
    expect(container.querySelector('.metrics-cell--empty')).not.toBeNull();

    store.add(makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }));
    expect(container.querySelector('.metrics-cell--empty')).toBeNull();
  });

  it('the empty-state row reappears synchronously when store is reset to empty', () => {
    const store = new DeliveryEventStore([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }),
    ]);
    mountMetricsDashboard(container, store);
    expect(container.querySelector('.metrics-cell--empty')).toBeNull();

    store.reset([]);
    expect(container.querySelector('.metrics-cell--empty')).not.toBeNull();
  });
});

// ── AC5: Simulator compatibility ─────────────────────────────────────────────

describe('AC5 – simulator compatibility', () => {
  it('RETRY_SCHEDULE_MS has the expected exponential back-off shape', () => {
    // Verify the simulator uses the spec-required schedule so its events
    // produce meaningful TTD values in the dashboard.
    expect(RETRY_SCHEDULE_MS[0]).toBe(0);          // immediate
    expect(RETRY_SCHEDULE_MS[1]).toBe(60_000);     // 1 min
    expect(RETRY_SCHEDULE_MS[2]).toBe(5 * 60_000); // 5 min
    expect(RETRY_SCHEDULE_MS.length).toBeGreaterThanOrEqual(6);
  });

  it('simulator events have the same shape as manually constructed events', () => {
    const events = simulateWebhook('wh_test', 'payment.created', {
      successRate: 1.0,
      maxAttempts: 1,
      random: () => 0.5,
      startTime: 0,
    });
    expect(events.length).toBe(1);
    const e = events[0];
    expect(e).toHaveProperty('webhookId', 'wh_test');
    expect(e).toHaveProperty('eventType', 'payment.created');
    expect(e).toHaveProperty('status');
    expect(e).toHaveProperty('attempt');
    expect(e).toHaveProperty('timestamp');
    expect(e).toHaveProperty('httpStatus');
    expect(e).toHaveProperty('responseBodyExcerpt');
  });

  it('dashboard shows correct success rate for a mixed simulator batch', () => {
    // Use a deterministic RNG to produce a predictable mix.
    let seed = 100;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const events = generateSimulatedEvents({
      count: 10,
      successRate: 1.0, // all succeed
      random: rng,
      startTime: 0,
    });
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);

    store.addMany(events);

    // With successRate=1.0 every webhook delivers → 100.0%
    expect(successRateCard(container)).toBe('100.0%');
    expect(container.textContent).not.toContain('NaN');
  });

  it('dashboard shows 0.0% success rate for a 0% simulator batch', () => {
    let seed = 200;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const events = generateSimulatedEvents({
      count: 5,
      successRate: 0.0, // all fail/exhaust
      random: rng,
      startTime: 0,
    });
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);
    store.addMany(events);

    expect(successRateCard(container)).toBe('0.0%');
  });

  it('dashboard updates reactively as simulator events arrive one by one', () => {
    const events = simulateWebhook('wh_seq', 'payment.created', {
      successRate: 1.0,
      maxAttempts: 3,
      random: () => 0.9, // always succeeds on first attempt
      startTime: 0,
    });

    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);

    for (const event of events) {
      store.add(event);
      // After each add the dashboard must be present and NaN-free.
      expect(container.querySelector('.metrics-dashboard')).not.toBeNull();
      expect(container.textContent).not.toContain('NaN');
    }
  });
});

// ── AC6: No Refresh/Reload button ────────────────────────────────────────────

describe('AC6 – no Refresh/Reload button required or present', () => {
  it('renderMetricsDashboard produces no <button> elements at all', () => {
    const report = calculateMetrics([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }),
    ]);
    const el = renderMetricsDashboard(report);
    expect(el.querySelectorAll('button').length).toBe(0);
  });

  it('mountMetricsDashboard container has no <button> elements', () => {
    const store = new DeliveryEventStore([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }),
    ]);
    mountMetricsDashboard(container, store);
    expect(container.querySelectorAll('button').length).toBe(0);
  });

  it('no element with text matching /refresh/i exists in the dashboard', () => {
    const store = new DeliveryEventStore([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }),
    ]);
    mountMetricsDashboard(container, store);
    const allText = container.textContent?.toLowerCase() ?? '';
    expect(allText).not.toContain('refresh');
    expect(allText).not.toContain('reload');
  });

  it('metrics update after store.add() without any simulated user interaction', () => {
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);

    // No click, no event dispatch — just a data change.
    store.add(makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }));

    expect(successRateCard(container)).toBe('100.0%');
  });
});

// ── AC7: Exhausted-alert indicator ───────────────────────────────────────────

describe('AC7 – exhausted-alert indicator reactive behaviour', () => {
  it('alert is absent when the store is empty', () => {
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);
    expect(hasExhaustedAlert(container)).toBe(false);
  });

  it('alert is absent when all webhooks delivered', () => {
    const store = new DeliveryEventStore([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }),
    ]);
    mountMetricsDashboard(container, store);
    expect(hasExhaustedAlert(container)).toBe(false);
  });

  it('alert is absent when webhooks are only failed (not yet exhausted)', () => {
    const store = new DeliveryEventStore([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'failed', httpStatus: 503 }),
    ]);
    mountMetricsDashboard(container, store);
    expect(hasExhaustedAlert(container)).toBe(false);
  });

  it('alert appears immediately when an exhausted event is added', () => {
    const store = new DeliveryEventStore([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'failed', httpStatus: 503 }),
    ]);
    mountMetricsDashboard(container, store);
    expect(hasExhaustedAlert(container)).toBe(false);

    store.add(makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'exhausted', httpStatus: 503 }));
    expect(hasExhaustedAlert(container)).toBe(true);
  });

  it('alert has role="alert" for screen-reader accessibility', () => {
    const store = new DeliveryEventStore([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'exhausted', httpStatus: 503 }),
    ]);
    mountMetricsDashboard(container, store);
    const alert = container.querySelector('.metrics-alert--exhausted');
    expect(alert).not.toBeNull();
    expect(alert!.getAttribute('role')).toBe('alert');
  });

  it('alert disappears when store is reset to events with no exhausted webhooks', () => {
    const store = new DeliveryEventStore([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'exhausted', httpStatus: 503 }),
    ]);
    mountMetricsDashboard(container, store);
    expect(hasExhaustedAlert(container)).toBe(true);

    store.reset([
      makeEvent({ webhookId: 'b', eventType: 'payment.created', status: 'delivered' }),
    ]);
    expect(hasExhaustedAlert(container)).toBe(false);
  });

  it('alert appears when simulator produces an exhausted webhook (0% success rate)', () => {
    const events = simulateWebhook('wh_exhaust', 'payment.created', {
      successRate: 0.0,
      maxAttempts: 6,
      random: () => 0.99, // always fails
      startTime: 0,
    });
    // The last event should be exhausted.
    const lastEvent = events[events.length - 1];
    expect(lastEvent.status).toBe('exhausted');

    const store = new DeliveryEventStore(events);
    mountMetricsDashboard(container, store);
    expect(hasExhaustedAlert(container)).toBe(true);
  });

  it('alert count does not double when a second exhausted webhook is added', () => {
    const store = new DeliveryEventStore([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'exhausted', httpStatus: 503 }),
    ]);
    mountMetricsDashboard(container, store);
    expect(container.querySelectorAll('.metrics-alert--exhausted').length).toBe(1);

    store.add(makeEvent({ webhookId: 'b', eventType: 'payment.created', status: 'exhausted', httpStatus: 503 }));
    // Still exactly one alert banner (not duplicated).
    expect(container.querySelectorAll('.metrics-alert--exhausted').length).toBe(1);
  });
});

// ── AC8: No unnecessary re-renders ───────────────────────────────────────────

describe('AC8 – no unnecessary re-renders on unrelated state changes', () => {
  it('a second store mutation does not affect a dashboard mounted on a different store', () => {
    const storeA = new DeliveryEventStore([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }),
    ]);
    const storeB = new DeliveryEventStore([
      makeEvent({ webhookId: 'b', eventType: 'refund.issued', status: 'failed', httpStatus: 503 }),
    ]);

    const containerA = document.createElement('div');
    const containerB = document.createElement('div');

    mountMetricsDashboard(containerA, storeA);
    mountMetricsDashboard(containerB, storeB);

    // Mutate storeB — containerA must not change.
    const rateABefore = successRateCard(containerA);
    storeB.add(makeEvent({ webhookId: 'c', eventType: 'refund.issued', status: 'delivered' }));
    expect(successRateCard(containerA)).toBe(rateABefore);
  });

  it('the store listener is called exactly once per add()', () => {
    const store = new DeliveryEventStore();
    const spy = vi.fn();
    store.subscribe(spy);
    spy.mockClear(); // ignore the immediate call from subscribe()

    store.add(makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('the store listener is called exactly once per addMany()', () => {
    const store = new DeliveryEventStore();
    const spy = vi.fn();
    store.subscribe(spy);
    spy.mockClear();

    store.addMany([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }),
      makeEvent({ webhookId: 'b', eventType: 'payment.created', status: 'failed', httpStatus: 503 }),
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('the store listener is called exactly once per reset()', () => {
    const store = new DeliveryEventStore([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }),
    ]);
    const spy = vi.fn();
    store.subscribe(spy);
    spy.mockClear();

    store.reset([makeEvent({ webhookId: 'b', eventType: 'refund.issued', status: 'delivered' })]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('addMany with an empty array does not trigger the listener', () => {
    const store = new DeliveryEventStore();
    const spy = vi.fn();
    store.subscribe(spy);
    spy.mockClear();

    store.addMany([]);
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it('the disposer stops all further listener calls', () => {
    const store = new DeliveryEventStore();
    const spy = vi.fn();
    const dispose = store.subscribe(spy);
    spy.mockClear();

    dispose();
    store.add(makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }));
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it('mountMetricsDashboard disposer clears the container and stops DOM updates', () => {
    const store = new DeliveryEventStore([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }),
    ]);
    const dispose = mountMetricsDashboard(container, store);
    expect(container.querySelector('.metrics-dashboard')).not.toBeNull();

    dispose();
    expect(container.querySelector('.metrics-dashboard')).toBeNull();
    expect(container.children.length).toBe(0);

    // After disposal, further store mutations must not re-populate the container.
    store.add(makeEvent({ webhookId: 'b', eventType: 'payment.created', status: 'delivered' }));
    expect(container.querySelector('.metrics-dashboard')).toBeNull();
  });
});

// ── AC9: Existing calculation tests unaffected ───────────────────────────────

describe('AC9 – existing calculation tests unaffected by reactive wiring', () => {
  it('calculateMetrics returns correct overall success rate', () => {
    const events = [
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }),
      makeEvent({ webhookId: 'b', eventType: 'payment.created', status: 'failed', httpStatus: 503 }),
      makeEvent({ webhookId: 'c', eventType: 'payment.created', status: 'delivered' }),
    ];
    const report = calculateMetrics(events);
    // 2 delivered / 3 total = 0.6667
    expect(report.overall.successRate).toBeCloseTo(2 / 3, 5);
  });

  it('calculateMetrics returns null successRate for empty input', () => {
    const report = calculateMetrics([]);
    expect(report.overall.successRate).toBeNull();
    expect(report.overall.averageRetryCount).toBeNull();
    expect(report.overall.timeToDelivery.medianMs).toBeNull();
    expect(report.overall.timeToDelivery.p95Ms).toBeNull();
  });

  it('calculateMetrics byEventType is sorted alphabetically', () => {
    const events = [
      makeEvent({ webhookId: 'a', eventType: 'refund.issued', status: 'delivered' }),
      makeEvent({ webhookId: 'b', eventType: 'payment.created', status: 'delivered' }),
      makeEvent({ webhookId: 'c', eventType: 'payout.paid', status: 'delivered' }),
    ];
    const report = calculateMetrics(events);
    const types = report.byEventType.map((s) => s.eventType);
    expect(types).toEqual([...types].sort());
  });

  it('DeliveryEventStore.getEvents() returns a snapshot of current events', () => {
    const store = new DeliveryEventStore([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }),
    ]);
    expect(store.getEvents().length).toBe(1);

    store.add(makeEvent({ webhookId: 'b', eventType: 'payment.created', status: 'delivered' }));
    expect(store.getEvents().length).toBe(2);
  });

  it('DeliveryEventStore.subscribe() fires immediately with current snapshot', () => {
    const initial = [makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' })];
    const store = new DeliveryEventStore(initial);

    let received: readonly DeliveryEvent[] | null = null;
    store.subscribe((events) => { received = events; });

    expect(received).not.toBeNull();
    expect(received!.length).toBe(1);
  });

  it('renderMetricsDashboard is a pure function: same input → same output structure', () => {
    const report = calculateMetrics([
      makeEvent({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }),
    ]);
    const el1 = renderMetricsDashboard(report);
    const el2 = renderMetricsDashboard(report);
    // Both renders produce the same text content.
    expect(el1.textContent).toBe(el2.textContent);
    expect(el1.querySelector('.metrics-dashboard__title')?.textContent).toBe(
      el2.querySelector('.metrics-dashboard__title')?.textContent,
    );
  });
});
