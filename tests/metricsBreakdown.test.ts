/**
 * Unit tests for src/metricsBreakdown.ts
 *
 * Covers Issue #168 acceptance criteria:
 *   AC9  – breakdown correctly groups metrics by event type for a representative
 *           fixture dataset.
 *   AC10 – edge cases: zero deliveries, 100% failure, single attempt per type.
 *
 * Also exercises the overall aggregate and reactive-grouping helpers.
 */

import { describe, expect, it } from 'vitest';
import {
  calculateBreakdown,
  calculateMetricsForGroup,
  groupByEventType,
  type DeliveryEvent,
} from '../src/metricsBreakdown';

// ── Fixture helpers ───────────────────────────────────────────────────────────

/** Build a minimal DeliveryEvent. */
function makeEvent(
  overrides: Partial<DeliveryEvent> & {
    webhookId: string;
    eventType: string;
    status: DeliveryEvent['status'];
    attemptNumber: number;
  }
): DeliveryEvent {
  return {
    timestamp: '2024-01-01T00:00:00.000Z',
    httpStatus: overrides.status === 'delivered' ? 200 : 500,
    responseExcerpt: '',
    ...overrides,
  };
}

/**
 * Representative fixture: three event types, multiple webhooks each, a mix of
 * delivered / failed / exhausted outcomes, and multi-attempt webhooks.
 *
 * payment.created  – 3 webhooks: 2 delivered (one on attempt 1, one on attempt 2), 1 failed
 * refund.issued    – 2 webhooks: 1 delivered (attempt 1), 1 exhausted
 * dispute.opened   – 1 webhook:  1 delivered (attempt 1)
 */
const FIXTURE: DeliveryEvent[] = [
  // ── payment.created ──────────────────────────────────────────────────────
  // webhook-pc-1: delivered on first attempt
  makeEvent({
    webhookId: 'pc-1',
    eventType: 'payment.created',
    status: 'delivered',
    attemptNumber: 1,
    timestamp: '2024-01-01T00:00:00.000Z',
    httpStatus: 200,
  }),
  // webhook-pc-2: failed on attempt 1, delivered on attempt 2
  makeEvent({
    webhookId: 'pc-2',
    eventType: 'payment.created',
    status: 'failed',
    attemptNumber: 1,
    timestamp: '2024-01-01T01:00:00.000Z',
  }),
  makeEvent({
    webhookId: 'pc-2',
    eventType: 'payment.created',
    status: 'delivered',
    attemptNumber: 2,
    timestamp: '2024-01-01T01:05:00.000Z', // 5 min later
    httpStatus: 200,
  }),
  // webhook-pc-3: failed (never delivered)
  makeEvent({
    webhookId: 'pc-3',
    eventType: 'payment.created',
    status: 'failed',
    attemptNumber: 1,
    timestamp: '2024-01-01T02:00:00.000Z',
  }),

  // ── refund.issued ─────────────────────────────────────────────────────────
  // webhook-ri-1: delivered on first attempt
  makeEvent({
    webhookId: 'ri-1',
    eventType: 'refund.issued',
    status: 'delivered',
    attemptNumber: 1,
    timestamp: '2024-01-01T03:00:00.000Z',
    httpStatus: 200,
  }),
  // webhook-ri-2: exhausted after 2 attempts
  makeEvent({
    webhookId: 'ri-2',
    eventType: 'refund.issued',
    status: 'failed',
    attemptNumber: 1,
    timestamp: '2024-01-01T04:00:00.000Z',
  }),
  makeEvent({
    webhookId: 'ri-2',
    eventType: 'refund.issued',
    status: 'exhausted',
    attemptNumber: 2,
    timestamp: '2024-01-01T04:30:00.000Z',
  }),

  // ── dispute.opened ────────────────────────────────────────────────────────
  // webhook-do-1: delivered on first attempt
  makeEvent({
    webhookId: 'do-1',
    eventType: 'dispute.opened',
    status: 'delivered',
    attemptNumber: 1,
    timestamp: '2024-01-01T05:00:00.000Z',
    httpStatus: 200,
  }),
];

// ── AC9: Correct grouping by event type ──────────────────────────────────────

