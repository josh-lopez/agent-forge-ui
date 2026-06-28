/**
 * Real webhook delivery mechanism.
 *
 * Produces `DeliveryEvent` objects that conform to the canonical
 * `DeliveryEvent` type defined in `src/deliveryEvent.ts`.  The simulator
 * (`src/simulator.ts`) produces objects of the same shape, so UI components
 * need no special-case code to distinguish the two sources.
 *
 * NOTE: This module is entirely client-side.  Per the product spec, there are
 * no backend services in this repo.  "Delivery" here means dispatching a
 * `fetch()` request to a merchant-configured endpoint URL and recording the
 * outcome as a `DeliveryEvent`.
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

/** Maximum number of characters to retain from a response body. */
const EXCERPT_MAX_LENGTH = 200;

export interface DeliveryOptions {
  /** Target URL to POST the webhook payload to. */
  endpointUrl: string;
  /** Opaque identifier for this webhook. */
  webhookId: string;
  /** Event type label (e.g. "payment.created"). */
  eventType: string;
  /** JSON-serialisable payload to deliver. */
  payload: unknown;
  /** Maximum number of attempts (defaults to full retry schedule length). */
  maxAttempts?: number;
  /**
   * Callback invoked after each delivery attempt with the resulting event.
   * Use this to update UI state reactively.
   */
  onAttempt?: (event: DeliveryEvent) => void;
}

/**
 * Attempt to deliver a webhook payload to `endpointUrl`, retrying on failure
 * according to the exponential back-off schedule.
 *
 * Each attempt emits a `DeliveryEvent` via `onAttempt` (if provided) and the
 * function resolves with the final event once the delivery either succeeds or
 * exhausts all retries.
 */
export async function deliverWebhook(options: DeliveryOptions): Promise<DeliveryEvent> {
  const {
    endpointUrl,
    webhookId,
    eventType,
    payload,
    maxAttempts = RETRY_SCHEDULE_MS.length,
    onAttempt,
  } = options;

  let lastEvent: DeliveryEvent | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const delayMs = RETRY_SCHEDULE_MS[attempt - 1] ?? 0;

    if (delayMs > 0) {
      await sleep(delayMs);
    }

    const event = await attemptDelivery({
      endpointUrl,
      webhookId,
      eventType,
      payload,
      attemptNumber: attempt,
      isLastAttempt: attempt === maxAttempts,
    });

    lastEvent = event;
    onAttempt?.(event);

    if (event.status === 'delivered' || event.status === 'exhausted') {
      break;
    }
  }

  // lastEvent is always set because maxAttempts >= 1
  return lastEvent!;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

interface AttemptOptions {
  endpointUrl: string;
  webhookId: string;
  eventType: string;
  payload: unknown;
  attemptNumber: number;
  isLastAttempt: boolean;
}

async function attemptDelivery(opts: AttemptOptions): Promise<DeliveryEvent> {
  const { endpointUrl, webhookId, eventType, payload, attemptNumber, isLastAttempt } = opts;

  let httpStatusCode: number | null = null;
  let responseBodyExcerpt = '';
  let status: DeliveryStatus;

  try {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    httpStatusCode = response.status;

    const rawBody = await response.text().catch(() => '');
    responseBodyExcerpt = rawBody.slice(0, EXCERPT_MAX_LENGTH);

    if (response.ok) {
      status = 'delivered';
    } else if (isLastAttempt) {
      status = 'exhausted';
    } else {
      status = 'failed';
    }
  } catch {
    // Network-level failure — no HTTP response received.
    httpStatusCode = null;
    responseBodyExcerpt = '';
    status = isLastAttempt ? 'exhausted' : 'failed';
  }

  const event: DeliveryEvent = {
    status,
    timestamp: new Date().toISOString(),
    httpStatusCode,
    responseBodyExcerpt,
    webhookId,
    eventType,
    attemptNumber,
  };

  return event;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
