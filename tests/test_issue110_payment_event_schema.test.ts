/**
 * Issue #110 — Payment event schema: acceptance-criteria unit tests.
 *
 * These tests complement the developer-authored paymentEventSchema.test.ts
 * with additional coverage of:
 *
 *   AC1  – Base event shape fields (eventId UUID, paymentId, eventType,
 *           occurredAt ISO-8601, payload object).
 *   AC2  – All five concrete event types with typed payloads.
 *   AC3  – Exports are importable without re-declaration.
 *   AC5  – Sample objects for each event type satisfy the schema at runtime.
 *   AC6  – Negative cases: missing required fields, wrong types, bad formats.
 *   AC7  – No backend dependency (pure client-side / build-time module).
 */

import { describe, expect, it } from 'vitest';

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

// ── Fixtures ──────────────────────────────────────────────────────────────────
// Each fixture is typed with its concrete event type so that TypeScript itself
// validates the shape at compile time (AC3 / AC5 type-level check).
//
// UUIDs are hand-crafted to satisfy the validator's regex:
//   /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
// i.e. version nibble in [1-5] and variant nibble in [89ab].

const sampleInitiated: PaymentInitiatedEvent = {
  eventId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
  paymentId: 'pay_initiated_001',
  eventType: 'PaymentInitiated',
  occurredAt: '2026-06-01T09:00:00.000Z',
  payload: {
    amountMinor: 5000,
    currency: 'AUD',
    customerId: 'cust_abc',
  } satisfies PaymentInitiatedPayload,
};

const sampleAuthorised: PaymentAuthorisedEvent = {
  eventId: 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6',
  paymentId: 'pay_authorised_001',
  eventType: 'PaymentAuthorised',
  occurredAt: '2026-06-01T09:00:01.000Z',
  payload: {
    authorisationId: 'auth_xyz',
    amountMinor: 5000,
    currency: 'AUD',
  } satisfies PaymentAuthorisedPayload,
};

const sampleCaptured: PaymentCapturedEvent = {
  eventId: 'c3d4e5f6-a7b8-4c9d-8e1f-a2b3c4d5e6f7',
  paymentId: 'pay_captured_001',
  eventType: 'PaymentCaptured',
  occurredAt: '2026-06-01T09:00:02.000Z',
  payload: {
    authorisationId: 'auth_xyz',
    amountMinor: 5000,
    currency: 'AUD',
  } satisfies PaymentCapturedPayload,
};

const sampleFailed: PaymentFailedEvent = {
  eventId: 'd4e5f6a7-b8c9-4d0e-9f2a-b3c4d5e6f7a8',
  paymentId: 'pay_failed_001',
  eventType: 'PaymentFailed',
  occurredAt: '2026-06-01T09:00:03.000Z',
  payload: {
    reasonCode: 'insufficient_funds',
    reason: 'Card declined due to insufficient funds',
  } satisfies PaymentFailedPayload,
};

const sampleRefunded: PaymentRefundedEvent = {
  eventId: 'e5f6a7b8-c9d0-4e1f-a23b-c4d5e6f7a8b9',
  paymentId: 'pay_refunded_001',
  eventType: 'PaymentRefunded',
  occurredAt: '2026-06-01T09:00:04.000Z',
  payload: {
    refundId: 'ref_001',
    amountMinor: 2500,
    currency: 'AUD',
  } satisfies PaymentRefundedPayload,
};

const allSamples: PaymentEvent[] = [
  sampleInitiated,
  sampleAuthorised,
  sampleCaptured,
  sampleFailed,
  sampleRefunded,
];

// ── AC1: Base event shape ─────────────────────────────────────────────────────

