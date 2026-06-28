/**
 * Canonical delivery-event schema shared by the real delivery mechanism and
 * the webhook delivery simulator.
 *
 * Both modules MUST import and conform to this type so that UI components
 * never need special-case branching to distinguish simulator-emitted events
 * from real-mechanism-emitted events.
 */

/** Lifecycle states a webhook delivery attempt can be in. */
export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'exhausted';

/**
 * A single delivery-attempt event.
 *
 * Fields:
 *  - `status`             – current lifecycle state of this attempt.
 *  - `timestamp`          – ISO 8601 string recording when the attempt was made.
 *  - `httpStatusCode`     – HTTP response status code received from the endpoint,
 *                           or `null` when no HTTP response was received (e.g.
 *                           network-level failure before a response arrived).
 *  - `responseBodyExcerpt`– First 200 characters of the response body (empty
 *                           string when no body is available).
 *  - `webhookId`          – Opaque identifier for the webhook being delivered.
 *  - `eventType`          – The event type label (e.g. "payment.created").
 *  - `attemptNumber`      – 1-based index of this attempt within the retry
 *                           schedule for this webhook.
 */
export interface DeliveryEvent {
  status: DeliveryStatus;
  timestamp: string; // ISO 8601
  httpStatusCode: number | null;
  responseBodyExcerpt: string;
  webhookId: string;
  eventType: string;
  attemptNumber: number;
}

/**
 * Runtime structural validator for `DeliveryEvent`.
 *
 * Returns `true` when `value` satisfies every required field and type
 * constraint of `DeliveryEvent`.  Useful in tests and simulator fixtures
 * where TypeScript's compile-time checks are not available.
 */
export function isDeliveryEvent(value: unknown): value is DeliveryEvent {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;

  const validStatuses: DeliveryStatus[] = [
    'pending',
    'delivered',
    'failed',
    'exhausted',
  ];

  return (
    validStatuses.includes(v['status'] as DeliveryStatus) &&
    typeof v['timestamp'] === 'string' &&
    v['timestamp'].length > 0 &&
    (v['httpStatusCode'] === null || typeof v['httpStatusCode'] === 'number') &&
    typeof v['responseBodyExcerpt'] === 'string' &&
    typeof v['webhookId'] === 'string' &&
    typeof v['eventType'] === 'string' &&
    typeof v['attemptNumber'] === 'number' &&
    v['attemptNumber'] >= 1
  );
}
