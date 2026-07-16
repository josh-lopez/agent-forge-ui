/**
 * Issue #110 — Payment event schema: integration / cross-cutting tests.
 *
 * This file provides additional test coverage verifying that:
 *
 *   AC1  – The base event shape fields are correctly typed and validated.
 *   AC2  – All five concrete event types are fully defined with correct
 *           discriminated `eventType` literals and typed payloads.
 *   AC3  – All exported symbols are importable from the schema module without
 *           re-declaration (simulates what other src/ modules would do).
 *   AC5  – Sample objects for each event type satisfy the schema at runtime.
 *   AC6  – Negative cases: objects missing required fields fail validation.
 *   AC7  – The schema module is entirely synchronous with no backend dependency.
 *
 * These tests complement the existing coverage in:
 *   - tests/paymentEventSchema.test.ts          (developer-authored, 12 tests)
 *   - tests/test_issue110_payment_event_schema.test.ts  (50 tests)
 *   - tests/test_issue110_schema_edge_cases.test.ts     (33 tests)
 */

import { describe, expect, it } from 'vitest';

// AC3: Import every exported symbol from the schema module — this is the same
// import pattern any other src/ module would use.
import {
  assertPaymentEvent,
  isIso8601,
  isPaymentEvent,
  isPaymentEventType,
  isUuid,
  PAYMENT_EVENT_TYPES,
  type BasePaymentEvent,
  type PaymentAuthorisedEvent,
  type PaymentAuthorisedPayload,
  type PaymentCapturedEvent,
  type PaymentCapturedPayload,
  type PaymentEvent,
  type PaymentEventType,
  type PaymentFailedEvent,
  type PaymentFailedPayload,
  type PaymentInitiatedEvent,
  type PaymentInitiatedPayload,
  type PaymentRefundedEvent,
  type PaymentRefundedPayload,
} from '../src/events/paymentEventSchema';

// ── Typed fixtures (AC2 + AC5 type-level check) ───────────────────────────────
// Annotating each fixture with its concrete type means TypeScript validates the
// shape at compile time — if any field is missing or wrong-typed, tsc fails.

const initiated: PaymentInitiatedEvent = {
  eventId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  paymentId: 'pay-int-001',
  eventType: 'PaymentInitiated',
  occurredAt: '2026-07-01T10:00:00.000Z',
  payload: {
    amountMinor: 9999,
    currency: 'USD',
    customerId: 'cust-int-001',
  } satisfies PaymentInitiatedPayload,
};

const authorised: PaymentAuthorisedEvent = {
  eventId: '550e8400-e29b-41d4-a716-446655440000',
  paymentId: 'pay-int-001',
  eventType: 'PaymentAuthorised',
  occurredAt: '2026-07-01T10:00:01.000Z',
  payload: {
    authorisationId: 'auth-int-001',
    amountMinor: 9999,
    currency: 'USD',
  } satisfies PaymentAuthorisedPayload,
};

const captured: PaymentCapturedEvent = {
  eventId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  paymentId: 'pay-int-001',
  eventType: 'PaymentCaptured',
  occurredAt: '2026-07-01T10:00:02.000Z',
  payload: {
    authorisationId: 'auth-int-001',
    amountMinor: 9999,
    currency: 'USD',
  } satisfies PaymentCapturedPayload,
};

const failed: PaymentFailedEvent = {
  eventId: '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
  paymentId: 'pay-int-002',
  eventType: 'PaymentFailed',
  occurredAt: '2026-07-01T10:00:03.000Z',
  payload: {
    reasonCode: 'card_expired',
    reason: 'The card has expired.',
  } satisfies PaymentFailedPayload,
};

const refunded: PaymentRefundedEvent = {
  eventId: '6ba7b812-9dad-11d1-80b4-00c04fd430c8',
  paymentId: 'pay-int-001',
  eventType: 'PaymentRefunded',
  occurredAt: '2026-07-01T10:00:04.000Z',
  payload: {
    refundId: 'ref-int-001',
    amountMinor: 4999,
    currency: 'USD',
  } satisfies PaymentRefundedPayload,
};

const allFive: PaymentEvent[] = [initiated, authorised, captured, failed, refunded];

// ── AC1: Base event shape ─────────────────────────────────────────────────────

