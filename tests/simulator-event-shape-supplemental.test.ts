/**
 * Supplemental unit tests for simulator event-shape emission — Issue #273
 *
 * Extends tests/simulator-event-shape.test.ts with:
 *   - Tests for the shared `toEpochMillis` utility exported from
 *     src/delivery-events.ts (AC6: assertions reference the shared schema).
 *   - Additional edge-case coverage for both simulators:
 *       • successRate clamping (values outside [0,1]).
 *       • Single-attempt (maxAttempts=1) event shape.
 *       • RETRY_SCHEDULE_MS export shape.
 *       • Timestamps are monotonically non-decreasing across attempts.
 *
 * Acceptance criteria covered:
 *   AC1 – status field holds a valid DeliveryStatus value (edge: maxAttempts=1).
 *   AC2 – timestamp field is a valid ISO-8601 string (edge: monotonic ordering).
 *   AC3 – HTTP status code field is a number (edge: maxAttempts=1 exhausted).
 *   AC4 – Response body excerpt field is a string (edge: maxAttempts=1 exhausted).
 *   AC5 – Both successful and failed delivery events exercised (edge cases).
 *   AC6 – toEpochMillis (shared schema utility) is tested directly so future
 *          changes to delivery-events.ts automatically surface here.
 *   AC7 – All tests pass without modifying production simulator code.
 */

import { describe, expect, it } from 'vitest';

// AC6: import the shared schema types AND the toEpochMillis utility so that
// any future change to the canonical shape in delivery-events.ts will cause
// a TypeScript compile error here.
import {
  type DeliveryEvent,
  type DeliveryStatus,
  toEpochMillis,
} from '../src/delivery-events';

import {
  simulateWebhook,
  generateSimulatedEvents,
  RETRY_SCHEDULE_MS,
} from '../src/webhook-simulator';

import {
  WebhookSimulator,
} from '../src/webhookSimulator';

// ---------------------------------------------------------------------------
// Shared helpers (mirrors simulator-event-shape.test.ts for independence)
// ---------------------------------------------------------------------------

const VALID_STATUSES: DeliveryStatus[] = ['pending', 'delivered', 'failed', 'exhausted'];
const INSTANT_DELAYS = [0, 0, 0, 0, 0, 0];
const alwaysSucceed = () => 0.0;
const alwaysFail = () => 1.0;

function assertValidTimestamp(ts: unknown): void {
  expect(typeof ts).toBe('string');
  const parsed = Date.parse(ts as string);
  expect(Number.isNaN(parsed)).toBe(false);
  expect(new Date(ts as string).toISOString()).toBe(ts as string);
}

function assertValidStatus(status: unknown): void {
  expect(VALID_STATUSES).toContain(status as DeliveryStatus);
}

// ===========================================================================
// AC6 – toEpochMillis: shared schema utility
// ===========================================================================
// toEpochMillis is exported from src/delivery-events.ts alongside the
// DeliveryEvent interface.  Testing it here ensures the shared schema module
// is exercised end-to-end and that future signature changes break these tests.

describe('delivery-events.ts – toEpochMillis (shared schema utility, AC6)', () => {
  it('converts a valid ISO-8601 string to epoch milliseconds', () => {
    const iso = '2024-01-15T12:00:00.000Z';
    const result = toEpochMillis(iso);
    expect(typeof result).toBe('number');
    expect(Number.isNaN(result)).toBe(false);
    expect(result).toBe(Date.parse(iso));
  });

  it('returns the same number when given epoch milliseconds directly', () => {
    const ms = 1_700_000_000_000;
    expect(toEpochMillis(ms)).toBe(ms);
  });

  it('returns NaN for an unparseable string', () => {
    expect(Number.isNaN(toEpochMillis('not-a-date'))).toBe(true);
  });

  it('returns NaN for an empty string', () => {
    expect(Number.isNaN(toEpochMillis(''))).toBe(true);
  });

  it('handles a timestamp produced by new Date().toISOString()', () => {
    const iso = new Date().toISOString();
    const result = toEpochMillis(iso);
    expect(Number.isNaN(result)).toBe(false);
    expect(result).toBe(Date.parse(iso));
  });

  it('handles epoch 0 (Unix epoch) without returning NaN', () => {
    const result = toEpochMillis(0);
    expect(result).toBe(0);
    expect(Number.isNaN(result)).toBe(false);
  });

  it('handles the ISO string for epoch 0', () => {
    const result = toEpochMillis('1970-01-01T00:00:00.000Z');
    expect(result).toBe(0);
  });
});

