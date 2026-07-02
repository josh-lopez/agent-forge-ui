// Additional unit and integration tests for the webhook delivery metrics
// dashboard (Issue #145).
//
// These tests supplement the existing metrics.test.ts and
// metrics-dashboard.test.ts files to ensure every acceptance criterion is
// explicitly exercised.
//
// AC coverage map:
//   AC1  – dashboard component is rendered and reachable from the main app view
//   AC2  – overall success rate displayed as a percentage
//   AC3  – mean retry count per webhook broken down by event type
//   AC4  – TTD stats (median + p95) per event type
//   AC5  – aggregate + per-event-type in a single scannable view
//   AC6  – reactive recalculation (no manual refresh)
//   AC7  – works with simulator data
//   AC8  – success rate edge cases (zero, 100% failure, single attempt)
//   AC9  – retry count edge cases
//   AC10 – TTD edge cases
//   AC11 – graceful empty state (no NaN, no crash)
//   AC12 – no backend / network dependency

import { describe, expect, it, beforeEach, vi } from 'vitest';

import { DeliveryEvent } from '../src/delivery-events';
import { DeliveryEventStore } from '../src/delivery-event-store';
import { mountMetricsDashboard, renderMetricsDashboard } from '../src/metrics-dashboard';
import { calculateMetrics, formatSuccessRate, formatRetryCount, formatDuration } from '../src/metrics';
import { generateSimulatedEvents, simulateWebhook } from '../src/webhook-simulator';
import { mountApp } from '../src/main';

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

