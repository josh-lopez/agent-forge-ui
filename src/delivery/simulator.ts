/**
 * Client-side webhook delivery simulator.
 *
 * Progresses through the full exponential back-off retry schedule, emitting
 * intermediate `failed` events before eventually resolving to `delivered` or
 * `exhausted`.  This lets developers exercise every UI state without a live
 * backend.
 *
 * Key design decisions
 * ────────────────────
 * • **Injectable clock** – the `now` and `sleep` options let tests drive time
 *   synchronously (or with fake timers) without waiting for real delays.
 * • **No real HTTP calls** – the simulator never touches the network.
 * • **Same event shape** – every emitted event satisfies `DeliveryEvent` so
 *   UI components need no special-case code.
 *
 * Spec ref: spec § "Webhook delivery simulator (developer fixture)"
 */

import {
  DEFAULT_MAX_ATTEMPTS,
  DeliveryEvent,
  DeliveryStatus,
  RETRY_SCHEDULE_MS,
} from './types.ts';

// ── Public API ────────────────────────────────────────────────────────────────

/** Callback invoked each time the simulator emits a delivery event. */
export type DeliveryEventListener = (event: DeliveryEvent) => void;

/** Options accepted by {@link WebhookDeliverySimulator}. */
export interface SimulatorOptions {
  /**
   * Probability (0.0–1.0) that any given delivery attempt succeeds.
   * Defaults to 0.8.
   */
  successRate?: number;

  /**
   * Maximum number of total attempts (initial + retries).
   * Defaults to {@link DEFAULT_MAX_ATTEMPTS} (7).
   */
  maxAttempts?: number;

  /**
   * Injectable clock function.  Returns the current time as a Unix timestamp
   * in milliseconds.  Defaults to `Date.now`.
   *
   * Provide a custom function in tests to control timestamps without real
   * wall-clock dependency.
   */
  now?: () => number;

  /**
   * Injectable sleep function.  Returns a Promise that resolves after `ms`
   * milliseconds.  Defaults to a real `setTimeout`-based delay.
   *
   * Provide a custom function in tests to skip delays entirely:
   * ```ts
   * sleep: () => Promise.resolve()
   * ```
   */
  sleep?: (ms: number) => Promise<void>;

  /**
   * Optional seeded random function (0 ≤ value < 1).  Defaults to
   * `Math.random`.  Inject a deterministic function in tests.
   */
  random?: () => number;
}

/**
 * Simulates the full webhook delivery retry flow.
 *
 * Usage:
 * ```ts
 * const sim = new WebhookDeliverySimulator({ successRate: 0.5 });
 * sim.on('delivery', (event) => console.log(event));
 * await sim.run();
 * ```
 */
export class WebhookDeliverySimulator {
  private readonly successRate: number;
  private readonly maxAttempts: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  private readonly listeners: DeliveryEventListener[] = [];
  private terminated = false;

  constructor(options: SimulatorOptions = {}) {
    this.successRate = options.successRate ?? 0.8;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.now = options.now ?? (() => Date.now());
    this.sleep =
      options.sleep ??
      ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    this.random = options.random ?? (() => Math.random());

    if (this.successRate < 0 || this.successRate > 1) {
      throw new RangeError(
        `successRate must be between 0.0 and 1.0, got ${this.successRate}`,
      );
    }
    if (this.maxAttempts < 1) {
      throw new RangeError(
        `maxAttempts must be at least 1, got ${this.maxAttempts}`,
      );
    }
  }

  /**
   * Register a listener for delivery events.
   *
   * @param _event - Currently only `'delivery'` is supported.
   * @param listener - Called with each {@link DeliveryEvent}.
   */
  on(_event: 'delivery', listener: DeliveryEventListener): this {
    this.listeners.push(listener);
    return this;
  }

  /**
   * Run the full delivery simulation.
   *
   * Progresses through every step of the retry schedule, emitting a
   * `failed` event for each unsuccessful attempt and a terminal `delivered`
   * or `exhausted` event at the end.
   *
   * Resolves when the simulation reaches a terminal state.
   */
  async run(): Promise<void> {
    this.terminated = false;

    for (let attemptIndex = 0; attemptIndex < this.maxAttempts; attemptIndex++) {
      // Apply the inter-attempt delay (skip for the very first attempt).
      if (attemptIndex > 0) {
        // The retry schedule has delays for retries 1..N.
        // RETRY_SCHEDULE_MS[0] = delay before retry 1 (i.e. between attempt 0
        // and attempt 1), RETRY_SCHEDULE_MS[1] = delay before retry 2, etc.
        const scheduleIndex = attemptIndex - 1;
        const delay =
          scheduleIndex < RETRY_SCHEDULE_MS.length
            ? RETRY_SCHEDULE_MS[scheduleIndex]
            : RETRY_SCHEDULE_MS[RETRY_SCHEDULE_MS.length - 1];
        await this.sleep(delay);
      }

      const succeeded = this.random() < this.successRate;
      const isLastAttempt = attemptIndex === this.maxAttempts - 1;

      let status: DeliveryStatus;
      let httpStatusCode: number;
      let responseBodyExcerpt: string;

      if (succeeded) {
        status = 'delivered';
        httpStatusCode = 200;
        responseBodyExcerpt = '{"ok":true}';
      } else if (isLastAttempt) {
        status = 'exhausted';
        httpStatusCode = 500;
        responseBodyExcerpt = '{"error":"Internal Server Error"}';
      } else {
        status = 'failed';
        httpStatusCode = 500;
        responseBodyExcerpt = '{"error":"Internal Server Error"}';
      }

      const event: DeliveryEvent = {
        status,
        timestamp: new Date(this.now()).toISOString(),
        httpStatusCode,
        responseBodyExcerpt,
        attemptIndex,
      };

      this.emit(event);

      // Stop after reaching a terminal state.
      if (status === 'delivered' || status === 'exhausted') {
        this.terminated = true;
        return;
      }
    }
  }

  /** Whether the simulator has reached a terminal state. */
  get isTerminated(): boolean {
    return this.terminated;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private emit(event: DeliveryEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