describe('AC1 – base event shape fields are present and correctly typed', () => {
  it('PAYMENT_EVENT_TYPES contains exactly the five required literals', () => {
    const required: PaymentEventType[] = [
      'PaymentInitiated',
      'PaymentAuthorised',
      'PaymentCaptured',
      'PaymentFailed',
      'PaymentRefunded',
    ];
    expect([...PAYMENT_EVENT_TYPES].sort()).toEqual([...required].sort());
    expect(PAYMENT_EVENT_TYPES).toHaveLength(5);
  });

  it('every sample event carries all five required base fields', () => {
    for (const event of allFive) {
      expect(event).toHaveProperty('eventId');
      expect(event).toHaveProperty('paymentId');
      expect(event).toHaveProperty('eventType');
      expect(event).toHaveProperty('occurredAt');
      expect(event).toHaveProperty('payload');
    }
  });

  it('eventId on every sample passes UUID validation', () => {
    for (const event of allFive) {
      expect(isUuid(event.eventId)).toBe(true);
    }
  });

  it('occurredAt on every sample passes ISO-8601 validation', () => {
    for (const event of allFive) {
      expect(isIso8601(event.occurredAt)).toBe(true);
    }
  });

  it('payload on every sample is a non-null, non-array plain object', () => {
    for (const event of allFive) {
      expect(typeof event.payload).toBe('object');
      expect(event.payload).not.toBeNull();
      expect(Array.isArray(event.payload)).toBe(false);
    }
  });

  it('isPaymentEventType accepts all five recognised literals', () => {
    for (const t of PAYMENT_EVENT_TYPES) {
      expect(isPaymentEventType(t)).toBe(true);
    }
  });

  it('isPaymentEventType rejects unknown strings and non-strings', () => {
    expect(isPaymentEventType('PaymentVoided')).toBe(false);
    expect(isPaymentEventType('')).toBe(false);
    expect(isPaymentEventType(null)).toBe(false);
    expect(isPaymentEventType(undefined)).toBe(false);
  });
});

// ── AC2: Concrete event types ─────────────────────────────────────────────────

describe('AC2 – concrete event types have correct discriminated literals and payloads', () => {
  it('PaymentInitiated: eventType literal and payload fields', () => {
    expect(initiated.eventType).toBe('PaymentInitiated');
    expect(initiated.payload.amountMinor).toBe(9999);
    expect(initiated.payload.currency).toBe('USD');
    expect(initiated.payload.customerId).toBe('cust-int-001');
  });

  it('PaymentAuthorised: eventType literal and payload fields', () => {
    expect(authorised.eventType).toBe('PaymentAuthorised');
    expect(authorised.payload.authorisationId).toBe('auth-int-001');
    expect(authorised.payload.amountMinor).toBe(9999);
    expect(authorised.payload.currency).toBe('USD');
  });

  it('PaymentCaptured: eventType literal and payload fields', () => {
    expect(captured.eventType).toBe('PaymentCaptured');
    expect(captured.payload.authorisationId).toBe('auth-int-001');
    expect(captured.payload.amountMinor).toBe(9999);
    expect(captured.payload.currency).toBe('USD');
  });

  it('PaymentFailed: eventType literal and payload fields', () => {
    expect(failed.eventType).toBe('PaymentFailed');
    expect(failed.payload.reasonCode).toBe('card_expired');
    expect(typeof failed.payload.reason).toBe('string');
    expect(failed.payload.reason.length).toBeGreaterThan(0);
  });

  it('PaymentRefunded: eventType literal and payload fields', () => {
    expect(refunded.eventType).toBe('PaymentRefunded');
    expect(refunded.payload.refundId).toBe('ref-int-001');
    expect(refunded.payload.amountMinor).toBe(4999);
    expect(refunded.payload.currency).toBe('USD');
  });

  it('all five event types are represented in the samples array', () => {
    const types = allFive.map((e) => e.eventType).sort();
    expect(types).toEqual([...PAYMENT_EVENT_TYPES].sort());
  });

  it('BasePaymentEvent generic is usable with custom type parameters (compile-time check)', () => {
    // If BasePaymentEvent is not exported or its generics are broken, tsc fails here.
    const custom: BasePaymentEvent<'PaymentInitiated', { total: number }> = {
      eventId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      paymentId: 'pay-custom',
      eventType: 'PaymentInitiated',
      occurredAt: '2026-07-01T10:00:00.000Z',
      payload: { total: 42 },
    };
    expect(custom.eventType).toBe('PaymentInitiated');
    expect(custom.payload.total).toBe(42);
  });
});

// ── AC3: Exports are importable ───────────────────────────────────────────────

describe('AC3 – all schema exports are importable without re-declaration', () => {
  it('PAYMENT_EVENT_TYPES is a non-empty readonly array', () => {
    expect(Array.isArray(PAYMENT_EVENT_TYPES)).toBe(true);
    expect(PAYMENT_EVENT_TYPES.length).toBeGreaterThan(0);
  });

  it('isPaymentEvent is a callable function', () => {
    expect(typeof isPaymentEvent).toBe('function');
  });

  it('assertPaymentEvent is a callable function', () => {
    expect(typeof assertPaymentEvent).toBe('function');
  });

  it('isUuid is a callable function', () => {
    expect(typeof isUuid).toBe('function');
  });

  it('isIso8601 is a callable function', () => {
    expect(typeof isIso8601).toBe('function');
  });

  it('isPaymentEventType is a callable function', () => {
    expect(typeof isPaymentEventType).toBe('function');
  });
});

// ── AC5: Runtime validation accepts all five event types ──────────────────────

