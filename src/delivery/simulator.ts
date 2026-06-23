// Client-side webhook delivery simulator (developer fixture).
//
// This module lets developers exercise every webhook delivery UI state without
// any backend or external service. It is activated via the
// `VITE_USE_WEBHOOK_SIMULATOR` environment flag (see ./index.ts); when the flag
// is unset, the guarded dynamic import in ./index.ts is statically eliminated by
// the bundler, so NONE of this module ends up in a production build.

import type {
  DeliveryEvent,
  DeliveryEventListener,
  WebhookDeliveryService,
} from './types';

/**
 * Unique runtime string identifying the simulator module. It is stored on every
 * simulator instance (see `WebhookDeliverySimulator.moduleMarker`) so it is a
 * genuine, minification-surviving runtime reference. The CI bundle-content
 * check (tests/test_simulator_di.sh) greps built output for this token to assert
 * the simulator is present in dev builds and ABSENT from production builds.
 */
export const SIMULATOR_MODULE_MARKER = 'WEBHOOK_SIMULATOR_MODULE_MARKER_v1';

/**
 * Exponential back-off retry schedule (delays before each attempt), mirroring
 * the schedule in spec § "Retry schedule":
 * immediately, 1 min, 5 min, 30 min, 2 h, 8 h.
 */
export const RETRY_SCHEDULE_MS: readonly number[] = [
  0,
  1 * 60 * 1000,
  5 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
  8 * 60 * 60 * 1000,
];

export interface SimulatorOptions {
  /**
   * Probability (0.0–1.0) that each simulated delivery attempt succeeds.
   * Defaults to 0.5.
   */
  successRate?: number;
  /**
   * Maximum number of attempts before the webhook is marked `exhausted`.
   * Defaults to the length of the retry schedule.
   */
  maxAttempts?: number;
  /**
   * Multiplier applied to the real retry-schedule delays so developers don't
   * wait hours between attempts. Defaults to 0 (fire attempts back-to-back).
   * Set to 1 to use the real schedule timings.
   */
  scheduleScale?: number;
  /** Injectable RNG (0–1) for deterministic tests. Defaults to Math.random. */
  random?: () => number;
  /** Injectable timer scheduler for deterministic tests. Defaults to setTimeout. */
  schedule?: (fn: () => void, delayMs: number) => void;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

/**
 * A `WebhookDeliveryService` that fabricates delivery events with a configurable
 * success rate, progressing through the full retry schedule and emitting
 * intermediate `failed` events before resolving to `delivered` or `exhausted`.
 */
export class WebhookDeliverySimulator implements WebhookDeliveryService {
  /** Marks instances as simulator-produced (also pins the marker into builds). */
  readonly moduleMarker: string = SIMULATOR_MODULE_MARKER;

  private readonly successRate: number;
  private readonly maxAttempts: number;
  private readonly scheduleScale: number;
  private readonly random: () => number;
  private readonly schedule: (fn: () => void, delayMs: number) => void;

  constructor(options: SimulatorOptions = {}) {
    this.successRate = clamp01(options.successRate ?? 0.5);
    this.maxAttempts =
      options.maxAttempts && options.maxAttempts > 0
        ? Math.floor(options.maxAttempts)
        : RETRY_SCHEDULE_MS.length;
    this.scheduleScale = options.scheduleScale ?? 0;
    this.random = options.random ?? Math.random;
    this.schedule =
      options.schedule ??
      ((fn, delayMs) => {
        setTimeout(fn, delayMs);
      });
  }

  deliver(webhookId: string, listener: DeliveryEventListener): void {
    this.attempt(webhookId, listener, 1);
  }

  private delayFor(attempt: number): number {
    const idx = Math.min(attempt - 1, RETRY_SCHEDULE_MS.length - 1);
    return RETRY_SCHEDULE_MS[idx] * this.scheduleScale;
  }

  private attempt(
    webhookId: string,
    listener: DeliveryEventListener,
    attempt: number,
  ): void {
    const succeeded = this.random() < this.successRate;
    const isLastAttempt = attempt >= this.maxAttempts;

    let event: DeliveryEvent;
    if (succeeded) {
      event = {
        webhookId,
        status: 'delivered',
        timestamp: new Date().toISOString(),
        httpStatusCode: 200,
        responseBodyExcerpt: '{"ok":true}',
        attempt,
      };
    } else if (isLastAttempt) {
      event = {
        webhookId,
        status: 'exhausted',
        timestamp: new Date().toISOString(),
        httpStatusCode: 503,
        responseBodyExcerpt: 'Service Unavailable',
        attempt,
      };
    } else {
      event = {
        webhookId,
        status: 'failed',
        timestamp: new Date().toISOString(),
        httpStatusCode: 503,
        responseBodyExcerpt: 'Service Unavailable',
        attempt,
      };
    }

    listener(event);

    if (event.status === 'failed') {
      this.schedule(() => {
        this.attempt(webhookId, listener, attempt + 1);
      }, this.delayFor(attempt + 1));
    }
  }
}

/** Factory mirroring `createRealDeliveryService` for the DI seam. */
export function createWebhookDeliverySimulator(
  options?: SimulatorOptions,
): WebhookDeliveryService {
  return new WebhookDeliverySimulator(options);
}
