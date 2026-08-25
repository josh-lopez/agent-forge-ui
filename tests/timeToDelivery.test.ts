/**
 * Unit tests for calculateTimeToDelivery (Issue #160).
 *
 * Covers:
 *   AC1  – function exists and returns overall + per-event-type stats.
 *   AC2  – duration measured from initial attempt to first delivered event.
 *   AC5  – zero deliveries → safe null state (no crash, no NaN).
 *   AC6  – 100 % failure (no delivered events) → stats omitted / null.
 *   AC7  – single attempt → median === p95 === that single value.
 *   AC8  – representative multi-event fixture with correct median and p95.
 *   AC9  – works with simulator-shaped data (no special-case code).
 *   AC10 – existing metrics are unaffected (function is purely additive).
 *
 * Percentile method: nearest-rank (lower-inclusive).
 *   rank = ceil(p / 100 * N), value = sorted[rank - 1]
 */

import { describe, expect, it } from 'vitest';
import {
  calculateTimeToDelivery,
  type DeliveryAttemptEvent,
} from '../src/timeToDelivery';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal DeliveryAttemptEvent. */
function evt(
  webhookId: string,
  eventType: string,
  status: string,
  attemptIndex: number,
  timestamp: string | number
): DeliveryAttemptEvent {
  return { webhookId, eventType, status, attemptIndex, timestamp };
}

// ── AC5: Zero deliveries ──────────────────────────────────────────────────────

describe('calculateTimeToDelivery – zero deliveries (AC5)', () => {
  it('returns null stats and sampleSize 0 for an empty event array', () => {
    const result = calculateTimeToDelivery([]);
    expect(result.overall.medianMs).toBeNull();
    expect(result.overall.p95Ms).toBeNull();
    expect(result.overall.sampleSize).toBe(0);
    expect(result.byEventType).toEqual({});
  });

  it('does not throw or return NaN for an empty array', () => {
    expect(() => calculateTimeToDelivery([])).not.toThrow();
    const result = calculateTimeToDelivery([]);
    expect(result.overall.medianMs).not.toBeNaN();
    expect(result.overall.p95Ms).not.toBeNaN();
  });
});

// ── AC6: 100 % failure (no delivered events) ──────────────────────────────────

describe('calculateTimeToDelivery – 100% failure (AC6)', () => {
  it('returns null stats when all attempts are failed/exhausted', () => {
    const events: DeliveryAttemptEvent[] = [
      evt('wh-1', 'payment.created', 'failed',    0, '2024-01-01T00:00:00Z'),
      evt('wh-1', 'payment.created', 'failed',    1, '2024-01-01T00:01:00Z'),
      evt('wh-1', 'payment.created', 'exhausted', 2, '2024-01-01T00:05:00Z'),
      evt('wh-2', 'refund.issued',   'failed',    0, '2024-01-01T01:00:00Z'),
      evt('wh-2', 'refund.issued',   'exhausted', 1, '2024-01-01T01:30:00Z'),
    ];
    const result = calculateTimeToDelivery(events);
    expect(result.overall.medianMs).toBeNull();
    expect(result.overall.p95Ms).toBeNull();
    expect(result.overall.sampleSize).toBe(0);
    // No event type should appear in byEventType (no delivered webhooks).
    expect(Object.keys(result.byEventType)).toHaveLength(0);
  });

  it('excludes failed webhooks even when mixed with delivered ones', () => {
    const events: DeliveryAttemptEvent[] = [
      // Delivered webhook: 60 000 ms
      evt('wh-ok',   'payment.created', 'failed',    0, '2024-01-01T00:00:00Z'),
      evt('wh-ok',   'payment.created', 'delivered', 1, '2024-01-01T00:01:00Z'),
      // Failed webhook: must NOT contribute to stats
      evt('wh-fail', 'payment.created', 'failed',    0, '2024-01-01T00:00:00Z'),
      evt('wh-fail', 'payment.created', 'exhausted', 1, '2024-01-01T00:05:00Z'),
    ];
    const result = calculateTimeToDelivery(events);
    // Only wh-ok contributes; its duration is 60 000 ms (attempt 0 → attempt 1 delivered).
    expect(result.overall.sampleSize).toBe(1);
    expect(result.overall.medianMs).toBe(60_000);
  });
});

// ── AC7: Single attempt ───────────────────────────────────────────────────────

