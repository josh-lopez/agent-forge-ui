/**
 * Unit tests for the metrics dashboard calculation module (src/metrics.ts).
 *
 * Spec ref: spec § "Webhook delivery metrics dashboard — Test coverage"
 *
 * Acceptance criteria covered:
 *   AC1 – success-rate: normal, zero deliveries, 100% failure, single attempt
 *   AC2 – average-retry-count: normal, zero deliveries, 100% failure, single attempt
 *   AC3 – time-to-delivery (median + p95): normal, zero deliveries, 100% failure, single attempt
 *   AC4 – shared representative fixture dataset (see FIXTURE section below)
 *   AC5 – overall aggregate AND per-event-type breakdown tested
 *   AC6 – all tests pass, none skipped
 *   AC7 – file co-located with src/ metrics module (tests/ mirrors src/)
 *
 * ── Fixture dataset design ────────────────────────────────────────────────────
 *
 * The MIXED_FIXTURE contains 6 logical webhooks across two event types:
 *
 *   payment.created  (3 webhooks)
 *     wh-pc-1: attempt 1 → delivered  (1 attempt,   0 ms to delivery)
 *     wh-pc-2: attempt 1 → failed,
 *              attempt 2 → delivered  (2 attempts, 60 000 ms to delivery)
 *     wh-pc-3: attempt 1 → failed,
 *              attempt 2 → failed,
 *              attempt 3 → failed     (3 attempts, exhausted — no delivery)
 *
 *   refund.issued    (3 webhooks)
 *     wh-ri-1: attempt 1 → delivered  (1 attempt,   0 ms to delivery)
 *     wh-ri-2: attempt 1 → failed,
 *              attempt 2 → delivered  (2 attempts, 120 000 ms to delivery)
 *     wh-ri-3: attempt 1 → failed,
 *              attempt 2 → failed     (2 attempts, exhausted — no delivery)
 *
 * Overall:
 *   totalWebhooks = 6, delivered = 4
 *   successRate   = 4/6 ≈ 0.6667
 *   totalAttempts = (1+2+3) + (1+2+2) = 11
 *   avgRetryCount = 11/6 ≈ 1.8333
 *   timeToDelivery values (sorted): [0, 0, 60000, 120000]
 *   median (p50, nearest-rank): index = ceil(0.5*4)-1 = 1 → 0 ms
 *   p95 (nearest-rank):         index = ceil(0.95*4)-1 = 3 → 120000 ms
 *
 * payment.created:
 *   totalWebhooks = 3, delivered = 2
 *   successRate   = 2/3 ≈ 0.6667
 *   totalAttempts = 1+2+3 = 6
 *   avgRetryCount = 6/3 = 2
 *   timeToDelivery values (sorted): [0, 60000]
 *   median: index = ceil(0.5*2)-1 = 0 → 0 ms
 *   p95:    index = ceil(0.95*2)-1 = 1 → 60000 ms
 *
 * refund.issued:
 *   totalWebhooks = 3, delivered = 2
 *   successRate   = 2/3 ≈ 0.6667
 *   totalAttempts = 1+2+2 = 5
 *   avgRetryCount = 5/3 ≈ 1.6667
 *   timeToDelivery values (sorted): [0, 120000]
 *   median: index = ceil(0.5*2)-1 = 0 → 0 ms
 *   p95:    index = ceil(0.95*2)-1 = 1 → 120000 ms
 */

import { describe, expect, it } from 'vitest';
import {
  calculateMetrics,
  type DeliveryAttempt,
} from '../src/metrics';

// ── Shared fixture helpers ────────────────────────────────────────────────────

/** Build a DeliveryAttempt with sensible defaults for fields not under test. */
function attempt(
  overrides: Partial<DeliveryAttempt> & Pick<DeliveryAttempt, 'webhookId' | 'eventType' | 'status' | 'attemptNumber' | 'timestamp'>
): DeliveryAttempt {
  return {
    httpStatus: overrides.status === 'delivered' ? 200 : 500,
    responseExcerpt: null,
    ...overrides,
  };
}

/**
 * MIXED_FIXTURE — representative dataset covering:
 *   - multiple event types (payment.created, refund.issued)
 *   - delivered on first attempt (0 ms TTD)
 *   - delivered after retries (non-zero TTD)
 *   - fully failed / exhausted webhooks (no delivery)
 *
 * Timestamps are ISO-8601 strings; the base epoch is 2024-01-01T00:00:00.000Z.
 * Offsets are chosen to produce clean, predictable TTD values.
 */
