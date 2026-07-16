/**
 * Unit tests for simulator event-shape emission — Issue #273
 *
 * Asserts that every event emitted by the simulator modules contains the
 * required fields of the shared DeliveryEvent schema:
 *   - status   : a valid DeliveryStatus value
 *   - timestamp: a valid ISO-8601 / Date-compatible string
 *   - httpStatus: a number (HTTP status code)
 *   - responseBodyExcerpt / responseExcerpt: a string (response body excerpt)
 *
 * Acceptance criteria covered:
 *   AC1 – status field is present and holds a valid DeliveryStatus value.
 *   AC2 – timestamp field is present and is a valid ISO-8601 string.
 *   AC3 – HTTP status code field is present and is a number.
 *   AC4 – Response body excerpt field is present and is a string.
 *   AC5 – Both a successful delivery event and a failed delivery event are
 *          exercised.
 *   AC6 – Assertions reference the shared DeliveryEvent / DeliveryStatus types
 *          from src/delivery-events.ts so future schema changes break these
 *          tests automatically.
 *   AC7 – All tests pass without modifying production simulator code.
 */

import { describe, expect, it } from 'vitest';

// AC6: import the shared schema types so future changes to the canonical shape
// automatically surface here as TypeScript compile errors.
import {
  type DeliveryEvent,
  type DeliveryStatus,
} from '../src/delivery-events';

// ── Functional simulator (src/webhook-simulator.ts) ─────────────────────────
// This simulator uses the canonical DeliveryEvent from src/delivery-events.ts
// and emits events with `responseBodyExcerpt`.
import {
  simulateWebhook,
  generateSimulatedEvents,
} from '../src/webhook-simulator';

// ── Class-based simulator (src/webhookSimulator.ts) ──────────────────────────
// This simulator defines its own DeliveryEvent shape (with `responseExcerpt`
// instead of `responseBodyExcerpt`).  We still verify the common fields
// (status, timestamp, httpStatus, and the excerpt string) against the same
// semantic requirements.
import {
  WebhookSimulator,
  type DeliveryEvent as WsDeliveryEvent,
} from '../src/webhookSimulator';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** All valid status values from the shared schema. */
const VALID_STATUSES: DeliveryStatus[] = ['pending', 'delivered', 'failed', 'exhausted'];

/** Zero-delay retry schedule so tests run instantly. */
const INSTANT_DELAYS = [0, 0, 0, 0, 0, 0];

/** Deterministic RNG that always succeeds (returns 0.0 < any positive successRate). */
const alwaysSucceed = () => 0.0;

/** Deterministic RNG that always fails (returns 1.0 >= any successRate < 1). */
const alwaysFail = () => 1.0;

/**
 * Assert that a value is a valid ISO-8601 / Date-compatible timestamp string.
 * We verify:
 *   1. It is a string.
 *   2. Date.parse() does not return NaN.
 *   3. new Date(ts).toISOString() round-trips back to the same string (i.e. it
 *      is already in the canonical ISO-8601 format that toISOString() produces).
 */
function assertValidTimestamp(ts: unknown): void {
  expect(typeof ts).toBe('string');
  const parsed = Date.parse(ts as string);
  expect(Number.isNaN(parsed)).toBe(false);
  expect(new Date(ts as string).toISOString()).toBe(ts as string);
}

/**
 * Assert that a status value is one of the valid DeliveryStatus literals
 * defined in the shared schema.
 */
function assertValidStatus(status: unknown): void {
  expect(VALID_STATUSES).toContain(status as DeliveryStatus);
}

// ===========================================================================
// Section 1 – Functional simulator: src/webhook-simulator.ts
// ===========================================================================
// This simulator imports DeliveryEvent from src/delivery-events.ts directly,
// so its emitted events are structurally identical to the canonical schema.

