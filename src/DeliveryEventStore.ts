/**
 * Reactive store for delivery attempt events.
 *
 * Provides a lightweight publish/subscribe mechanism so UI components update
 * automatically whenever new delivery events are added.  The store is
 * intentionally framework-agnostic (no React, Vue, etc.) so it can be used
 * in plain TypeScript components and tested without a full framework.
 *
 * Spec ref: spec § "Webhook delivery & retries" — reactive updates requirement.
 * Spec ref: spec § "Event log filtering" — the store exposes the data structure
 *   required by date-range and event-type filters.
 */

import type { DeliveryEvent } from './deliveryEvent.ts';

/** Callback invoked whenever the store's event list changes. */
export type StoreListener = (events: DeliveryEvent[]) => void;

/**
 * Maximum number of events retained in memory.
 *
 * Prevents unbounded memory growth when a large number of delivery attempts
 * are logged (spec AC8 — no layout breakage with many entries).  When the cap
 * is reached the oldest entries are dropped.
 */
const MAX_EVENTS = 1000;

/**
 * DeliveryEventStore — the single source of truth for delivery attempt events.
 *
 * Usage:
 *   const store = new DeliveryEventStore();
 *   store.subscribe(events => renderLog(events));
 *   store.add(event);
 */
export class DeliveryEventStore {
  private _events: DeliveryEvent[] = [];
  private _listeners: Set<StoreListener> = new Set();

  /**
   * All events currently held in the store, ordered most-recent first.
   *
   * The most-recent-first ordering is the documented display order for the
   * event log (spec AC6 — consistent, scannable order).  Consumers that need
   * chronological order should reverse the array.
   */
  get events(): DeliveryEvent[] {
    return this._events;
  }

  /**
   * Add a new delivery event to the store and notify all subscribers.
   *
   * The event is prepended (most-recent first).  If the store has reached
   * MAX_EVENTS the oldest entry is removed.
   */
  add(event: DeliveryEvent): void {
    this._events = [event, ...this._events];
    if (this._events.length > MAX_EVENTS) {
      this._events = this._events.slice(0, MAX_EVENTS);
    }
    this._notify();
  }

  /**
   * Add multiple events at once and notify subscribers once.
   *
   * Events are prepended in the order provided (first element ends up at the
   * top of the list).
   */
  addMany(events: DeliveryEvent[]): void {
    if (events.length === 0) return;
    this._events = [...events, ...this._events];
    if (this._events.length > MAX_EVENTS) {
      this._events = this._events.slice(0, MAX_EVENTS);
    }
    this._notify();
  }

  /**
   * Replace the entire event list and notify subscribers.
   *
   * Useful for loading a snapshot from a backend or resetting the store in
   * tests.
   */
  setAll(events: DeliveryEvent[]): void {
    this._events = events.slice(0, MAX_EVENTS);
    this._notify();
  }

  /** Remove all events and notify subscribers. */
  clear(): void {
    this._events = [];
    this._notify();
  }

  /**
   * Subscribe to store changes.
   *
   * The listener is called immediately with the current event list so the
   * subscriber can render an initial state without a separate "get" call.
   *
   * @returns An unsubscribe function.  Call it to stop receiving updates.
   */
  subscribe(listener: StoreListener): () => void {
    this._listeners.add(listener);
    // Immediate call so the subscriber can render its initial state.
    listener(this._events);
    return () => {
      this._listeners.delete(listener);
    };
  }

  private _notify(): void {
    for (const listener of this._listeners) {
      listener(this._events);
    }
  }
}
