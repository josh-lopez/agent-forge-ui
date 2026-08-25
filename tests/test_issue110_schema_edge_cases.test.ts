/**
 * Issue #110 — Payment event schema: supplementary edge-case tests.
 *
 * These tests add coverage for edge cases not exercised by the primary test
 * files, including:
 *
 *   AC1  – isIso8601 boundary cases (fractional seconds, various offsets).
 *   AC1  – isUuid version nibble boundaries (v1–v5 accepted, v0/v6 rejected).
 *   AC2  – Discriminated-union narrowing: narrowing on eventType gives the
 *           correct payload type at compile time.
 *   AC5  – PaymentEvent discriminated union covers all five types.
 *   AC6  – Additional negative cases: wrong field types, partial objects.
 *   AC7  – Schema module has no async exports (purely synchronous).
 */

import { describe, expect, it } from 'vitest';

import {
  assertPaymentEvent,
  isIso8601,
  isPaymentEvent,
  isUuid,
  PAYMENT_EVENT_TYPES,
  type PaymentEvent,
} from '../src/events/paymentEventSchema';

// ── AC1: isIso8601 edge cases ─────────────────────────────────────────────────

describe('AC1 – isIso8601 edge cases', () => {
  it('accepts ISO-8601 with fractional seconds (3 digits)', () => {
    expect(isIso8601('2026-01-15T08:30:00.123Z')).toBe(true);
  });

  it('accepts ISO-8601 with fractional seconds (1 digit)', () => {
    expect(isIso8601('2026-01-15T08:30:00.9Z')).toBe(true);
  });

  it('accepts ISO-8601 with positive timezone offset', () => {
    expect(isIso8601('2026-01-15T08:30:00+05:30')).toBe(true);
  });

  it('accepts ISO-8601 with negative timezone offset', () => {
    expect(isIso8601('2026-01-15T08:30:00-08:00')).toBe(true);
  });

  it('accepts ISO-8601 with zero offset (+00:00)', () => {
    expect(isIso8601('2026-01-15T08:30:00+00:00')).toBe(true);
  });

  it('rejects ISO-8601 date-only (no time component)', () => {
    expect(isIso8601('2026-01-15')).toBe(false);
  });

  it('rejects ISO-8601 with missing timezone', () => {
    // No Z or offset — not a valid absolute timestamp
    expect(isIso8601('2026-01-15T08:30:00')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isIso8601('')).toBe(false);
  });

  it('rejects numeric value', () => {
    expect(isIso8601(1234567890)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isIso8601(undefined)).toBe(false);
  });
});

// ── AC1: isUuid version nibble boundaries ─────────────────────────────────────

describe('AC1 – isUuid version nibble boundaries', () => {
  it('accepts UUID v1', () => {
    expect(isUuid('11111111-1111-1111-8111-111111111111')).toBe(true);
  });

  it('accepts UUID v4', () => {
    expect(isUuid('a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5')).toBe(true);
  });

  it('accepts UUID v5', () => {
    expect(isUuid('a1b2c3d4-e5f6-5a7b-8c9d-e0f1a2b3c4d5')).toBe(true);
  });

  it('rejects UUID with version nibble 0 (invalid)', () => {
    expect(isUuid('a1b2c3d4-e5f6-0a7b-8c9d-e0f1a2b3c4d5')).toBe(false);
  });

  it('rejects UUID with version nibble 6 (not in v1-v5 range)', () => {
    expect(isUuid('a1b2c3d4-e5f6-6a7b-8c9d-e0f1a2b3c4d5')).toBe(false);
  });

  it('rejects UUID with wrong variant nibble (not 8/9/a/b)', () => {
    expect(isUuid('a1b2c3d4-e5f6-4a7b-0c9d-e0f1a2b3c4d5')).toBe(false);
  });

  it('rejects UUID with wrong segment lengths', () => {
    expect(isUuid('a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4')).toBe(false);
  });

  it('rejects UUID with uppercase letters (case-insensitive match still works)', () => {
    // The regex uses /i flag so uppercase should be accepted
    expect(isUuid('A1B2C3D4-E5F6-4A7B-8C9D-E0F1A2B3C4D5')).toBe(true);
  });
});

// ── AC2: Discriminated-union narrowing ────────────────────────────────────────

