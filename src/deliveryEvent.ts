/**
 * Shared delivery-event shape used by both the real delivery mechanism and the
 * webhook delivery simulator.
 *
 * All UI components (event log, metrics dashboard, filters) consume this type
 * so there is no special-case branching between real and simulated data.
 *
 * Spec ref: spec § "Webhook delivery & retries" and § "Webhook delivery simulator"
 */

/** Possible lifecycle states for a single webhook delivery attempt. */
export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'exhausted';

/**
 * A single delivery attempt event.
 *
 * This is the canonical shape emitted by both the real delivery mechanism and
 * the simulator.  The event log, metrics dashboard, and filter components all
 * operate on arrays of this type.
 */
export interface DeliveryEvent {
  /** Unique identifier for this delivery attempt. */
  id: string;

  /**
   * The webhook event type, e.g. "payment.created", "refund.issued".
   * Used by the event-type filter (spec § "Event log filtering — Event-type filter").
   */
  eventType: string;

  /**
   * ISO-8601 timestamp of when this delivery attempt was made.
   * Used by the date-range filter (spec § "Event log filtering — Date-range filter").
   */
  timestamp: string;

  /** Lifecycle status of this attempt. */
  status: DeliveryStatus;

  /**
   * HTTP status code returned by the endpoint, or null when the attempt has
   * not yet completed (status === 'pending') or when no HTTP response was
   * received (e.g. network timeout).
   */
  httpStatusCode: number | null;

  /**
   * A short excerpt (≤ 200 chars) of the response body, or null when no
   * response body is available.  Truncated by the producer to avoid storing
   * large payloads in memory.
   */
  responseBodyExcerpt: string | null;

  /**
   * Which attempt number this is (1-based).  Attempt 1 is the initial
   * delivery; attempts 2+ are retries.
   */
  attemptNumber: number;

  /**
   * The webhook endpoint URL that was targeted.
   * Included so the log can display which endpoint received (or failed to
   * receive) the event.
   */
  webhookUrl: string;
}
