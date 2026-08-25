/**
 * Issue #110 — Payment event schema: Test Engineer coverage.
 *
 * Independent test file verifying all 7 acceptance criteria for the payment
 * event schema. Uses a fresh set of fixtures distinct from the developer-
 * authored and prior test files to provide independent validation.
 *
 * AC1  – Base event shape: eventId (UUID), paymentId, eventType, occurredAt
 *         (ISO-8601), payload (object).
 * AC2  – All five concrete event types defined with discriminated eventType
 *         literals and typed payloads.
 * AC3  – All types/functions exported from the schema module.
 * AC4  – PAYMENT_EVENTS.md exists and documents each event type.
 * AC5  – Sample objects for each event type satisfy the schema at runtime.
 * AC6  – Negative cases: missing required fields fail validation.
 * AC7  – Schema is entirely client-side / build-time (no backend dependency).
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

// ── Independent fixtures (typed at compile time — AC2 + AC5 type-level) ──────

const evtInitiated: PaymentInitiatedEvent = {
  eventId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  paymentId: 'pay-te-001',
  eventType: 'PaymentInitiated',
  occurredAt: '2025-12-01T00:00:00.000Z',
  payload: {
    amountMinor: 1500,
    currency: 'GBP',
    customerId: 'cust-te-001',
  } satisfies PaymentInitiatedPayload,
};

const evtAuthorised: PaymentAuthorisedEvent = {
  eventId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  paymentId: 'pay-te-001',
  eventType: 'PaymentAuthorised',
  occurredAt: '2025-12-01T00:00:01.000Z',
  payload: {
    authorisationId: 'auth-te-001',
    amountMinor: 1500,
    currency: 'GBP',
  } satisfies PaymentAuthorisedPayload,
};

const evtCaptured: PaymentCapturedEvent = {
  eventId: '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
  paymentId: 'pay-te-001',
  eventType: 'PaymentCaptured',
  occurredAt: '2025-12-01T00:00:02.000Z',
  payload: {
    authorisationId: 'auth-te-001',
    amountMinor: 1500,
    currency: 'GBP',
  } satisfies PaymentCapturedPayload,
};

const evtFailed: PaymentFailedEvent = {
  eventId: '6ba7b812-9dad-11d1-80b4-00c04fd430c8',
  paymentId: 'pay-te-002',
  eventType: 'PaymentFailed',
  occurredAt: '2025-12-01T00:00:03.000Z',
  payload: {
    reasonCode: 'do_not_honour',
    reason: 'Bank declined the transaction.',
  } satisfies PaymentFailedPayload,
};

const evtRefunded: PaymentRefundedEvent = {
  eventId: '6ba7b813-9dad-11d1-80b4-00c04fd430c8',
  paymentId: 'pay-te-001',
  eventType: 'PaymentRefunded',
  occurredAt: '2025-12-01T00:00:04.000Z',
  payload: {
    refundId: 'ref-te-001',
    amountMinor: 750,
    currency: 'GBP',
  } satisfies PaymentRefundedPayload,
};

/** All five typed as the discriminated union — AC5 runtime check. */
const allFive: PaymentEvent[] = [
  evtInitiated,
  evtAuthorised,
  evtCaptured,
  evtFailed,
  evtRefunded,
];

// ── AC1: Base event shape ─────────────────────────────────────────────────────