describe('groupByEventType', () => {
  it('returns a Map with one entry per distinct event type', () => {
    const grouped = groupByEventType(FIXTURE);
    expect(grouped.size).toBe(3);
    expect(grouped.has('payment.created')).toBe(true);
    expect(grouped.has('refund.issued')).toBe(true);
    expect(grouped.has('dispute.opened')).toBe(true);
  });

  it('assigns every event to the correct group', () => {
    const grouped = groupByEventType(FIXTURE);
    // payment.created has 4 events (pc-1 x1, pc-2 x2, pc-3 x1)
    expect(grouped.get('payment.created')!.length).toBe(4);
    // refund.issued has 3 events (ri-1 x1, ri-2 x2)
    expect(grouped.get('refund.issued')!.length).toBe(3);
    // dispute.opened has 1 event
    expect(grouped.get('dispute.opened')!.length).toBe(1);
  });

  it('returns an empty Map for an empty event list', () => {
    expect(groupByEventType([]).size).toBe(0);
  });

  it('handles a new event type arriving dynamically', () => {
    const extra = makeEvent({
      webhookId: 'charge-1',
      eventType: 'charge.failed',
      status: 'failed',
      attemptNumber: 1,
    });
    const grouped = groupByEventType([...FIXTURE, extra]);
    expect(grouped.size).toBe(4);
    expect(grouped.has('charge.failed')).toBe(true);
  });
});

describe('calculateBreakdown – representative fixture (AC9)', () => {
  const result = calculateBreakdown(FIXTURE);

  it('produces a byEventType array with one entry per distinct event type', () => {
    expect(result.byEventType.length).toBe(3);
  });

  it('sorts event types alphabetically', () => {
    const types = result.byEventType.map((b) => b.eventType);
    expect(types).toEqual(['dispute.opened', 'payment.created', 'refund.issued']);
  });

  it('computes correct success rate for payment.created (2/3 ≈ 66.67%)', () => {
    const pc = result.byEventType.find((b) => b.eventType === 'payment.created')!;
    expect(pc.metrics.successRate).toBeCloseTo(66.67, 1);
    expect(pc.metrics.deliveredCount).toBe(2);
    expect(pc.metrics.totalWebhooks).toBe(3);
  });

  it('computes correct success rate for refund.issued (1/2 = 50%)', () => {
    const ri = result.byEventType.find((b) => b.eventType === 'refund.issued')!;
    expect(ri.metrics.successRate).toBeCloseTo(50, 1);
  });

  it('computes correct success rate for dispute.opened (1/1 = 100%)', () => {
    const dop = result.byEventType.find((b) => b.eventType === 'dispute.opened')!;
    expect(dop.metrics.successRate).toBeCloseTo(100, 1);
  });

  it('computes correct avgRetryCount for payment.created', () => {
    // pc-1: 1 attempt, pc-2: 2 attempts, pc-3: 1 attempt → avg = 4/3 ≈ 1.33
    const pc = result.byEventType.find((b) => b.eventType === 'payment.created')!;
    expect(pc.metrics.avgRetryCount).toBeCloseTo(4 / 3, 5);
  });

  it('computes correct avgRetryCount for refund.issued', () => {
    // ri-1: 1 attempt, ri-2: 2 attempts → avg = 3/2 = 1.5
    const ri = result.byEventType.find((b) => b.eventType === 'refund.issued')!;
    expect(ri.metrics.avgRetryCount).toBeCloseTo(1.5, 5);
  });

  it('computes time-to-delivery for payment.created', () => {
    // pc-1: TTD = 0 ms (delivered on attempt 1, same timestamp)
    // pc-2: TTD = 5 min = 300 000 ms
    // Sorted: [0, 300000] → median = 0 (nearest-rank p50 of 2 = index 0)
    const pc = result.byEventType.find((b) => b.eventType === 'payment.created')!;
    expect(pc.metrics.medianTTD).toBe(0);
    expect(pc.metrics.p95TTD).toBe(300_000);
  });

  it('computes time-to-delivery for dispute.opened (single delivered webhook)', () => {
    const dop = result.byEventType.find((b) => b.eventType === 'dispute.opened')!;
    expect(dop.metrics.medianTTD).toBe(0);
    expect(dop.metrics.p95TTD).toBe(0);
  });

  it('overall aggregate covers all 6 distinct webhooks', () => {
    expect(result.overall.totalWebhooks).toBe(6);
  });

  it('overall aggregate success rate is correct (4/6 ≈ 66.67%)', () => {
    // pc-1 delivered, pc-2 delivered, pc-3 failed, ri-1 delivered, ri-2 exhausted, do-1 delivered
    expect(result.overall.successRate).toBeCloseTo(66.67, 1);
    expect(result.overall.deliveredCount).toBe(4);
  });
});

// ── AC10: Edge cases ──────────────────────────────────────────────────────────