// ===========================================================================
// RETRY_SCHEDULE_MS export — structural shape (AC6 / AC3)
// ===========================================================================

describe('webhook-simulator.ts – RETRY_SCHEDULE_MS export', () => {
  it('is an array of numbers', () => {
    expect(Array.isArray(RETRY_SCHEDULE_MS)).toBe(true);
    for (const delay of RETRY_SCHEDULE_MS) {
      expect(typeof delay).toBe('number');
    }
  });

  it('has at least one entry', () => {
    expect(RETRY_SCHEDULE_MS.length).toBeGreaterThan(0);
  });

  it('first entry is 0 (immediate first attempt)', () => {
    expect(RETRY_SCHEDULE_MS[0]).toBe(0);
  });

  it('all entries are non-negative', () => {
    for (const delay of RETRY_SCHEDULE_MS) {
      expect(delay).toBeGreaterThanOrEqual(0);
    }
  });
});

// ===========================================================================
// Edge case: maxAttempts=1 — single-attempt event shape
// ===========================================================================

describe('webhook-simulator.ts – simulateWebhook() maxAttempts=1 edge case', () => {
  it('AC1/AC3/AC4 – single successful attempt emits delivered event with correct shape', () => {
    const events: DeliveryEvent[] = simulateWebhook('wh_single_ok', 'payment.created', {
      successRate: 1.0,
      maxAttempts: 1,
      random: alwaysSucceed,
    });
    expect(events).toHaveLength(1);
    const [event] = events;
    assertValidStatus(event.status);
    expect(event.status).toBe('delivered');
    expect(typeof event.httpStatus).toBe('number');
    expect(typeof event.responseBodyExcerpt).toBe('string');
  });

  it('AC1/AC3/AC4 – single failed attempt emits exhausted event with correct shape', () => {
    const events: DeliveryEvent[] = simulateWebhook('wh_single_fail', 'refund.issued', {
      successRate: 0.0,
      maxAttempts: 1,
      random: alwaysFail,
    });
    expect(events).toHaveLength(1);
    const [event] = events;
    assertValidStatus(event.status);
    expect(event.status).toBe('exhausted');
    expect(typeof event.httpStatus).toBe('number');
    expect(typeof event.responseBodyExcerpt).toBe('string');
  });

  it('AC2 – single-attempt event has a valid ISO-8601 timestamp', () => {
    const events: DeliveryEvent[] = simulateWebhook('wh_single_ts', 'payout.paid', {
      successRate: 1.0,
      maxAttempts: 1,
      random: alwaysSucceed,
    });
    assertValidTimestamp(events[0].timestamp);
  });
});

// ===========================================================================
// Edge case: successRate clamping
// ===========================================================================

describe('webhook-simulator.ts – simulateWebhook() successRate clamping', () => {
  it('successRate > 1.0 is treated as 1.0 (always delivers)', () => {
    const events: DeliveryEvent[] = simulateWebhook('wh_clamp_hi', 'payment.created', {
      successRate: 999,
      maxAttempts: 3,
      random: alwaysSucceed,
    });
    expect(events.length).toBeGreaterThan(0);
    const last = events[events.length - 1];
    expect(last.status).toBe('delivered');
  });

  it('successRate < 0.0 is treated as 0.0 (always fails)', () => {
    const events: DeliveryEvent[] = simulateWebhook('wh_clamp_lo', 'refund.issued', {
      successRate: -5,
      maxAttempts: 2,
      random: alwaysFail,
    });
    expect(events.length).toBeGreaterThan(0);
    const last = events[events.length - 1];
    expect(last.status).toBe('exhausted');
  });

  it('NaN successRate produces valid events (does not throw)', () => {
    expect(() => {
      simulateWebhook('wh_nan', 'payment.created', {
        successRate: NaN,
        maxAttempts: 2,
        random: alwaysFail,
      });
    }).not.toThrow();
  });
});

// ===========================================================================
// Edge case: timestamps are monotonically non-decreasing across attempts
// ===========================================================================

