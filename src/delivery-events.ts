// Delivery-event model shared by the real webhook delivery mechanism, the
// client-side simulator, and the UI components (event log, metrics dashboard).
//
// Keeping a single canonical shape here means UI components need no special-case
// code to handle simulator data versus real data — see spec "Simulator
// compatibility" and "Event emission" requirements.

/** Lifecycle status of a webhook delivery attempt / webhook. */
export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'exhausted';

/**
 * A single delivery *attempt* for a webhook. The real delivery mechanism and
 * the simulator both emit events in this shape.
 */
export interface DeliveryEvent {
  /**
   * Identifier of the webhook this attempt belongs to. All attempts for the
   * same webhook share this id, which is how the dashboard groups attempts into
   * "per webhook" retry counts and time-to-delivery measurements.
   */
  webhookId: string;
  /**
   * Canonical event-type identifier (e.g. `payment.created`, `refund.issued`).
   * Used for the per-event-type breakdown. Must be stable between the simulator
   * and the real mechanism so the breakdown does not fragment.
   */
  eventType: string;
  /** Status reached by this attempt. */
  status: DeliveryStatus;
  /**
   * 1-based attempt number for this webhook (1 = initial attempt, 2 = first
   * retry, …). Used to derive retry counts.
   */
  attempt: number;
  /** ISO-8601 timestamp of when the attempt was made. */
  timestamp: string;
  /** HTTP status code returned by the endpoint (0 if the request never completed). */
  httpStatus: number;
  /** Short excerpt of the response body, for the event log. */
  responseBodyExcerpt: string;
}

/**
 * Normalises a timestamp (ISO string or epoch millis) to epoch milliseconds.
 * Returns NaN for unparseable input so callers can guard explicitly rather than
 * silently producing wrong stats.
 */
export function toEpochMillis(timestamp: string | number): number {
  if (typeof timestamp === 'number') return timestamp;
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? NaN : ms;
}