describe('calculateBreakdown – edge case: zero deliveries (empty list)', () => {
  it('returns NaN metrics and empty byEventType for an empty event list', () => {
    const result = calculateBreakdown([]);
    expect(result.byEventType).toHaveLength(0);
    expect(result.overall.totalWebhooks).toBe(0);
    expect(result.overall.deliveredCount).toBe(0);
    expect(Number.isNaN(result.overall.successRate)).toBe(true);
    expect(Number.isNaN(result.overall.avgRetryCount)).toBe(true);
    expect(Number.isNaN(result.overall.medianTTD)).toBe(true);
    expect(Number.isNaN(result.overall.p95TTD)).toBe(true);
  });
});

describe('calculateBreakdown – edge case: 100% failure', () => {
  const allFailed: DeliveryEvent[] = [
    makeEvent({ webhookId: 'f-1', eventType: 'payment.created', status: 'failed', attemptNumber: 1 }),
    makeEvent({ webhookId: 'f-2', eventType: 'payment.created', status: 'exhausted', attemptNumber: 1 }),
    makeEvent({ webhookId: 'f-3', eventType: 'refund.issued', status: 'failed', attemptNumber: 1 }),
  ];

  it('reports 0% success rate for each event type', () => {
    const result = calculateBreakdown(allFailed);
    for (const breakdown of result.byEventType) {
      expect(breakdown.metrics.successRate).toBe(0);
    }
  });

  it('reports 0% overall success rate', () => {
    const result = calculateBreakdown(allFailed);
    expect(result.overall.successRate).toBe(0);
  });

  it('reports NaN TTD when no webhook was delivered', () => {
    const result = calculateBreakdown(allFailed);
    expect(Number.isNaN(result.overall.medianTTD)).toBe(true);
    expect(Number.isNaN(result.overall.p95TTD)).toBe(true);
    for (const breakdown of result.byEventType) {
      expect(Number.isNaN(breakdown.metrics.medianTTD)).toBe(true);
      expect(Number.isNaN(breakdown.metrics.p95TTD)).toBe(true);
    }
  });

  it('still reports correct avgRetryCount when all failed', () => {
    const result = calculateBreakdown(allFailed);
    // All webhooks have exactly 1 attempt
    expect(result.overall.avgRetryCount).toBe(1);
  });
});

describe('calculateBreakdown – edge case: single attempt per event type', () => {
  const singleAttempts: DeliveryEvent[] = [
    makeEvent({
      webhookId: 'sa-1',
      eventType: 'payment.created',
      status: 'delivered',
      attemptNumber: 1,
      timestamp: '2024-06-01T10:00:00.000Z',
      httpStatus: 200,
    }),
    makeEvent({
      webhookId: 'sa-2',
      eventType: 'refund.issued',
      status: 'failed',
      attemptNumber: 1,
      timestamp: '2024-06-01T11:00:00.000Z',
    }),
  ];

  it('reports 100% success rate for the delivered type', () => {
    const result = calculateBreakdown(singleAttempts);
    const pc = result.byEventType.find((b) => b.eventType === 'payment.created')!;
    expect(pc.metrics.successRate).toBe(100);
  });

  it('reports 0% success rate for the failed type', () => {
    const result = calculateBreakdown(singleAttempts);
    const ri = result.byEventType.find((b) => b.eventType === 'refund.issued')!;
    expect(ri.metrics.successRate).toBe(0);
  });

  it('reports avgRetryCount of 1 for each type (single attempt)', () => {
    const result = calculateBreakdown(singleAttempts);
    for (const breakdown of result.byEventType) {
      expect(breakdown.metrics.avgRetryCount).toBe(1);
    }
  });

  it('reports TTD of 0 for the delivered type (same-timestamp delivery)', () => {
    const result = calculateBreakdown(singleAttempts);
    const pc = result.byEventType.find((b) => b.eventType === 'payment.created')!;
    expect(pc.metrics.medianTTD).toBe(0);
    expect(pc.metrics.p95TTD).toBe(0);
  });
});

// ── calculateMetricsForGroup standalone tests ─────────────────────────────────