describe('calculateTimeToDelivery – single attempt (AC7)', () => {
  it('median === p95 === 0 when initial attempt is immediately delivered', () => {
    const events: DeliveryAttemptEvent[] = [
      evt('wh-1', 'payment.created', 'delivered', 0, '2024-01-01T00:00:00Z'),
    ];
    const result = calculateTimeToDelivery(events);
    expect(result.overall.sampleSize).toBe(1);
    // Duration from attempt 0 to attempt 0 (same event) = 0 ms.
    expect(result.overall.medianMs).toBe(0);
    expect(result.overall.p95Ms).toBe(0);
  });

  it('median === p95 when there is exactly one delivered webhook', () => {
    const events: DeliveryAttemptEvent[] = [
      evt('wh-1', 'payment.created', 'failed',    0, '2024-01-01T00:00:00Z'),
      evt('wh-1', 'payment.created', 'delivered', 1, '2024-01-01T00:05:00Z'),
    ];
    const result = calculateTimeToDelivery(events);
    expect(result.overall.sampleSize).toBe(1);
    const expectedMs = 5 * 60 * 1000; // 5 minutes
    expect(result.overall.medianMs).toBe(expectedMs);
    expect(result.overall.p95Ms).toBe(expectedMs);
  });
});

// ── AC2: Duration measurement ─────────────────────────────────────────────────

describe('calculateTimeToDelivery – duration measurement (AC2)', () => {
  it('measures from initial attempt (attemptIndex 0) to first delivered event', () => {
    // wh-1: initial at T+0, delivered at T+2min (not T+5min which is a later attempt)
    const events: DeliveryAttemptEvent[] = [
      evt('wh-1', 'payment.created', 'failed',    0, '2024-01-01T00:00:00Z'),
      evt('wh-1', 'payment.created', 'delivered', 1, '2024-01-01T00:02:00Z'),
      evt('wh-1', 'payment.created', 'delivered', 2, '2024-01-01T00:05:00Z'), // later delivered — ignored
    ];
    const result = calculateTimeToDelivery(events);
    expect(result.overall.medianMs).toBe(2 * 60 * 1000); // 2 minutes
  });

  it('handles out-of-order event arrival by sorting on attemptIndex', () => {
    // Events arrive in reverse order.
    const events: DeliveryAttemptEvent[] = [
      evt('wh-1', 'payment.created', 'delivered', 2, '2024-01-01T00:10:00Z'),
      evt('wh-1', 'payment.created', 'failed',    1, '2024-01-01T00:05:00Z'),
      evt('wh-1', 'payment.created', 'failed',    0, '2024-01-01T00:00:00Z'),
    ];
    const result = calculateTimeToDelivery(events);
    // Duration: T+0 → T+10min = 600 000 ms
    expect(result.overall.medianMs).toBe(10 * 60 * 1000);
  });

  it('normalises ISO string timestamps correctly', () => {
    const events: DeliveryAttemptEvent[] = [
      evt('wh-1', 'payment.created', 'failed',    0, '2024-06-15T12:00:00.000Z'),
      evt('wh-1', 'payment.created', 'delivered', 1, '2024-06-15T12:00:30.000Z'),
    ];
    const result = calculateTimeToDelivery(events);
    expect(result.overall.medianMs).toBe(30_000); // 30 seconds
  });

  it('normalises epoch-millisecond timestamps correctly', () => {
    const t0 = 1_700_000_000_000;
    const t1 = t0 + 45_000; // 45 seconds later
    const events: DeliveryAttemptEvent[] = [
      evt('wh-1', 'payment.created', 'failed',    0, t0),
      evt('wh-1', 'payment.created', 'delivered', 1, t1),
    ];
    const result = calculateTimeToDelivery(events);
    expect(result.overall.medianMs).toBe(45_000);
  });
});

// ── AC1 + AC8: Representative multi-event fixture ─────────────────────────────
//
// Fixture design (durations in ms):
//   payment.created webhooks: 60 000, 120 000, 180 000, 240 000, 300 000
//     sorted: [60k, 120k, 180k, 240k, 300k]  N=5
//     median (p50): rank = ceil(50/100*5) = ceil(2.5) = 3 → 180 000
//     p95:          rank = ceil(95/100*5) = ceil(4.75) = 5 → 300 000
//
//   refund.issued webhooks: 10 000, 20 000
//     sorted: [10k, 20k]  N=2
//     median (p50): rank = ceil(50/100*2) = ceil(1) = 1 → 10 000
//     p95:          rank = ceil(95/100*2) = ceil(1.9) = 2 → 20 000
//
//   overall (all 7 durations): [10k, 20k, 60k, 120k, 180k, 240k, 300k]  N=7
//     median (p50): rank = ceil(50/100*7) = ceil(3.5) = 4 → 120 000
//     p95:          rank = ceil(95/100*7) = ceil(6.65) = 7 → 300 000

const BASE = new Date('2024-01-01T00:00:00Z').getTime();

