# Payment event schema (v1)

This document describes the versioned schema for **payment domain events**. The
canonical TypeScript definitions live in
[`src/events/paymentEventSchema.ts`](./src/events/paymentEventSchema.ts) — all
other modules should import the exported types from there rather than
re-declaring event shapes.

The schema is entirely client-side / build-time: it adds **no runtime
dependency on a backend service** and **no third-party runtime library**. A
small dependency-free runtime validator (`isPaymentEvent` / `assertPaymentEvent`)
is provided alongside the types for callers that need to validate untrusted
input.

## Base event shape

Every payment event extends a common base shape:

| Field        | Type                | Description                                                     |
| ------------ | ------------------- | --------------------------------------------------------------- |
| `eventId`    | `string` (UUID)     | Globally unique identifier for this event.                      |
| `paymentId`  | `string`            | Identifier of the payment this event relates to.                |
| `eventType`  | `PaymentEventType`  | Discriminating literal — one of the values listed below.        |
| `occurredAt` | `string` (ISO-8601) | When the event occurred, e.g. `2026-01-01T12:00:00.000Z`.       |
| `payload`    | `object`            | Event-type-specific structured data (see each type below).      |

`PaymentEventType` is the literal union:

```
'PaymentInitiated' | 'PaymentAuthorised' | 'PaymentCaptured'
  | 'PaymentFailed' | 'PaymentRefunded'
```

The exported `PaymentEvent` type is a discriminated union over `eventType`, so
narrowing on `eventType` yields precise `payload` typing.

## Event types

### `PaymentInitiated`

`eventType` literal: `"PaymentInitiated"`

A payment has been initiated.

| Payload field | Type     | Description                                      |
| ------------- | -------- | ------------------------------------------------ |
| `amountMinor` | `number` | Amount in the smallest currency unit (e.g. cents). |
| `currency`    | `string` | ISO-4217 currency code, e.g. `"AUD"`.            |
| `customerId`  | `string` | Identifier of the customer initiating the payment. |

### `PaymentAuthorised`

`eventType` literal: `"PaymentAuthorised"`

A payment has been authorised by the processor.

| Payload field     | Type     | Description                                      |
| ----------------- | -------- | ------------------------------------------------ |
| `authorisationId` | `string` | Identifier returned by the authorising processor. |
| `amountMinor`     | `number` | Amount authorised, in the smallest currency unit. |
| `currency`        | `string` | ISO-4217 currency code, e.g. `"AUD"`.            |

### `PaymentCaptured`

`eventType` literal: `"PaymentCaptured"`

Previously authorised funds have been captured.

| Payload field     | Type     | Description                                      |
| ----------------- | -------- | ------------------------------------------------ |
| `authorisationId` | `string` | Identifier of the authorisation being captured.  |
| `amountMinor`     | `number` | Amount captured, in the smallest currency unit.  |
| `currency`        | `string` | ISO-4217 currency code, e.g. `"AUD"`.            |

### `PaymentFailed`

`eventType` literal: `"PaymentFailed"`

A payment attempt has failed.

| Payload field | Type     | Description                                            |
| ------------- | -------- | ------------------------------------------------------ |
| `reasonCode`  | `string` | Machine-readable failure reason code, e.g. `"insufficient_funds"`. |
| `reason`      | `string` | Human-readable failure description.                    |

### `PaymentRefunded`

`eventType` literal: `"PaymentRefunded"`

A captured payment has been refunded (fully or partially).

| Payload field | Type     | Description                                     |
| ------------- | -------- | ----------------------------------------------- |
| `refundId`    | `string` | Identifier of the refund.                       |
| `amountMinor` | `number` | Amount refunded, in the smallest currency unit. |
| `currency`    | `string` | ISO-4217 currency code, e.g. `"AUD"`.           |

## Validation

```ts
import { isPaymentEvent, assertPaymentEvent } from './src/events/paymentEventSchema';

if (isPaymentEvent(value)) {
  // value is narrowed to PaymentEvent here
}

assertPaymentEvent(value); // throws TypeError if invalid
```

`eventId` is validated as a UUID and `occurredAt` is validated as an ISO-8601
date-time string. The `eventType` must be one of the five recognised literals.

## Versioning

This is **v1** of the schema. Adding new event types or payload fields in a
backwards-compatible way does not require a version bump; breaking changes will
be introduced as a new version.