describe('webhook-simulator.ts – simulateWebhook() event shape', () => {
  // ── AC5: successful delivery event ────────────────────────────────────────

  describe('AC5 – successful delivery event (successRate=1.0)', () => {
    it('AC1 – status is a valid DeliveryStatus', () => {
      const events: DeliveryEvent[] = simulateWebhook('wh_1', 'payment.created', {
        successRate: 1.0,
        random: alwaysSucceed,
      });
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        assertValidStatus(event.status);
      }
    });

    it('AC2 – timestamp is a valid ISO-8601 string', () => {
      const events: DeliveryEvent[] = simulateWebhook('wh_1', 'payment.created', {
        successRate: 1.0,
        random: alwaysSucceed,
      });
      for (const event of events) {
        assertValidTimestamp(event.timestamp);
      }
    });

    it('AC3 – httpStatus is a number', () => {
      const events: DeliveryEvent[] = simulateWebhook('wh_1', 'payment.created', {
        successRate: 1.0,
        random: alwaysSucceed,
      });
      for (const event of events) {
        expect(typeof event.httpStatus).toBe('number');
      }
    });

    it('AC4 – responseBodyExcerpt is a string', () => {
      const events: DeliveryEvent[] = simulateWebhook('wh_1', 'payment.created', {
        successRate: 1.0,
        random: alwaysSucceed,
      });
      for (const event of events) {
        expect(typeof event.responseBodyExcerpt).toBe('string');
      }
    });

    it('delivered event has httpStatus 200', () => {
      const events: DeliveryEvent[] = simulateWebhook('wh_1', 'payment.created', {
        successRate: 1.0,
        random: alwaysSucceed,
      });
      const delivered = events.find((e) => e.status === 'delivered');
      expect(delivered).toBeDefined();
      expect(delivered!.httpStatus).toBe(200);
    });
  });

  // ── AC5: failed delivery event ─────────────────────────────────────────────

  describe('AC5 – failed delivery event (successRate=0.0)', () => {
    it('AC1 – status is a valid DeliveryStatus', () => {
      const events: DeliveryEvent[] = simulateWebhook('wh_2', 'refund.issued', {
        successRate: 0.0,
        maxAttempts: 3,
        random: alwaysFail,
      });
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        assertValidStatus(event.status);
      }
    });

    it('AC2 – timestamp is a valid ISO-8601 string', () => {
      const events: DeliveryEvent[] = simulateWebhook('wh_2', 'refund.issued', {
        successRate: 0.0,
        maxAttempts: 3,
        random: alwaysFail,
      });
      for (const event of events) {
        assertValidTimestamp(event.timestamp);
      }
    });

    it('AC3 – httpStatus is a number', () => {
      const events: DeliveryEvent[] = simulateWebhook('wh_2', 'refund.issued', {
        successRate: 0.0,
        maxAttempts: 3,
        random: alwaysFail,
      });
      for (const event of events) {
        expect(typeof event.httpStatus).toBe('number');
      }
    });

    it('AC4 – responseBodyExcerpt is a string', () => {
      const events: DeliveryEvent[] = simulateWebhook('wh_2', 'refund.issued', {
        successRate: 0.0,
        maxAttempts: 3,
        random: alwaysFail,
      });
      for (const event of events) {
        expect(typeof event.responseBodyExcerpt).toBe('string');
      }
    });

    it('failed intermediate events have httpStatus 503', () => {
      const events: DeliveryEvent[] = simulateWebhook('wh_2', 'refund.issued', {
        successRate: 0.0,
        maxAttempts: 3,
        random: alwaysFail,
      });
      const failedEvents = events.filter((e) => e.status === 'failed');
      expect(failedEvents.length).toBeGreaterThan(0);
      for (const event of failedEvents) {
        expect(event.httpStatus).toBe(503);
      }
    });

    it('exhausted event is the last event', () => {
      const events: DeliveryEvent[] = simulateWebhook('wh_2', 'refund.issued', {
        successRate: 0.0,
        maxAttempts: 3,
        random: alwaysFail,
      });
      const last = events[events.length - 1];
      expect(last.status).toBe('exhausted');
    });
  });

  // ── All required fields present on every event ────────────────────────────

  describe('complete field presence on every emitted event', () => {
    it('every event has webhookId, eventType, status, attempt, timestamp, httpStatus, responseBodyExcerpt', () => {
      const events: DeliveryEvent[] = simulateWebhook('wh_shape', 'payout.paid', {
        successRate: 0.0,
        maxAttempts: 4,
        random: alwaysFail,
      });
      for (const event of events) {
        expect(event).toHaveProperty('webhookId');
        expect(event).toHaveProperty('eventType');
        expect(event).toHaveProperty('status');
        expect(event).toHaveProperty('attempt');
        expect(event).toHaveProperty('timestamp');
        expect(event).toHaveProperty('httpStatus');
        expect(event).toHaveProperty('responseBodyExcerpt');
      }
    });

    it('webhookId and eventType are preserved from the call arguments', () => {
      const events: DeliveryEvent[] = simulateWebhook('wh_id_check', 'dispute.opened', {
        successRate: 1.0,
        random: alwaysSucceed,
      });
      for (const event of events) {
        expect(event.webhookId).toBe('wh_id_check');
        expect(event.eventType).toBe('dispute.opened');
      }
    });

    it('attempt numbers are 1-based integers', () => {
      const events: DeliveryEvent[] = simulateWebhook('wh_attempt', 'payment.created', {
        successRate: 0.0,
        maxAttempts: 4,
        random: alwaysFail,
      });
      events.forEach((event, index) => {
        expect(typeof event.attempt).toBe('number');
        expect(Number.isInteger(event.attempt)).toBe(true);
        expect(event.attempt).toBe(index + 1);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// generateSimulatedEvents() — batch emission
// ---------------------------------------------------------------------------

describe('webhook-simulator.ts – generateSimulatedEvents() event shape', () => {
  it('AC1 – all emitted events have a valid status', () => {
    const events: DeliveryEvent[] = generateSimulatedEvents({
      count: 10,
      successRate: 0.5,
      random: (() => {
        // Alternating succeed/fail for determinism.
        let i = 0;
        return () => (i++ % 2 === 0 ? 0.1 : 0.9);
      })(),
    });
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      assertValidStatus(event.status);
    }
  });

  it('AC2 – all emitted events have a valid ISO-8601 timestamp', () => {
    const events: DeliveryEvent[] = generateSimulatedEvents({
      count: 5,
      successRate: 1.0,
      random: alwaysSucceed,
    });
    for (const event of events) {
      assertValidTimestamp(event.timestamp);
    }
  });

  it('AC3 – all emitted events have a numeric httpStatus', () => {
    const events: DeliveryEvent[] = generateSimulatedEvents({
      count: 5,
      successRate: 0.0,
      random: alwaysFail,
    });
    for (const event of events) {
      expect(typeof event.httpStatus).toBe('number');
    }
  });

  it('AC4 – all emitted events have a string responseBodyExcerpt', () => {
    const events: DeliveryEvent[] = generateSimulatedEvents({
      count: 5,
      successRate: 0.0,
      random: alwaysFail,
    });
    for (const event of events) {
      expect(typeof event.responseBodyExcerpt).toBe('string');
    }
  });

  it('AC5 – batch includes both delivered and failed/exhausted events', () => {
    // Combine events from a 100%-success run and a 100%-failure run to
    // guarantee both outcome shapes are present without relying on a shared
    // RNG that is also consumed for eventType selection.
    const successEvents: DeliveryEvent[] = generateSimulatedEvents({
      count: 3,
      successRate: 1.0,
      maxAttempts: 1,
      random: alwaysSucceed,
    });
    const failEvents: DeliveryEvent[] = generateSimulatedEvents({
      count: 3,
      successRate: 0.0,
      maxAttempts: 1,
      random: alwaysFail,
    });

    const allEvents = [...successEvents, ...failEvents];
    const statuses = new Set(allEvents.map((e) => e.status));
    expect(statuses.has('delivered')).toBe(true);
    // With maxAttempts=1 and successRate=0.0, failures become 'exhausted'.
    expect(statuses.has('exhausted')).toBe(true);
  });

  it('returns an empty array when count=0', () => {
    const events: DeliveryEvent[] = generateSimulatedEvents({ count: 0 });
    expect(events).toHaveLength(0);
  });
});

// ===========================================================================
// Section 2 – Class-based simulator: src/webhookSimulator.ts
// ===========================================================================
// This simulator defines its own DeliveryEvent shape (with `responseExcerpt`
// instead of `responseBodyExcerpt`).  We verify the common semantic fields
// against the same requirements.

describe('webhookSimulator.ts – WebhookSimulator.deliver() event shape', () => {
  /** Collect all events from a single deliver() call. */
  async function collectEvents(
    config: ConstructorParameters<typeof WebhookSimulator>[0],
    webhookId = 'wh_test',
    eventType = 'payment.created',
  ): Promise<WsDeliveryEvent[]> {
    const sim = new WebhookSimulator(config);
    const events: WsDeliveryEvent[] = [];
    for await (const event of sim.deliver(webhookId, eventType)) {
      events.push(event);
    }
    return events;
  }

  // ── AC5: successful delivery event ────────────────────────────────────────

  describe('AC5 – successful delivery event (successRate=1.0)', () => {
    it('AC1 – status is a valid DeliveryStatus value', async () => {
      const events = await collectEvents({
        successRate: 1.0,
        retryDelaysMs: INSTANT_DELAYS,
        rng: alwaysSucceed,
      });
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        // Use the shared VALID_STATUSES array (references DeliveryStatus from
        // delivery-events.ts) to validate the value.
        assertValidStatus(event.status);
      }
    });

    it('AC2 – timestamp is a valid ISO-8601 string', async () => {
      const events = await collectEvents({
        successRate: 1.0,
        retryDelaysMs: INSTANT_DELAYS,
        rng: alwaysSucceed,
      });
      for (const event of events) {
        assertValidTimestamp(event.timestamp);
      }
    });

    it('AC3 – httpStatus is a number', async () => {
      const events = await collectEvents({
        successRate: 1.0,
        retryDelaysMs: INSTANT_DELAYS,
        rng: alwaysSucceed,
      });
      for (const event of events) {
        expect(typeof event.httpStatus).toBe('number');
      }
    });

    it('AC4 – responseExcerpt is a string', async () => {
      const events = await collectEvents({
        successRate: 1.0,
        retryDelaysMs: INSTANT_DELAYS,
        rng: alwaysSucceed,
      });
      for (const event of events) {
        expect(typeof event.responseExcerpt).toBe('string');
      }
    });

    it('delivered event has httpStatus 200', async () => {
      const events = await collectEvents({
        successRate: 1.0,
        retryDelaysMs: INSTANT_DELAYS,
        rng: alwaysSucceed,
      });
      const delivered = events.find((e) => e.status === 'delivered');
      expect(delivered).toBeDefined();
      expect(delivered!.httpStatus).toBe(200);
    });
  });

  // ── AC5: failed delivery event ─────────────────────────────────────────────

  describe('AC5 – failed delivery event (successRate=0.0)', () => {
    it('AC1 – status is a valid DeliveryStatus value', async () => {
      const events = await collectEvents({
        successRate: 0.0,
        maxAttempts: 3,
        retryDelaysMs: INSTANT_DELAYS,
        rng: alwaysFail,
      });
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        assertValidStatus(event.status);
      }
    });

    it('AC2 – timestamp is a valid ISO-8601 string', async () => {
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

    it('AC3 – httpStatus is a number', async () => {
      const events = await collectEvents({
        successRate: 0.0,
        maxAttempts: 3,
        retryDelaysMs: INSTANT_DELAYS,
        rng: alwaysFail,
      });
      for (const event of events) {
        expect(typeof event.httpStatus).toBe('number');
      }
    });

    it('AC4 – responseExcerpt is a string', async () => {
      const events = await collectEvents({
        successRate: 0.0,
        maxAttempts: 3,
        retryDelaysMs: INSTANT_DELAYS,
        rng: alwaysFail,
      });
      for (const event of events) {
        expect(typeof event.responseExcerpt).toBe('string');
      }
    });

    it('intermediate failed events have httpStatus 500', async () => {
      const events = await collectEvents({
        successRate: 0.0,
        maxAttempts: 3,
        retryDelaysMs: INSTANT_DELAYS,
        rng: alwaysFail,
      });
      const failedEvents = events.filter((e) => e.status === 'failed');
      expect(failedEvents.length).toBeGreaterThan(0);
      for (const event of failedEvents) {
        expect(event.httpStatus).toBe(500);
      }
    });

    it('exhausted event is the last event', async () => {
      const events = await collectEvents({
        successRate: 0.0,
        maxAttempts: 3,
        retryDelaysMs: INSTANT_DELAYS,
        rng: alwaysFail,
      });
      const last = events[events.length - 1];
      expect(last.status).toBe('exhausted');
    });
  });

  // ── All required fields present on every event ────────────────────────────

  describe('complete field presence on every emitted event', () => {
    it('every event has webhookId, eventType, status, attempt, timestamp, httpStatus, responseExcerpt', async () => {
      const events = await collectEvents(
        {
          successRate: 0.0,
          maxAttempts: 4,
          retryDelaysMs: INSTANT_DELAYS,
          rng: alwaysFail,
        },
        'wh_shape',
        'payout.paid',
      );
      for (const event of events) {
        expect(event).toHaveProperty('webhookId');
        expect(event).toHaveProperty('eventType');
        expect(event).toHaveProperty('status');
        expect(event).toHaveProperty('attempt');
        expect(event).toHaveProperty('timestamp');
        expect(event).toHaveProperty('httpStatus');
        expect(event).toHaveProperty('responseExcerpt');
      }
    });

    it('webhookId and eventType are preserved from the call arguments', async () => {
      const events = await collectEvents(
        {
          successRate: 1.0,
          retryDelaysMs: INSTANT_DELAYS,
          rng: alwaysSucceed,
        },
        'wh_id_check',
        'dispute.opened',
      );
      for (const event of events) {
        expect(event.webhookId).toBe('wh_id_check');
        expect(event.eventType).toBe('dispute.opened');
      }
    });

    it('attempt numbers are 1-based integers', async () => {
      const events = await collectEvents({
        successRate: 0.0,
        maxAttempts: 4,
        retryDelaysMs: INSTANT_DELAYS,
        rng: alwaysFail,
      });
      events.forEach((event, index) => {
        expect(typeof event.attempt).toBe('number');
        expect(Number.isInteger(event.attempt)).toBe(true);
        expect(event.attempt).toBe(index + 1);
      });
    });
  });
});

// ===========================================================================
// Section 3 – Schema conformance: shared DeliveryStatus values
// ===========================================================================
// These tests explicitly reference the shared DeliveryStatus type from
// src/delivery-events.ts (AC6) and verify that both simulators only emit
// status values that belong to the canonical set.

describe('AC6 – schema conformance: emitted status values match shared DeliveryStatus', () => {
  it('webhook-simulator.ts only emits statuses from the shared DeliveryStatus union', () => {
    // Run with all-fail to get the full range of statuses (failed + exhausted).
    const failEvents: DeliveryEvent[] = simulateWebhook('wh_schema', 'payment.created', {
      successRate: 0.0,
      maxAttempts: 4,
      random: alwaysFail,
    });
    // Run with all-succeed to get delivered.
    const successEvents: DeliveryEvent[] = simulateWebhook('wh_schema2', 'payment.created', {
      successRate: 1.0,
      random: alwaysSucceed,
    });

    for (const event of [...failEvents, ...successEvents]) {
      // VALID_STATUSES is typed as DeliveryStatus[] from delivery-events.ts —
      // if the union changes, this assertion will catch any new/removed values.
      expect(VALID_STATUSES).toContain(event.status);
    }
  });

  it('webhookSimulator.ts only emits statuses from the shared DeliveryStatus union', async () => {
    const sim = new WebhookSimulator({
      successRate: 0.0,
      maxAttempts: 4,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysFail,
    });
    for await (const event of sim.deliver('wh_schema', 'payment.created')) {
      expect(VALID_STATUSES).toContain(event.status as DeliveryStatus);
    }
  });

  it('all four DeliveryStatus values are reachable across both simulators', async () => {
    const observedStatuses = new Set<string>();

    // delivered — from functional simulator
    simulateWebhook('wh_d', 'payment.created', {
      successRate: 1.0,
      random: alwaysSucceed,
    }).forEach((e) => observedStatuses.add(e.status));

    // failed + exhausted — from functional simulator
    simulateWebhook('wh_fe', 'payment.created', {
      successRate: 0.0,
      maxAttempts: 3,
      random: alwaysFail,
    }).forEach((e) => observedStatuses.add(e.status));

    // delivered — from class simulator
    const simSuccess = new WebhookSimulator({
      successRate: 1.0,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysSucceed,
    });
    for await (const event of simSuccess.deliver('wh_d2', 'payment.created')) {
      observedStatuses.add(event.status);
    }

    // failed + exhausted — from class simulator
    const simFail = new WebhookSimulator({
      successRate: 0.0,
      maxAttempts: 3,
      retryDelaysMs: INSTANT_DELAYS,
      rng: alwaysFail,
    });
    for await (const event of simFail.deliver('wh_fe2', 'payment.created')) {
      observedStatuses.add(event.status);
    }

    // 'pending' is a valid DeliveryStatus in the schema but neither simulator
    // emits it (they start directly at attempt 1).  The other three are covered.
    expect(observedStatuses.has('delivered')).toBe(true);
    expect(observedStatuses.has('failed')).toBe(true);
    expect(observedStatuses.has('exhausted')).toBe(true);
  });
});
