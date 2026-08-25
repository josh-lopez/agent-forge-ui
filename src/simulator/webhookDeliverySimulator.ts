/**
 * Webhook Delivery Simulator — standalone client-side developer fixture.
 *
 * Creates a configurable simulator that progresses through the full retry
 * back-off schedule (immediately, 1 min, 5 min, 30 min, 2 h, 8 h), emitting
 * intermediate `failed` events before resolving to `delivered` or `exhausted`.
 *
 * This module:
 *  - Has zero runtime dependencies on external endpoints or a running backend.
 *  - Imports no UI framework code.
 *  - Re-exports the canonical `DeliveryEvent` type from the shared model so
 *    UI components need no special-case code for simulator vs real data.
 *
 * Spec ref: spec § "Webhook delivery simulator (developer fixture)"
 *
 * @module webhookDeliverySimulator
 */

// Re-export the canonical shared type so consumers can import it from here.
export type { DeliveryEvent, DeliveryStatus } from '../delivery-events';
import type { DeliveryEvent } from '../delivery-events';

// ---------------------------------------------------------------------------
// Retry schedule
// ---------------------------------------------------------------------------

/**
 * Default exponential back-off schedule in milliseconds.
 *
 * Index 0 = first attempt (immediate, 0 ms delay).
 * Index 1 = second attempt (1 min after first failure).
 * …and so on, matching the spec "Retry schedule" requirement.
 */
export const RETRY_SCHEDULE_MS: readonly number[] = [
  0,                    // attempt 1: immediate
  1 * 60 * 1000,        // attempt 2: 1 min
  5 * 60 * 1000,        // attempt 3: 5 min
  30 * 60 * 1000,       // attempt 4: 30 min
  2 * 60 * 60 * 1000,   // attempt 5: 2 h
  8 * 60 * 60 * 1000,   // attempt 6: 8 h
];

/** Default maximum number of attempts (covers the full canonical schedule). */
export const DEFAULT_MAX_ATTEMPTS = RETRY_SCHEDULE_MS.length;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options accepted by {@link createWebhookDeliverySimulator}.
 */
export interface WebhookDeliverySimulatorOptions {
  /**
   * Probability (0.0–1.0 inclusive) that each individual delivery attempt
   * succeeds.
   *
   * - `1.0` → every attempt resolves to `delivered` on the first try.
   * - `0.0` → every attempt fails; the webhook eventually reaches `exhausted`.
   * - Values between 0.0 and 1.0 produce probabilistic outcomes.
   *
   * Values outside [0.0, 1.0] are silently clamped to the nearest boundary.
   */
  successRate: number;

  /**
   * Maximum number of delivery attempts (including the initial attempt) before
   * the webhook is marked `exhausted`. Defaults to {@link DEFAULT_MAX_ATTEMPTS}
   * (6, matching the full canonical retry schedule).
   */
  maxAttempts: number;

  /**
   * Default event type to use when `simulate()` is called without an explicit
   * `eventType`. Defaults to `"payment.created"`.
   */
  defaultEventType?: string;

  /**
   * Override the back-off schedule (milliseconds between attempts).
   * Defaults to {@link RETRY_SCHEDULE_MS}.
   * Pass all-zero delays in tests to avoid real waits.
   */
  retryDelaysMs?: readonly number[];

  /**
   * Optional seeded random-number generator for deterministic testing.
   * Must return a value in [0, 1). Defaults to `Math.random`.
   */
  rng?: () => number;
}

// ---------------------------------------------------------------------------
// Simulator instance interface
// ---------------------------------------------------------------------------

/**
 * A webhook delivery simulator instance returned by
 * {@link createWebhookDeliverySimulator}.
 */
export interface WebhookDeliverySimulator {
  /**
   * Simulate the full delivery lifecycle of a single webhook, yielding one
   * {@link DeliveryEvent} per attempt until the webhook is either `delivered`
   * or `exhausted`.
   *
   * The generator respects the configured retry delays between attempts.
   * Pass `retryDelaysMs: [0, 0, ...]` in tests to avoid real waits.
   *
   * @param webhookId - Unique identifier for the webhook.
   * @param eventType - Event type string (e.g. `"payment.created"`).
   *                    Defaults to the `defaultEventType` from options.
   */
  simulate(webhookId: string, eventType?: string): AsyncIterable<DeliveryEvent>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new webhook delivery simulator.
 *
 * @param options - Simulator configuration. `successRate` and `maxAttempts`
 *                  are required; all other fields have sensible defaults.
 * @returns A {@link WebhookDeliverySimulator} whose `simulate()` method yields
 *          one {@link DeliveryEvent} per delivery attempt.
 *
 * @example
 * ```ts
 * const sim = createWebhookDeliverySimulator({ successRate: 0.8, maxAttempts: 6 });
 * for await (const event of sim.simulate('wh_1', 'payment.created')) {
 *   console.log(event.status, event.attempt);
 * }
 * ```
 */
export function createWebhookDeliverySimulator(
  options: WebhookDeliverySimulatorOptions,
): WebhookDeliverySimulator {
  const successRate = clamp01(options.successRate);
  const maxAttempts = Math.max(1, options.maxAttempts);
  const defaultEventType = options.defaultEventType ?? 'payment.created';
  const retryDelaysMs = options.retryDelaysMs ?? RETRY_SCHEDULE_MS;
  const rng = options.rng ?? Math.random;

  return {
    simulate(webhookId: string, eventType?: string): AsyncIterable<DeliveryEvent> {
      const resolvedEventType = eventType ?? defaultEventType;
      return makeAsyncIterable(
        webhookId,
        resolvedEventType,
        successRate,
        maxAttempts,
        retryDelaysMs,
        rng,
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns an AsyncIterable that yields one DeliveryEvent per attempt,
 * waiting the configured back-off delay between attempts.
 */
function makeAsyncIterable(
  webhookId: string,
  eventType: string,
  successRate: number,
  maxAttempts: number,
  retryDelaysMs: readonly number[],
  rng: () => number,
): AsyncIterable<DeliveryEvent> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<DeliveryEvent> {
      let attempt = 0;
      let done = false;

      return {
        async next(): Promise<IteratorResult<DeliveryEvent>> {
          if (done) return { value: undefined as unknown as DeliveryEvent, done: true };

          attempt += 1;

          // Wait for the back-off delay before this attempt.
          // The first attempt (index 0) has 0 ms delay.
          const delayIndex = attempt - 1;
          const delayMs =
            delayIndex < retryDelaysMs.length
              ? retryDelaysMs[delayIndex]
              : retryDelaysMs[retryDelaysMs.length - 1];

          if (delayMs > 0) {
            await sleep(delayMs);
          }

          const succeeded = rng() < successRate;
          const isLastAttempt = attempt >= maxAttempts;

          let status: DeliveryEvent['status'];
          let httpStatus: number;
          let responseBodyExcerpt: string;

          if (succeeded) {
            status = 'delivered';
            httpStatus = 200;
            responseBodyExcerpt = '{"ok":true}';
            done = true;
          } else if (isLastAttempt) {
            status = 'exhausted';
            httpStatus = 503;
            responseBodyExcerpt = '{"error":"upstream_unavailable"}';
            done = true;
          } else {
            status = 'failed';
            httpStatus = 503;
            responseBodyExcerpt = '{"error":"upstream_unavailable"}';
          }

          const event: DeliveryEvent = {
            webhookId,
            eventType,
            status,
            attempt,
            timestamp: new Date().toISOString(),
            httpStatus,
            responseBodyExcerpt,
          };

          return { value: event, done: false };
        },
      };
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
