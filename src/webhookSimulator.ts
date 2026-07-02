/**
 * Webhook Delivery Simulator
 *
 * A client-side, dev-only module that simulates webhook delivery attempts with
 * configurable success/failure rates and exponential back-off retries.
 *
 * Spec ref: spec § "Webhook delivery simulator (developer fixture)"
 *
 * @module webhookSimulator
 */

// ---------------------------------------------------------------------------
// Delivery event shape
// ---------------------------------------------------------------------------

/** Status of a single delivery attempt. */
export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'exhausted';

/**
 * A single delivery attempt event emitted by the simulator.
 * This shape is identical to what the real delivery mechanism emits so that
 * UI components require no special-case code.
 */
export interface DeliveryEvent {
  /** Unique identifier for the webhook being delivered. */
  webhookId: string;
  /** The event type (e.g. "payment.created", "refund.issued"). */
  eventType: string;
  /** Outcome of this attempt. */
  status: DeliveryStatus;
  /** ISO-8601 timestamp of this attempt. */
  timestamp: string;
  /** HTTP status code returned by the endpoint (0 if no response). */
  httpStatus: number;
  /** First 200 characters of the response body (empty string if none). */
  responseExcerpt: string;
  /** 1-based attempt number. */
  attempt: number;
}

// ---------------------------------------------------------------------------
// Simulator configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the {@link WebhookSimulator}.
 */
export interface SimulatorConfig {
  /**
   * Probability (0.0–1.0 inclusive) that each individual delivery attempt
   * succeeds.
   *
   * - `1.0` → every attempt resolves to `delivered`.
   * - `0.0` → every attempt fails; the webhook eventually reaches `exhausted`.
   * - Values in between produce probabilistic outcomes.
   *
   * Values outside [0.0, 1.0] are clamped to the nearest boundary.
   */
  successRate: number;

  /**
   * Maximum number of delivery attempts before the webhook is marked
   * `exhausted`. Defaults to 6 (matches the spec retry schedule).
   */
  maxAttempts?: number;

  /**
   * Retry back-off delays in milliseconds between attempts.
   * Defaults to [0, 60_000, 300_000, 1_800_000, 7_200_000, 28_800_000]
   * (immediately, 1 min, 5 min, 30 min, 2 h, 8 h).
   *
   * In tests you can pass short delays (e.g. all zeros) to avoid real waits.
   */
  retryDelaysMs?: number[];

  /**
   * Optional seeded random-number generator for deterministic testing.
   * Must return a value in [0, 1). Defaults to `Math.random`.
   */
  rng?: () => number;
}

// ---------------------------------------------------------------------------
// Default retry schedule (spec §"Retry schedule")
// ---------------------------------------------------------------------------

const DEFAULT_RETRY_DELAYS_MS = [
  0,           // immediate first attempt
  60_000,      // 1 min
  300_000,     // 5 min
  1_800_000,   // 30 min
  7_200_000,   // 2 h
  28_800_000,  // 8 h
];

const DEFAULT_MAX_ATTEMPTS = 6;

// ---------------------------------------------------------------------------
// Simulator
// ---------------------------------------------------------------------------

/**
 * Simulates webhook delivery with configurable success rate and exponential
 * back-off retries.
 *
 * @example
 * ```ts
 * const sim = new WebhookSimulator({ successRate: 0.8 });
 * for await (const event of sim.deliver('wh_1', 'payment.created')) {
 *   console.log(event.status, event.attempt);
 * }
 * ```
 */
export class WebhookSimulator {
  private readonly successRate: number;
  private readonly maxAttempts: number;
  private readonly retryDelaysMs: number[];
  private readonly rng: () => number;

  /**
   * Create a new simulator instance.
   *
   * @param config - Simulator configuration. `successRate` is required.
   * @throws Never — out-of-range `successRate` values are silently clamped.
   */
  constructor(config: SimulatorConfig) {
    // Clamp successRate to [0.0, 1.0] rather than throwing, so callers with
    // floating-point edge cases degrade gracefully.
    this.successRate = Math.min(1.0, Math.max(0.0, config.successRate));
    this.maxAttempts = config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.retryDelaysMs = config.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.rng = config.rng ?? Math.random;
  }

  /**
   * Simulate delivery of a single webhook, yielding one {@link DeliveryEvent}
   * per attempt until the webhook is either `delivered` or `exhausted`.
   *
   * The generator respects the configured retry delays between attempts.
   * Pass `retryDelaysMs: [0, 0, ...]` in tests to avoid real waits.
   *
   * @param webhookId - Unique identifier for the webhook.
   * @param eventType - Event type string (e.g. "payment.created").
   */
  async *deliver(
    webhookId: string,
    eventType: string,
  ): AsyncGenerator<DeliveryEvent> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      // Wait for the back-off delay before this attempt (first attempt has 0 ms).
      const delayIndex = attempt - 1;
      const delayMs =
        delayIndex < this.retryDelaysMs.length
          ? this.retryDelaysMs[delayIndex]
          : this.retryDelaysMs[this.retryDelaysMs.length - 1];

      if (delayMs > 0) {
        await sleep(delayMs);
      }

      const succeeded = this.rng() < this.successRate;
      const isLastAttempt = attempt === this.maxAttempts;

      if (succeeded) {
        yield makeEvent(webhookId, eventType, 'delivered', attempt, 200, 'OK');
        return; // Delivery succeeded — stop retrying.
      }

      if (isLastAttempt) {
        // Final attempt also failed — mark as exhausted.
        yield makeEvent(webhookId, eventType, 'exhausted', attempt, 0, '');
      } else {
        // Intermediate failure — will retry.
        yield makeEvent(webhookId, eventType, 'failed', attempt, 500, 'Internal Server Error');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(
  webhookId: string,
  eventType: string,
  status: DeliveryStatus,
  attempt: number,
  httpStatus: number,
  responseExcerpt: string,
): DeliveryEvent {
  return {
    webhookId,
    eventType,
    status,
    timestamp: new Date().toISOString(),
    httpStatus,
    responseExcerpt,
    attempt,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
