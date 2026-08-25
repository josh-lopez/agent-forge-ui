/**
 * Issue #110 — Payment event schema: Test Engineer independent verification.
 *
 * This file provides an independent, self-contained verification of all 7
 * acceptance criteria using a fresh set of fixtures and focused assertions.
 * It is intentionally distinct from the developer-authored tests and the
 * prior Test Engineer files to provide an independent signal.
 *
 * AC1  – Base event shape: eventId (UUID), paymentId (string), eventType
 *         (string/discriminated union), occurredAt (ISO-8601), payload (object).
 * AC2  – All five concrete event types defined with discriminated eventType
 *         literals and typed payloads.
 * AC3  – All types and functions are exported from the schema module so other
 *         src/ modules can import them without re-declaring.
 * AC4  – PAYMENT_EVENTS.md exists and documents each event type (structural
 *         check via ?raw import).
 * AC5  – Sample objects for each of the five event types satisfy the schema
 *         (TypeScript type-level and runtime validation).
 * AC6  – At least one negative case: an object missing a required field
 *         (e.g. eventId) fails validation or produces a TypeScript compile error.
 * AC7  – No runtime dependency on a backend service is introduced.
 */

import { describe, expect, it } from 'vitest';

// AC3: Import every exported runtime value and type from the schema module.
// Any missing export causes a TypeScript compile error here.
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

// AC4: Import PAYMENT_EVENTS.md as raw text for structural verification.
// The ?raw suffix is the Vite/Vitest idiom for reading file content without
// Node.js built-ins (required in the jsdom environment).
import PAYMENT_EVENTS_MD from '../PAYMENT_EVENTS.md?raw';

// ── Independent typed fixtures (AC2 + AC5 compile-time check) ─────────────────
// Each fixture is annotated with its concrete TypeScript type so that tsc
// validates the shape at compile time. Using EUR currency and distinct IDs
// to be independent of all other test files.

const teInitiated: PaymentInitiatedEvent = {
  eventId: 'c9bf9e57-1685-4c89-bafb-ff5af830be8a',
  paymentId: 'pay-te-eur-001',
  eventType: 'PaymentInitiated',
  occurredAt: '2024-03-15T14:30:00.000Z',
  payload: {
    amountMinor: 2500,
    currency: 'EUR',
    customerId: 'cust-te-eur-001',
  } satisfies PaymentInitiatedPayload,
};

const teAuthorised: PaymentAuthorisedEvent = {
  eventId: 'c9bf9e57-1685-4c89-bafb-ff5af830be8b',
  paymentId: 'pay-te-eur-001',
  eventType: 'PaymentAuthorised',
  occurredAt: '2024-03-15T14:30:01.000Z',
  payload: {
    authorisationId: 'auth-te-eur-001',
    amountMinor: 2500,
    currency: 'EUR',
  } satisfies PaymentAuthorisedPayload,
};

const teCaptured: PaymentCapturedEvent = {
  eventId: 'c9bf9e57-1685-4c89-bafb-ff5af830be8c',
  paymentId: 'pay-te-eur-001',
  eventType: 'PaymentCaptured',
  occurredAt: '2024-03-15T14:30:02.000Z',
  payload: {
    authorisationId: 'auth-te-eur-001',
    amountMinor: 2500,
    currency: 'EUR',
  } satisfies PaymentCapturedPayload,
};

const teFailed: PaymentFailedEvent = {
  eventId: 'c9bf9e57-1685-4c89-bafb-ff5af830be8d',
  paymentId: 'pay-te-eur-002',
  eventType: 'PaymentFailed',
  occurredAt: '2024-03-15T14:30:03.000Z',
  payload: {
    reasonCode: 'card_blocked',
    reason: 'Card is blocked by issuing bank.',
  } satisfies PaymentFailedPayload,
};

const teRefunded: PaymentRefundedEvent = {
  eventId: 'c9bf9e57-1685-4c89-bafb-ff5af830be8e',
  paymentId: 'pay-te-eur-001',
  eventType: 'PaymentRefunded',
  occurredAt: '2024-03-15T14:30:04.000Z',
  payload: {
    refundId: 'ref-te-eur-001',
    amountMinor: 1250,
    currency: 'EUR',
  } satisfies PaymentRefundedPayload,
};