describe('calculateMetricsForGroup', () => {
  it('handles a group with a single delivered webhook', () => {
    const events: DeliveryEvent[] = [
      makeEvent({
        webhookId: 'w1',
        eventType: 'payment.created',
        status: 'delivered',
        attemptNumber: 1,
        httpStatus: 200,
      }),
    ];
    const m = calculateMetricsForGroup(events);
    expect(m.successRate).toBe(100);
    expect(m.avgRetryCount).toBe(1);
    expect(m.totalWebhooks).toBe(1);
    expect(m.deliveredCount).toBe(1);
  });

  it('handles multiple attempts for the same webhookId correctly', () => {
    const events: DeliveryEvent[] = [
      makeEvent({ webhookId: 'w1', eventType: 'payment.created', status: 'failed', attemptNumber: 1, timestamp: '2024-01-01T00:00:00.000Z' }),
      makeEvent({ webhookId: 'w1', eventType: 'payment.created', status: 'failed', attemptNumber: 2, timestamp: '2024-01-01T00:01:00.000Z' }),
      makeEvent({ webhookId: 'w1', eventType: 'payment.created', status: 'delivered', attemptNumber: 3, timestamp: '2024-01-01T00:06:00.000Z', httpStatus: 200 }),
    ];
    const m = calculateMetricsForGroup(events);
    expect(m.totalWebhooks).toBe(1);
    expect(m.deliveredCount).toBe(1);
    expect(m.successRate).toBe(100);
    expect(m.avgRetryCount).toBe(3);
    // TTD: 6 minutes = 360 000 ms
    expect(m.medianTTD).toBe(360_000);
    expect(m.p95TTD).toBe(360_000);
  });

  it('returns NaN metrics for an empty event list', () => {
    const m = calculateMetricsForGroup([]);
    expect(m.totalWebhooks).toBe(0);
    expect(Number.isNaN(m.successRate)).toBe(true);
    expect(Number.isNaN(m.avgRetryCount)).toBe(true);
    expect(Number.isNaN(m.medianTTD)).toBe(true);
    expect(Number.isNaN(m.p95TTD)).toBe(true);
  });
});

// ── Simulator compatibility (AC7) ─────────────────────────────────────────────
// The simulator emits the same DeliveryEvent shape; verify calculateBreakdown
// works correctly with simulator-style data (multiple event types, retry flow).

describe('calculateBreakdown – simulator-style data (AC7)', () => {
  /** Simulate a full retry flow: initial attempt fails, retry delivers. */
  function simulatorWebhook(
    id: string,
    eventType: string,
    baseTs: number,
    retryDelayMs: number
  ): DeliveryEvent[] {
    return [
      {
        webhookId: id,
        eventType,
        status: 'failed',
        attemptNumber: 1,
        timestamp: new Date(baseTs).toISOString(),
        httpStatus: 500,
        responseExcerpt: 'Internal Server Error',
      },
      {
        webhookId: id,
        eventType,
        status: 'delivered',
        attemptNumber: 2,
        timestamp: new Date(baseTs + retryDelayMs).toISOString(),
        httpStatus: 200,
        responseExcerpt: 'OK',
      },
    ];
  }

  const simEvents: DeliveryEvent[] = [
    ...simulatorWebhook('sim-pc-1', 'payment.created', Date.parse('2024-03-01T00:00:00Z'), 60_000),
    ...simulatorWebhook('sim-pc-2', 'payment.created', Date.parse('2024-03-01T01:00:00Z'), 300_000),
    ...simulatorWebhook('sim-ri-1', 'refund.issued', Date.parse('2024-03-01T02:00:00Z'), 60_000),
  ];

  it('produces correct event-type breakdown for simulator data', () => {
    const result = calculateBreakdown(simEvents);
    expect(result.byEventType.length).toBe(2);
    const types = result.byEventType.map((b) => b.eventType);
    expect(types).toContain('payment.created');
    expect(types).toContain('refund.issued');
  });

  it('reports 100% success rate for all simulator webhooks (all delivered)', () => {
    const result = calculateBreakdown(simEvents);
    expect(result.overall.successRate).toBe(100);
    for (const b of result.byEventType) {
      expect(b.metrics.successRate).toBe(100);
    }
  });

  it('reports avgRetryCount of 2 for all simulator webhooks (1 fail + 1 deliver)', () => {
    const result = calculateBreakdown(simEvents);
    expect(result.overall.avgRetryCount).toBe(2);
  });

  it('computes correct TTD for payment.created simulator data', () => {
    const result = calculateBreakdown(simEvents);
    const pc = result.byEventType.find((b) => b.eventType === 'payment.created')!;
    // TTDs: [60000, 300000] → sorted → median = 60000 (nearest-rank p50 of 2 = index 0)
    expect(pc.metrics.medianTTD).toBe(60_000);
    expect(pc.metrics.p95TTD).toBe(300_000);
  });
});