/** Deterministic LCG random for reproducible simulator tests. */
function makeLcgRandom(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// Representative fixture: two event types, mixed success/failure, retries.
const fixture: DeliveryEvent[] = [
  // wh_a payment.created: failed then delivered on 2nd attempt (1 retry, TTD 60 s)
  ev({ webhookId: 'wh_a', eventType: 'payment.created', status: 'failed',    attempt: 1, httpStatus: 503, timestamp: '2026-01-01T00:00:00.000Z' }),
  ev({ webhookId: 'wh_a', eventType: 'payment.created', status: 'delivered', attempt: 2,                  timestamp: '2026-01-01T00:01:00.000Z' }),
  // wh_b payment.created: delivered first try (0 retries, TTD 0)
  ev({ webhookId: 'wh_b', eventType: 'payment.created', status: 'delivered', attempt: 1,                  timestamp: '2026-01-01T00:00:00.000Z' }),
  // wh_c refund.issued: all 3 attempts failed → exhausted (2 retries, no TTD)
  ev({ webhookId: 'wh_c', eventType: 'refund.issued',   status: 'failed',    attempt: 1, httpStatus: 503, timestamp: '2026-01-01T00:00:00.000Z' }),
  ev({ webhookId: 'wh_c', eventType: 'refund.issued',   status: 'failed',    attempt: 2, httpStatus: 503, timestamp: '2026-01-01T00:01:00.000Z' }),
  ev({ webhookId: 'wh_c', eventType: 'refund.issued',   status: 'exhausted', attempt: 3, httpStatus: 503, timestamp: '2026-01-01T00:05:00.000Z' }),
];

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

// ── AC1: Dashboard is rendered and reachable from the main app view ───────────

describe('AC1 – dashboard reachable from main app view', () => {
  it('mountApp returns a store and mounts the dashboard when the mount point exists', () => {
    // Set up the mount point that main.ts looks for.
    const mountPoint = document.createElement('section');
    mountPoint.id = 'metrics-dashboard';
    document.body.appendChild(mountPoint);

    const store = mountApp();

    // mountApp returns a DeliveryEventStore (the reactive data source).
    expect(store).toBeDefined();
    expect(typeof store.getEvents).toBe('function');
    expect(typeof store.subscribe).toBe('function');

    // The dashboard section is populated with the metrics component.
    expect(mountPoint.querySelector('.metrics-dashboard')).not.toBeNull();

    mountPoint.remove();
  });

  it('mountApp does not throw when the mount point is absent (graceful no-op)', () => {
    // No #metrics-dashboard element in the DOM.
    expect(() => mountApp()).not.toThrow();
  });

  it('renderMetricsDashboard returns a section element with aria-label', () => {
    const report = calculateMetrics([]);
    const el = renderMetricsDashboard(report);
    expect(el.tagName.toLowerCase()).toBe('section');
    expect(el.getAttribute('aria-label')).toContain('metrics');
  });
});

// ── AC2: Overall success rate displayed as a percentage ───────────────────────

describe('AC2 – overall success rate displayed as a percentage', () => {
  it('shows the success rate card with a "%" suffix for a non-empty dataset', () => {
    const store = new DeliveryEventStore(fixture);
    mountMetricsDashboard(container, store);

    // The first metrics-card__value is the success rate.
    const firstCardValue = container.querySelector('.metrics-card__value')?.textContent ?? '';
    expect(firstCardValue).toMatch(/\d+\.\d+%/);
  });

  it('success rate card shows 33.3% for 2 delivered out of 6 attempts', () => {
    const store = new DeliveryEventStore(fixture);
    mountMetricsDashboard(container, store);

    // 2 delivered / 6 total = 33.3%
    const firstCardValue = container.querySelector('.metrics-card__value')?.textContent ?? '';
    expect(firstCardValue).toBe('33.3%');
  });

  it('success rate card shows 100.0% when all attempts delivered', () => {
    const allDelivered: DeliveryEvent[] = [
      ev({ webhookId: 'a', eventType: 'payment.created' }),
      ev({ webhookId: 'b', eventType: 'payment.created' }),
    ];
    const store = new DeliveryEventStore(allDelivered);
    mountMetricsDashboard(container, store);

    const firstCardValue = container.querySelector('.metrics-card__value')?.textContent ?? '';
    expect(firstCardValue).toBe('100.0%');
  });

  it('success rate card shows 0.0% when all attempts failed', () => {
    const allFailed: DeliveryEvent[] = [
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'failed',    httpStatus: 503 }),
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'exhausted', httpStatus: 503, attempt: 2 }),
    ];
    const store = new DeliveryEventStore(allFailed);
    mountMetricsDashboard(container, store);

    const firstCardValue = container.querySelector('.metrics-card__value')?.textContent ?? '';
    expect(firstCardValue).toBe('0.0%');
  });

  it('aggregate table row also shows success rate as a percentage', () => {
    const store = new DeliveryEventStore(fixture);
    mountMetricsDashboard(container, store);

    const aggregateRow = container.querySelector('.metrics-row--aggregate');
    expect(aggregateRow).not.toBeNull();
    // The second cell (index 1) is the success rate column.
    const cells = aggregateRow!.querySelectorAll('.metrics-cell');
    const successRateCell = cells[1]?.textContent ?? '';
    expect(successRateCell).toMatch(/\d+\.\d+%/);
  });

  it('formatSuccessRate helper produces correct percentage strings', () => {
    expect(formatSuccessRate(null)).toBe('—');
    expect(formatSuccessRate(0)).toBe('0.0%');
    expect(formatSuccessRate(1)).toBe('100.0%');
    expect(formatSuccessRate(0.333)).toBe('33.3%');
    expect(formatSuccessRate(0.5)).toBe('50.0%');
  });
});

// ── AC3: Mean retry count broken down by event type ───────────────────────────