describe('AC1 – base event shape', () => {
  it('PAYMENT_EVENT_TYPES contains exactly the five required literals', () => {
    const expected: PaymentEventType[] = [
      'PaymentInitiated',
      'PaymentAuthorised',
      'PaymentCaptured',
      'PaymentFailed',
      'PaymentRefunded',
    ];
    expect([...PAYMENT_EVENT_TYPES].sort()).toEqual([...expected].sort());
    expect(PAYMENT_EVENT_TYPES).toHaveLength(5);
  });

  it('isUuid accepts a valid v4-style UUID', () => {
    expect(isUuid('a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5')).toBe(true);
  });

  it('isUuid rejects non-UUID strings', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid(42)).toBe(false);
    expect(isUuid(null)).toBe(false);
  });

  it('isIso8601 accepts valid ISO-8601 timestamps', () => {
    expect(isIso8601('2026-06-01T09:00:00.000Z')).toBe(true);
    expect(isIso8601('2026-06-01T09:00:00Z')).toBe(true);
    expect(isIso8601('2026-06-01T09:00:00+10:00')).toBe(true);
    expect(isIso8601('2026-06-01T09:00:00-05:30')).toBe(true);
  });

  it('isIso8601 rejects non-ISO-8601 strings', () => {
    expect(isIso8601('01/06/2026')).toBe(false);
    expect(isIso8601('2026-06-01')).toBe(false);
    expect(isIso8601('not a date')).toBe(false);
    expect(isIso8601(1234567890)).toBe(false);
    expect(isIso8601(null)).toBe(false);
  });

  it('isPaymentEventType accepts all five recognised literals', () => {
    for (const t of PAYMENT_EVENT_TYPES) {
      expect(isPaymentEventType(t)).toBe(true);
    }
  });

  it('isPaymentEventType rejects unknown strings', () => {
    expect(isPaymentEventType('PaymentExploded')).toBe(false);
    expect(isPaymentEventType('')).toBe(false);
    expect(isPaymentEventType(null)).toBe(false);
  });

  it('every sample event has all five required base fields', () => {
    for (const event of allSamples) {
      expect(event).toHaveProperty('eventId');
      expect(event).toHaveProperty('paymentId');
      expect(event).toHaveProperty('eventType');
      expect(event).toHaveProperty('occurredAt');
      expect(event).toHaveProperty('payload');
    }
  });

  it('eventId on every sample is a UUID string', () => {
    for (const event of allSamples) {
      expect(isUuid(event.eventId)).toBe(true);
    }
  });

  it('occurredAt on every sample is an ISO-8601 string', () => {
    for (const event of allSamples) {
      expect(isIso8601(event.occurredAt)).toBe(true);
    }
  });

  it('payload on every sample is a plain object', () => {
    for (const event of allSamples) {
      expect(typeof event.payload).toBe('object');
      expect(event.payload).not.toBeNull();
      expect(Array.isArray(event.payload)).toBe(false);
    }
  });
});

// ── AC2: Concrete event types ─────────────────────────────────────────────────

describe('AC2 – concrete event types', () => {
  it('PaymentInitiated event has correct eventType literal and payload shape', () => {
    expect(sampleInitiated.eventType).toBe('PaymentInitiated');
    expect(sampleInitiated.payload.amountMinor).toBe(5000);
    expect(sampleInitiated.payload.currency).toBe('AUD');
    expect(sampleInitiated.payload.customerId).toBe('cust_abc');
  });

  it('PaymentAuthorised event has correct eventType literal and payload shape', () => {
    expect(sampleAuthorised.eventType).toBe('PaymentAuthorised');
    expect(sampleAuthorised.payload.authorisationId).toBe('auth_xyz');
    expect(sampleAuthorised.payload.amountMinor).toBe(5000);
    expect(sampleAuthorised.payload.currency).toBe('AUD');
  });

  it('PaymentCaptured event has correct eventType literal and payload shape', () => {
    expect(sampleCaptured.eventType).toBe('PaymentCaptured');
    expect(sampleCaptured.payload.authorisationId).toBe('auth_xyz');
    expect(sampleCaptured.payload.amountMinor).toBe(5000);
    expect(sampleCaptured.payload.currency).toBe('AUD');
  });

  it('PaymentFailed event has correct eventType literal and payload shape', () => {
    expect(sampleFailed.eventType).toBe('PaymentFailed');
    expect(sampleFailed.payload.reasonCode).toBe('insufficient_funds');
    expect(typeof sampleFailed.payload.reason).toBe('string');
    expect(sampleFailed.payload.reason.length).toBeGreaterThan(0);
  });

  it('PaymentRefunded event has correct eventType literal and payload shape', () => {
    expect(sampleRefunded.eventType).toBe('PaymentRefunded');
    expect(sampleRefunded.payload.refundId).toBe('ref_001');
    expect(sampleRefunded.payload.amountMinor).toBe(2500);
    expect(sampleRefunded.payload.currency).toBe('AUD');
  });

  it('all five event types are represented in the samples array', () => {
    const types = allSamples.map((e) => e.eventType).sort();
    expect(types).toEqual([...PAYMENT_EVENT_TYPES].sort());
  });

  it('BasePaymentEvent generic type is usable with custom type parameters', () => {
    // This is a compile-time check: if BasePaymentEvent is not exported or
    // its generics are wrong, this assignment will fail to compile.
    const custom: BasePaymentEvent<'PaymentInitiated', { amount: number }> = {
      eventId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
      paymentId: 'pay_custom',
      eventType: 'PaymentInitiated',
      occurredAt: '2026-06-01T09:00:00.000Z',
      payload: { amount: 100 },
    };
    expect(custom.eventType).toBe('PaymentInitiated');
  });
});

