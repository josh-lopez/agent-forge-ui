// Shared types for the webhook delivery layer.
//
// Both the real delivery mechanism and the developer-fixture simulator emit
// events of exactly this shape, so UI components never need special-case code
// depending on which implementation is active.

/** Lifecycle status of a single webhook (across all its delivery attempts). */
export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'exhausted';

/**
 * A single delivery event, emitted once per delivery attempt (and once for the
 * terminal `delivered` / `exhausted` resolution).
 *
 * This shape is the contract between the delivery layer and the UI. The real
 * mechanism and the simulator MUST emit identical fields.
 */
export interface DeliveryEvent {
  /** Identifier of the webhook this event belongs to. */
  webhookId: string;
  /** Current status after this attempt. */
  status: DeliveryStatus;
  /** ISO-8601 timestamp of the attempt. */
  timestamp: string;
  /** HTTP status code returned by the attempt (e.g. 200, 503). */
  httpStatusCode: number;
  /** Short excerpt of the response body, for the event log. */
  responseBodyExcerpt: string;
  /** 1-based attempt number within the retry schedule. */
  attempt: number;
}

/** Callback invoked for every emitted delivery event. */
export type DeliveryEventListener = (event: DeliveryEvent) => void;

/**
 * The dependency-injection seam. Both the real delivery mechanism and the
 * simulator implement this interface so the rest of the app depends only on the
 * abstraction, never on a concrete implementation.
 */
export interface WebhookDeliveryService {
  /**
   * Begin delivering the given webhook, invoking `listener` for each delivery
   * event (intermediate `failed` events plus the terminal resolution).
   */
  deliver(webhookId: string, listener: DeliveryEventListener): void;
}
