/**
 * DeliveryEventStore
 *
 * A lightweight reactive store that tracks webhook delivery events.
 * Components subscribe to state changes; the store notifies them whenever
 * a new delivery event is appended.
 *
 * This is the single shared data stream used by the event log, metrics
 * dashboard, and exhausted-webhook alert components.
 */

export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'exhausted';

export interface DeliveryAttempt {
  /** Timestamp of this delivery attempt (ISO-8601 string). */
  timestamp: string;
  /** HTTP status code returned by the endpoint (0 if no response). */
  httpStatus: number;
  /** Short excerpt of the response body (may be empty). */
  responseBody: string;
}

export interface DeliveryEvent {
  /** Unique identifier for the webhook. */
  webhookId: string;
  /** Event type, e.g. "payment.created" or "refund.issued". */
  eventType: string;
  /** Current delivery status. */
  status: DeliveryStatus;
  /** Ordered list of delivery attempts (oldest first). */
  attempts: DeliveryAttempt[];
}

export type StoreListener = (events: ReadonlyArray<DeliveryEvent>) => void;

export class DeliveryEventStore {
  private events: DeliveryEvent[] = [];
  private listeners: Set<StoreListener> = new Set();

  /** Return a snapshot of all current delivery events. */
  getEvents(): ReadonlyArray<DeliveryEvent> {
    return this.events;
  }

  /**
   * Upsert a delivery event.
   *
   * If a DeliveryEvent with the same `webhookId` already exists it is replaced
   * in-place (preserving insertion order); otherwise the new event is appended.
   * Subscribers are notified after every upsert.
   */
  upsert(event: DeliveryEvent): void {
    const idx = this.events.findIndex((e) => e.webhookId === event.webhookId);
    if (idx >= 0) {
      this.events[idx] = event;
    } else {
      this.events.push(event);
    }
    this.notify();
  }

  /**
   * Subscribe to store changes.
   *
   * The listener is called immediately with the current snapshot, then again
   * after every subsequent upsert.  Returns an unsubscribe function.
   */
  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    // Immediate call so the subscriber can initialise its view.
    listener(this.getEvents());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Remove all events and notify subscribers (useful for testing). */
  clear(): void {
    this.events = [];
    this.notify();
  }

  private notify(): void {
    const snapshot = this.getEvents();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
