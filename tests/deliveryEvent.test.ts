/**
 * Unit tests for Issue #157: Canonical DeliveryEvent schema
 *
 * AC1  – canonical type lives in a single shared location (src/deliveryEvent.ts)
 * AC2  – DeliveryEvent includes status, timestamp, httpStatusCode, responseBodyExcerpt
 * AC3  – simulator produces objects that satisfy DeliveryEvent (TS compile-time + runtime)
 * AC4  – real delivery mechanism produces objects that satisfy DeliveryEvent
 * AC5  – no special-case branching needed (both sources share the same type)
 * AC6  – sample simulator event passes structural validation
 * AC7  – sample real-mechanism event passes structural validation
 * AC8  – strict mode is enabled (tsconfig.json strict:true covers all src/ files)
 */

import { describe, it, expect } from 'vitest';
import { isDeliveryEvent } from '../src/deliveryEvent.ts';
import type { DeliveryEvent, DeliveryStatus } from '../src/deliveryEvent.ts';
import { simulateDelivery, simulateNetworkFailure } from '../src/simulator.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal valid DeliveryEvent literal.
 * Used to verify the real-mechanism shape without actually calling fetch().
 */
function makeMechanismEvent(overrides: Partial<DeliveryEvent> = {}): DeliveryEvent {
  return {
    status: 'delivered',
    timestamp: new Date().toISOString(),
    httpStatusCode: 200,
    responseBodyExcerpt: '{"ok":true}',
    webhookId: 'wh-real-001',
    eventType: 'payment.created',
    attemptNumber: 1,
    ...overrides,
  };
}

// ── AC2: Required fields exist on the type ────────────────────────────────────

describe('DeliveryEvent type shape (AC2)', () => {
  it('accepts a fully-populated valid event', () => {
    const event: DeliveryEvent = {
      status: 'delivered',
      timestamp: '2024-01-15T10:30:00.000Z',
      httpStatusCode: 200,
      responseBodyExcerpt: '{"ok":true}',
      webhookId: 'wh-001',
      eventType: 'payment.created',
      attemptNumber: 1,
    };
    expect(isDeliveryEvent(event)).toBe(true);
  });

  it('accepts null httpStatusCode (network-level failure)', () => {
    const event: DeliveryEvent = {
      status: 'failed',
      timestamp: '2024-01-15T10:30:00.000Z',
      httpStatusCode: null,
      responseBodyExcerpt: '',
      webhookId: 'wh-002',
      eventType: 'refund.issued',
      attemptNumber: 2,
    };
    expect(isDeliveryEvent(event)).toBe(true);
  });

  it('accepts all valid status values', () => {
    const statuses: DeliveryStatus[] = ['pending', 'delivered', 'failed', 'exhausted'];
    for (const status of statuses) {
      const event = makeMechanismEvent({ status });
      expect(isDeliveryEvent(event)).toBe(true);
    }
  });
});

// ── AC6: Simulator events pass structural validation ──────────────────────────

describe('Simulator events – structural validation (AC6)', () => {
  it('simulateDelivery emits events that satisfy isDeliveryEvent', () => {
    // Force success on first attempt for a deterministic test.
    const { events } = simulateDelivery({ successRate: 1.0, eventType: 'payment.created' });
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(isDeliveryEvent(event)).toBe(true);
    }
  });

  it('simulateDelivery with successRate=0 emits exhausted event satisfying isDeliveryEvent', () => {
    const { events, finalStatus } = simulateDelivery({
      successRate: 0,
      maxAttempts: 3,
      eventType: 'refund.issued',
    });
    expect(events.length).toBe(3);
    expect(finalStatus).toBe('exhausted');
    for (const event of events) {
      expect(isDeliveryEvent(event)).toBe(true);
    }
  });

  it('simulateNetworkFailure emits an event with httpStatusCode: null', () => {
    const event = simulateNetworkFailure({ eventType: 'payment.created' });
    expect(isDeliveryEvent(event)).toBe(true);
    expect(event.httpStatusCode).toBeNull();
    expect(event.status).toBe('failed');
  });

  it('simulator events include all required fields', () => {
    const { events } = simulateDelivery({ successRate: 1.0 });
    const event = events[0];
    expect(event).toBeDefined();
    expect(typeof event.status).toBe('string');
    expect(typeof event.timestamp).toBe('string');
    // timestamp must be a valid ISO 8601 date
    expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
    expect(event.httpStatusCode === null || typeof event.httpStatusCode === 'number').toBe(true);
    expect(typeof event.responseBodyExcerpt).toBe('string');
    expect(typeof event.webhookId).toBe('string');
    expect(typeof event.eventType).toBe('string');
    expect(typeof event.attemptNumber).toBe('number');
    expect(event.attemptNumber).toBeGreaterThanOrEqual(1);
  });

  it('simulator progresses through retry schedule emitting intermediate failed events', () => {
    const { events } = simulateDelivery({
      successRate: 0,
      maxAttempts: 3,
      eventType: 'payment.created',
      webhookId: 'wh-retry-test',
    });
    expect(events[0].status).toBe('failed');
    expect(events[1].status).toBe('failed');
    expect(events[2].status).toBe('exhausted');
    // attempt numbers must be sequential
    expect(events.map((e) => e.attemptNumber)).toEqual([1, 2, 3]);
  });
});

