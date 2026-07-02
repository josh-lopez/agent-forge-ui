/**
 * Shared types for webhook delivery state management.
 *
 * These types are used by the delivery store, the bulk re-trigger action,
 * the per-webhook manual re-trigger, and the webhook delivery simulator.
 *
 * Spec ref: spec § "Webhook delivery & retries"
 */

/** Possible delivery states for a webhook. */
export type WebhookStatus = 'pending' | 'delivered' | 'failed' | 'exhausted';

/** A single delivery attempt log entry. */
export interface DeliveryAttempt {
  /** ISO-8601 timestamp of the attempt. */
  timestamp: string;
  /** HTTP status code returned by the endpoint (0 if no response). */
  httpStatus: number;
  /** Excerpt of the response body (may be empty string). */
  responseExcerpt: string;
}

/** A webhook entry tracked by the delivery store. */
export interface WebhookEntry {
  /** Unique identifier for this webhook. */
  id: string;
  /** The event type (e.g. "payment.created"). */
  eventType: string;
  /** Current delivery status. */
  status: WebhookStatus;
  /** Ordered list of delivery attempts (oldest first). */
  attempts: DeliveryAttempt[];
}