describe('AC3 – mean retry count per webhook broken down by event type', () => {
  it('shows the avg-retries card in the aggregate summary', () => {
    const store = new DeliveryEventStore(fixture);
    mountMetricsDashboard(container, store);

    const cardLabels = [...container.querySelectorAll('.metrics-card__label')].map((l) => l.textContent ?? '');
    expect(cardLabels.some((l) => l.toLowerCase().includes('retr'))).toBe(true);
  });

  it('avg-retries card shows 1.00 for the fixture (mean of 1, 0, 2 retries)', () => {
    const store = new DeliveryEventStore(fixture);
    mountMetricsDashboard(container, store);

    // Second card is avg retries.
    const cardValues = [...container.querySelectorAll('.metrics-card__value')].map((v) => v.textContent ?? '');
    expect(cardValues[1]).toBe('1.00');
  });

  it('per-event-type table rows include a retry count column for each type', () => {
    const store = new DeliveryEventStore(fixture);
    mountMetricsDashboard(container, store);

    const typeCells = [...container.querySelectorAll('.metrics-cell--type')];
    const paymentRow = typeCells.find((c) => c.textContent === 'payment.created')?.closest('tr');
    const refundRow  = typeCells.find((c) => c.textContent === 'refund.issued')?.closest('tr');

    expect(paymentRow).not.toBeNull();
    expect(refundRow).not.toBeNull();

    // payment.created: (1 retry for wh_a + 0 for wh_b) / 2 = 0.50
    const paymentCells = paymentRow!.querySelectorAll('.metrics-cell');
    expect(paymentCells[2]?.textContent).toBe('0.50');

    // refund.issued: 2 retries / 1 webhook = 2.00
    const refundCells = refundRow!.querySelectorAll('.metrics-cell');
    expect(refundCells[2]?.textContent).toBe('2.00');
  });

  it('table header includes an "Avg. retries" column heading', () => {
    const store = new DeliveryEventStore(fixture);
    mountMetricsDashboard(container, store);

    const headings = [...container.querySelectorAll('.metrics-th')].map((h) => h.textContent ?? '');
    expect(headings.some((h) => h.toLowerCase().includes('retr'))).toBe(true);
  });

  it('formatRetryCount helper produces correct strings', () => {
    expect(formatRetryCount(null)).toBe('—');
    expect(formatRetryCount(0)).toBe('0.00');
    expect(formatRetryCount(1.5)).toBe('1.50');
    expect(formatRetryCount(2)).toBe('2.00');
  });
});

// ── AC4: TTD stats (median + p95) per event type ──────────────────────────────

describe('AC4 – time-to-delivery stats (median + p95) per event type', () => {
  it('shows median and p95 TTD cards in the aggregate summary', () => {
    const store = new DeliveryEventStore(fixture);
    mountMetricsDashboard(container, store);

    const cardLabels = [...container.querySelectorAll('.metrics-card__label')].map((l) => l.textContent ?? '');
    expect(cardLabels.some((l) => l.toLowerCase().includes('median'))).toBe(true);
    expect(cardLabels.some((l) => l.toLowerCase().includes('p95') || l.toLowerCase().includes('95'))).toBe(true);
  });

  it('per-event-type table rows include median and p95 TTD columns', () => {
    const store = new DeliveryEventStore(fixture);
    mountMetricsDashboard(container, store);

    const typeCells = [...container.querySelectorAll('.metrics-cell--type')];
    const paymentRow = typeCells.find((c) => c.textContent === 'payment.created')?.closest('tr');
    expect(paymentRow).not.toBeNull();

    // payment.created TTD: wh_a=60s, wh_b=0s → median=30s, p95=60s
    const cells = paymentRow!.querySelectorAll('.metrics-cell');
    // col 0: type, col 1: success rate, col 2: avg retries, col 3: median TTD, col 4: p95 TTD
    expect(cells[3]?.textContent).toBe('30.0 s');
    expect(cells[4]?.textContent).toBe('1.0 min');
  });

  it('refund.issued row shows "—" for TTD when no webhook delivered', () => {
    const store = new DeliveryEventStore(fixture);
    mountMetricsDashboard(container, store);

    const typeCells = [...container.querySelectorAll('.metrics-cell--type')];
    const refundRow = typeCells.find((c) => c.textContent === 'refund.issued')?.closest('tr');
    expect(refundRow).not.toBeNull();

    const cells = refundRow!.querySelectorAll('.metrics-cell');
    expect(cells[3]?.textContent).toBe('—');
    expect(cells[4]?.textContent).toBe('—');
  });

  it('table header includes Median TTD and p95 TTD column headings', () => {
    const store = new DeliveryEventStore(fixture);
    mountMetricsDashboard(container, store);

    const headings = [...container.querySelectorAll('.metrics-th')].map((h) => h.textContent ?? '');
    expect(headings.some((h) => h.toLowerCase().includes('median'))).toBe(true);
    expect(headings.some((h) => h.toLowerCase().includes('p95'))).toBe(true);
  });

  it('formatDuration helper produces human-readable strings', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(0)).toBe('0 ms');
    expect(formatDuration(500)).toBe('500 ms');
    expect(formatDuration(1500)).toBe('1.5 s');
    expect(formatDuration(90_000)).toBe('1.5 min');
    expect(formatDuration(3_600_000)).toBe('1.0 h');
  });
});

