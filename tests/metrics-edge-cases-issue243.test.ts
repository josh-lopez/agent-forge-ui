// Unit tests for metrics dashboard edge cases (Issue #243).
//
// Explicitly exercises the three edge-case fixture datasets called out in the
// spec: zero deliveries, 100 % failure, and single delivery attempt.  Each
// scenario is tested for all three metric dimensions:
//   • success rate
//   • average retry count
//   • time-to-delivery (median + 95th-percentile)
//
// All tests use static fixture data and are fully isolated from the simulator
// module — no live data, no network, no randomness.

import { describe, expect, it } from 'vitest';

import type { DeliveryEvent } from '../src/delivery-events';
import { calculateMetrics } from '../src/metrics';

// ── Fixture builder ───────────────────────────────────────────────────────────

/** Builds a minimal valid DeliveryEvent, overriding only the supplied fields. */
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

// ── Edge-case fixture datasets ────────────────────────────────────────────────

/** FIXTURE A: zero deliveries — empty event array. */
const ZERO_DELIVERIES: DeliveryEvent[] = [];

/**
 * FIXTURE B: 100 % failure — two attempts for the same webhook, both
 * non-delivered (failed → exhausted).  No attempt ever reaches `delivered`.
 */
const ALL_FAILED: DeliveryEvent[] = [
  ev({
    webhookId: 'wh_fail',
    eventType: 'payment.created',
    status: 'failed',
    attempt: 1,
    httpStatus: 503,
    timestamp: '2026-01-01T00:00:00.000Z',
  }),
  ev({
    webhookId: 'wh_fail',
    eventType: 'payment.created',
    status: 'exhausted',
    attempt: 2,
    httpStatus: 503,
    timestamp: '2026-01-01T00:01:00.000Z',
  }),
];

/**
 * FIXTURE C: single delivered attempt — exactly one event, status `delivered`,
 * attempt number 1.  The webhook succeeds on its very first try.
 */
const SINGLE_DELIVERED: DeliveryEvent[] = [
  ev({
    webhookId: 'wh_single',
    eventType: 'payment.created',
    status: 'delivered',
    attempt: 1,
    httpStatus: 200,
    timestamp: '2026-01-01T00:00:00.000Z',
  }),
];

/**
 * FIXTURE D: single failed attempt — exactly one event, status `failed`,
 * attempt number 1.  The webhook fails on its very first (and only) try.
 */
const SINGLE_FAILED: DeliveryEvent[] = [
  ev({
    webhookId: 'wh_single_fail',
    eventType: 'payment.created',
    status: 'failed',
    attempt: 1,
    httpStatus: 503,
    timestamp: '2026-01-01T00:00:00.000Z',
  }),
];

// ─────────────────────────────────────────────────────────────────────────────
// AC1 + AC2 + AC3: Success-rate edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('success rate – zero deliveries (AC1)', () => {
  it('returns null (not NaN) when there are zero delivery events', () => {
    const { overall } = calculateMetrics(ZERO_DELIVERIES);
    expect(overall.successRate).toBeNull();
    expect(Number.isNaN(overall.successRate as unknown as number)).toBe(false);
  });

  it('reports zero total attempts when there are zero delivery events', () => {
    const { overall } = calculateMetrics(ZERO_DELIVERIES);
    expect(overall.totalAttempts).toBe(0);
    expect(overall.deliveredAttempts).toBe(0);
  });

  it('produces no per-event-type rows when there are zero delivery events', () => {
    const { byEventType } = calculateMetrics(ZERO_DELIVERIES);
    expect(byEventType).toHaveLength(0);
  });
});

describe('success rate – 100 % failure (AC2)', () => {
  it('returns 0 (not null, not NaN) when all attempts failed', () => {
    const { overall } = calculateMetrics(ALL_FAILED);
    expect(overall.successRate).toBe(0);
    expect(overall.successRate).not.toBeNull();
    expect(Number.isNaN(overall.successRate as number)).toBe(false);
  });

  it('reports zero delivered attempts when all attempts failed', () => {
    const { overall } = calculateMetrics(ALL_FAILED);
    expect(overall.deliveredAttempts).toBe(0);
    expect(overall.totalAttempts).toBe(2);
  });

  it('per-event-type row also shows 0 success rate when all attempts failed', () => {
    const { byEventType } = calculateMetrics(ALL_FAILED);
    expect(byEventType).toHaveLength(1);
    expect(byEventType[0].successRate).toBe(0);
  });
});

