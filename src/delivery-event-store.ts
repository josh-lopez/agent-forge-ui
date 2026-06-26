// A tiny reactive store for delivery events. Components subscribe and are
// notified whenever the event set changes (a new attempt is logged or a webhook
// transitions state), which is what drives the dashboard's reactive
// recalculation without any manual refresh.
//
// No framework, no external dependencies — just an array + a Set of listeners.

import { DeliveryEvent } from './delivery-events';

export type StoreListener = (events: readonly DeliveryEvent[]) => void;

export class DeliveryEventStore {
  private events: DeliveryEvent[] = [];
  private listeners = new Set<StoreListener>();

  constructor(initial: DeliveryEvent[] = []) {
    this.events = [...initial];
  }

  /** Returns a read-only snapshot of all events. */
  getEvents(): readonly DeliveryEvent[] {
    return this.events;
  }

  /** Appends a single delivery event and notifies subscribers. */
  add(event: DeliveryEvent): void {
    this.events.push(event);
    this.emit();
  }

  /** Appends several delivery events in one batch (single notification). */
  addMany(events: DeliveryEvent[]): void {
    if (events.length === 0) return;
    this.events.push(...events);
    this.emit();
  }

  /** Replaces the entire event set (e.g. loading a fixture) and notifies. */
  reset(events: DeliveryEvent[] = []): void {
    this.events = [...events];
    this.emit();
  }

  /**
   * Subscribes to changes. The listener is invoked immediately with the current
   * snapshot so subscribers can render initial state without a separate read.
   * Returns an unsubscribe function.
   */
  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    listener(this.events);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = this.events;
    for (const listener of this.listeners) listener(snapshot);
  }
}