/** All five typed as the discriminated union — AC5 runtime check. */
const allFive: PaymentEvent[] = [
  teInitiated,
  teAuthorised,
  teCaptured,
  teFailed,
  teRefunded,
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

  it('every sample event has all five required base fields', () => {
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
    expect(isUuid('c9bf9e57-1685-4c89-bafb-ff5af830be8a')).toBe(true); // v4
    expect(isUuid('11111111-1111-1111-8111-111111111111')).toBe(true); // v1
    expect(isUuid('11111111-1111-5111-8111-111111111111')).toBe(true); // v5
  });

  it('isUuid rejects non-UUID values', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(42)).toBe(false);
  });

  it('isIso8601 accepts valid ISO-8601 timestamps', () => {
    expect(isIso8601('2024-03-15T14:30:00.000Z')).toBe(true);
    expect(isIso8601('2024-03-15T14:30:00Z')).toBe(true);
    expect(isIso8601('2024-03-15T14:30:00+01:00')).toBe(true);
    expect(isIso8601('2024-03-15T14:30:00-07:00')).toBe(true);
    expect(isIso8601('2024-03-15T14:30:00.999Z')).toBe(true);
  });

  it('isIso8601 rejects non-ISO-8601 values', () => {
    expect(isIso8601('15/03/2024')).toBe(false);
    expect(isIso8601('2024-03-15')).toBe(false);
    expect(isIso8601('not-a-date')).toBe(false);
    expect(isIso8601(1234567890)).toBe(false);
    expect(isIso8601(null)).toBe(false);
    expect(isIso8601('2024-03-15T14:30:00')).toBe(false); // no timezone
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
    expect(isPaymentEventType(0)).toBe(false);
  });
});

// ── AC2: Concrete event types ─────────────────────────────────────────────────

