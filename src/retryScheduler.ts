/**
 * Webhook delivery retry scheduler with exponential back-off.
 *
 * Implements the retry schedule specified in spec/README.md:
 *   "failed webhook deliveries are retried on an exponential back-off schedule
 *    (e.g. immediately, then 1 min, 5 min, 30 min, 2 h, 8 h) up to a
 *    configurable maximum attempt count."
 *
 * This module is entirely client-side and has no dependency on any backend
 * service or real HTTP endpoint.
 *
 * Spec ref: spec § "Webhook delivery & retries"
 */

// ── Delivery-event shape ──────────────────────────────────────────────────────

/** Status of a single delivery attempt or the overall webhook delivery. */
export type DeliveryStatus = 'pending' | 'failed' | 'delivered' | 'exhausted';

/**
 * A delivery event emitted for each attempt (and for the final state
 * transition).  This shape is shared by the retry scheduler, the simulator,
 * the event log, and the status UI so that no component needs special-case
 * code.
 */
export interface DeliveryEvent {
  /** Current status of this attempt. */
  status: DeliveryStatus;
  /** ISO-8601 timestamp of when this event was created. */
  timestamp: string;
  /** HTTP status code returned by the endpoint (0 if no response was received). */
  httpStatus: number;
  /** First 200 characters of the response body (empty string if none). */
  responseBodyExcerpt: string;
  /** 1-based attempt number. */
  attemptNumber: number;
}

// ── Back-off schedule ─────────────────────────────────────────────────────────

/**
 * Canonical back-off schedule in milliseconds.
 *
 * Index 0 = first attempt (immediate, 0 ms delay before the first call).
 * Index 1 = second attempt (1 min after the first failure).
 * Index 2 = third attempt (5 min after the second failure).
 * …and so on.
 *
 * When the attempt number exceeds the length of this array the last interval
 * is reused (i.e. 8 h for any attempt beyond the 6th).
 */
export const BACKOFF_SCHEDULE_MS: readonly number[] = [
  0,                    // attempt 1: immediate
  1 * 60 * 1000,        // attempt 2: 1 min
  5 * 60 * 1000,        // attempt 3: 5 min
  30 * 60 * 1000,       // attempt 4: 30 min
  2 * 60 * 60 * 1000,   // attempt 5: 2 h
  8 * 60 * 60 * 1000,   // attempt 6: 8 h
];

/** Default maximum number of attempts (covers the full canonical schedule). */
export const DEFAULT_MAX_ATTEMPTS = BACKOFF_SCHEDULE_MS.length;

// ── Attempt function type ─────────────────────────────────────────────────────

/**
 * The result returned by a single delivery attempt.
 *
 * Consumers (the simulator, tests, etc.) provide this function; the scheduler
 * calls it for each attempt and uses the result to decide whether to retry.
 */
export interface AttemptResult {
  /** Whether this attempt succeeded. */
  success: boolean;
  /** HTTP status code (0 if no response). */
  httpStatus: number;
  /** Response body excerpt (empty string if none). */
  responseBodyExcerpt: string;
}

/** A function that performs (or simulates) a single delivery attempt. */
export type AttemptFn = (attemptNumber: number) => AttemptResult | Promise<AttemptResult>;

// ── Scheduler options ─────────────────────────────────────────────────────────

export interface RetrySchedulerOptions {
  /**
   * Maximum number of delivery attempts (including the first).
   * Defaults to `DEFAULT_MAX_ATTEMPTS` (6).
   */
  maxAttempts?: number;

  /**
   * Override the back-off schedule (milliseconds between attempts).
   * Defaults to `BACKOFF_SCHEDULE_MS`.
   * Useful for tests that want to use fake timers with custom intervals.
   */
  scheduleMs?: readonly number[];

  /**
   * Called after every attempt with the resulting `DeliveryEvent`.
   * Receives intermediate `failed` events as well as the terminal
   * `delivered` / `exhausted` event.
   */
  onEvent?: (event: DeliveryEvent) => void;
}

// ── Scheduler handle ──────────────────────────────────────────────────────────

/** Handle returned by `scheduleWithRetry`; allows the caller to cancel. */
export interface RetryHandle {
  /**
   * Cancel all pending retries.  Any in-flight attempt is allowed to complete
   * but its result is discarded and no further events are emitted.
   */
  cancel(): void;
}

// ── Core implementation ───────────────────────────────────────────────────────

/**
 * Schedule a webhook delivery with automatic exponential back-off retries.
 *
 * @param attemptFn - Function that performs (or simulates) a single delivery
 *                    attempt.  Must return (or resolve to) an `AttemptResult`.
 * @param options   - Configuration: `maxAttempts`, `scheduleMs`, `onEvent`.
 * @returns A `RetryHandle` that can be used to cancel pending retries.
 *
 * @example
 * ```ts
 * const handle = scheduleWithRetry(
 *   (n) => ({ success: Math.random() > 0.5, httpStatus: 200, responseBodyExcerpt: '' }),
 *   { maxAttempts: 3, onEvent: (e) => console.log(e) },
 * );
 * // Later, if the component unmounts:
 * handle.cancel();
 * ```
 */
export function scheduleWithRetry(
  attemptFn: AttemptFn,
  options: RetrySchedulerOptions = {},
): RetryHandle {
  const {
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    scheduleMs = BACKOFF_SCHEDULE_MS,
    onEvent,
  } = options;

  let cancelled = false;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  /**
   * Return the delay (ms) before attempt number `attemptIndex` (0-based).
   * The first attempt (index 0) always fires immediately (0 ms).
   */
  function delayFor(attemptIndex: number): number {
    if (attemptIndex === 0) return 0;
    // Use the schedule entry for this index, or the last entry if beyond.
    const idx = Math.min(attemptIndex, scheduleMs.length - 1);
    return scheduleMs[idx];
  }

  function emit(event: DeliveryEvent): void {
    if (!cancelled && onEvent) {
      onEvent(event);
    }
  }

  async function runAttempt(attemptIndex: number): Promise<void> {
    if (cancelled) return;

    const attemptNumber = attemptIndex + 1; // 1-based for the event
    const result = await attemptFn(attemptNumber);

    if (cancelled) return;

    const timestamp = new Date().toISOString();

    if (result.success) {
      emit({
        status: 'delivered',
        timestamp,
        httpStatus: result.httpStatus,
        responseBodyExcerpt: result.responseBodyExcerpt,
        attemptNumber,
      });
      return; // Done — no more retries.
    }

    // This attempt failed.
    const isLastAttempt = attemptNumber >= maxAttempts;

    if (isLastAttempt) {
      emit({
        status: 'exhausted',
        timestamp,
        httpStatus: result.httpStatus,
        responseBodyExcerpt: result.responseBodyExcerpt,
        attemptNumber,
      });
      return; // All attempts exhausted.
    }

    // Emit an intermediate `failed` event and schedule the next attempt.
    emit({
      status: 'failed',
      timestamp,
      httpStatus: result.httpStatus,
      responseBodyExcerpt: result.responseBodyExcerpt,
      attemptNumber,
    });

    const nextAttemptIndex = attemptIndex + 1;
    const delay = delayFor(nextAttemptIndex);

    timerId = setTimeout(() => {
      timerId = null;
      void runAttempt(nextAttemptIndex);
    }, delay);
  }

  // Kick off the first attempt (delay = 0, but still async via setTimeout so
  // callers always receive the handle before any events fire).
  timerId = setTimeout(() => {
    timerId = null;
    void runAttempt(0);
  }, 0);

  return {
    cancel(): void {
      cancelled = true;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    },
  };
}
