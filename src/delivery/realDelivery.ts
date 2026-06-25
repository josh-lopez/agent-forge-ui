// Real webhook delivery mechanism — event construction.
//
// The full delivery/retry transport is out of scope for this issue; what
// matters here is that the *real* mechanism's emitted events are typed against
// the SAME canonical `DeliveryEvent` interface as the simulator. This proves a
// single shared contract: UI components consume one type regardless of source.

import {
  DeliveryEvent,
  DeliveryStatus,
  toResponseBodyExcerpt,
} from './event';

export interface DeliveryAttemptResult {
  /** HTTP status code from the destination, or null if no response. */
  httpStatusCode: number | null;
  /** Raw response body, if any. */
  responseBody?: string | null;
  /** When the attempt completed (defaults to now). */
  timestamp?: Date | string;
}

/**
 * Translate the outcome of a real delivery attempt into a canonical
 * `DeliveryEvent`. The return type pins this to the shared contract.
 */
export function toDeliveryEvent(
  status: DeliveryStatus,
  result: DeliveryAttemptResult,
): DeliveryEvent {
  const timestamp =
    result.timestamp instanceof Date
      ? result.timestamp.toISOString()
      : (result.timestamp ?? new Date().toISOString());

  return {
    status,
    timestamp,
    httpStatusCode: result.httpStatusCode,
    responseBodyExcerpt: toResponseBodyExcerpt(result.responseBody),
  };
}
