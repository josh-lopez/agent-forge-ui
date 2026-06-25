// Shared delivery-event model and reactive store.
//
// This module is the single source of truth for webhook delivery events. Both
// the event log and the metrics dashboard subscribe to the same store instance
// so that a new delivery event updates both views simultaneously (Issue #97).

/** Lifecycle status of a webhook delivery, per the product spec. */
export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'exhausted';

/**
 * A single delivery attempt. This is the canonical event shape emitted by both
 * the real delivery mechanism and the developer simulator, so UI components
 * need no special-case code.
 */
export interface DeliveryEvent {
  /** Identifier of the logical webhook this attempt belongs to. */
  webhookId: string;
  /** Attempt number (1-based). */
  attempt: number;
  /** Status of this attempt / the webhook after this attempt. */
  status: DeliveryStatus;
  /** ISO-8601 timestamp of the attempt. */
  timestamp: string;
  /** HTTP status code returned by the endpoint (0 when no response). */
  httpStatus: number;
  /** Short excerpt of the response body. */
  responseExcerpt: string;
}

/**
 * Exponential back-off retry schedule (delays in milliseconds) from the spec:
 * immediately, then 1 min, 5 min, 30 min, 2 h, 8 h.
 */
export const RETRY_SCHEDULE_MS: readonly number[] = [
  0,
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  8 * 60 * 60_000,
];

/** Aggregate statistics surfaced by the metrics dashboard. */
export interface DeliveryStats {
  /** Total number of delivery attempts recorded. */
  totalAttempts: number;
  /** Distinct webhooks seen. */
  totalWebhooks: number;
  /** Per-status attempt counts. */
  byStatus: Record<DeliveryStatus, number>;
  /** Number of webhooks whose latest attempt is in each status. */
  webhooksByStatus: Record<DeliveryStatus, number>;
  /** Successful-delivery rate across webhooks (0..1). */
  deliveryRate: number;
}

type Listener = (events: readonly DeliveryEvent[]) => void;

/**
 * Reactive, in-memory store of delivery events. Components subscribe to be
 * notified on every change; this is the "shared data source" that keeps the
 * dashboard and the event log in sync.
 */
export class DeliveryEventStore {
  private events: DeliveryEvent[] = [];
  private listeners = new Set<Listener>();

  /** Append a delivery event and notify all subscribers. */
  add(event: DeliveryEvent): void {
    this.events.push(event);
    this.emit();
  }

  /** Replace all events (used in tests / resets). */
  reset(events: DeliveryEvent[] = []): void {
    this.events = [...events];
    this.emit();
  }

  /** Snapshot of all events in insertion order. */
  getAll(): readonly DeliveryEvent[] {
    return this.events;
  }

  /**
   * Subscribe to changes. The listener fires immediately with the current
   * snapshot and on every subsequent change. Returns an unsubscribe function.
   */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.events);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.events);
    }
  }
}

const emptyStatusRecord = (): Record<DeliveryStatus, number> => ({
  pending: 0,
  delivered: 0,
  failed: 0,
  exhausted: 0,
});

/**
 * Compute aggregate dashboard statistics from a list of delivery events.
 * Pure function — easy to unit-test without a DOM.
 */
export function computeStats(events: readonly DeliveryEvent[]): DeliveryStats {
  const byStatus = emptyStatusRecord();
  // Track the latest attempt per webhook to determine its current status.
  const latestByWebhook = new Map<string, DeliveryEvent>();

  for (const event of events) {
    byStatus[event.status] += 1;
    const current = latestByWebhook.get(event.webhookId);
    if (!current || event.attempt >= current.attempt) {
      latestByWebhook.set(event.webhookId, event);
    }
  }

  const webhooksByStatus = emptyStatusRecord();
  for (const event of latestByWebhook.values()) {
    webhooksByStatus[event.status] += 1;
  }

  const totalWebhooks = latestByWebhook.size;
  const deliveryRate =
    totalWebhooks === 0 ? 0 : webhooksByStatus.delivered / totalWebhooks;

  return {
    totalAttempts: events.length,
    totalWebhooks,
    byStatus,
    webhooksByStatus,
    deliveryRate,
  };
}