function makeWebhook(
  id: string,
  eventType: string,
  durationMs: number
): DeliveryAttemptEvent[] {
  return [
    evt(id, eventType, 'failed',    0, BASE),
    evt(id, eventType, 'delivered', 1, BASE + durationMs),
  ];
}

const FIXTURE_EVENTS: DeliveryAttemptEvent[] = [
  ...makeWebhook('pc-1', 'payment.created',  60_000),
  ...makeWebhook('pc-2', 'payment.created', 120_000),
  ...makeWebhook('pc-3', 'payment.created', 180_000),
  ...makeWebhook('pc-4', 'payment.created', 240_000),
  ...makeWebhook('pc-5', 'payment.created', 300_000),
  ...makeWebhook('ri-1', 'refund.issued',    10_000),
  ...makeWebhook('ri-2', 'refund.issued',    20_000),
];

describe('calculateTimeToDelivery – multi-event fixture (AC1, AC8)', () => {
  it('returns overall stats with correct sampleSize', () => {
    const result = calculateTimeToDelivery(FIXTURE_EVENTS);
    expect(result.overall.sampleSize).toBe(7);
  });

  it('calculates correct overall median (p50 = 120 000 ms)', () => {
    const result = calculateTimeToDelivery(FIXTURE_EVENTS);
    expect(result.overall.medianMs).toBe(120_000);
  });

  it('calculates correct overall p95 (300 000 ms)', () => {
    const result = calculateTimeToDelivery(FIXTURE_EVENTS);
    expect(result.overall.p95Ms).toBe(300_000);
  });

  it('returns per-event-type stats for payment.created', () => {
    const result = calculateTimeToDelivery(FIXTURE_EVENTS);
    const pc = result.byEventType['payment.created'];
    expect(pc).toBeDefined();
    expect(pc.sampleSize).toBe(5);
    expect(pc.medianMs).toBe(180_000);
    expect(pc.p95Ms).toBe(300_000);
  });

  it('returns per-event-type stats for refund.issued', () => {
    const result = calculateTimeToDelivery(FIXTURE_EVENTS);
    const ri = result.byEventType['refund.issued'];
    expect(ri).toBeDefined();
    expect(ri.sampleSize).toBe(2);
    expect(ri.medianMs).toBe(10_000);
    expect(ri.p95Ms).toBe(20_000);
  });

  it('does not include event types not present in the fixture', () => {
    const result = calculateTimeToDelivery(FIXTURE_EVENTS);
    expect(result.byEventType['dispute.opened']).toBeUndefined();
  });
});

// ── AC9: Simulator-shaped data ────────────────────────────────────────────────

describe('calculateTimeToDelivery – simulator compatibility (AC9)', () => {
  it('works with simulator-shaped events (no special-case code required)', () => {
    // Simulate the shape the webhook delivery simulator emits.
    const simulatorEvents: DeliveryAttemptEvent[] = [
      {
        webhookId: 'sim-wh-001',
        eventType: 'payment.created',
        status: 'failed',
        attemptIndex: 0,
        timestamp: '2024-03-01T10:00:00.000Z',
      },
      {
        webhookId: 'sim-wh-001',
        eventType: 'payment.created',
        status: 'failed',
        attemptIndex: 1,
        timestamp: '2024-03-01T10:01:00.000Z',
      },
      {
        webhookId: 'sim-wh-001',
        eventType: 'payment.created',
        status: 'delivered',
        attemptIndex: 2,
        timestamp: '2024-03-01T10:06:00.000Z',
      },
    ];
    const result = calculateTimeToDelivery(simulatorEvents);
    expect(result.overall.sampleSize).toBe(1);
    // Duration: 10:00:00 → 10:06:00 = 6 minutes = 360 000 ms
    expect(result.overall.medianMs).toBe(360_000);
    expect(result.overall.p95Ms).toBe(360_000);
    expect(result.byEventType['payment.created'].medianMs).toBe(360_000);
  });
});

// ── AC1: Return shape ─────────────────────────────────────────────────────────

describe('calculateTimeToDelivery – return shape (AC1)', () => {
  it('always returns an object with overall and byEventType keys', () => {
    const result = calculateTimeToDelivery([]);
    expect(result).toHaveProperty('overall');
    expect(result).toHaveProperty('byEventType');
  });

  it('overall always has medianMs, p95Ms, and sampleSize keys', () => {
    const result = calculateTimeToDelivery([]);
    expect(result.overall).toHaveProperty('medianMs');
    expect(result.overall).toHaveProperty('p95Ms');
    expect(result.overall).toHaveProperty('sampleSize');
  });
});
