// Supplementary unit tests for delivery-events utilities and additional
// metrics edge cases (Issue #243 follow-up).
//
// Covers:
//   • toEpochMillis — the timestamp normalisation helper used internally by
//     the metrics calculations; not tested elsewhere in the suite.
//   • calculateMetrics with a mixed multi-event-type dataset where one event
//     type has zero delivered attempts and another has 100% success — verifies
//     that per-type edge cases are correctly isolated from each other.
//
// All tests use static fixture data and are fully isolated from the simulator.

import { describe, expect, it } from 'vitest';

import { toEpochMillis, DeliveryEvent } from '../src/delivery-events';
import { calculateMetrics } from '../src/metrics';

// ── toEpochMillis ─────────────────────────────────────────────────────────────

describe('toEpochMillis – valid ISO-8601 string', () => {
  it('parses a UTC ISO string to epoch milliseconds', () => {
    const ms = toEpochMillis('2026-01-01T00:00:00.000Z');
    expect(ms).toBe(Date.parse('2026-01-01T00:00:00.000Z'));
    expect(Number.isNaN(ms)).toBe(false);
  });

  it('parses a non-zero timestamp correctly', () => {
    const ms = toEpochMillis('2026-01-01T00:01:00.000Z');
    const expected = Date.parse('2026-01-01T00:01:00.000Z');
    expect(ms).toBe(expected);
    expect(ms).toBeGreaterThan(Date.parse('2026-01-01T00:00:00.000Z'));
  });
});

