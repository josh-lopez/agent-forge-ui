/**
 * Payment domain event schema (v1).
 *
 * Defines a documented, versioned schema for payment domain events. This is the
 * single source of truth for the shape of payment events across the codebase —
 * other `src/` modules should import these types rather than re-declaring them.
 *
 * The schema is entirely type-level plus a small dependency-free runtime
 * validator (`isPaymentEvent` / `assertPaymentEvent`). No backend service or
 * third-party runtime dependency is introduced.
 *
 * See `PAYMENT_EVENTS.md` for the human-readable description of each event type
 * and its payload fields.
 */

/** Literal union of every supported payment event type. */
export type PaymentEventType =
  | 'PaymentInitiated'
  | 'PaymentAuthorised'
  | 'PaymentCaptured'
  | 'PaymentFailed'
  | 'PaymentRefunded';

/**
 * Base shape shared by every payment event.
 *
 * @typeParam TType    - The discriminating `eventType` literal.
 * @typeParam TPayload - The event-type-specific payload object.
 */
export interface BasePaymentEvent<
  TType extends PaymentEventType,
  TPayload extends object,
> {
  /** Globally unique identifier for this event (UUID string). */
  eventId: string;
  /** Identifier of the payment this event relates to. */
  paymentId: string;
  /** Discriminating event-type literal. */
  eventType: TType;
  /** When the event occurred, as an ISO-8601 timestamp string. */
  occurredAt: string;
  /** Event-type-specific structured data. */
  payload: TPayload;
}

/* -------------------------------------------------------------------------- */
/* Per-event payloads                                                         */
/* -------------------------------------------------------------------------- */

/** Payload for {@link PaymentInitiatedEvent}. */
export interface PaymentInitiatedPayload {
  /** Amount in the smallest currency unit (e.g. cents). */
  amountMinor: number;
  /** ISO-4217 currency code, e.g. "AUD". */
  currency: string;
  /** Identifier of the customer initiating the payment. */
  customerId: string;
}

/** Payload for {@link PaymentAuthorisedEvent}. */
export interface PaymentAuthorisedPayload {
  /** Identifier returned by the authorising processor. */
  authorisationId: string;
  /** Amount authorised, in the smallest currency unit. */
  amountMinor: number;
  /** ISO-4217 currency code, e.g. "AUD". */
  currency: string;
}

/** Payload for {@link PaymentCapturedEvent}. */
export interface PaymentCapturedPayload {
  /** Identifier of the authorisation being captured. */
  authorisationId: string;
  /** Amount captured, in the smallest currency unit. */
  amountMinor: number;
  /** ISO-4217 currency code, e.g. "AUD". */
  currency: string;
}

/** Payload for {@link PaymentFailedEvent}. */
export interface PaymentFailedPayload {
  /** Machine-readable failure reason code, e.g. "insufficient_funds". */
  reasonCode: string;
  /** Human-readable failure description. */
  reason: string;
}

/** Payload for {@link PaymentRefundedEvent}. */
export interface PaymentRefundedPayload {
  /** Identifier of the refund. */
  refundId: string;
  /** Amount refunded, in the smallest currency unit. */
  amountMinor: number;
  /** ISO-4217 currency code, e.g. "AUD". */
  currency: string;
}

/* -------------------------------------------------------------------------- */
/* Concrete event types                                                       */
/* -------------------------------------------------------------------------- */

/** A payment has been initiated. */
export type PaymentInitiatedEvent = BasePaymentEvent<
  'PaymentInitiated',
  PaymentInitiatedPayload
>;

/** A payment has been authorised by the processor. */
export type PaymentAuthorisedEvent = BasePaymentEvent<
  'PaymentAuthorised',
  PaymentAuthorisedPayload
>;

/** Previously authorised funds have been captured. */
export type PaymentCapturedEvent = BasePaymentEvent<
  'PaymentCaptured',
  PaymentCapturedPayload
>;

/** A payment attempt has failed. */
export type PaymentFailedEvent = BasePaymentEvent<
  'PaymentFailed',
  PaymentFailedPayload
>;

/** A captured payment has been refunded (fully or partially). */
export type PaymentRefundedEvent = BasePaymentEvent<
  'PaymentRefunded',
  PaymentRefundedPayload
>;

/**
 * Discriminated union of every concrete payment event.
 *
 * Narrowing on `eventType` gives precise `payload` typing.
 */
export type PaymentEvent =
  | PaymentInitiatedEvent
  | PaymentAuthorisedEvent
  | PaymentCapturedEvent
  | PaymentFailedEvent
  | PaymentRefundedEvent;

/** All recognised payment event-type literals, useful for runtime checks. */
export const PAYMENT_EVENT_TYPES: readonly PaymentEventType[] = [
  'PaymentInitiated',
  'PaymentAuthorised',
  'PaymentCaptured',
  'PaymentFailed',
  'PaymentRefunded',
] as const;

/* -------------------------------------------------------------------------- */
/* Lightweight, dependency-free runtime validation                           */
/* -------------------------------------------------------------------------- */

/** Canonical UUID (v1–v5) matcher. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * ISO-8601 date-time matcher. Accepts a `Z` or `±HH:MM` offset and an optional
 * fractional-seconds component. Also requires `Date.parse` to succeed so that
 * obviously invalid dates (e.g. month 13) are rejected.
 */
const ISO_8601_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Returns true when `value` is a non-empty UUID string. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Returns true when `value` is a valid ISO-8601 date-time string. */
export function isIso8601(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    ISO_8601_RE.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

/** Returns true when `value` is one of the recognised event-type literals. */
export function isPaymentEventType(value: unknown): value is PaymentEventType {
  return (
    typeof value === 'string' &&
    (PAYMENT_EVENT_TYPES as readonly string[]).includes(value)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Runtime type-guard validating that an unknown value satisfies the base
 * payment-event schema. Validates field presence/types, the `eventType`
 * literal, UUID format of `eventId`, and ISO-8601 format of `occurredAt`.
 *
 * Pure and dependency-free — safe to use client-side and in tests.
 */
export function isPaymentEvent(value: unknown): value is PaymentEvent {
  if (!isPlainObject(value)) return false;

  if (!isUuid(value.eventId)) return false;
  if (typeof value.paymentId !== 'string' || value.paymentId.length === 0) {
    return false;
  }
  if (!isPaymentEventType(value.eventType)) return false;
  if (!isIso8601(value.occurredAt)) return false;
  if (!isPlainObject(value.payload)) return false;

  return true;
}

/**
 * Asserting variant of {@link isPaymentEvent}. Throws a `TypeError` with a
 * descriptive message when `value` does not satisfy the schema; otherwise
 * narrows `value` to {@link PaymentEvent}.
 */
export function assertPaymentEvent(value: unknown): asserts value is PaymentEvent {
  if (!isPaymentEvent(value)) {
    throw new TypeError('Value does not satisfy the PaymentEvent schema');
  }
}