// ── AC3: Exports are importable ───────────────────────────────────────────────

describe('AC3 – exports are importable without re-declaration', () => {
  it('PAYMENT_EVENT_TYPES is a non-empty readonly array', () => {
    expect(Array.isArray(PAYMENT_EVENT_TYPES)).toBe(true);
    expect(PAYMENT_EVENT_TYPES.length).toBeGreaterThan(0);
  });

  it('isPaymentEvent is a function', () => {
    expect(typeof isPaymentEvent).toBe('function');
  });

  it('assertPaymentEvent is a function', () => {
    expect(typeof assertPaymentEvent).toBe('function');
  });

  it('isUuid is a function', () => {
    expect(typeof isUuid).toBe('function');
  });

  it('isIso8601 is a function', () => {
    expect(typeof isIso8601).toBe('function');
  });

  it('isPaymentEventType is a function', () => {
    expect(typeof isPaymentEventType).toBe('function');
  });
});

// ── AC5: Runtime validation of all five event types ───────────────────────────

describe('AC5 – runtime validation accepts all five event types', () => {
  it.each(allSamples.map((s) => [s.eventType, s] as const))(
    'isPaymentEvent returns true for a valid %s event',
    (_label, event) => {
      expect(isPaymentEvent(event)).toBe(true);
    },
  );

  it.each(allSamples.map((s) => [s.eventType, s] as const))(
    'assertPaymentEvent does not throw for a valid %s event',
    (_label, event) => {
      expect(() => assertPaymentEvent(event)).not.toThrow();
    },
  );
});

// ── AC6: Negative cases ───────────────────────────────────────────────────────

