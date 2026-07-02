// Unit tests for the webhook delivery metrics calculation module (Issue #145).
//
// Covers AC8 (success rate), AC9 (average retry count), AC10 (time-to-delivery
// median + 95th-percentile) over a representative fixture dataset and the
// required edge cases: zero deliveries, 100% failure, single attempt.

import { describe, expect, it } from 'vitest';

import { DeliveryEvent } from '../src/delivery-events';
import {
  calculateMetrics,
  median,
  percentile,
} from '../src/metrics';

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

// A representative fixture: two event types, mixed success/failure, retries.
const fixture: DeliveryEvent[] = [
  // wh_a payment.created: failed then delivered on 2nd attempt (1 retry, TTD 60s)
  ev({ webhookId: 'wh_a', eventType: 'payment.created', status: 'failed', attempt: 1, httpStatus: 503, timestamp: '2026-01-01T00:00:00.000Z' }),
  ev({ webhookId: 'wh_a', eventType: 'payment.created', status: 'delivered', attempt: 2, timestamp: '2026-01-01T00:01:00.000Z' }),
  // wh_b payment.created: delivered first try (0 retries, TTD 0)
  ev({ webhookId: 'wh_b', eventType: 'payment.created', status: 'delivered', attempt: 1, timestamp: '2026-01-01T00:00:00.000Z' }),
  // wh_c refund.issued: all 3 attempts failed → exhausted (2 retries, no TTD)
  ev({ webhookId: 'wh_c', eventType: 'refund.issued', status: 'failed', attempt: 1, httpStatus: 503, timestamp: '2026-01-01T00:00:00.000Z' }),
  ev({ webhookId: 'wh_c', eventType: 'refund.issued', status: 'failed', attempt: 2, httpStatus: 503, timestamp: '2026-01-01T00:01:00.000Z' }),
  ev({ webhookId: 'wh_c', eventType: 'refund.issued', status: 'exhausted', attempt: 3, httpStatus: 503, timestamp: '2026-01-01T00:05:00.000Z' }),
];

describe('percentile (nearest-rank)', () => {
  it('returns null for empty input', () => {
    expect(percentile([], 95)).toBeNull();
  });

  it('returns the single value for any percentile (single attempt)', () => {
    expect(percentile([42], 95)).toBe(42);
    expect(percentile([42], 50)).toBe(42);
  });

  it('computes p95 by nearest rank for a known set', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    // rank = ceil(0.95 * 10) = 10 → index 9 → value 10
    expect(percentile(sorted, 95)).toBe(10);
    // rank = ceil(0.5 * 10) = 5 → index 4 → value 5
    expect(percentile(sorted, 50)).toBe(5);
  });
});

