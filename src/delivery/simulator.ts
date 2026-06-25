// Client-side webhook delivery simulator (developer fixture).
//
// This module produces `DeliveryEvent` objects that conform exactly to the
// canonical shared shape defined in `./event`. UI components therefore need no
// special-case code to distinguish simulated events from real ones.
//
// Scope note: the configurable success/failure rate (issue #78) and the full
// retry-schedule progression (separate issue) are owned elsewhere. This module
// focuses on guaranteeing the emitted *shape* matches the canonical contract.
// It deliberately keeps a tiny, conforming emitter so the contract can be
// enforced and tested today.

import {
  DeliveryEvent,
  DeliveryStatus,
  toResponseBodyExcerpt,
} from './event';

/** Default response-body excerpts keyed by status, for realistic fixtures. */
const DEFAULT_BODIES: Record<DeliveryStatus, string> = {
  pending: '',
  delivered: '{"received":true}',
  failed: '{"error":"temporary upstream failure"}',
  exhausted: '{"error":"max retries reached"}',
};

/** Default HTTP status codes keyed by delivery status. */
const DEFAULT_HTTP_CODES: Record<DeliveryStatus, number | null> = {
  pending: null,
  delivered: 200,
  failed: 503,
  exhausted: 503,
};

export interface SimulatedEventOptions {
  /** Override the HTTP status code (defaults vary by status). */
  httpStatusCode?: number | null;
  /** Override the raw response body (truncated to the canonical excerpt). */
  responseBody?: string | null;
  /** Override the event timestamp (defaults to now). */
  timestamp?: Date | string;
}

function resolveTimestamp(value: Date | string | undefined): string {
  if (value === undefined) {
    return new Date().toISOString();
  }
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * Build a single simulated delivery event for the given status.
 *
 * The return type is `DeliveryEvent`, so TypeScript compilation fails if this
 * function ever emits a non-conforming shape — enforcing the shared contract.
 */
export function createSimulatedEvent(
  status: DeliveryStatus,
  options: SimulatedEventOptions = {},
): DeliveryEvent {
  const httpStatusCode =
    options.httpStatusCode !== undefined
      ? options.httpStatusCode
      : DEFAULT_HTTP_CODES[status];

  const rawBody =
    options.responseBody !== undefined
      ? options.responseBody
      : DEFAULT_BODIES[status];

  return {
    status,
    timestamp: resolveTimestamp(options.timestamp),
    httpStatusCode,
    responseBodyExcerpt: toResponseBodyExcerpt(rawBody),
  };
}

/**
 * Emit a conforming event for every possible delivery status. Useful for
 * exercising all UI states during development.
 */
export function createAllStatusEvents(): DeliveryEvent[] {
  const statuses: DeliveryStatus[] = [
    'pending',
    'delivered',
    'failed',
    'exhausted',
  ];
  return statuses.map((status) => createSimulatedEvent(status));
}