// ── AC5: Aggregate + per-event-type in a single scannable view ────────────────

describe('AC5 – aggregate and per-event-type in a single view', () => {
  it('renders both aggregate summary cards and a per-event-type breakdown table', () => {
    const store = new DeliveryEventStore(fixture);
    mountMetricsDashboard(container, store);

    // Aggregate cards section.
    expect(container.querySelectorAll('.metrics-card').length).toBe(4);

    // Table with aggregate row + per-type rows.
    const table = container.querySelector('.metrics-table');
    expect(table).not.toBeNull();

    const aggregateRow = container.querySelector('.metrics-row--aggregate');
    expect(aggregateRow).not.toBeNull();

    const typeRows = [...container.querySelectorAll('.metrics-cell--type')]
      .map((c) => c.textContent ?? '');
    expect(typeRows).toContain('All event types');
    expect(typeRows).toContain('payment.created');
    expect(typeRows).toContain('refund.issued');
  });

  it('all four metric dimensions appear in both the cards and the table', () => {
    const store = new DeliveryEventStore(fixture);
    mountMetricsDashboard(container, store);

    // Cards: success rate, avg retries, median TTD, p95 TTD.
    const cardLabels = [...container.querySelectorAll('.metrics-card__label')].map((l) => l.textContent ?? '');
    expect(cardLabels.length).toBe(4);

    // Table columns: event type, success rate, avg retries, median TTD, p95 TTD, attempts.
    const headings = [...container.querySelectorAll('.metrics-th')].map((h) => h.textContent ?? '');
    expect(headings.length).toBe(6);
  });

  it('event types are sorted alphabetically in the table', () => {
    const events: DeliveryEvent[] = [
      ev({ webhookId: 'z', eventType: 'refund.issued' }),
      ev({ webhookId: 'a', eventType: 'payment.created' }),
      ev({ webhookId: 'b', eventType: 'payout.paid' }),
    ];
    const store = new DeliveryEventStore(events);
    mountMetricsDashboard(container, store);

    const typeCells = [...container.querySelectorAll('.metrics-cell--type')]
      .map((c) => c.textContent ?? '')
      .filter((t) => t !== 'All event types');

    expect(typeCells).toEqual(['payment.created', 'payout.paid', 'refund.issued']);
  });
});

// ── AC6: Reactive recalculation ───────────────────────────────────────────────