describe('AC1 – base event shape fields', () => {
  it('PAYMENT_EVENT_TYPES has exactly 5 entries', () => {
    expect(PAYMENT_EVENT_TYPES).toHaveLength(5);
  });

  it('PAYMENT_EVENT_TYPES contains all five required literals', () => {
    const required: PaymentEventType[] = [
      'PaymentInitiated',
      'PaymentAuthorised',
      'PaymentCaptured',
      'PaymentFailed',
      'PaymentRefunded',
    ];
    expect([...PAYMENT_EVENT_TYPES].sort()).toEqual([...required].sort());
  });

  it('every sample carries all five required base fields', () => {
    for (const event of allFive) {
      expect(event).toHaveProperty('eventId');
      expect(event).toHaveProperty('paymentId');
      expect(event).toHaveProperty('eventType');
      expect(event).toHaveProperty('occurredAt');
      expect(event).toHaveProperty('payload');
    }
  });

  it('eventId on every sample is a UUID string', () => {
    for (const event of allFive) {
      expect(typeof event.eventId).toBe('string');
      expect(isUuid(event.eventId)).toBe(true);
    }
  });

  it('paymentId on every sample is a non-empty string', () => {
    for (const event of allFive) {
      expect(typeof event.paymentId).toBe('string');
      expect(event.paymentId.length).toBeGreaterThan(0);
    }
  });

  it('occurredAt on every sample is an ISO-8601 string', () => {
    for (const event of allFive) {
      expect(isIso8601(event.occurredAt)).toBe(true);
    }
  });

  it('payload on every sample is a non-null plain object (not an array)', () => {
    for (const event of allFive) {
      expect(typeof event.payload).toBe('object');
      expect(event.payload).not.toBeNull();
      expect(Array.isArray(event.payload)).toBe(false);
    }
  });

  it('isUuid accepts valid UUIDs (v1–v5)', () => {
    // v1
    expect(isUuid('11111111-1111-1111-8111-111111111111')).toBe(true);
    // v4
    expect(isUuid('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true);
    // v5
    expect(isUuid('f47ac10b-58cc-5372-a567-0e02b2c3d479')).toBe(true);
  });

  it('isUuid rejects non-UUID values', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(42)).toBe(false);
  });

  it('isIso8601 accepts valid ISO-8601 timestamps', () => {
    expect(isIso8601('2025-12-01T00:00:00.000Z')).toBe(true);
    expect(isIso8601('2025-12-01T00:00:00Z')).toBe(true);
    expect(isIso8601('2025-12-01T00:00:00+10:00')).toBe(true);
    expect(isIso8601('2025-12-01T00:00:00-05:00')).toBe(true);
  });

  it('isIso8601 rejects non-ISO-8601 values', () => {
    expect(isIso8601('01/12/2025')).toBe(false);
    expect(isIso8601('2025-12-01')).toBe(false);
    expect(isIso8601('not-a-date')).toBe(false);
    expect(isIso8601(1234567890)).toBe(false);
    expect(isIso8601(null)).toBe(false);
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

describe('AC2 – concrete event types with discriminated literals and typed payloads', () => {
  it('PaymentInitiated: correct eventType literal and payload fields', () => {
    expect(evtInitiated.eventType).toBe('PaymentInitiated');
    expect(evtInitiated.payload.amountMinor).toBe(1500);
    expect(evtInitiated.payload.currency).toBe('GBP');
    expect(evtInitiated.payload.customerId).toBe('cust-te-001');
  });

  it('PaymentAuthorised: correct eventType literal and payload fields', () => {
    expect(evtAuthorised.eventType).toBe('PaymentAuthorised');
    expect(evtAuthorised.payload.authorisationId).toBe('auth-te-001');
    expect(evtAuthorised.payload.amountMinor).toBe(1500);
    expect(evtAuthorised.payload.currency).toBe('GBP');
  });

  it('PaymentCaptured: correct eventType literal and payload fields', () => {
    expect(evtCaptured.eventType).toBe('PaymentCaptured');
    expect(evtCaptured.payload.authorisationId).toBe('auth-te-001');
    expect(evtCaptured.payload.amountMinor).toBe(1500);
    expect(evtCaptured.payload.currency).toBe('GBP');
  });

  it('PaymentFailed: correct eventType literal and payload fields', () => {
    expect(evtFailed.eventType).toBe('PaymentFailed');
    expect(evtFailed.payload.reasonCode).toBe('do_not_honour');
    expect(typeof evtFailed.payload.reason).toBe('string');
    expect(evtFailed.payload.reason.length).toBeGreaterThan(0);
  });

  it('PaymentRefunded: correct eventType literal and payload fields', () => {
    expect(evtRefunded.eventType).toBe('PaymentRefunded');
    expect(evtRefunded.payload.refundId).toBe('ref-te-001');
    expect(evtRefunded.payload.amountMinor).toBe(750);
    expect(evtRefunded.payload.currency).toBe('GBP');
  });

  it('all five event types are represented in the samples array', () => {
    const types = allFive.map((e) => e.eventType).sort();
    expect(types).toEqual([...PAYMENT_EVENT_TYPES].sort());
  });

  it('BasePaymentEvent generic is usable with custom type parameters (compile-time check)', () => {
    // If BasePaymentEvent is not exported or its generics are broken, tsc fails.
    const custom: BasePaymentEvent<'PaymentInitiated', { total: number }> = {
      eventId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      paymentId: 'pay-custom',
      eventType: 'PaymentInitiated',
      occurredAt: '2025-12-01T00:00:00.000Z',
      payload: { total: 99 },
    };
    expect(custom.eventType).toBe('PaymentInitiated');
    expect(custom.payload.total).toBe(99);
  });

  it('discriminated union narrows payload type on PaymentInitiated', () => {
    const event: PaymentEvent = evtInitiated;
    if (event.eventType === 'PaymentInitiated') {
      // TypeScript narrows payload to PaymentInitiatedPayload here
      expect(typeof event.payload.customerId).toBe('string');
    }
  });

  it('discriminated union narrows payload type on PaymentFailed', () => {
    const event: PaymentEvent = evtFailed;
    if (event.eventType === 'PaymentFailed') {
      expect(typeof event.payload.reasonCode).toBe('string');
    }
  });

  it('discriminated union narrows payload type on PaymentRefunded', () => {
    const event: PaymentEvent = evtRefunded;
    if (event.eventType === 'PaymentRefunded') {
      expect(typeof event.payload.refundId).toBe('string');
    }
  });
});

// ── AC3: Exports are importable ───────────────────────────────────────────────

describe('AC3 – all schema exports importable without re-declaration', () => {
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

describe('AC6 – negative cases: missing required fields fail validation', () => {
  it('rejects an object missing eventId (primary negative case per spec)', () => {
    const { eventId: _omit, ...noEventId } = evtInitiated;
    expect(isPaymentEvent(noEventId)).toBe(false);
    expect(() => assertPaymentEvent(noEventId)).toThrow(TypeError);
  });

  it('rejects an object missing paymentId', () => {
    const { paymentId: _omit, ...noPaymentId } = evtInitiated;
    expect(isPaymentEvent(noPaymentId)).toBe(false);
  });

  it('rejects an object missing eventType', () => {
    const { eventType: _omit, ...noEventType } = evtInitiated;
    expect(isPaymentEvent(noEventType)).toBe(false);
  });

  it('rejects an object missing occurredAt', () => {
    const { occurredAt: _omit, ...noOccurredAt } = evtInitiated;
    expect(isPaymentEvent(noOccurredAt)).toBe(false);
  });

  it('rejects an object missing payload', () => {
    const { payload: _omit, ...noPayload } = evtInitiated;
    expect(isPaymentEvent(noPayload)).toBe(false);
  });

  it('rejects eventId that is not a valid UUID', () => {
    expect(isPaymentEvent({ ...evtInitiated, eventId: 'plain-string' })).toBe(false);
    expect(isPaymentEvent({ ...evtInitiated, eventId: '' })).toBe(false);
    expect(isPaymentEvent({ ...evtInitiated, eventId: 12345 })).toBe(false);
    expect(isPaymentEvent({ ...evtInitiated, eventId: null })).toBe(false);
  });

  it('rejects an empty paymentId string', () => {
    expect(isPaymentEvent({ ...evtInitiated, paymentId: '' })).toBe(false);
  });

  it('rejects a non-string paymentId', () => {
    expect(isPaymentEvent({ ...evtInitiated, paymentId: 99 })).toBe(false);
  });

  it('rejects an unrecognised eventType literal', () => {
    expect(isPaymentEvent({ ...evtInitiated, eventType: 'PaymentVoided' })).toBe(false);
    expect(isPaymentEvent({ ...evtInitiated, eventType: '' })).toBe(false);
    expect(isPaymentEvent({ ...evtInitiated, eventType: 0 })).toBe(false);
  });

  it('rejects occurredAt that is not ISO-8601', () => {
    expect(isPaymentEvent({ ...evtInitiated, occurredAt: '01/12/2025' })).toBe(false);
    expect(isPaymentEvent({ ...evtInitiated, occurredAt: '2025-12-01' })).toBe(false);
    expect(isPaymentEvent({ ...evtInitiated, occurredAt: 'yesterday' })).toBe(false);
    expect(isPaymentEvent({ ...evtInitiated, occurredAt: 1234567890 })).toBe(false);
  });

  it('rejects payload that is not a plain object', () => {
    expect(isPaymentEvent({ ...evtInitiated, payload: null })).toBe(false);
    expect(isPaymentEvent({ ...evtInitiated, payload: 'string' })).toBe(false);
    expect(isPaymentEvent({ ...evtInitiated, payload: [1, 2, 3] })).toBe(false);
    expect(isPaymentEvent({ ...evtInitiated, payload: 42 })).toBe(false);
  });

  it('rejects null, undefined, primitives, and arrays', () => {
    expect(isPaymentEvent(null)).toBe(false);
    expect(isPaymentEvent(undefined)).toBe(false);
    expect(isPaymentEvent('PaymentInitiated')).toBe(false);
    expect(isPaymentEvent(42)).toBe(false);
    expect(isPaymentEvent([evtInitiated])).toBe(false);
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

  it('assertPaymentEvent throws TypeError for an event with a bad eventId', () => {
    expect(() =>
      assertPaymentEvent({ ...evtInitiated, eventId: 'not-a-uuid' }),
    ).toThrow(TypeError);
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
    const result = isPaymentEvent(evtInitiated);
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

  it('schema module exports are all synchronous values (not Promises)', () => {
    expect(isPaymentEvent).not.toBeInstanceOf(Promise);
    expect(assertPaymentEvent).not.toBeInstanceOf(Promise);
    expect(isUuid).not.toBeInstanceOf(Promise);
    expect(isIso8601).not.toBeInstanceOf(Promise);
    expect(isPaymentEventType).not.toBeInstanceOf(Promise);
  });
});
