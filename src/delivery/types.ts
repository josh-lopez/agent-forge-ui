/**
 * Shared types for the webhook delivery mechanism.
 *
 * These types are used by both the real delivery service and the client-side
 * simulator so that UI components need no special-case code for either.
 *
 * Spec ref: spec § "Webhook delivery & retries"
 */

/** Terminal and intermediate states a webhook delivery attempt can be in. */
export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'exhausted';

/**
 * A single delivery attempt event emitted by the delivery mechanism or
 * simulator.  Every field is required so consumers can always render a
 * complete row in the event log without defensive null-checks.
 */
export interface DeliveryEvent {
  /** Current status of this attempt. */
  status: DeliveryStatus;

  /** ISO-8601 timestamp of when this attempt was made. */
  timestamp: string;

  /**
   * HTTP status code returned by the endpoint (or a synthetic code for
   * simulator/error cases, e.g. 0 for network failure).
   */
  httpStatusCode: number;

  /**
   * Short excerpt of the response body (first 200 chars).  Empty string when
   * no body is available.
   */
  responseBodyExcerpt: string;

  /** Zero-based index of this attempt (0 = first attempt, 1 = first retry…). */
  attemptIndex: number;
}

/**
 * Retry schedule: delays (in milliseconds) between consecutive attempts.
 *
 * Index 0 is the delay before the first retry (after the initial attempt
 * fails).  The schedule is fixed per spec:
 *   immediately (0 ms), 1 min, 5 min, 30 min, 2 h, 8 h
 *
 * "Immediately" means the first attempt is made with no delay; the value at
 * index 0 is the delay before the *second* attempt.
 */
export const RETRY_SCHEDULE_MS: readonly number[] = [
  0,               // retry 1: immediately
  1 * 60_000,      // retry 2: 1 minute
  5 * 60_000,      // retry 3: 5 minutes
  30 * 60_000,     // retry 4: 30 minutes
  2 * 60 * 60_000, // retry 5: 2 hours
  8 * 60 * 60_000, // retry 6: 8 hours
];

/** Default maximum number of attempts (1 initial + 6 retries = 7 total). */
export const DEFAULT_MAX_ATTEMPTS = 7;
