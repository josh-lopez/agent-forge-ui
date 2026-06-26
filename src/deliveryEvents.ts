// Shared delivery-event type definitions.
//
// This module is the single source of truth for the *shape* of a webhook
// delivery event. Both the real delivery mechanism (when it lands) and the
// developer-only webhook simulator (src/webhookSimulator.ts) emit events that
// conform to these types, so UI components need no special-case code to
// distinguish simulated data from live data.
//
// Keep this module free of side effects and runtime dependencies — it should
// contain only types and small pure constants so it can be imported anywhere
// (including production code paths) without bloating the bundle.

/**
 * Lifecycle status of a webhook delivery.
 *
 * - `pending`   — an attempt has been scheduled/initiated but not yet resolved.
 * - `failed`    — an individual attempt failed; further retries may follow.
 * - `delivered` — the webhook was successfully delivered; no further retries.
 * - `exhausted` — every retry attempt failed; the webhook is given up on.
 */
export type DeliveryStatus = 'pending' | 'failed' | 'delivered' | 'exhausted';

/**
 * A single delivery attempt event.
 *
 * This is the canonical shape consumed by the UI (event log, metrics
 * dashboard, alerting). The simulator emits objects of exactly this shape.
 */
export interface DeliveryEvent {
  /** Identifier of the webhook this attempt belongs to. */
  webhookId: string;
  /** Event type that triggered the webhook, e.g. `payment.created`. */
  eventType: string;
  /** Lifecycle status of this delivery attempt. */
  status: DeliveryStatus;
  /**
   * 1-based attempt number (1 = the initial immediate attempt). For terminal
   * `delivered`/`exhausted` events this is the attempt on which delivery
   * resolved.
   */
  attempt: number;
  /** ISO-8601 timestamp of when this attempt resolved. */
  timestamp: string;
  /**
   * HTTP status code returned by the (simulated) endpoint, e.g. 200, 500.
   * `null` when no response was produced (not applicable for `pending`).
   */
  httpStatusCode: number | null;
  /** Short excerpt of the response body, truncated for display. */
  responseBodyExcerpt: string;
}

/**
 * The exponential back-off retry schedule, expressed as delays in
 * milliseconds *before* each attempt. The first entry (`0`) is the immediate
 * initial attempt; subsequent entries are the back-off before each retry:
 * immediately, 1 min, 5 min, 30 min, 2 h, 8 h.
 *
 * The length of this array is the spec's default maximum attempt count (6).
 */
export const RETRY_SCHEDULE_MS: readonly number[] = [
  0, // immediate (initial attempt)
  60_000, // 1 minute
  5 * 60_000, // 5 minutes
  30 * 60_000, // 30 minutes
  2 * 60 * 60_000, // 2 hours
  8 * 60 * 60_000, // 8 hours
];

/** Default maximum number of delivery attempts (initial + retries). */
export const DEFAULT_MAX_ATTEMPTS = RETRY_SCHEDULE_MS.length;