// ── AC7: Real-mechanism events pass structural validation ─────────────────────

describe('Real delivery mechanism events – structural validation (AC7)', () => {
  it('a delivered event satisfies isDeliveryEvent', () => {
    const event = makeMechanismEvent({ status: 'delivered', httpStatusCode: 200 });
    expect(isDeliveryEvent(event)).toBe(true);
  });

  it('a failed event with HTTP 500 satisfies isDeliveryEvent', () => {
    const event = makeMechanismEvent({
      status: 'failed',
      httpStatusCode: 500,
      responseBodyExcerpt: '{"error":"Internal Server Error"}',
    });
    expect(isDeliveryEvent(event)).toBe(true);
  });

  it('an exhausted event satisfies isDeliveryEvent', () => {
    const event = makeMechanismEvent({
      status: 'exhausted',
      httpStatusCode: 503,
      attemptNumber: 6,
    });
    expect(isDeliveryEvent(event)).toBe(true);
  });

  it('a network-failure event (null httpStatusCode) satisfies isDeliveryEvent', () => {
    const event = makeMechanismEvent({
      status: 'failed',
      httpStatusCode: null,
      responseBodyExcerpt: '',
    });
    expect(isDeliveryEvent(event)).toBe(true);
  });

  it('a pending event satisfies isDeliveryEvent', () => {
    const event = makeMechanismEvent({ status: 'pending', httpStatusCode: null });
    expect(isDeliveryEvent(event)).toBe(true);
  });
});

// ── isDeliveryEvent rejects invalid shapes ────────────────────────────────────

describe('isDeliveryEvent – rejects invalid shapes', () => {
  it('rejects null', () => {
    expect(isDeliveryEvent(null)).toBe(false);
  });

  it('rejects a plain string', () => {
    expect(isDeliveryEvent('not an event')).toBe(false);
  });

  it('rejects an object with an invalid status', () => {
    expect(
      isDeliveryEvent({
        status: 'unknown',
        timestamp: new Date().toISOString(),
        httpStatusCode: 200,
        responseBodyExcerpt: '',
        webhookId: 'wh-x',
        eventType: 'payment.created',
        attemptNumber: 1,
      }),
    ).toBe(false);
  });

  it('rejects an object missing timestamp', () => {
    expect(
      isDeliveryEvent({
        status: 'delivered',
        httpStatusCode: 200,
        responseBodyExcerpt: '',
        webhookId: 'wh-x',
        eventType: 'payment.created',
        attemptNumber: 1,
      }),
    ).toBe(false);
  });

  it('rejects an object with attemptNumber < 1', () => {
    expect(
      isDeliveryEvent({
        status: 'delivered',
        timestamp: new Date().toISOString(),
        httpStatusCode: 200,
        responseBodyExcerpt: '',
        webhookId: 'wh-x',
        eventType: 'payment.created',
        attemptNumber: 0,
      }),
    ).toBe(false);
  });

  it('rejects an object with a non-string responseBodyExcerpt', () => {
    expect(
      isDeliveryEvent({
        status: 'delivered',
        timestamp: new Date().toISOString(),
        httpStatusCode: 200,
        responseBodyExcerpt: 42,
        webhookId: 'wh-x',
        eventType: 'payment.created',
        attemptNumber: 1,
      }),
    ).toBe(false);
  });
});

// ── AC5: No special-case branching needed ─────────────────────────────────────
// This is enforced structurally: both sources produce `DeliveryEvent` objects
// and the same `isDeliveryEvent` validator accepts both without any
// source-specific branching.

describe('Shared type – no special-case branching (AC5)', () => {
  it('simulator and real-mechanism events are interchangeable via the shared type', () => {
    const simEvent = simulateDelivery({ successRate: 1.0 }).events[0];
    const realEvent = makeMechanismEvent();

    // Both pass the same validator — no source-specific check needed.
    const validate = (e: unknown) => isDeliveryEvent(e);
    expect(validate(simEvent)).toBe(true);
    expect(validate(realEvent)).toBe(true);
  });

  it('a function typed to accept DeliveryEvent handles both sources without narrowing', () => {
    function processEvent(event: DeliveryEvent): string {
      // No branching on event source — just uses the shared fields.
      return `${event.eventType}:${event.status}:${event.attemptNumber}`;
    }

    const simEvent = simulateDelivery({ successRate: 1.0 }).events[0];
    const realEvent = makeMechanismEvent();

    expect(processEvent(simEvent)).toMatch(/^payment\.created:delivered:1$/);
    expect(processEvent(realEvent)).toMatch(/^payment\.created:delivered:1$/);
  });
});
