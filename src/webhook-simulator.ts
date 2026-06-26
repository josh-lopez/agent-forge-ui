// Client-side webhook delivery simulator (developer fixture).
//
// Generates delivery-event attempts in the exact same shape the real delivery
// mechanism emits, so UI components — including the metrics dashboard — need no
// special-case code. Entirely client-side: it makes no network calls and needs
// no backend.
//
// See spec "Webhook delivery simulator" requirements. This module is importable
// standalone and gated behind a dev-mode flag (see main.ts) so it has no impact
// on production builds.

import { DeliveryEvent, DeliveryStatus } from './delivery-events';

/** The exponential back-off retry schedule, in milliseconds. */
export const RETRY_SCHEDULE_MS: number[] = [
  0, // immediate
  60_000, // 1 min
  5 * 60_000, // 5 min
  30 * 60_000, // 30 min
  2 * 60 * 60_000, // 2 h
  8 * 60 * 60_000, // 8 h
];

export interface SimulatorOptions {
  /** Probability (0..1) that each individual delivery attempt succeeds. */
  successRate?: number;
  /** Maximum number of attempts before a webhook is marked `exhausted`. */
  maxAttempts?: number;
  /** Deterministic RNG (0..1). Defaults to Math.random; inject for tests. */
  random?: () => number;
  /** Base epoch-millis timestamp for the first attempt. Defaults to Date.now(). */
  startTime?: number;
}

const SUCCESS_BODY = '{"ok":true}';
const FAILURE_BODY = '{"error":"upstream_unavailable"}';

function responseFor(success: boolean): { httpStatus: number; body: string } {
  return success
    ? { httpStatus: 200, body: SUCCESS_BODY }
    : { httpStatus: 503, body: FAILURE_BODY };
}

/**
 * Simulates the full delivery lifecycle of a single webhook, progressing
 * through the retry schedule and emitting one DeliveryEvent per attempt.
 *
 * Emits intermediate `failed` events before the webhook resolves to either
 * `delivered` (a later attempt succeeds) or `exhausted` (all attempts fail),
 * letting developers exercise every UI state.
 */
export function simulateWebhook(
  webhookId: string,
  eventType: string,
  options: SimulatorOptions = {},
): DeliveryEvent[] {
  const successRate = clamp01(options.successRate ?? 0.8);
  const maxAttempts = Math.max(1, options.maxAttempts ?? RETRY_SCHEDULE_MS.length);
  const random = options.random ?? Math.random;
  const startTime = options.startTime ?? Date.now();

  const events: DeliveryEvent[] = [];
  let elapsed = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    elapsed += RETRY_SCHEDULE_MS[Math.min(attempt - 1, RETRY_SCHEDULE_MS.length - 1)];
    const succeeded = random() < successRate;
    const isLast = attempt === maxAttempts;

    let status: DeliveryStatus;
    if (succeeded) status = 'delivered';
    else if (isLast) status = 'exhausted';
    else status = 'failed';

    const { httpStatus, body } = responseFor(succeeded);
    events.push({
      webhookId,
      eventType,
      status,
      attempt,
      timestamp: new Date(startTime + elapsed).toISOString(),
      httpStatus,
      responseBodyExcerpt: body,
    });

    if (succeeded) break;
  }

  return events;
}

export interface SimulationRunOptions extends SimulatorOptions {
  /** Number of webhooks to simulate. */
  count?: number;
  /** Pool of event types to draw from. */
  eventTypes?: string[];
}

/**
 * Produces a representative batch of simulated delivery events across several
 * webhooks and event types. The result feeds the store / dashboard directly.
 */
export function generateSimulatedEvents(options: SimulationRunOptions = {}): DeliveryEvent[] {
  const count = Math.max(0, options.count ?? 12);
  const eventTypes = options.eventTypes ?? ['payment.created', 'refund.issued', 'payout.paid'];
  const random = options.random ?? Math.random;
  const baseStart = options.startTime ?? Date.now() - 60 * 60_000;

  const all: DeliveryEvent[] = [];
  for (let i = 0; i < count; i++) {
    const eventType = eventTypes[Math.floor(random() * eventTypes.length) % eventTypes.length];
    all.push(
      ...simulateWebhook(`wh_${i + 1}`, eventType, {
        successRate: options.successRate,
        maxAttempts: options.maxAttempts,
        random,
        startTime: baseStart + i * 1000,
      }),
    );
  }
  return all;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
