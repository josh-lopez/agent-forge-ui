// Client-side webhook delivery simulator (developer fixture).
//
// This module lets developers exercise every webhook-delivery UI state — the
// full exponential back-off retry schedule, intermediate `failed` events, and
// terminal `delivered`/`exhausted` outcomes — WITHOUT a running backend and
// WITHOUT making any real network requests. It is entirely client-side and
// dependency-free beyond the shared event-type definitions in
// `./deliveryEvents`.
//
// Production safety: this module has no top-level side effects, so when the
// dev-mode flag (see `isSimulatorEnabled`) is not set and `runSimulation` is
// never referenced, a tree-shaking bundler (Vite/Rollup) drops it from the
// production bundle. Never import it unconditionally from a production code
// path — gate the import behind `isSimulatorEnabled()`.

import {
  DEFAULT_MAX_ATTEMPTS,
  type DeliveryEvent,
  RETRY_SCHEDULE_MS,
} from './deliveryEvents';

/**
 * A pseudo-random number generator returning a float in [0, 1). Defaults to
 * `Math.random`; inject a deterministic generator in tests for repeatable
 * success/failure decisions.
 */
export type RandomFn = () => number;

/**
 * A clock/scheduler abstraction. Defaults to the real `setTimeout`; inject a
 * fake timer (or an immediate scheduler) in tests to avoid wall-clock delays
 * and flakiness.
 */
export interface Clock {
  /** Schedule `cb` to run after `delayMs`. */
  setTimeout(cb: () => void, delayMs: number): void;
  /** Current wall-clock time in ms since epoch (for event timestamps). */
  now(): number;
}

/** The default real-time clock backed by the host environment. */
export const realClock: Clock = {
  setTimeout: (cb, delayMs) => {
    setTimeout(cb, delayMs);
  },
  now: () => Date.now(),
};

/** Options accepted by {@link runSimulation}. */
export interface SimulatorOptions {
  /**
   * Probability (0.0–1.0 inclusive) that each individual delivery attempt
   * succeeds. Values outside this range throw a `RangeError`.
   */
  successRate: number;
  /** Identifier for the simulated webhook. Defaults to a generated id. */
  webhookId?: string;
  /** Event type to stamp on emitted events. Defaults to `payment.created`. */
  eventType?: string;
  /**
   * Maximum number of attempts (initial + retries). Defaults to the spec's
   * schedule length (6). Must be a positive integer.
   */
  maxAttempts?: number;
  /** Injectable RNG for deterministic tests. Defaults to `Math.random`. */
  random?: RandomFn;
  /** Injectable clock/scheduler. Defaults to {@link realClock}. */
  clock?: Clock;
  /**
   * Callback invoked for every emitted delivery event (failed, delivered,
   * exhausted), in order.
   */
  onEvent: (event: DeliveryEvent) => void;
}

let webhookCounter = 0;

function nextWebhookId(): string {
  webhookCounter += 1;
  return `sim-wh-${webhookCounter}`;
}

/** Delay (ms) before attempt `n` (1-based), clamped to the schedule length. */
function delayForAttempt(attempt: number): number {
  const index = Math.min(attempt - 1, RETRY_SCHEDULE_MS.length - 1);
  return RETRY_SCHEDULE_MS[index] ?? 0;
}

/**
 * Run a simulated webhook delivery.
 *
 * The simulator schedules attempts on the exponential back-off retry schedule.
 * Each attempt succeeds with probability `successRate`:
 *
 * - On success it emits a `delivered` event and stops retrying.
 * - On failure it emits a `failed` event and schedules the next retry.
 * - When `maxAttempts` failures accumulate, it emits a terminal `exhausted`
 *   event.
 *
 * No real HTTP request is ever made — HTTP status codes and response body
 * excerpts are synthesised locally.
 *
 * @returns a promise that resolves with the terminal event (`delivered` or
 *   `exhausted`) once the simulation completes.
 */
export function runSimulation(options: SimulatorOptions): Promise<DeliveryEvent> {
  const { successRate, onEvent } = options;

  if (
    typeof successRate !== 'number' ||
    Number.isNaN(successRate) ||
    successRate < 0 ||
    successRate > 1
  ) {
    throw new RangeError(
      `successRate must be a number in the range 0.0-1.0 (received ${String(successRate)})`,
    );
  }

  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError(
      `maxAttempts must be a positive integer (received ${String(maxAttempts)})`,
    );
  }

  const webhookId = options.webhookId ?? nextWebhookId();
  const eventType = options.eventType ?? 'payment.created';
  const random = options.random ?? Math.random;
  const clock = options.clock ?? realClock;

  return new Promise<DeliveryEvent>((resolve) => {
    const attemptDelivery = (attempt: number): void => {
      const timestamp = new Date(clock.now()).toISOString();
      const succeeded = random() < successRate;

      if (succeeded) {
        const event: DeliveryEvent = {
          webhookId,
          eventType,
          status: 'delivered',
          attempt,
          timestamp,
          httpStatusCode: 200,
          responseBodyExcerpt: '{"ok":true}',
        };
        onEvent(event);
        resolve(event);
        return;
      }

      const isLastAttempt = attempt >= maxAttempts;
      const failedEvent: DeliveryEvent = {
        webhookId,
        eventType,
        status: isLastAttempt ? 'exhausted' : 'failed',
        attempt,
        timestamp,
        httpStatusCode: 500,
        responseBodyExcerpt: '{"error":"simulated delivery failure"}',
      };
      onEvent(failedEvent);

      if (isLastAttempt) {
        resolve(failedEvent);
        return;
      }

      const nextAttempt = attempt + 1;
      clock.setTimeout(() => {
        attemptDelivery(nextAttempt);
      }, delayForAttempt(nextAttempt));
    };

    // Kick off the immediate initial attempt (delay 0).
    clock.setTimeout(() => {
      attemptDelivery(1);
    }, delayForAttempt(1));
  });
}

/**
 * Whether the webhook simulator is enabled. Activated via the documented
 * dev-mode environment flag `VITE_USE_SIMULATOR=true`. Always returns `false`
 * in production builds where the flag is unset, so guarding simulator imports
 * with this check keeps the module out of the production bundle.
 *
 * `import.meta.env.VITE_USE_SIMULATOR` is statically replaced by Vite at build
 * time; when the flag is unset this collapses to a constant `false`, allowing
 * the bundler to tree-shake away any simulator import guarded by this check.
 */
export function isSimulatorEnabled(): boolean {
  return import.meta.env.VITE_USE_SIMULATOR === 'true';
}
