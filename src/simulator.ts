// Client-side webhook delivery simulator (developer fixture).
//
// Emits the same DeliveryEvent shape used by the real delivery mechanism so UI
// components need no special-case code. It is entirely client-side: it never
// calls a real endpoint and requires no backend.

import {
  type DeliveryEvent,
  type DeliveryEventStore,
  RETRY_SCHEDULE_MS,
} from './deliveryEvents.ts';

export interface SimulatorOptions {
  /** Probability (0..1) that each simulated delivery attempt succeeds. */
  successRate?: number;
  /** Maximum number of attempts before a webhook is marked exhausted. */
  maxAttempts?: number;
  /**
   * Multiplier applied to the retry schedule delays. Defaults to a tiny value
   * so the simulator races through the full schedule quickly during dev, while
   * still emitting every intermediate `failed` event.
   */
  speed?: number;
  /** Injectable RNG (defaults to Math.random) for deterministic tests. */
  random?: () => number;
  /** Injectable scheduler (defaults to setTimeout) for deterministic tests. */
  schedule?: (fn: () => void, ms: number) => void;
  /** Injectable clock (defaults to Date.now) for deterministic timestamps. */
  now?: () => number;
}

const DEFAULTS = {
  successRate: 0.7,
  maxAttempts: RETRY_SCHEDULE_MS.length,
  speed: 0.001,
};

function excerptFor(status: number): string {
  if (status >= 200 && status < 300) return '{"ok":true}';
  if (status === 0) return 'network error: connection refused';
  return `{"error":"endpoint returned ${status}"}`;
}

/**
 * Drives one logical webhook through the retry schedule, appending a
 * DeliveryEvent to the shared store for every attempt. Eventually resolves to
 * `delivered` (on the first success) or `exhausted` (after maxAttempts fails).
 */
export class WebhookDeliverySimulator {
  private readonly successRate: number;
  private readonly maxAttempts: number;
  private readonly speed: number;
  private readonly random: () => number;
  private readonly schedule: (fn: () => void, ms: number) => void;
  private readonly now: () => number;

  constructor(
    private readonly store: DeliveryEventStore,
    options: SimulatorOptions = {},
  ) {
    this.successRate = options.successRate ?? DEFAULTS.successRate;
    this.maxAttempts = options.maxAttempts ?? DEFAULTS.maxAttempts;
    this.speed = options.speed ?? DEFAULTS.speed;
    this.random = options.random ?? Math.random;
    this.schedule =
      options.schedule ?? ((fn, ms) => void setTimeout(fn, ms));
    this.now = options.now ?? Date.now;
  }

  /** Start simulating delivery for a single webhook id. */
  deliver(webhookId: string): void {
    this.attemptDelivery(webhookId, 1);
  }

  /** Convenience: simulate `count` independent webhooks. */
  deliverMany(count: number, prefix = 'wh'): void {
    for (let i = 0; i < count; i += 1) {
      this.deliver(`${prefix}-${this.now()}-${i}`);
    }
  }

  private attemptDelivery(webhookId: string, attempt: number): void {
    const succeeded = this.random() < this.successRate;
    const isLastAttempt = attempt >= this.maxAttempts;

    let event: DeliveryEvent;
    if (succeeded) {
      event = {
        webhookId,
        attempt,
        status: 'delivered',
        timestamp: new Date(this.now()).toISOString(),
        httpStatus: 200,
        responseExcerpt: excerptFor(200),
      };
      this.store.add(event);
      return;
    }

    const httpStatus = this.random() < 0.5 ? 500 : 0;
    event = {
      webhookId,
      attempt,
      status: isLastAttempt ? 'exhausted' : 'failed',
      timestamp: new Date(this.now()).toISOString(),
      httpStatus,
      responseExcerpt: excerptFor(httpStatus),
    };
    this.store.add(event);

    if (isLastAttempt) return;

    // Progress through the retry schedule, emitting intermediate failures.
    const delayIndex = Math.min(attempt, RETRY_SCHEDULE_MS.length - 1);
    const delay = RETRY_SCHEDULE_MS[delayIndex] * this.speed;
    this.schedule(() => this.attemptDelivery(webhookId, attempt + 1), delay);
  }
}

/**
 * Whether the simulator should be active. Controlled by a documented dev flag
 * so it has no impact on production builds: set VITE_SIMULATOR=1 (or append
 * `?sim=1` to the URL in the browser).
 */
export function isSimulatorEnabled(): boolean {
  // Vite statically replaces import.meta.env at build time.
  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  if (env && env.VITE_SIMULATOR === '1') return true;
  if (typeof location !== 'undefined' && /[?&]sim=1\b/.test(location.search)) {
    return true;
  }
  return false;
}