describe('AC6 – reactive recalculation without manual refresh', () => {
  it('recalculates success rate when a new delivered event is added', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'failed', httpStatus: 503 }),
    ]);
    mountMetricsDashboard(container, store);

    // Before: 0 delivered / 1 total = 0.0%
    expect(container.querySelector('.metrics-card__value')?.textContent).toBe('0.0%');

    // Add a delivered attempt — no manual refresh.
    store.add(ev({ webhookId: 'b', eventType: 'payment.created', status: 'delivered', attempt: 1 }));

    // After: 1 delivered / 2 total = 50.0%
    expect(container.querySelector('.metrics-card__value')?.textContent).toBe('50.0%');
  });

  it('recalculates when a new event type appears', () => {
    const store = new DeliveryEventStore([
      ev({ webhookId: 'a', eventType: 'payment.created' }),
    ]);
    mountMetricsDashboard(container, store);

    let typeCells = [...container.querySelectorAll('.metrics-cell--type')].map((c) => c.textContent ?? '');
    expect(typeCells).not.toContain('refund.issued');

    store.add(ev({ webhookId: 'b', eventType: 'refund.issued' }));

    typeCells = [...container.querySelectorAll('.metrics-cell--type')].map((c) => c.textContent ?? '');
    expect(typeCells).toContain('refund.issued');
  });

  it('recalculates when store.reset() is called with new data', () => {
    const store = new DeliveryEventStore(fixture);
    mountMetricsDashboard(container, store);

    // Reset to empty.
    store.reset([]);
    expect(container.querySelector('.metrics-cell--empty')).not.toBeNull();

    // Reset to a single delivered event.
    store.reset([ev({ webhookId: 'x', eventType: 'payout.paid' })]);
    expect(container.querySelector('.metrics-cell--empty')).toBeNull();
    const typeCells = [...container.querySelectorAll('.metrics-cell--type')].map((c) => c.textContent ?? '');
    expect(typeCells).toContain('payout.paid');
  });

  it('recalculates when addMany() is called', () => {
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);

    expect(container.querySelector('.metrics-cell--empty')).not.toBeNull();

    store.addMany([
      ev({ webhookId: 'a', eventType: 'payment.created' }),
      ev({ webhookId: 'b', eventType: 'refund.issued' }),
    ]);

    expect(container.querySelector('.metrics-cell--empty')).toBeNull();
    const typeCells = [...container.querySelectorAll('.metrics-cell--type')].map((c) => c.textContent ?? '');
    expect(typeCells).toContain('payment.created');
    expect(typeCells).toContain('refund.issued');
  });
});

// ── AC7: Works with simulator data ───────────────────────────────────────────

describe('AC7 – simulator compatibility', () => {
  it('simulateWebhook produces events in the correct DeliveryEvent shape', () => {
    const events = simulateWebhook('wh_test', 'payment.created', {
      successRate: 1,
      random: makeLcgRandom(),
      startTime: 0,
    });
    expect(events.length).toBeGreaterThan(0);
    const first = events[0];
    expect(first.webhookId).toBe('wh_test');
    expect(first.eventType).toBe('payment.created');
    expect(typeof first.attempt).toBe('number');
    expect(typeof first.timestamp).toBe('string');
    expect(typeof first.httpStatus).toBe('number');
    expect(typeof first.responseBodyExcerpt).toBe('string');
  });

  it('dashboard renders all metric states with simulator data (no NaN, no crash)', () => {
    const events = generateSimulatedEvents({
      count: 10,
      successRate: 0.5,
      random: makeLcgRandom(42),
      startTime: 0,
      eventTypes: ['payment.created', 'refund.issued', 'payout.paid'],
    });
    expect(events.length).toBeGreaterThan(0);

    const store = new DeliveryEventStore(events);
    mountMetricsDashboard(container, store);

    expect(container.querySelector('.metrics-dashboard')).not.toBeNull();
    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).not.toContain('undefined');
  });

  it('dashboard renders with 100% success simulator data', () => {
    const events = generateSimulatedEvents({
      count: 6,
      successRate: 1.0,
      random: makeLcgRandom(7),
      startTime: 0,
    });
    const store = new DeliveryEventStore(events);
    mountMetricsDashboard(container, store);

    // All delivered → success rate should be 100.0%
    const firstCardValue = container.querySelector('.metrics-card__value')?.textContent ?? '';
    expect(firstCardValue).toBe('100.0%');
    expect(container.textContent).not.toContain('NaN');
  });

  it('dashboard renders with 0% success simulator data (all exhausted)', () => {
    const events = generateSimulatedEvents({
      count: 4,
      successRate: 0.0,
      random: makeLcgRandom(3),
      startTime: 0,
    });
    const store = new DeliveryEventStore(events);
    mountMetricsDashboard(container, store);

    const firstCardValue = container.querySelector('.metrics-card__value')?.textContent ?? '';
    expect(firstCardValue).toBe('0.0%');
    expect(container.textContent).not.toContain('NaN');
  });

  it('simulator emits the same event shape as the real delivery mechanism', () => {
    // The spec requires "the simulator emits the same delivery-event shape used
    // by the real delivery mechanism so UI components need no special-case code."
    const events = simulateWebhook('wh_1', 'payment.created', {
      successRate: 0.5,
      maxAttempts: 3,
      random: makeLcgRandom(99),
      startTime: Date.parse('2026-01-01T00:00:00.000Z'),
    });
    for (const e of events) {
      // All required DeliveryEvent fields must be present and typed correctly.
      expect(typeof e.webhookId).toBe('string');
      expect(typeof e.eventType).toBe('string');
      expect(['pending', 'delivered', 'failed', 'exhausted']).toContain(e.status);
      expect(typeof e.attempt).toBe('number');
      expect(e.attempt).toBeGreaterThanOrEqual(1);
      expect(typeof e.timestamp).toBe('string');
      expect(Date.parse(e.timestamp)).not.toBeNaN();
      expect(typeof e.httpStatus).toBe('number');
      expect(typeof e.responseBodyExcerpt).toBe('string');
    }
  });
});