const T0 = '2024-01-01T00:00:00.000Z'; // base timestamp
const T1m = '2024-01-01T00:01:00.000Z'; // +60 000 ms
const T2m = '2024-01-01T00:02:00.000Z'; // +120 000 ms
const T3m = '2024-01-01T00:03:00.000Z'; // +180 000 ms (unused in delivery, used for failed)

const MIXED_FIXTURE: DeliveryAttempt[] = [
  // ── payment.created ──────────────────────────────────────────────────────
  // wh-pc-1: delivered on first attempt (TTD = 0 ms)
  attempt({ webhookId: 'wh-pc-1', eventType: 'payment.created', status: 'delivered', attemptNumber: 1, timestamp: T0 }),

  // wh-pc-2: failed then delivered (TTD = 60 000 ms)
  attempt({ webhookId: 'wh-pc-2', eventType: 'payment.created', status: 'failed',    attemptNumber: 1, timestamp: T0 }),
  attempt({ webhookId: 'wh-pc-2', eventType: 'payment.created', status: 'delivered', attemptNumber: 2, timestamp: T1m }),

  // wh-pc-3: three failures, exhausted (no delivery)
  attempt({ webhookId: 'wh-pc-3', eventType: 'payment.created', status: 'failed',    attemptNumber: 1, timestamp: T0 }),
  attempt({ webhookId: 'wh-pc-3', eventType: 'payment.created', status: 'failed',    attemptNumber: 2, timestamp: T1m }),
  attempt({ webhookId: 'wh-pc-3', eventType: 'payment.created', status: 'exhausted', attemptNumber: 3, timestamp: T2m }),

  // ── refund.issued ─────────────────────────────────────────────────────────
  // wh-ri-1: delivered on first attempt (TTD = 0 ms)
  attempt({ webhookId: 'wh-ri-1', eventType: 'refund.issued', status: 'delivered', attemptNumber: 1, timestamp: T0 }),

  // wh-ri-2: failed then delivered (TTD = 120 000 ms)
  attempt({ webhookId: 'wh-ri-2', eventType: 'refund.issued', status: 'failed',    attemptNumber: 1, timestamp: T0 }),
  attempt({ webhookId: 'wh-ri-2', eventType: 'refund.issued', status: 'delivered', attemptNumber: 2, timestamp: T2m }),

  // wh-ri-3: two failures, exhausted (no delivery)
  attempt({ webhookId: 'wh-ri-3', eventType: 'refund.issued', status: 'failed',    attemptNumber: 1, timestamp: T0 }),
  attempt({ webhookId: 'wh-ri-3', eventType: 'refund.issued', status: 'exhausted', attemptNumber: 2, timestamp: T3m }),
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Tolerance for floating-point comparisons (4 decimal places). */
const FLOAT_PRECISION = 4;

function round(n: number, dp = FLOAT_PRECISION): number {
  return Math.round(n * 10 ** dp) / 10 ** dp;
}

// ═════════════════════════════════════════════════════════════════════════════
// AC1 + AC5: Success-rate calculation
// ═════════════════════════════════════════════════════════════════════════════

describe('calculateMetrics – success rate', () => {
  // ── Normal mixed dataset (overall) ────────────────────────────────────────
  it('overall: computes correct success rate for mixed dataset', () => {
    const result = calculateMetrics(MIXED_FIXTURE);
    // 4 delivered out of 6 webhooks
    expect(round(result.overall.successRate)).toBe(round(4 / 6));
  });

  // ── Normal mixed dataset (per event type) ─────────────────────────────────
  it('payment.created: computes correct success rate', () => {
    const result = calculateMetrics(MIXED_FIXTURE);
    const pc = result.byEventType.find((r) => r.eventType === 'payment.created');
    expect(pc).toBeDefined();
    // 2 delivered out of 3 webhooks
    expect(round(pc!.successRate)).toBe(round(2 / 3));
  });

  it('refund.issued: computes correct success rate', () => {
    const result = calculateMetrics(MIXED_FIXTURE);
    const ri = result.byEventType.find((r) => r.eventType === 'refund.issued');
    expect(ri).toBeDefined();
    // 2 delivered out of 3 webhooks
    expect(round(ri!.successRate)).toBe(round(2 / 3));
  });

  // ── Edge case: zero deliveries (empty input) ──────────────────────────────
  it('zero deliveries: overall success rate is 0', () => {
    const result = calculateMetrics([]);
    expect(result.overall.successRate).toBe(0);
  });

  it('zero deliveries: byEventType is empty', () => {
    const result = calculateMetrics([]);
    expect(result.byEventType).toHaveLength(0);
  });

  // ── Edge case: 100% failure ───────────────────────────────────────────────
  it('100% failure: overall success rate is 0', () => {
    const allFailed: DeliveryAttempt[] = [
      attempt({ webhookId: 'wh-f-1', eventType: 'payment.created', status: 'failed',    attemptNumber: 1, timestamp: T0 }),
      attempt({ webhookId: 'wh-f-1', eventType: 'payment.created', status: 'exhausted', attemptNumber: 2, timestamp: T1m }),
      attempt({ webhookId: 'wh-f-2', eventType: 'payment.created', status: 'failed',    attemptNumber: 1, timestamp: T0 }),
      attempt({ webhookId: 'wh-f-2', eventType: 'payment.created', status: 'exhausted', attemptNumber: 2, timestamp: T1m }),
    ];
    const result = calculateMetrics(allFailed);
    expect(result.overall.successRate).toBe(0);
  });

  it('100% failure: per-event-type success rate is 0', () => {
    const allFailed: DeliveryAttempt[] = [
      attempt({ webhookId: 'wh-f-1', eventType: 'payment.created', status: 'failed',    attemptNumber: 1, timestamp: T0 }),
      attempt({ webhookId: 'wh-f-1', eventType: 'payment.created', status: 'exhausted', attemptNumber: 2, timestamp: T1m }),
    ];
    const result = calculateMetrics(allFailed);
    const pc = result.byEventType.find((r) => r.eventType === 'payment.created');
    expect(pc).toBeDefined();
    expect(pc!.successRate).toBe(0);
  });

  // ── Edge case: single attempt ─────────────────────────────────────────────
  it('single attempt (delivered): success rate is 1', () => {
    const single: DeliveryAttempt[] = [
      attempt({ webhookId: 'wh-s-1', eventType: 'payment.created', status: 'delivered', attemptNumber: 1, timestamp: T0 }),
    ];
    const result = calculateMetrics(single);
    expect(result.overall.successRate).toBe(1);
  });

  it('single attempt (failed): success rate is 0', () => {
    const single: DeliveryAttempt[] = [
      attempt({ webhookId: 'wh-s-1', eventType: 'payment.created', status: 'failed', attemptNumber: 1, timestamp: T0 }),
    ];
    const result = calculateMetrics(single);
    expect(result.overall.successRate).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC2 + AC5: Average retry count calculation
// ═════════════════════════════════════════════════════════════════════════════

describe('calculateMetrics – average retry count', () => {
  // ── Normal mixed dataset (overall) ────────────────────────────────────────
  it('overall: computes correct average retry count for mixed dataset', () => {
    const result = calculateMetrics(MIXED_FIXTURE);
    // totalAttempts = (1+2+3) + (1+2+2) = 11, totalWebhooks = 6
    expect(round(result.overall.averageRetryCount)).toBe(round(11 / 6));
  });

  // ── Normal mixed dataset (per event type) ─────────────────────────────────
  it('payment.created: computes correct average retry count', () => {
    const result = calculateMetrics(MIXED_FIXTURE);
    const pc = result.byEventType.find((r) => r.eventType === 'payment.created');
    expect(pc).toBeDefined();
    // totalAttempts = 1+2+3 = 6, totalWebhooks = 3
    expect(round(pc!.averageRetryCount)).toBe(round(6 / 3));
  });

  it('refund.issued: computes correct average retry count', () => {
    const result = calculateMetrics(MIXED_FIXTURE);
    const ri = result.byEventType.find((r) => r.eventType === 'refund.issued');
    expect(ri).toBeDefined();
    // totalAttempts = 1+2+2 = 5, totalWebhooks = 3
    expect(round(ri!.averageRetryCount)).toBe(round(5 / 3));
  });

  // ── Edge case: zero deliveries (empty input) ──────────────────────────────
  it('zero deliveries: average retry count is 0', () => {
    const result = calculateMetrics([]);
    expect(result.overall.averageRetryCount).toBe(0);
  });

  // ── Edge case: 100% failure ───────────────────────────────────────────────
  it('100% failure: average retry count reflects all failed attempts', () => {
    const allFailed: DeliveryAttempt[] = [
      attempt({ webhookId: 'wh-f-1', eventType: 'payment.created', status: 'failed',    attemptNumber: 1, timestamp: T0 }),
      attempt({ webhookId: 'wh-f-1', eventType: 'payment.created', status: 'exhausted', attemptNumber: 2, timestamp: T1m }),
      attempt({ webhookId: 'wh-f-2', eventType: 'payment.created', status: 'failed',    attemptNumber: 1, timestamp: T0 }),
      attempt({ webhookId: 'wh-f-2', eventType: 'payment.created', status: 'exhausted', attemptNumber: 2, timestamp: T1m }),
    ];
    const result = calculateMetrics(allFailed);
    // totalAttempts = 2+2 = 4, totalWebhooks = 2
    expect(result.overall.averageRetryCount).toBe(2);
  });

  it('100% failure: per-event-type average retry count is correct', () => {
    const allFailed: DeliveryAttempt[] = [
      attempt({ webhookId: 'wh-f-1', eventType: 'payment.created', status: 'failed',    attemptNumber: 1, timestamp: T0 }),
      attempt({ webhookId: 'wh-f-1', eventType: 'payment.created', status: 'exhausted', attemptNumber: 2, timestamp: T1m }),
    ];
    const result = calculateMetrics(allFailed);
    const pc = result.byEventType.find((r) => r.eventType === 'payment.created');
    expect(pc).toBeDefined();
    // 2 attempts / 1 webhook = 2
    expect(pc!.averageRetryCount).toBe(2);
  });

  // ── Edge case: single attempt ─────────────────────────────────────────────
  it('single attempt: average retry count is 1', () => {
    const single: DeliveryAttempt[] = [
      attempt({ webhookId: 'wh-s-1', eventType: 'payment.created', status: 'delivered', attemptNumber: 1, timestamp: T0 }),
    ];
    const result = calculateMetrics(single);
    expect(result.overall.averageRetryCount).toBe(1);
  });

  it('single attempt (failed): average retry count is 1', () => {
    const single: DeliveryAttempt[] = [
      attempt({ webhookId: 'wh-s-1', eventType: 'payment.created', status: 'failed', attemptNumber: 1, timestamp: T0 }),
    ];
    const result = calculateMetrics(single);
    expect(result.overall.averageRetryCount).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC3 + AC5: Time-to-delivery (median and p95) calculation
// ═════════════════════════════════════════════════════════════════════════════

describe('calculateMetrics – time-to-delivery (median and p95)', () => {
  // ── Normal mixed dataset (overall) ────────────────────────────────────────
  it('overall: computes correct median time-to-delivery', () => {
    const result = calculateMetrics(MIXED_FIXTURE);
    // Delivered TTDs (sorted): [0, 0, 60000, 120000]
    // median (nearest-rank p50): ceil(0.5*4)-1 = index 1 → 0 ms
    expect(result.overall.medianTimeToDeliveryMs).toBe(0);
  });

  it('overall: computes correct p95 time-to-delivery', () => {
    const result = calculateMetrics(MIXED_FIXTURE);
    // p95 (nearest-rank): ceil(0.95*4)-1 = ceil(3.8)-1 = 4-1 = index 3 → 120000 ms
    expect(result.overall.p95TimeToDeliveryMs).toBe(120000);
  });

  // ── Normal mixed dataset (per event type) ─────────────────────────────────
  it('payment.created: computes correct median time-to-delivery', () => {
    const result = calculateMetrics(MIXED_FIXTURE);
    const pc = result.byEventType.find((r) => r.eventType === 'payment.created');
    expect(pc).toBeDefined();
    // Delivered TTDs (sorted): [0, 60000]
    // median: ceil(0.5*2)-1 = index 0 → 0 ms
    expect(pc!.medianTimeToDeliveryMs).toBe(0);
  });

  it('payment.created: computes correct p95 time-to-delivery', () => {
    const result = calculateMetrics(MIXED_FIXTURE);
    const pc = result.byEventType.find((r) => r.eventType === 'payment.created');
    expect(pc).toBeDefined();
    // p95: ceil(0.95*2)-1 = ceil(1.9)-1 = 2-1 = index 1 → 60000 ms
    expect(pc!.p95TimeToDeliveryMs).toBe(60000);
  });

  it('refund.issued: computes correct median time-to-delivery', () => {
    const result = calculateMetrics(MIXED_FIXTURE);
    const ri = result.byEventType.find((r) => r.eventType === 'refund.issued');
    expect(ri).toBeDefined();
    // Delivered TTDs (sorted): [0, 120000]
    // median: ceil(0.5*2)-1 = index 0 → 0 ms
    expect(ri!.medianTimeToDeliveryMs).toBe(0);
  });

  it('refund.issued: computes correct p95 time-to-delivery', () => {
    const result = calculateMetrics(MIXED_FIXTURE);
    const ri = result.byEventType.find((r) => r.eventType === 'refund.issued');
    expect(ri).toBeDefined();
    // p95: ceil(0.95*2)-1 = index 1 → 120000 ms
    expect(ri!.p95TimeToDeliveryMs).toBe(120000);
  });

  // ── Edge case: zero deliveries (empty input) ──────────────────────────────
  it('zero deliveries: median is null (no divide-by-zero or NaN)', () => {
    const result = calculateMetrics([]);
    expect(result.overall.medianTimeToDeliveryMs).toBeNull();
  });

  it('zero deliveries: p95 is null (no divide-by-zero or NaN)', () => {
    const result = calculateMetrics([]);
    expect(result.overall.p95TimeToDeliveryMs).toBeNull();
  });

  // ── Edge case: 100% failure (no delivered webhooks) ───────────────────────
  it('100% failure: median is null (no delivered webhooks to measure)', () => {
    const allFailed: DeliveryAttempt[] = [
      attempt({ webhookId: 'wh-f-1', eventType: 'payment.created', status: 'failed',    attemptNumber: 1, timestamp: T0 }),
      attempt({ webhookId: 'wh-f-1', eventType: 'payment.created', status: 'exhausted', attemptNumber: 2, timestamp: T1m }),
    ];
    const result = calculateMetrics(allFailed);
    expect(result.overall.medianTimeToDeliveryMs).toBeNull();
  });

  it('100% failure: p95 is null (no delivered webhooks to measure)', () => {
    const allFailed: DeliveryAttempt[] = [
      attempt({ webhookId: 'wh-f-1', eventType: 'payment.created', status: 'failed',    attemptNumber: 1, timestamp: T0 }),
      attempt({ webhookId: 'wh-f-1', eventType: 'payment.created', status: 'exhausted', attemptNumber: 2, timestamp: T1m }),
    ];
    const result = calculateMetrics(allFailed);
    expect(result.overall.p95TimeToDeliveryMs).toBeNull();
  });

  it('100% failure: per-event-type median is null', () => {
    const allFailed: DeliveryAttempt[] = [
      attempt({ webhookId: 'wh-f-1', eventType: 'payment.created', status: 'failed',    attemptNumber: 1, timestamp: T0 }),
      attempt({ webhookId: 'wh-f-1', eventType: 'payment.created', status: 'exhausted', attemptNumber: 2, timestamp: T1m }),
    ];
    const result = calculateMetrics(allFailed);
    const pc = result.byEventType.find((r) => r.eventType === 'payment.created');
    expect(pc).toBeDefined();
    expect(pc!.medianTimeToDeliveryMs).toBeNull();
  });

  // ── Edge case: single attempt (delivered) ─────────────────────────────────
  it('single attempt (delivered): median TTD is 0 ms (same timestamp)', () => {
    const single: DeliveryAttempt[] = [
      attempt({ webhookId: 'wh-s-1', eventType: 'payment.created', status: 'delivered', attemptNumber: 1, timestamp: T0 }),
    ];
    const result = calculateMetrics(single);
    expect(result.overall.medianTimeToDeliveryMs).toBe(0);
  });

  it('single attempt (delivered): p95 TTD is 0 ms (same timestamp)', () => {
    const single: DeliveryAttempt[] = [
      attempt({ webhookId: 'wh-s-1', eventType: 'payment.created', status: 'delivered', attemptNumber: 1, timestamp: T0 }),
    ];
    const result = calculateMetrics(single);
    expect(result.overall.p95TimeToDeliveryMs).toBe(0);
  });

  it('single attempt (failed): median TTD is null', () => {
    const single: DeliveryAttempt[] = [
      attempt({ webhookId: 'wh-s-1', eventType: 'payment.created', status: 'failed', attemptNumber: 1, timestamp: T0 }),
    ];
    const result = calculateMetrics(single);
    expect(result.overall.medianTimeToDeliveryMs).toBeNull();
  });

  it('single attempt (failed): p95 TTD is null', () => {
    const single: DeliveryAttempt[] = [
      attempt({ webhookId: 'wh-s-1', eventType: 'payment.created', status: 'failed', attemptNumber: 1, timestamp: T0 }),
    ];
    const result = calculateMetrics(single);
    expect(result.overall.p95TimeToDeliveryMs).toBeNull();
  });

  // ── Boundary: TTD measured from first attempt to first delivered attempt ──
  it('TTD is measured from first attempt timestamp to delivered attempt timestamp', () => {
    // wh-ttd-1: attempt 1 at T0 (failed), attempt 2 at T2m (delivered)
    // Expected TTD = 120 000 ms
    const attempts: DeliveryAttempt[] = [
      attempt({ webhookId: 'wh-ttd-1', eventType: 'payment.created', status: 'failed',    attemptNumber: 1, timestamp: T0 }),
      attempt({ webhookId: 'wh-ttd-1', eventType: 'payment.created', status: 'delivered', attemptNumber: 2, timestamp: T2m }),
    ];
    const result = calculateMetrics(attempts);
    expect(result.overall.medianTimeToDeliveryMs).toBe(120000);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AC4 + AC5: Event-type breakdown structure
// ═════════════════════════════════════════════════════════════════════════════

describe('calculateMetrics – event-type breakdown structure', () => {
  it('byEventType contains one entry per distinct event type', () => {
    const result = calculateMetrics(MIXED_FIXTURE);
    expect(result.byEventType).toHaveLength(2);
    const types = result.byEventType.map((r) => r.eventType).sort();
    expect(types).toEqual(['payment.created', 'refund.issued']);
  });

  it('byEventType entries are sorted alphabetically by event type', () => {
    const result = calculateMetrics(MIXED_FIXTURE);
    const types = result.byEventType.map((r) => r.eventType);
    expect(types).toEqual([...types].sort());
  });

  it('overall eventType label is "overall"', () => {
    const result = calculateMetrics(MIXED_FIXTURE);
    expect(result.overall.eventType).toBe('overall');
  });

  it('single event type: byEventType has exactly one entry', () => {
    const single: DeliveryAttempt[] = [
      attempt({ webhookId: 'wh-s-1', eventType: 'payment.created', status: 'delivered', attemptNumber: 1, timestamp: T0 }),
    ];
    const result = calculateMetrics(single);
    expect(result.byEventType).toHaveLength(1);
    expect(result.byEventType[0].eventType).toBe('payment.created');
  });

  it('zero deliveries: byEventType is empty array', () => {
    const result = calculateMetrics([]);
    expect(result.byEventType).toEqual([]);
  });

  it('three event types: byEventType has three entries', () => {
    const threeTypes: DeliveryAttempt[] = [
      attempt({ webhookId: 'wh-a-1', eventType: 'dispute.opened',   status: 'delivered', attemptNumber: 1, timestamp: T0 }),
      attempt({ webhookId: 'wh-b-1', eventType: 'payment.created',  status: 'delivered', attemptNumber: 1, timestamp: T0 }),
      attempt({ webhookId: 'wh-c-1', eventType: 'refund.issued',    status: 'delivered', attemptNumber: 1, timestamp: T0 }),
    ];
    const result = calculateMetrics(threeTypes);
    expect(result.byEventType).toHaveLength(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Additional: NaN / null safety
// ═════════════════════════════════════════════════════════════════════════════

describe('calculateMetrics – NaN and null safety', () => {
  it('empty input: no NaN values in overall metrics', () => {
    const result = calculateMetrics([]);
    expect(Number.isNaN(result.overall.successRate)).toBe(false);
    expect(Number.isNaN(result.overall.averageRetryCount)).toBe(false);
  });

  it('100% failure: no NaN in time-to-delivery fields', () => {
    const allFailed: DeliveryAttempt[] = [
      attempt({ webhookId: 'wh-f-1', eventType: 'payment.created', status: 'exhausted', attemptNumber: 1, timestamp: T0 }),
    ];
    const result = calculateMetrics(allFailed);
    // Should be null, not NaN
    expect(result.overall.medianTimeToDeliveryMs).toBeNull();
    expect(result.overall.p95TimeToDeliveryMs).toBeNull();
  });
});
