// Canonical delivery-event shape shared by the real webhook delivery mechanism
// and the developer-only delivery simulator.
//
// This module is the single source of truth for the structure of a webhook
// delivery event. Both the real delivery mechanism and the client-side
// simulator type their emitted objects against `DeliveryEvent` so that UI
// components can consume events without any special-case branching or type
// guards distinguishing "simulated" from "real" events.
//
// It is intentionally dependency-free so it can be imported by any module
// (simulator, real delivery, UI) without risk of circular imports.

/**
 * The lifecycle status of a webhook delivery.
 *
 * - `pending`    — the delivery has been queued / attempted but not yet
 *                  confirmed delivered or failed.
 * - `delivered`  — the destination acknowledged the delivery (2xx response).
 * - `failed`     — an individual attempt failed; further retries may follow.
 * - `exhausted`  — the maximum number of retries was reached without success.
 */
export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'exhausted';

/** All valid `DeliveryStatus` values, in lifecycle order. */
export const DELIVERY_STATUSES: readonly DeliveryStatus[] = [
  'pending',
  'delivered',
  'failed',
  'exhausted',
] as const;

/**
 * Maximum number of characters retained from a delivery response body.
 *
 * The spec describes the field as a "response body excerpt" but does not fix a
 * length. We define one canonical limit here so the simulator and the real
 * mechanism truncate identically and never drift.
 */
export const RESPONSE_BODY_EXCERPT_MAX_LENGTH = 512;

/**
 * Canonical shape of a single webhook delivery event.
 *
 * Both the real delivery mechanism and the simulator MUST emit objects that
 * satisfy this interface. UI components reference only this type.
 */
export interface DeliveryEvent {
  /** Current lifecycle status of the delivery. */
  status: DeliveryStatus;

  /**
   * When this delivery event was produced.
   *
   * Stored as an ISO-8601 timestamp string (e.g. the output of
   * `new Date().toISOString()`) so events serialise cleanly and sort
   * lexicographically.
   */
  timestamp: string;

  /**
   * The HTTP status code returned by the destination for this attempt.
   *
   * `null` when no HTTP response was received (e.g. a connection error or a
   * `pending` event that has not yet been attempted).
   */
  httpStatusCode: number | null;

  /**
   * A short excerpt of the destination's response body, truncated to at most
   * {@link RESPONSE_BODY_EXCERPT_MAX_LENGTH} characters.
   *
   * Empty string when there is no response body.
   */
  responseBodyExcerpt: string;
}

/**
 * Truncate a response body to the canonical excerpt length.
 *
 * Shared helper so the simulator and the real delivery mechanism produce
 * identically-bounded excerpts. Never returns `null`/`undefined`.
 */
export function toResponseBodyExcerpt(body: string | null | undefined): string {
  if (!body) {
    return '';
  }
  return body.length > RESPONSE_BODY_EXCERPT_MAX_LENGTH
    ? body.slice(0, RESPONSE_BODY_EXCERPT_MAX_LENGTH)
    : body;
}

/**
 * Runtime guard that an arbitrary value satisfies the {@link DeliveryEvent}
 * contract. Useful in tests and at trust boundaries; UI code does not need it
 * because every emitted event is statically typed.
 */
export function isDeliveryEvent(value: unknown): value is DeliveryEvent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const statusOk =
    typeof candidate.status === 'string' &&
    (DELIVERY_STATUSES as readonly string[]).includes(candidate.status);
  const timestampOk =
    typeof candidate.timestamp === 'string' &&
    !Number.isNaN(Date.parse(candidate.timestamp));
  const httpOk =
    candidate.httpStatusCode === null ||
    typeof candidate.httpStatusCode === 'number';
  const bodyOk = typeof candidate.responseBodyExcerpt === 'string';
  return statusOk && timestampOk && httpOk && bodyOk;
}