// ── AC8: Success rate edge cases ──────────────────────────────────────────────

describe('AC8 – success rate edge cases', () => {
  it('zero deliveries → successRate null (no NaN, no crash)', () => {
    const { overall } = calculateMetrics([]);
    expect(overall.successRate).toBeNull();
    expect(Number.isNaN(overall.successRate as unknown as number)).toBe(false);
    expect(overall.totalAttempts).toBe(0);
    expect(overall.deliveredAttempts).toBe(0);
  });

  it('100% failure → successRate 0 (not null)', () => {
    const events: DeliveryEvent[] = [
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'failed',    httpStatus: 503, attempt: 1 }),
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'exhausted', httpStatus: 503, attempt: 2 }),
    ];
    const { overall } = calculateMetrics(events);
    expect(overall.successRate).toBe(0);
    expect(overall.deliveredAttempts).toBe(0);
    expect(overall.totalAttempts).toBe(2);
  });

  it('single delivered attempt → successRate 1 (100%)', () => {
    const events: DeliveryEvent[] = [ev({ webhookId: 'a', eventType: 'payment.created' })];
    const { overall } = calculateMetrics(events);
    expect(overall.successRate).toBe(1);
    expect(overall.deliveredAttempts).toBe(1);
    expect(overall.totalAttempts).toBe(1);
  });

  it('per-event-type success rate is independent of other types', () => {
    const events: DeliveryEvent[] = [
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'delivered' }),
      ev({ webhookId: 'b', eventType: 'refund.issued',   status: 'failed',    httpStatus: 503 }),
      ev({ webhookId: 'b', eventType: 'refund.issued',   status: 'exhausted', httpStatus: 503, attempt: 2 }),
    ];
    const { byEventType } = calculateMetrics(events);
    const payment = byEventType.find((m) => m.eventType === 'payment.created')!;
    const refund  = byEventType.find((m) => m.eventType === 'refund.issued')!;
    expect(payment.successRate).toBe(1);
    expect(refund.successRate).toBe(0);
  });
});

// ── AC9: Average retry count edge cases ───────────────────────────────────────

