/**
 * Webhook delivery simulator (developer fixture).
 *
 * Produces `DeliveryEvent` objects that are structurally identical to those
 * emitted by the real delivery mechanism (`src/delivery.ts`).  UI components
 * therefore need no special-case code to distinguish simulator events from
 * real events.
 *
 * Activation: import and call `createSimulator()` in dev/test code.  The
 * simulator has no side-effects on import and never calls real endpoints.
 */

import type { DeliveryEvent, DeliveryStatus } from './deliveryEvent.ts';

/** Exponential back-off retry schedule (delays in milliseconds). */
export const RETRY_SCHEDULE_MS: readonly number[] = [
  0,           // attempt 1 – immediate
  60_000,      // attempt 2 – 1 min
  300_000,     // attempt 3 – 5 min
  1_800_000,   // attempt 4 – 30 min
  7_200_000,   // attempt 5 – 2 h
  28_800_000,  // attempt 6 – 8 h
];

export interface SimulatorOptions {
  /** Probability (0.0–1.0) that any single delivery attempt succeeds. */
  successRate?: number;
  /** Maximum number of attempts before the webhook is marked exhausted. */
  maxAttempts?: number;
  /** Seed event type label. */
  eventType?: string;
  /** Seed webhook ID. */
  webhookId?: string;
}

export interface SimulatorResult {
  /** All delivery events emitted during the simulated run. */
  events: DeliveryEvent[];
  /** Final status after all attempts. */
  finalStatus: DeliveryStatus;
}

/**
 * Simulate a full webhook delivery lifecycle, progressing through the retry
 * schedule and emitting a `DeliveryEvent` for each attempt.
 *
 * @param options - Simulator configuration.
 * @returns An object containing all emitted events and the final status.
 */
export function simulateDelivery(options: SimulatorOptions = {}): SimulatorResult {
  const {
    successRate = 0.8,
    maxAttempts = RETRY_SCHEDULE_MS.length,
    eventType = 'payment.created',
    webhookId = `sim-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  } = options;

  const events: DeliveryEvent[] = [];
  let baseTime = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const delayMs = RETRY_SCHEDULE_MS[attempt - 1] ?? 0;
    baseTime += delayMs;

    const succeeded = Math.random() < successRate;
    const isLastAttempt = attempt === maxAttempts;

    let status: DeliveryStatus;
    let httpStatusCode: number | null;
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
      timestamp: new Date(baseTime).toISOString(),
      httpStatusCode,
      responseBodyExcerpt,
      webhookId,
      eventType,
      attemptNumber: attempt,
    };

    events.push(event);

    if (status === 'delivered' || status === 'exhausted') {
      break;
    }
  }

  const finalStatus = events[events.length - 1]?.status ?? 'exhausted';

  return { events, finalStatus };
}

/**
 * Simulate a network-level failure (no HTTP response received).
 *
 * Returns a single `DeliveryEvent` with `httpStatusCode: null` and
 * `status: 'failed'`, modelling the case where the endpoint was unreachable.
 */
export function simulateNetworkFailure(options: SimulatorOptions = {}): DeliveryEvent {
  const {
    eventType = 'payment.created',
    webhookId = `sim-net-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  } = options;

  const event: DeliveryEvent = {
    status: 'failed',
    timestamp: new Date().toISOString(),
    httpStatusCode: null,
    responseBodyExcerpt: '',
    webhookId,
    eventType,
    attemptNumber: 1,
  };

  return event;
}