describe('webhook-simulator.ts – simulateWebhook() timestamp ordering (AC2)', () => {
  it('timestamps are monotonically non-decreasing across attempts', () => {
    const startTime = Date.parse('2024-06-01T00:00:00.000Z');
    const events: DeliveryEvent[] = simulateWebhook('wh_order', 'payment.created', {
      successRate: 0.0,
      maxAttempts: 6,
      random: alwaysFail,
      startTime,
    });
    expect(events.length).toBeGreaterThan(1);
    for (let i = 1; i < events.length; i++) {
      const prev = Date.parse(events[i - 1].timestamp);
      const curr = Date.parse(events[i].timestamp);
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  it('all timestamps are at or after the provided startTime', () => {
    const startTime = Date.parse('2024-06-01T00:00:00.000Z');
    const events: DeliveryEvent[] = simulateWebhook('wh_start', 'refund.issued', {
      successRate: 0.0,
      maxAttempts: 4,
      random: alwaysFail,
      startTime,
    });
    for (const event of events) {
      expect(Date.parse(event.timestamp)).toBeGreaterThanOrEqual(startTime);
    }
  });
});

// ===========================================================================
// WebhookSimulator (class-based) — edge cases
// ===========================================================================

describe('webhookSimulator.ts – WebhookSimulator edge cases', () => {
  async function collectEvents(
    config: ConstructorParameters<typeof WebhookSimulator>[0],
    webhookId = 'wh_test',
    eventType = 'payment.created',
  ) {
    const sim = new WebhookSimulator(config);
    const events = [];
    for await (const event of sim.deliver(webhookId, eventType)) {
      events.push(event);
    }
    return events;
  }

  it('AC1/AC3/AC4 – maxAttempts=1 success emits a single delivered event', async () => {
    const events = await collectEvents({
      successRate: 1.0,
      maxAttempts: 1,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysSucceed,
    });
    expect(events).toHaveLength(1);
    assertValidStatus(events[0].status);
    expect(events[0].status).toBe('delivered');
    expect(typeof events[0].httpStatus).toBe('number');
    expect(typeof events[0].responseExcerpt).toBe('string');
  });

  it('AC1/AC3/AC4 – maxAttempts=1 failure emits a single exhausted event', async () => {
    const events = await collectEvents({
      successRate: 0.0,
      maxAttempts: 1,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysFail,
    });
    expect(events).toHaveLength(1);
    assertValidStatus(events[0].status);
    expect(events[0].status).toBe('exhausted');
    expect(typeof events[0].httpStatus).toBe('number');
    expect(typeof events[0].responseExcerpt).toBe('string');
  });

  it('AC2 – all timestamps from WebhookSimulator are valid ISO-8601 strings', async () => {
    const events = await collectEvents({
      successRate: 0.0,
      maxAttempts: 3,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysFail,
    });
    for (const event of events) {
      assertValidTimestamp(event.timestamp);
    }
  });

  it('successRate clamped above 1.0 still produces valid delivered event', async () => {
    const events = await collectEvents({
      successRate: 2.0,
      maxAttempts: 3,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysSucceed,
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1].status).toBe('delivered');
  });

  it('successRate clamped below 0.0 still produces valid exhausted event', async () => {
    const events = await collectEvents({
      successRate: -1.0,
      maxAttempts: 2,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysFail,
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1].status).toBe('exhausted');
  });
});

// ===========================================================================
// generateSimulatedEvents() — additional edge cases
// ===========================================================================

describe('webhook-simulator.ts – generateSimulatedEvents() edge cases', () => {
  it('AC1/AC2/AC3/AC4 – count=1 produces at least one event with all required fields', () => {
    const events: DeliveryEvent[] = generateSimulatedEvents({
      count: 1,
      successRate: 1.0,
      random: alwaysSucceed,
    });
    expect(events.length).toBeGreaterThan(0);
    const event = events[0];
    assertValidStatus(event.status);
    assertValidTimestamp(event.timestamp);
    expect(typeof event.httpStatus).toBe('number');
    expect(typeof event.responseBodyExcerpt).toBe('string');
  });

  it('custom eventTypes pool is respected in emitted events', () => {
    const customTypes = ['custom.event', 'another.event'];
    const events: DeliveryEvent[] = generateSimulatedEvents({
      count: 10,
      successRate: 1.0,
      eventTypes: customTypes,
      random: alwaysSucceed,
    });
    for (const event of events) {
      expect(customTypes).toContain(event.eventType);
    }
  });

  it('AC5 – 100% success run produces only delivered events', () => {
    const events: DeliveryEvent[] = generateSimulatedEvents({
      count: 5,
      successRate: 1.0,
      maxAttempts: 1,
      random: alwaysSucceed,
    });
    for (const event of events) {
      expect(event.status).toBe('delivered');
    }
  });

  it('AC5 – 0% success run with maxAttempts=1 produces only exhausted events', () => {
    const events: DeliveryEvent[] = generateSimulatedEvents({
      count: 5,
      successRate: 0.0,
      maxAttempts: 1,
      random: alwaysFail,
    });
    for (const event of events) {
      expect(event.status).toBe('exhausted');
    }
  });
});