describe('AC9 – average retry count edge cases', () => {
  it('zero deliveries → averageRetryCount null (no NaN)', () => {
    const { overall } = calculateMetrics([]);
    expect(overall.averageRetryCount).toBeNull();
    expect(Number.isNaN(overall.averageRetryCount as unknown as number)).toBe(false);
  });

  it('single attempt → 0 retries', () => {
    const events: DeliveryEvent[] = [ev({ webhookId: 'a', eventType: 'payment.created', attempt: 1 })];
    expect(calculateMetrics(events).overall.averageRetryCount).toBe(0);
  });

  it('100% failure still counts retries correctly', () => {
    const events: DeliveryEvent[] = [
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'failed',    attempt: 1, httpStatus: 503 }),
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'exhausted', attempt: 2, httpStatus: 503 }),
    ];
    // 1 webhook, 2 attempts → 1 retry
    expect(calculateMetrics(events).overall.averageRetryCount).toBe(1);
  });

  it('multiple webhooks with different retry counts are averaged correctly', () => {
    const events: DeliveryEvent[] = [
      // wh_a: 3 attempts → 2 retries
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'failed',    attempt: 1, httpStatus: 503 }),
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'failed',    attempt: 2, httpStatus: 503 }),
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'delivered', attempt: 3 }),
      // wh_b: 1 attempt → 0 retries
      ev({ webhookId: 'b', eventType: 'payment.created', status: 'delivered', attempt: 1 }),
    ];
    // (2 + 0) / 2 = 1.0
    expect(calculateMetrics(events).overall.averageRetryCount).toBeCloseTo(1.0, 10);
  });

  it('per-event-type retry counts are independent', () => {
    const { byEventType } = calculateMetrics(fixture);
    const payment = byEventType.find((m) => m.eventType === 'payment.created')!;
    const refund  = byEventType.find((m) => m.eventType === 'refund.issued')!;
    // payment: (1 + 0) / 2 = 0.5
    expect(payment.averageRetryCount).toBeCloseTo(0.5, 10);
    // refund: 2 / 1 = 2.0
    expect(refund.averageRetryCount).toBeCloseTo(2.0, 10);
  });
});

// ── AC10: TTD edge cases ──────────────────────────────────────────────────────

describe('AC10 – time-to-delivery edge cases', () => {
  it('zero deliveries → medianMs null, p95Ms null, sampleCount 0 (no crash)', () => {
    const ttd = calculateMetrics([]).overall.timeToDelivery;
    expect(ttd.medianMs).toBeNull();
    expect(ttd.p95Ms).toBeNull();
    expect(ttd.sampleCount).toBe(0);
    expect(Number.isNaN(ttd.medianMs as unknown as number)).toBe(false);
    expect(Number.isNaN(ttd.p95Ms as unknown as number)).toBe(false);
  });

  it('100% failure → no TTD sample (medianMs null, p95Ms null)', () => {
    const events: DeliveryEvent[] = [
      ev({ webhookId: 'a', eventType: 'refund.issued', status: 'exhausted', attempt: 1, httpStatus: 503 }),
    ];
    const ttd = calculateMetrics(events).overall.timeToDelivery;
    expect(ttd.sampleCount).toBe(0);
    expect(ttd.medianMs).toBeNull();
    expect(ttd.p95Ms).toBeNull();
  });

  it('single delivered attempt → TTD 0 ms (initial attempt = delivery)', () => {
    const events: DeliveryEvent[] = [ev({ webhookId: 'a', eventType: 'payment.created', attempt: 1 })];
    const ttd = calculateMetrics(events).overall.timeToDelivery;
    expect(ttd.sampleCount).toBe(1);
    expect(ttd.medianMs).toBe(0);
    expect(ttd.p95Ms).toBe(0);
  });

  it('TTD is measured from initial attempt to first successful delivery', () => {
    // wh_a: failed at T=0, delivered at T=60s → TTD = 60_000 ms
    const events: DeliveryEvent[] = [
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'failed',    attempt: 1, timestamp: '2026-01-01T00:00:00.000Z', httpStatus: 503 }),
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'delivered', attempt: 2, timestamp: '2026-01-01T00:01:00.000Z' }),
    ];
    const ttd = calculateMetrics(events).overall.timeToDelivery;
    expect(ttd.sampleCount).toBe(1);
    expect(ttd.medianMs).toBe(60_000);
    expect(ttd.p95Ms).toBe(60_000);
  });

  it('TTD is never negative (clamped to 0 for out-of-order timestamps)', () => {
    // Delivery timestamp before initial attempt (edge case / clock skew).
    const events: DeliveryEvent[] = [
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'failed',    attempt: 1, timestamp: '2026-01-01T00:01:00.000Z', httpStatus: 503 }),
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'delivered', attempt: 2, timestamp: '2026-01-01T00:00:00.000Z' }),
    ];
    const ttd = calculateMetrics(events).overall.timeToDelivery;
    expect(ttd.sampleCount).toBe(1);
    expect(ttd.medianMs).toBeGreaterThanOrEqual(0);
    expect(ttd.p95Ms).toBeGreaterThanOrEqual(0);
  });

  it('per-event-type TTD is computed independently', () => {
    const { byEventType } = calculateMetrics(fixture);
    const payment = byEventType.find((m) => m.eventType === 'payment.created')!;
    const refund  = byEventType.find((m) => m.eventType === 'refund.issued')!;

    // payment: wh_a=60s, wh_b=0s → median=30s, p95=60s
    expect(payment.timeToDelivery.sampleCount).toBe(2);
    expect(payment.timeToDelivery.medianMs).toBe(30_000);
    expect(payment.timeToDelivery.p95Ms).toBe(60_000);

    // refund: no delivered webhooks
    expect(refund.timeToDelivery.sampleCount).toBe(0);
    expect(refund.timeToDelivery.medianMs).toBeNull();
    expect(refund.timeToDelivery.p95Ms).toBeNull();
  });
});