describe('AC5 – runtime validation accepts all five event types', () => {
  it.each(allFive.map((s) => [s.eventType, s] as const))(
    'isPaymentEvent returns true for a valid %s event',
    (_label, event) => {
      expect(isPaymentEvent(event)).toBe(true);
    },
  );

  it.each(allFive.map((s) => [s.eventType, s] as const))(
    'assertPaymentEvent does not throw for a valid %s event',
    (_label, event) => {
      expect(() => assertPaymentEvent(event)).not.toThrow();
    },
  );
});

// ── AC6: Negative cases ───────────────────────────────────────────────────────

describe('AC6 – negative cases: objects missing required fields fail validation', () => {
  it('rejects an object missing eventId (primary negative case)', () => {
    const { eventId: _omit, ...noEventId } = initiated;
    expect(isPaymentEvent(noEventId)).toBe(false);
    expect(() => assertPaymentEvent(noEventId)).toThrow(TypeError);
  });

  it('rejects an object missing paymentId', () => {
    const { paymentId: _omit, ...noPaymentId } = initiated;
    expect(isPaymentEvent(noPaymentId)).toBe(false);
  });

  it('rejects an object missing eventType', () => {
    const { eventType: _omit, ...noEventType } = initiated;
    expect(isPaymentEvent(noEventType)).toBe(false);
  });

  it('rejects an object missing occurredAt', () => {
    const { occurredAt: _omit, ...noOccurredAt } = initiated;
    expect(isPaymentEvent(noOccurredAt)).toBe(false);
  });

  it('rejects an object missing payload', () => {
    const { payload: _omit, ...noPayload } = initiated;
    expect(isPaymentEvent(noPayload)).toBe(false);
  });

  it('rejects eventId that is not a valid UUID', () => {
    expect(isPaymentEvent({ ...initiated, eventId: 'not-a-uuid' })).toBe(false);
    expect(isPaymentEvent({ ...initiated, eventId: '' })).toBe(false);
    expect(isPaymentEvent({ ...initiated, eventId: 123 })).toBe(false);
  });

  it('rejects an empty paymentId string', () => {
    expect(isPaymentEvent({ ...initiated, paymentId: '' })).toBe(false);
  });

  it('rejects an unrecognised eventType literal', () => {
    expect(isPaymentEvent({ ...initiated, eventType: 'PaymentVoided' })).toBe(false);
    expect(isPaymentEvent({ ...initiated, eventType: '' })).toBe(false);
  });

  it('rejects occurredAt that is not ISO-8601', () => {
    expect(isPaymentEvent({ ...initiated, occurredAt: '2026/07/01' })).toBe(false);
    expect(isPaymentEvent({ ...initiated, occurredAt: 'yesterday' })).toBe(false);
  });

  it('rejects payload that is not a plain object', () => {
    expect(isPaymentEvent({ ...initiated, payload: null })).toBe(false);
    expect(isPaymentEvent({ ...initiated, payload: [] })).toBe(false);
    expect(isPaymentEvent({ ...initiated, payload: 'string' })).toBe(false);
  });

  it('rejects null, undefined, and primitive values', () => {
    expect(isPaymentEvent(null)).toBe(false);
    expect(isPaymentEvent(undefined)).toBe(false);
    expect(isPaymentEvent(42)).toBe(false);
    expect(isPaymentEvent('PaymentInitiated')).toBe(false);
  });

  it('assertPaymentEvent throws TypeError with a message mentioning PaymentEvent', () => {
    let message = '';
    try {
      assertPaymentEvent({ invalid: true });
    } catch (e) {
      if (e instanceof TypeError) message = e.message;
    }
    expect(message).toMatch(/PaymentEvent/i);
  });
});

// ── AC7: No backend dependency ────────────────────────────────────────────────

describe('AC7 – schema is entirely client-side / build-time (no backend dependency)', () => {
  it('PAYMENT_EVENT_TYPES is available synchronously (not a Promise)', () => {
    expect(PAYMENT_EVENT_TYPES).toBeDefined();
    expect(PAYMENT_EVENT_TYPES).not.toBeInstanceOf(Promise);
    expect(Array.isArray(PAYMENT_EVENT_TYPES)).toBe(true);
  });

  it('isPaymentEvent returns a boolean synchronously (not a Promise)', () => {
    const result = isPaymentEvent(initiated);
    expect(typeof result).toBe('boolean');
    expect(result).not.toBeInstanceOf(Promise);
  });

  it('assertPaymentEvent throws synchronously (not a rejected Promise)', () => {
    let threw = false;
    try {
      assertPaymentEvent({ notAnEvent: true });
    } catch (e) {
      threw = true;
      expect(e).toBeInstanceOf(TypeError);
    }
    expect(threw).toBe(true);
  });

  it('PAYMENT_EVENT_TYPES has no duplicate entries', () => {
    const unique = new Set(PAYMENT_EVENT_TYPES);
    expect(unique.size).toBe(PAYMENT_EVENT_TYPES.length);
  });
});