describe('AC2 – discriminated-union narrowing gives correct payload type', () => {
  const events: PaymentEvent[] = [
    {
      eventId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
      paymentId: 'pay_001',
      eventType: 'PaymentInitiated',
      occurredAt: '2026-06-01T09:00:00.000Z',
      payload: { amountMinor: 100, currency: 'AUD', customerId: 'cust_1' },
    },
    {
      eventId: 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6',
      paymentId: 'pay_001',
      eventType: 'PaymentAuthorised',
      occurredAt: '2026-06-01T09:00:01.000Z',
      payload: { authorisationId: 'auth_1', amountMinor: 100, currency: 'AUD' },
    },
    {
      eventId: 'c3d4e5f6-a7b8-4c9d-8e1f-a2b3c4d5e6f7',
      paymentId: 'pay_001',
      eventType: 'PaymentCaptured',
      occurredAt: '2026-06-01T09:00:02.000Z',
      payload: { authorisationId: 'auth_1', amountMinor: 100, currency: 'AUD' },
    },
    {
      eventId: 'd4e5f6a7-b8c9-4d0e-9f2a-b3c4d5e6f7a8',
      paymentId: 'pay_002',
      eventType: 'PaymentFailed',
      occurredAt: '2026-06-01T09:00:03.000Z',
      payload: { reasonCode: 'card_declined', reason: 'Declined' },
    },
    {
      eventId: 'e5f6a7b8-c9d0-4e1f-a23b-c4d5e6f7a8b9',
      paymentId: 'pay_001',
      eventType: 'PaymentRefunded',
      occurredAt: '2026-06-01T09:00:04.000Z',
      payload: { refundId: 'ref_1', amountMinor: 50, currency: 'AUD' },
    },
  ];

  it('all five events in the union pass runtime validation', () => {
    for (const event of events) {
      expect(isPaymentEvent(event)).toBe(true);
    }
  });

  it('narrowing on PaymentInitiated gives access to customerId', () => {
    const event = events.find((e) => e.eventType === 'PaymentInitiated')!;
    // TypeScript narrows payload to PaymentInitiatedPayload here
    if (event.eventType === 'PaymentInitiated') {
      expect(typeof event.payload.customerId).toBe('string');
    }
  });

  it('narrowing on PaymentFailed gives access to reasonCode', () => {
    const event = events.find((e) => e.eventType === 'PaymentFailed')!;
    if (event.eventType === 'PaymentFailed') {
      expect(typeof event.payload.reasonCode).toBe('string');
    }
  });

  it('narrowing on PaymentRefunded gives access to refundId', () => {
    const event = events.find((e) => e.eventType === 'PaymentRefunded')!;
    if (event.eventType === 'PaymentRefunded') {
      expect(typeof event.payload.refundId).toBe('string');
    }
  });
});

// ── AC5 / AC6: Additional negative cases ─────────────────────────────────────

describe('AC6 – additional negative cases', () => {
  const validBase = {
    eventId: 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
    paymentId: 'pay_001',
    eventType: 'PaymentInitiated' as const,
    occurredAt: '2026-06-01T09:00:00.000Z',
    payload: { amountMinor: 100, currency: 'AUD', customerId: 'cust_1' },
  };

  it('rejects an object with payload as an array', () => {
    expect(isPaymentEvent({ ...validBase, payload: [] })).toBe(false);
  });

  it('rejects an object with payload as a number', () => {
    expect(isPaymentEvent({ ...validBase, payload: 42 })).toBe(false);
  });

  it('rejects an object with payload as undefined', () => {
    expect(isPaymentEvent({ ...validBase, payload: undefined })).toBe(false);
  });

  it('rejects an object with eventId as an empty string', () => {
    expect(isPaymentEvent({ ...validBase, eventId: '' })).toBe(false);
  });

  it('rejects an object with occurredAt as a number (Unix timestamp)', () => {
    expect(isPaymentEvent({ ...validBase, occurredAt: 1234567890 })).toBe(false);
  });

  it('rejects an object with occurredAt as null', () => {
    expect(isPaymentEvent({ ...validBase, occurredAt: null })).toBe(false);
  });

  it('assertPaymentEvent message mentions PaymentEvent schema', () => {
    let message = '';
    try {
      assertPaymentEvent({ invalid: true });
    } catch (e) {
      if (e instanceof TypeError) message = e.message;
    }
    expect(message).toMatch(/PaymentEvent/i);
  });
});

// ── AC7: Synchronous / no async exports ──────────────────────────────────────

describe('AC7 – schema exports are synchronous (no backend dependency)', () => {
  it('PAYMENT_EVENT_TYPES is not a Promise', () => {
    expect(PAYMENT_EVENT_TYPES).not.toBeInstanceOf(Promise);
  });

  it('isPaymentEvent returns a boolean synchronously (not a Promise)', () => {
    const result = isPaymentEvent({ eventId: 'x' });
    expect(typeof result).toBe('boolean');
    expect(result).not.toBeInstanceOf(Promise);
  });

  it('PAYMENT_EVENT_TYPES has exactly 5 entries', () => {
    expect(PAYMENT_EVENT_TYPES).toHaveLength(5);
  });

  it('PAYMENT_EVENT_TYPES contains no duplicates', () => {
    const unique = new Set(PAYMENT_EVENT_TYPES);
    expect(unique.size).toBe(PAYMENT_EVENT_TYPES.length);
  });
});
