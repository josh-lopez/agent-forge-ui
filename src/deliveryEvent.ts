/**
 * Delivery event types for the webhook delivery mechanism.
 *
 * These types define the shape of delivery events emitted by both the real
 * delivery mechanism and the webhook delivery simulator. UI components must
 * use only these types so that no special-case code is needed for simulator
 * vs. real data.
 *
 * Spec ref: spec § "Webhook delivery & retries"
 */

/** Possible delivery statuses for a webhook attempt. */
export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'exhausted';

/**
 * A single delivery attempt log entry.
 *
 * Emitted by the delivery mechanism (or simulator) each time a webhook
 * delivery is attempted or its state transitions.
 */
export interface DeliveryEvent {
  /** Unique identifier for this delivery attempt. */
  id: string;
  /** The event type, e.g. "payment.created", "refund.issued". */
  eventType: string;
  /** Current delivery status of this attempt. */
  status: DeliveryStatus;
  /** ISO-8601 timestamp of this attempt. */
  timestamp: string;
  /** HTTP status code returned by the endpoint (undefined if not yet attempted). */
  httpStatus?: number;
  /** Excerpt of the response body (undefined if not yet attempted). */
  responseBody?: string;
  /** Number of attempts made so far (1-based). */
  attemptCount: number;
}