describe('success rate – single attempt, delivered (AC3 success variant)', () => {
  it('returns 1 (100 %) when the single attempt succeeded', () => {
    const { overall } = calculateMetrics(SINGLE_DELIVERED);
    expect(overall.successRate).toBe(1);
  });

  it('reports 1 total attempt and 1 delivered attempt', () => {
    const { overall } = calculateMetrics(SINGLE_DELIVERED);
    expect(overall.totalAttempts).toBe(1);
    expect(overall.deliveredAttempts).toBe(1);
  });
});

describe('success rate – single attempt, failed (AC3 failure variant)', () => {
  it('returns 0 when the single attempt failed', () => {
    const { overall } = calculateMetrics(SINGLE_FAILED);
    expect(overall.successRate).toBe(0);
  });

  it('reports 1 total attempt and 0 delivered attempts', () => {
    const { overall } = calculateMetrics(SINGLE_FAILED);
    expect(overall.totalAttempts).toBe(1);
    expect(overall.deliveredAttempts).toBe(0);
  });

  it('does not produce NaN for success rate on a single failed attempt', () => {
    const { overall } = calculateMetrics(SINGLE_FAILED);
    expect(Number.isNaN(overall.successRate as number)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4: Average retry count edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('average retry count – zero deliveries (AC4)', () => {
  it('returns null (not NaN) when there are zero delivery events', () => {
    const { overall } = calculateMetrics(ZERO_DELIVERIES);
    expect(overall.averageRetryCount).toBeNull();
    expect(Number.isNaN(overall.averageRetryCount as unknown as number)).toBe(false);
  });

  it('reports zero webhooks when there are zero delivery events', () => {
    const { overall } = calculateMetrics(ZERO_DELIVERIES);
    expect(overall.webhookCount).toBe(0);
  });
});

describe('average retry count – 100 % failure (AC4)', () => {
  it('returns 1 retry for a webhook that failed on attempt 1 and was exhausted on attempt 2', () => {
    const { overall } = calculateMetrics(ALL_FAILED);
    // wh_fail: max attempt = 2, so retries = 2 - 1 = 1
    expect(overall.averageRetryCount).toBe(1);
  });

  it('does not return null or NaN when all attempts failed', () => {
    const { overall } = calculateMetrics(ALL_FAILED);
    expect(overall.averageRetryCount).not.toBeNull();
    expect(Number.isNaN(overall.averageRetryCount as number)).toBe(false);
  });

  it('per-event-type row also shows correct retry count when all attempts failed', () => {
    const { byEventType } = calculateMetrics(ALL_FAILED);
    expect(byEventType[0].averageRetryCount).toBe(1);
  });
});

describe('average retry count – single delivered attempt (AC4)', () => {
  it('returns 0 retries when the webhook succeeded on its first attempt', () => {
    const { overall } = calculateMetrics(SINGLE_DELIVERED);
    expect(overall.averageRetryCount).toBe(0);
  });

  it('reports 1 webhook with 0 retries', () => {
    const { overall } = calculateMetrics(SINGLE_DELIVERED);
    expect(overall.webhookCount).toBe(1);
    expect(overall.averageRetryCount).toBe(0);
  });
});

describe('average retry count – single failed attempt (AC4)', () => {
  it('returns 0 retries when the webhook failed on its first (and only) attempt', () => {
    const { overall } = calculateMetrics(SINGLE_FAILED);
    expect(overall.averageRetryCount).toBe(0);
  });

  it('does not return null or NaN for a single failed attempt', () => {
    const { overall } = calculateMetrics(SINGLE_FAILED);
    expect(overall.averageRetryCount).not.toBeNull();
    expect(Number.isNaN(overall.averageRetryCount as number)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5: Time-to-delivery edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('time-to-delivery – zero deliveries (AC5)', () => {
  it('returns null for medianMs when there are zero delivery events', () => {
    const { overall } = calculateMetrics(ZERO_DELIVERIES);
    expect(overall.timeToDelivery.medianMs).toBeNull();
  });

  it('returns null for p95Ms when there are zero delivery events', () => {
    const { overall } = calculateMetrics(ZERO_DELIVERIES);
    expect(overall.timeToDelivery.p95Ms).toBeNull();
  });

  it('reports sampleCount of 0 when there are zero delivery events', () => {
    const { overall } = calculateMetrics(ZERO_DELIVERIES);
    expect(overall.timeToDelivery.sampleCount).toBe(0);
  });

  it('does not produce NaN for any TTD field when there are zero delivery events', () => {
    const { overall } = calculateMetrics(ZERO_DELIVERIES);
    const { medianMs, p95Ms } = overall.timeToDelivery;
    expect(Number.isNaN(medianMs as unknown as number)).toBe(false);
    expect(Number.isNaN(p95Ms as unknown as number)).toBe(false);
  });
});

describe('time-to-delivery – 100 % failure (AC5)', () => {
  it('returns null for medianMs when no webhook ever delivered', () => {
    const { overall } = calculateMetrics(ALL_FAILED);
    expect(overall.timeToDelivery.medianMs).toBeNull();
  });

  it('returns null for p95Ms when no webhook ever delivered', () => {
    const { overall } = calculateMetrics(ALL_FAILED);
    expect(overall.timeToDelivery.p95Ms).toBeNull();
  });

  it('reports sampleCount of 0 when no webhook ever delivered', () => {
    const { overall } = calculateMetrics(ALL_FAILED);
    expect(overall.timeToDelivery.sampleCount).toBe(0);
  });

  it('does not crash or produce NaN for TTD when all attempts failed', () => {
    const { overall } = calculateMetrics(ALL_FAILED);
    const { medianMs, p95Ms } = overall.timeToDelivery;
    expect(Number.isNaN(medianMs as unknown as number)).toBe(false);
    expect(Number.isNaN(p95Ms as unknown as number)).toBe(false);
  });
});

describe('time-to-delivery – single delivered attempt (AC5)', () => {
  it('returns 0 ms for medianMs when the webhook delivered on its first attempt', () => {
    // The initial attempt IS the delivery attempt, so elapsed time = 0.
    const { overall } = calculateMetrics(SINGLE_DELIVERED);
    expect(overall.timeToDelivery.medianMs).toBe(0);
  });

  it('returns 0 ms for p95Ms when the webhook delivered on its first attempt', () => {
    const { overall } = calculateMetrics(SINGLE_DELIVERED);
    expect(overall.timeToDelivery.p95Ms).toBe(0);
  });

  it('reports sampleCount of 1 for a single delivered attempt', () => {
    const { overall } = calculateMetrics(SINGLE_DELIVERED);
    expect(overall.timeToDelivery.sampleCount).toBe(1);
  });

  it('does not produce NaN for any TTD field with a single delivered attempt', () => {
    const { overall } = calculateMetrics(SINGLE_DELIVERED);
    const { medianMs, p95Ms } = overall.timeToDelivery;
    expect(Number.isNaN(medianMs as unknown as number)).toBe(false);
    expect(Number.isNaN(p95Ms as unknown as number)).toBe(false);
  });
});

describe('time-to-delivery – single failed attempt (AC5)', () => {
  it('returns null for medianMs when the single attempt failed', () => {
    const { overall } = calculateMetrics(SINGLE_FAILED);
    expect(overall.timeToDelivery.medianMs).toBeNull();
  });

  it('returns null for p95Ms when the single attempt failed', () => {
    const { overall } = calculateMetrics(SINGLE_FAILED);
    expect(overall.timeToDelivery.p95Ms).toBeNull();
  });

  it('reports sampleCount of 0 when the single attempt failed', () => {
    const { overall } = calculateMetrics(SINGLE_FAILED);
    expect(overall.timeToDelivery.sampleCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC6 + AC7: Stability / isolation guarantees
// ─────────────────────────────────────────────────────────────────────────────

describe('fixture isolation and purity (AC6, AC7)', () => {
  it('does not mutate the zero-deliveries fixture array', () => {
    const input: DeliveryEvent[] = [];
    calculateMetrics(input);
    expect(input).toHaveLength(0);
  });

  it('does not mutate the all-failed fixture array', () => {
    const input = [...ALL_FAILED];
    const snapshot = JSON.stringify(input);
    calculateMetrics(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('does not mutate the single-delivered fixture array', () => {
    const input = [...SINGLE_DELIVERED];
    const snapshot = JSON.stringify(input);
    calculateMetrics(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('produces identical results on repeated calls with the same fixture (no hidden state)', () => {
    const first  = calculateMetrics(ALL_FAILED);
    const second = calculateMetrics(ALL_FAILED);
    expect(first.overall.successRate).toBe(second.overall.successRate);
    expect(first.overall.averageRetryCount).toBe(second.overall.averageRetryCount);
    expect(first.overall.timeToDelivery.medianMs).toBe(second.overall.timeToDelivery.medianMs);
  });
});