describe('toEpochMillis – numeric input (already epoch ms)', () => {
  it('returns the number unchanged when given a numeric epoch value', () => {
    expect(toEpochMillis(0)).toBe(0);
    expect(toEpochMillis(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it('returns negative numbers unchanged (pre-epoch timestamps)', () => {
    expect(toEpochMillis(-1000)).toBe(-1000);
  });
});

describe('toEpochMillis – invalid / unparseable input', () => {
  it('returns NaN for a completely invalid string', () => {
    expect(Number.isNaN(toEpochMillis('not-a-date'))).toBe(true);
  });

  it('returns NaN for an empty string', () => {
    expect(Number.isNaN(toEpochMillis(''))).toBe(true);
  });

  it('returns NaN for a partial date string that cannot be parsed', () => {
    // "2026-99-99" is an invalid date in all environments
    expect(Number.isNaN(toEpochMillis('2026-99-99'))).toBe(true);
  });
});

// ── Mixed multi-event-type edge cases ─────────────────────────────────────────
//
// Fixture: two event types in the same dataset.
//   • payment.created: 1 webhook, delivered on first attempt (100% success)
//   • refund.issued:   1 webhook, failed on first attempt, exhausted on second (0% success)
//
// This exercises the per-event-type isolation: one type's edge case (0% / 100%)
// must not bleed into the other type's metrics.

function ev(
  partial: Partial<DeliveryEvent> & Pick<DeliveryEvent, 'webhookId' | 'eventType'>,
): DeliveryEvent {
  return {
    status: 'delivered',
    attempt: 1,
    timestamp: '2026-01-01T00:00:00.000Z',
    httpStatus: 200,
    responseBodyExcerpt: '',
    ...partial,
  };
}

const MIXED_FIXTURE: DeliveryEvent[] = [
  // payment.created: single delivered attempt
  ev({
    webhookId: 'wh_pay',
    eventType: 'payment.created',
    status: 'delivered',
    attempt: 1,
    httpStatus: 200,
    timestamp: '2026-01-01T00:00:00.000Z',
  }),
  // refund.issued: failed then exhausted (never delivered)
  ev({
    webhookId: 'wh_ref',
    eventType: 'refund.issued',
    status: 'failed',
    attempt: 1,
    httpStatus: 503,
    timestamp: '2026-01-01T00:00:00.000Z',
  }),
  ev({
    webhookId: 'wh_ref',
    eventType: 'refund.issued',
    status: 'exhausted',
    attempt: 2,
    httpStatus: 503,
    timestamp: '2026-01-01T00:01:00.000Z',
  }),
];

describe('calculateMetrics – mixed event types: 100% success vs 0% success (AC2, AC3)', () => {
  it('overall success rate reflects both event types combined', () => {
    const { overall } = calculateMetrics(MIXED_FIXTURE);
    // 1 delivered out of 3 total attempts
    expect(overall.totalAttempts).toBe(3);
    expect(overall.deliveredAttempts).toBe(1);
    expect(overall.successRate).toBeCloseTo(1 / 3, 10);
  });

  it('payment.created row shows 100% success rate (single delivered attempt)', () => {
    const { byEventType } = calculateMetrics(MIXED_FIXTURE);
    const payment = byEventType.find((m) => m.eventType === 'payment.created')!;
    expect(payment).toBeDefined();
    expect(payment.successRate).toBe(1);
    expect(payment.totalAttempts).toBe(1);
    expect(payment.deliveredAttempts).toBe(1);
  });

  it('refund.issued row shows 0% success rate (100% failure)', () => {
    const { byEventType } = calculateMetrics(MIXED_FIXTURE);
    const refund = byEventType.find((m) => m.eventType === 'refund.issued')!;
    expect(refund).toBeDefined();
    expect(refund.successRate).toBe(0);
    expect(refund.totalAttempts).toBe(2);
    expect(refund.deliveredAttempts).toBe(0);
  });

  it('payment.created row shows 0 retries (single attempt)', () => {
    const { byEventType } = calculateMetrics(MIXED_FIXTURE);
    const payment = byEventType.find((m) => m.eventType === 'payment.created')!;
    expect(payment.averageRetryCount).toBe(0);
  });

  it('refund.issued row shows 1 retry (failed on attempt 1, exhausted on attempt 2)', () => {
    const { byEventType } = calculateMetrics(MIXED_FIXTURE);
    const refund = byEventType.find((m) => m.eventType === 'refund.issued')!;
    expect(refund.averageRetryCount).toBe(1);
  });

  it('payment.created TTD is 0 ms (delivered on first attempt)', () => {
    const { byEventType } = calculateMetrics(MIXED_FIXTURE);
    const payment = byEventType.find((m) => m.eventType === 'payment.created')!;
    expect(payment.timeToDelivery.sampleCount).toBe(1);
    expect(payment.timeToDelivery.medianMs).toBe(0);
    expect(payment.timeToDelivery.p95Ms).toBe(0);
  });

  it('refund.issued TTD is null (never delivered)', () => {
    const { byEventType } = calculateMetrics(MIXED_FIXTURE);
    const refund = byEventType.find((m) => m.eventType === 'refund.issued')!;
    expect(refund.timeToDelivery.sampleCount).toBe(0);
    expect(refund.timeToDelivery.medianMs).toBeNull();
    expect(refund.timeToDelivery.p95Ms).toBeNull();
  });

  it('produces exactly two event-type rows (one per type)', () => {
    const { byEventType } = calculateMetrics(MIXED_FIXTURE);
    expect(byEventType).toHaveLength(2);
    const types = byEventType.map((m) => m.eventType).sort();
    expect(types).toEqual(['payment.created', 'refund.issued']);
  });

  it('does not produce NaN for any metric in either event-type row', () => {
    const { byEventType } = calculateMetrics(MIXED_FIXTURE);
    for (const row of byEventType) {
      expect(Number.isNaN(row.successRate as number)).toBe(false);
      expect(Number.isNaN(row.averageRetryCount as number)).toBe(false);
      expect(Number.isNaN(row.timeToDelivery.medianMs as unknown as number)).toBe(false);
      expect(Number.isNaN(row.timeToDelivery.p95Ms as unknown as number)).toBe(false);
    }
  });
});
