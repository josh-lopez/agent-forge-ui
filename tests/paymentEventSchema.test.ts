import { describe, expect, it } from 'vitest';

import {
  assertPaymentEvent,
  isPaymentEvent,
  PAYMENT_EVENT_TYPES,
  type PaymentAuthorisedEvent,
  type PaymentCapturedEvent,
  type PaymentEvent,
  type PaymentFailedEvent,
  type PaymentInitiatedEvent,
  type PaymentRefundedEvent,
} from '../src/events/paymentEventSchema';

// Sample objects, one per concrete event type. Each is annotated with its
// concrete type so the test fails to compile (TypeScript) if the sample drifts
// from the schema — this is the type-level half of the assertion.
const initiated: PaymentInitiatedEvent = {
  eventId: '11111111-1111-4111-8111-111111111111',
  paymentId: 'pay_001',
  eventType: 'PaymentInitiated',
  occurredAt: '2026-01-01T12:00:00.000Z',
  payload: { amountMinor: 1000, currency: 'AUD', customerId: 'cust_1' },
};

const authorised: PaymentAuthorisedEvent = {
  eventId: '22222222-2222-4222-8222-222222222222',
  paymentId: 'pay_001',
  eventType: 'PaymentAuthorised',
  occurredAt: '2026-01-01T12:00:01.000Z',
  payload: { authorisationId: 'auth_1', amountMinor: 1000, currency: 'AUD' },
};

const captured: PaymentCapturedEvent = {
  eventId: '33333333-3333-4333-8333-333333333333',
  paymentId: 'pay_001',
  eventType: 'PaymentCaptured',
  occurredAt: '2026-01-01T12:00:02.000Z',
  payload: { authorisationId: 'auth_1', amountMinor: 1000, currency: 'AUD' },
};

const failed: PaymentFailedEvent = {
  eventId: '44444444-4444-4444-8444-444444444444',
  paymentId: 'pay_002',
  eventType: 'PaymentFailed',
  occurredAt: '2026-01-01T12:00:03.000Z',
  payload: { reasonCode: 'insufficient_funds', reason: 'Card declined' },
};

const refunded: PaymentRefundedEvent = {
  eventId: '55555555-5555-4555-8555-555555555555',
  paymentId: 'pay_001',
  eventType: 'PaymentRefunded',
  occurredAt: '2026-01-01T12:00:04.000Z',
  payload: { refundId: 'ref_1', amountMinor: 1000, currency: 'AUD' },
};

const samples: PaymentEvent[] = [initiated, authorised, captured, failed, refunded];

describe('payment event schema', () => {
  it('exposes all five recognised event-type literals', () => {
    expect(PAYMENT_EVENT_TYPES).toEqual([
      'PaymentInitiated',
      'PaymentAuthorised',
      'PaymentCaptured',
      'PaymentFailed',
      'PaymentRefunded',
    ]);
  });

  it.each(samples.map((s) => [s.eventType, s] as const))(
    'accepts a valid %s event at runtime',
    (_label, event) => {
      expect(isPaymentEvent(event)).toBe(true);
      expect(() => assertPaymentEvent(event)).not.toThrow();
    },
  );

  it('covers every event-type literal across the samples', () => {
    expect(samples.map((s) => s.eventType).sort()).toEqual(
      [...PAYMENT_EVENT_TYPES].sort(),
    );
  });

  // Negative case: an object missing the required `eventId` field must fail
  // runtime validation. (At compile time, omitting `eventId` from a value typed
  // as PaymentInitiatedEvent would also be a TypeScript error.)
  it('rejects an event missing the required eventId field', () => {
    const { eventId: _omitted, ...withoutEventId } = initiated;
    expect(isPaymentEvent(withoutEventId)).toBe(false);
    expect(() => assertPaymentEvent(withoutEventId)).toThrow(TypeError);
  });

  it('rejects an event with a non-UUID eventId', () => {
    expect(isPaymentEvent({ ...initiated, eventId: 'not-a-uuid' })).toBe(false);
  });

  it('rejects an event with a non-ISO-8601 occurredAt', () => {
    expect(isPaymentEvent({ ...initiated, occurredAt: '01/01/2026' })).toBe(
      false,
    );
  });

  it('rejects an unknown eventType literal', () => {
    expect(isPaymentEvent({ ...initiated, eventType: 'PaymentExploded' })).toBe(
      false,
    );
  });

  it('rejects a non-object value', () => {
    expect(isPaymentEvent(null)).toBe(false);
    expect(isPaymentEvent('PaymentInitiated')).toBe(false);
    expect(isPaymentEvent([initiated])).toBe(false);
  });
});