describe('AC2 – concrete event types with discriminated literals and typed payloads', () => {
  it('PaymentInitiated: correct eventType literal and payload fields', () => {
    expect(teInitiated.eventType).toBe('PaymentInitiated');
    expect(teInitiated.payload.amountMinor).toBe(2500);
    expect(teInitiated.payload.currency).toBe('EUR');
    expect(teInitiated.payload.customerId).toBe('cust-te-eur-001');
  });

  it('PaymentAuthorised: correct eventType literal and payload fields', () => {
    expect(teAuthorised.eventType).toBe('PaymentAuthorised');
    expect(teAuthorised.payload.authorisationId).toBe('auth-te-eur-001');
    expect(teAuthorised.payload.amountMinor).toBe(2500);
    expect(teAuthorised.payload.currency).toBe('EUR');
  });

  it('PaymentCaptured: correct eventType literal and payload fields', () => {
    expect(teCaptured.eventType).toBe('PaymentCaptured');
    expect(teCaptured.payload.authorisationId).toBe('auth-te-eur-001');
    expect(teCaptured.payload.amountMinor).toBe(2500);
    expect(teCaptured.payload.currency).toBe('EUR');
  });

  it('PaymentFailed: correct eventType literal and payload fields', () => {
    expect(teFailed.eventType).toBe('PaymentFailed');
    expect(teFailed.payload.reasonCode).toBe('card_blocked');
    expect(typeof teFailed.payload.reason).toBe('string');
    expect(teFailed.payload.reason.length).toBeGreaterThan(0);
  });

  it('PaymentRefunded: correct eventType literal and payload fields', () => {
    expect(teRefunded.eventType).toBe('PaymentRefunded');
    expect(teRefunded.payload.refundId).toBe('ref-te-eur-001');
    expect(teRefunded.payload.amountMinor).toBe(1250);
    expect(teRefunded.payload.currency).toBe('EUR');
  });

  it('all five event types are represented in the samples array', () => {
    const types = allFive.map((e) => e.eventType).sort();
    expect(types).toEqual([...PAYMENT_EVENT_TYPES].sort());
  });

  it('BasePaymentEvent generic is usable with custom type parameters (compile-time check)', () => {
    // If BasePaymentEvent is not exported or its generics are broken, tsc fails.
    const custom: BasePaymentEvent<'PaymentInitiated', { amount: number }> = {
      eventId: 'c9bf9e57-1685-4c89-bafb-ff5af830be8a',
      paymentId: 'pay-custom',
      eventType: 'PaymentInitiated',
      occurredAt: '2024-03-15T14:30:00.000Z',
      payload: { amount: 100 },
    };
    expect(custom.eventType).toBe('PaymentInitiated');
    expect(custom.payload.amount).toBe(100);
  });

  it('discriminated union narrows payload to PaymentInitiatedPayload', () => {
    const event: PaymentEvent = teInitiated;
    if (event.eventType === 'PaymentInitiated') {
      // TypeScript narrows payload to PaymentInitiatedPayload here
      expect(typeof event.payload.customerId).toBe('string');
      expect(typeof event.payload.amountMinor).toBe('number');
      expect(typeof event.payload.currency).toBe('string');
    }
  });

  it('discriminated union narrows payload to PaymentFailedPayload', () => {
    const event: PaymentEvent = teFailed;
    if (event.eventType === 'PaymentFailed') {
      expect(typeof event.payload.reasonCode).toBe('string');
      expect(typeof event.payload.reason).toBe('string');
    }
  });

  it('discriminated union narrows payload to PaymentRefundedPayload', () => {
    const event: PaymentEvent = teRefunded;
    if (event.eventType === 'PaymentRefunded') {
      expect(typeof event.payload.refundId).toBe('string');
      expect(typeof event.payload.amountMinor).toBe('number');
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

  it('PAYMENT_EVENT_TYPES has no duplicate entries', () => {
    const unique = new Set(PAYMENT_EVENT_TYPES);
    expect(unique.size).toBe(PAYMENT_EVENT_TYPES.length);
  });
});

// ── AC4: PAYMENT_EVENTS.md documents each event type ─────────────────────────

describe('AC4 – PAYMENT_EVENTS.md documents each event type and payload fields', () => {
  it('PAYMENT_EVENTS.md is non-empty', () => {
    expect(PAYMENT_EVENTS_MD.length).toBeGreaterThan(0);
  });

  it('PAYMENT_EVENTS.md documents all five event type names', () => {
    for (const eventType of PAYMENT_EVENT_TYPES) {
      expect(PAYMENT_EVENTS_MD).toContain(eventType);
    }
  });

  it('PAYMENT_EVENTS.md includes the eventType literal values in quotes', () => {
    for (const eventType of PAYMENT_EVENT_TYPES) {
      // The doc should show the literal value, e.g. "PaymentInitiated"
      expect(PAYMENT_EVENTS_MD).toContain(`"${eventType}"`);
    }
  });

  it('PAYMENT_EVENTS.md documents the base event shape', () => {
    // Must mention the base shape section
    expect(PAYMENT_EVENTS_MD.toLowerCase()).toMatch(/base.*event.*shape|base.*shape/);
  });

  it('PAYMENT_EVENTS.md documents all five base shape fields', () => {
    for (const field of ['eventId', 'paymentId', 'eventType', 'occurredAt', 'payload']) {
      expect(PAYMENT_EVENTS_MD).toContain(field);
    }
  });

  it('PAYMENT_EVENTS.md documents PaymentInitiated payload fields', () => {
    expect(PAYMENT_EVENTS_MD).toContain('amountMinor');
    expect(PAYMENT_EVENTS_MD).toContain('currency');
    expect(PAYMENT_EVENTS_MD).toContain('customerId');
  });

  it('PAYMENT_EVENTS.md documents PaymentAuthorised payload fields', () => {
    expect(PAYMENT_EVENTS_MD).toContain('authorisationId');
  });

  it('PAYMENT_EVENTS.md documents PaymentFailed payload fields', () => {
    expect(PAYMENT_EVENTS_MD).toContain('reasonCode');
    expect(PAYMENT_EVENTS_MD).toContain('reason');
  });

  it('PAYMENT_EVENTS.md documents PaymentRefunded payload fields', () => {
    expect(PAYMENT_EVENTS_MD).toContain('refundId');
  });

  it('PAYMENT_EVENTS.md references the canonical TypeScript source file', () => {
    expect(PAYMENT_EVENTS_MD).toContain('paymentEventSchema');
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

describe('AC6 – negative cases: invalid objects fail validation', () => {
  // Primary negative case per spec: missing eventId
  it('rejects an object missing eventId (primary negative case)', () => {
    const { eventId: _omit, ...noEventId } = teInitiated;
    expect(isPaymentEvent(noEventId)).toBe(false);
    expect(() => assertPaymentEvent(noEventId)).toThrow(TypeError);
  });

  it('rejects an object missing paymentId', () => {
    const { paymentId: _omit, ...noPaymentId } = teInitiated;
    expect(isPaymentEvent(noPaymentId)).toBe(false);
  });

  it('rejects an object missing eventType', () => {
    const { eventType: _omit, ...noEventType } = teInitiated;
    expect(isPaymentEvent(noEventType)).toBe(false);
  });

  it('rejects an object missing occurredAt', () => {
    const { occurredAt: _omit, ...noOccurredAt } = teInitiated;
    expect(isPaymentEvent(noOccurredAt)).toBe(false);
  });

  it('rejects an object missing payload', () => {
    const { payload: _omit, ...noPayload } = teInitiated;
    expect(isPaymentEvent(noPayload)).toBe(false);
  });

  it('rejects eventId that is not a valid UUID', () => {
    expect(isPaymentEvent({ ...teInitiated, eventId: 'not-a-uuid' })).toBe(false);
    expect(isPaymentEvent({ ...teInitiated, eventId: '' })).toBe(false);
    expect(isPaymentEvent({ ...teInitiated, eventId: 12345 })).toBe(false);
    expect(isPaymentEvent({ ...teInitiated, eventId: null })).toBe(false);
  });

  it('rejects an empty paymentId string', () => {
    expect(isPaymentEvent({ ...teInitiated, paymentId: '' })).toBe(false);
  });

  it('rejects a non-string paymentId', () => {
    expect(isPaymentEvent({ ...teInitiated, paymentId: 99 })).toBe(false);
  });

  it('rejects an unrecognised eventType literal', () => {
    expect(isPaymentEvent({ ...teInitiated, eventType: 'PaymentVoided' })).toBe(false);
    expect(isPaymentEvent({ ...teInitiated, eventType: '' })).toBe(false);
    expect(isPaymentEvent({ ...teInitiated, eventType: 0 })).toBe(false);
  });

  it('rejects occurredAt that is not ISO-8601', () => {
    expect(isPaymentEvent({ ...teInitiated, occurredAt: '15/03/2024' })).toBe(false);
    expect(isPaymentEvent({ ...teInitiated, occurredAt: '2024-03-15' })).toBe(false);
    expect(isPaymentEvent({ ...teInitiated, occurredAt: 'yesterday' })).toBe(false);
    expect(isPaymentEvent({ ...teInitiated, occurredAt: 1234567890 })).toBe(false);
  });

  it('rejects payload that is not a plain object', () => {
    expect(isPaymentEvent({ ...teInitiated, payload: null })).toBe(false);
    expect(isPaymentEvent({ ...teInitiated, payload: 'string' })).toBe(false);
    expect(isPaymentEvent({ ...teInitiated, payload: [1, 2, 3] })).toBe(false);
    expect(isPaymentEvent({ ...teInitiated, payload: 42 })).toBe(false);
  });

  it('rejects null, undefined, primitives, and arrays', () => {
    expect(isPaymentEvent(null)).toBe(false);
    expect(isPaymentEvent(undefined)).toBe(false);
    expect(isPaymentEvent('PaymentInitiated')).toBe(false);
    expect(isPaymentEvent(42)).toBe(false);
    expect(isPaymentEvent([teInitiated])).toBe(false);
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
      assertPaymentEvent({ ...teInitiated, eventId: 'not-a-uuid' }),
    ).toThrow(TypeError);
  });

  it('assertPaymentEvent throws TypeError for a completely empty object', () => {
    expect(() => assertPaymentEvent({})).toThrow(TypeError);
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
    const result = isPaymentEvent(teInitiated);
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

  it('schema module exports are all synchronously available (no async initialisation)', () => {
    // If any export required async initialisation, it would be a Promise here.
    expect(isPaymentEvent).not.toBeInstanceOf(Promise);
    expect(assertPaymentEvent).not.toBeInstanceOf(Promise);
    expect(isUuid).not.toBeInstanceOf(Promise);
    expect(isIso8601).not.toBeInstanceOf(Promise);
    expect(isPaymentEventType).not.toBeInstanceOf(Promise);
  });
});