describe('median', () => {
  it('returns null for empty input', () => {
    expect(median([])).toBeNull();
  });

  it('averages the two middles for an even count', () => {
    expect(median([1, 3])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('returns the middle for an odd count', () => {
    expect(median([5, 1, 3])).toBe(3);
  });
});

describe('calculateMetrics – success rate (AC8)', () => {
  it('computes overall success rate for the fixture', () => {
    const { overall } = calculateMetrics(fixture);
    // delivered attempts: wh_a #2, wh_b #1 = 2 of 6 total attempts
    expect(overall.totalAttempts).toBe(6);
    expect(overall.deliveredAttempts).toBe(2);
    expect(overall.successRate).toBeCloseTo(2 / 6, 10);
  });

  it('segments success rate by event type', () => {
    const { byEventType } = calculateMetrics(fixture);
    const payment = byEventType.find((m) => m.eventType === 'payment.created')!;
    const refund = byEventType.find((m) => m.eventType === 'refund.issued')!;
    expect(payment.successRate).toBeCloseTo(2 / 3, 10); // 2 delivered of 3 attempts
    expect(refund.successRate).toBe(0); // 0 of 3
  });

  it('edge: zero deliveries → successRate null (no NaN)', () => {
    const { overall } = calculateMetrics([]);
    expect(overall.successRate).toBeNull();
    expect(overall.totalAttempts).toBe(0);
    expect(Number.isNaN(overall.successRate as number)).toBe(false);
  });

  it('edge: 100% failure → successRate 0', () => {
    const allFail: DeliveryEvent[] = [
      ev({ webhookId: 'w', eventType: 'payment.created', status: 'failed', attempt: 1, httpStatus: 503 }),
      ev({ webhookId: 'w', eventType: 'payment.created', status: 'exhausted', attempt: 2, httpStatus: 503 }),
    ];
    expect(calculateMetrics(allFail).overall.successRate).toBe(0);
  });

  it('edge: single delivered attempt → 100%', () => {
    const one: DeliveryEvent[] = [ev({ webhookId: 'w', eventType: 'payment.created' })];
    expect(calculateMetrics(one).overall.successRate).toBe(1);
  });
});

describe('calculateMetrics – average retry count (AC9)', () => {
  it('computes mean retries per webhook for the fixture', () => {
    const { overall } = calculateMetrics(fixture);
    // wh_a: 1 retry, wh_b: 0 retries, wh_c: 2 retries → (1+0+2)/3 = 1
    expect(overall.averageRetryCount).toBeCloseTo(1, 10);
  });

  it('breaks average retries down by event type', () => {
    const { byEventType } = calculateMetrics(fixture);
    const payment = byEventType.find((m) => m.eventType === 'payment.created')!;
    const refund = byEventType.find((m) => m.eventType === 'refund.issued')!;
    expect(payment.averageRetryCount).toBeCloseTo(0.5, 10); // (1 + 0) / 2
    expect(refund.averageRetryCount).toBeCloseTo(2, 10); // 2 / 1
  });

  it('edge: zero deliveries → averageRetryCount null (no NaN)', () => {
    expect(calculateMetrics([]).overall.averageRetryCount).toBeNull();
  });

  it('edge: single attempt → 0 retries', () => {
    const one: DeliveryEvent[] = [ev({ webhookId: 'w', eventType: 'payment.created' })];
    expect(calculateMetrics(one).overall.averageRetryCount).toBe(0);
  });

  it('edge: 100% failure still counts retries', () => {
    const allFail: DeliveryEvent[] = [
      ev({ webhookId: 'w', eventType: 'payment.created', status: 'failed', attempt: 1, httpStatus: 503 }),
      ev({ webhookId: 'w', eventType: 'payment.created', status: 'exhausted', attempt: 2, httpStatus: 503 }),
    ];
    expect(calculateMetrics(allFail).overall.averageRetryCount).toBe(1);
  });
});

describe('calculateMetrics – time-to-delivery (AC10)', () => {
  it('computes median and p95 TTD for the fixture (per event type)', () => {
    const { byEventType, overall } = calculateMetrics(fixture);
    const payment = byEventType.find((m) => m.eventType === 'payment.created')!;
    // payment TTD samples: wh_a 60_000 ms, wh_b 0 ms → median 30_000, p95 60_000
    expect(payment.timeToDelivery.sampleCount).toBe(2);
    expect(payment.timeToDelivery.medianMs).toBe(30_000);
    expect(payment.timeToDelivery.p95Ms).toBe(60_000);
    // overall has the same two delivered webhooks
    expect(overall.timeToDelivery.sampleCount).toBe(2);
  });

  it('edge: zero deliveries → null TTD stats (no crash/NaN)', () => {
    const ttd = calculateMetrics([]).overall.timeToDelivery;
    expect(ttd.medianMs).toBeNull();
    expect(ttd.p95Ms).toBeNull();
    expect(ttd.sampleCount).toBe(0);
  });

  it('edge: 100% failure → no TTD sample', () => {
    const allFail: DeliveryEvent[] = [
      ev({ webhookId: 'w', eventType: 'refund.issued', status: 'exhausted', attempt: 1, httpStatus: 503 }),
    ];
    const ttd = calculateMetrics(allFail).overall.timeToDelivery;
    expect(ttd.sampleCount).toBe(0);
    expect(ttd.medianMs).toBeNull();
    expect(ttd.p95Ms).toBeNull();
  });

  it('edge: single delivered attempt → TTD 0 ms', () => {
    const one: DeliveryEvent[] = [ev({ webhookId: 'w', eventType: 'payment.created' })];
    const ttd = calculateMetrics(one).overall.timeToDelivery;
    expect(ttd.sampleCount).toBe(1);
    expect(ttd.medianMs).toBe(0);
    expect(ttd.p95Ms).toBe(0);
  });
});

describe('calculateMetrics – purity & empty event-type handling (AC11)', () => {
  it('does not mutate the input array', () => {
    const input = [...fixture];
    const before = JSON.stringify(input);
    calculateMetrics(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('produces no event-type rows for empty input', () => {
    expect(calculateMetrics([]).byEventType).toEqual([]);
  });
});
