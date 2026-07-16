/**
 * Delivery Status Badge component.
 *
 * Renders a visible status indicator for a single webhook's current delivery
 * status (pending / delivered / failed / exhausted).  The component subscribes
 * to a DeliveryEventStore and updates reactively whenever a new delivery event
 * arrives that transitions the webhook's status — no manual refresh required.
 *
 * Spec ref: spec § "Delivery status visibility"
 *   "The UI shows per-webhook delivery status (pending / delivered / failed /
 *    exhausted) so merchants can monitor events without raising support tickets."
 */

import { DeliveryStatus } from './delivery-events';
import { DeliveryEventStore } from './delivery-event-store';

// ── Status label map ──────────────────────────────────────────────────────────

/**
 * Human-readable labels for each delivery status value.
 * Exported so tests and other components can assert against the canonical text.
 */
export const STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending:   'Pending',
  delivered: 'Delivered',
  failed:    'Failed',
  exhausted: 'Exhausted',
};

/**
 * CSS modifier class applied to the badge element for each status.
 * Allows stylesheets to colour-code the badge without coupling to label text.
 */
export const STATUS_CLASSES: Record<DeliveryStatus, string> = {
  pending:   'delivery-status-badge--pending',
  delivered: 'delivery-status-badge--delivered',
  failed:    'delivery-status-badge--failed',
  exhausted: 'delivery-status-badge--exhausted',
};

// ── Derive current status from event history ──────────────────────────────────

/**
 * Derives the current delivery status for a given webhook from the full event
 * history.  The most-recent event for the webhook wins; if no events exist for
 * the webhook the status is `'pending'`.
 *
 * Exported as a pure function so it can be unit-tested independently of the DOM.
 */
export function deriveStatus(
  webhookId: string,
  events: readonly import('./delivery-events').DeliveryEvent[],
): DeliveryStatus {
  // Walk backwards so we find the most-recent event first.
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].webhookId === webhookId) {
      return events[i].status;
    }
  }
  return 'pending';
}

// ── DOM rendering ─────────────────────────────────────────────────────────────

/**
 * Creates a `<span>` element styled as a delivery-status badge for the given
 * status value.  The element carries:
 *   - `class="delivery-status-badge delivery-status-badge--<status>"`
 *   - `data-status="<status>"` for programmatic querying
 *   - `role="status"` so screen readers announce changes
 *   - `textContent` set to the canonical human-readable label
 *
 * This is a pure render function — it does not subscribe to any store.
 */
export function renderStatusBadge(status: DeliveryStatus): HTMLElement {
  const badge = document.createElement('span');
  badge.className = `delivery-status-badge ${STATUS_CLASSES[status]}`;
  badge.setAttribute('data-status', status);
  badge.setAttribute('role', 'status');
  badge.textContent = STATUS_LABELS[status];
  return badge;
}

// ── Reactive mount ────────────────────────────────────────────────────────────

/**
 * Mounts a reactive delivery-status badge into `container`, tracking the
 * current status of `webhookId` in `store`.
 *
 * The badge re-renders automatically whenever the store emits a new event for
 * the tracked webhook.  The initial render happens synchronously on mount via
 * `store.subscribe()`.
 *
 * @param container - Host element; its children are replaced on each update.
 * @param webhookId - The webhook whose status is tracked.
 * @param store     - The shared delivery-event store.
 * @returns A disposer function that unsubscribes and clears the container.
 *
 * @example
 * ```ts
 * const dispose = mountDeliveryStatusBadge(el, 'wh_123', store);
 * // Later, when the component unmounts:
 * dispose();
 * ```
 */
export function mountDeliveryStatusBadge(
  container: HTMLElement,
  webhookId: string,
  store: DeliveryEventStore,
): () => void {
  const render = (events: readonly import('./delivery-events').DeliveryEvent[]) => {
    const status = deriveStatus(webhookId, events);
    container.replaceChildren(renderStatusBadge(status));
  };

  // subscribe() calls the listener immediately with the current snapshot, so
  // the badge renders its initial state without a separate first-render call.
  const unsubscribe = store.subscribe(render);

  return () => {
    unsubscribe();
    container.replaceChildren();
  };
}