// ── AC11: Graceful empty state ────────────────────────────────────────────────

describe('AC11 – graceful empty state (no NaN, no crash)', () => {
  it('dashboard renders a clear empty indicator with zero events', () => {
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);

    expect(container.textContent).toContain('No delivery events yet.');
    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).not.toContain('undefined');
  });

  it('aggregate cards show em-dash placeholders (not NaN) with zero events', () => {
    const store = new DeliveryEventStore();
    mountMetricsDashboard(container, store);

    const values = [...container.querySelectorAll('.metrics-card__value')].map((v) => v.textContent ?? '');
    // All four cards should show '—' when there is no data.
    expect(values.every((v) => v === '—')).toBe(true);
  });

  it('per-event-type with all failures shows "—" for TTD (not NaN)', () => {
    const allFailed: DeliveryEvent[] = [
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'failed',    httpStatus: 503, attempt: 1 }),
      ev({ webhookId: 'a', eventType: 'payment.created', status: 'exhausted', httpStatus: 503, attempt: 2 }),
    ];
    const store = new DeliveryEventStore(allFailed);
    mountMetricsDashboard(container, store);

    const typeCells = [...container.querySelectorAll('.metrics-cell--type')];
    const paymentRow = typeCells.find((c) => c.textContent === 'payment.created')?.closest('tr');
    expect(paymentRow).not.toBeNull();

    const cells = paymentRow!.querySelectorAll('.metrics-cell');
    // Median TTD and p95 TTD should be '—', not 'NaN'.
    expect(cells[3]?.textContent).toBe('—');
    expect(cells[4]?.textContent).toBe('—');
    expect(container.textContent).not.toContain('NaN');
  });

  it('renderMetricsDashboard does not throw for an empty report', () => {
    const report = calculateMetrics([]);
    expect(() => renderMetricsDashboard(report)).not.toThrow();
    const el = renderMetricsDashboard(report);
    expect(el.textContent).not.toContain('NaN');
  });
});

// ── AC12: No backend / network dependency ─────────────────────────────────────

describe('AC12 – no backend or external network calls', () => {
  it('mountMetricsDashboard does not call fetch', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    const store = new DeliveryEventStore(fixture);
    mountMetricsDashboard(container, store);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('generateSimulatedEvents does not call fetch', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    generateSimulatedEvents({ count: 5, random: makeLcgRandom(), startTime: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('calculateMetrics is a pure function with no side effects', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    const xhrSpy = vi.spyOn(globalThis, 'XMLHttpRequest' in globalThis
      ? 'XMLHttpRequest' as keyof typeof globalThis
      : 'fetch' as keyof typeof globalThis);

    calculateMetrics(fixture);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    xhrSpy.mockRestore();
  });

  it('DeliveryEventStore is entirely in-memory with no network calls', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    const store = new DeliveryEventStore();
    store.add(ev({ webhookId: 'a', eventType: 'payment.created' }));
    store.addMany([ev({ webhookId: 'b', eventType: 'refund.issued' })]);
    store.reset([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