describe('AC6 – negative cases: invalid objects fail validation', () => {
  // Missing required field: eventId
  it('rejects an object missing eventId', () => {
    const { eventId: _omit, ...noEventId } = sampleInitiated;
    expect(isPaymentEvent(noEventId)).toBe(false);
    expect(() => assertPaymentEvent(noEventId)).toThrow(TypeError);
  });

  // Missing required field: paymentId
  it('rejects an object missing paymentId', () => {
    const { paymentId: _omit, ...noPaymentId } = sampleInitiated;
    expect(isPaymentEvent(noPaymentId)).toBe(false);
  });

  // Missing required field: eventType
  it('rejects an object missing eventType', () => {
    const { eventType: _omit, ...noEventType } = sampleInitiated;
    expect(isPaymentEvent(noEventType)).toBe(false);
  });

  // Missing required field: occurredAt
  it('rejects an object missing occurredAt', () => {
    const { occurredAt: _omit, ...noOccurredAt } = sampleInitiated;
    expect(isPaymentEvent(noOccurredAt)).toBe(false);
  });

  // Missing required field: payload
  it('rejects an object missing payload', () => {
    const { payload: _omit, ...noPayload } = sampleInitiated;
    expect(isPaymentEvent(noPayload)).toBe(false);
  });

  // Wrong type for eventId (not a UUID)
  it('rejects eventId that is not a UUID string', () => {
    expect(isPaymentEvent({ ...sampleInitiated, eventId: 'plain-string' })).toBe(false);
    expect(isPaymentEvent({ ...sampleInitiated, eventId: 12345 })).toBe(false);
    expect(isPaymentEvent({ ...sampleInitiated, eventId: null })).toBe(false);
  });

  // Wrong type for paymentId (empty string)
  it('rejects an empty paymentId string', () => {
    expect(isPaymentEvent({ ...sampleInitiated, paymentId: '' })).toBe(false);
  });

  // Wrong type for paymentId (non-string)
  it('rejects a non-string paymentId', () => {
    expect(isPaymentEvent({ ...sampleInitiated, paymentId: 42 })).toBe(false);
  });

  // Unknown eventType literal
  it('rejects an unrecognised eventType literal', () => {
    expect(isPaymentEvent({ ...sampleInitiated, eventType: 'PaymentExploded' })).toBe(false);
    expect(isPaymentEvent({ ...sampleInitiated, eventType: '' })).toBe(false);
    expect(isPaymentEvent({ ...sampleInitiated, eventType: 123 })).toBe(false);
  });

  // Invalid occurredAt format
  it('rejects occurredAt that is not ISO-8601', () => {
    expect(isPaymentEvent({ ...sampleInitiated, occurredAt: '01/06/2026' })).toBe(false);
    expect(isPaymentEvent({ ...sampleInitiated, occurredAt: '2026-06-01' })).toBe(false);
    expect(isPaymentEvent({ ...sampleInitiated, occurredAt: 'not-a-date' })).toBe(false);
  });

  // payload is not a plain object
  it('rejects payload that is not a plain object', () => {
    expect(isPaymentEvent({ ...sampleInitiated, payload: null })).toBe(false);
    expect(isPaymentEvent({ ...sampleInitiated, payload: 'string' })).toBe(false);
    expect(isPaymentEvent({ ...sampleInitiated, payload: [1, 2, 3] })).toBe(false);
  });

  // Completely non-object values
  it('rejects null, primitives, and arrays', () => {
    expect(isPaymentEvent(null)).toBe(false);
    expect(isPaymentEvent(undefined)).toBe(false);
    expect(isPaymentEvent('PaymentInitiated')).toBe(false);
    expect(isPaymentEvent(42)).toBe(false);
    expect(isPaymentEvent([sampleInitiated])).toBe(false);
  });

  // assertPaymentEvent throws TypeError with a descriptive message
  it('assertPaymentEvent throws TypeError for an invalid event', () => {
    expect(() => assertPaymentEvent({})).toThrow(TypeError);
    expect(() => assertPaymentEvent(null)).toThrow(TypeError);
    expect(() => assertPaymentEvent({ ...sampleInitiated, eventId: 'bad' })).toThrow(TypeError);
  });
});

// ── AC7: No backend dependency ────────────────────────────────────────────────

describe('AC7 – schema is entirely client-side / build-time', () => {
  it('PAYMENT_EVENT_TYPES is available synchronously (no async loading)', () => {
    // If the module required a network call, this would be undefined or a Promise.
    expect(PAYMENT_EVENT_TYPES).toBeDefined();
    expect(Array.isArray(PAYMENT_EVENT_TYPES)).toBe(true);
  });

  it('isPaymentEvent runs synchronously without side effects', () => {
    // Verify the function completes synchronously and returns a boolean.
    const result = isPaymentEvent(sampleInitiated);
    expect(typeof result).toBe('boolean');
  });

  it('assertPaymentEvent runs synchronously and throws synchronously', () => {
    let threw = false;
    try {
      assertPaymentEvent({ notAnEvent: true });
    } catch (e) {
      threw = true;
      expect(e).toBeInstanceOf(TypeError);
    }
    expect(threw).toBe(true);
  });
});
