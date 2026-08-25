// Exhausted-webhook alert component.
//
// Surfaces a prominent alert whenever one or more webhooks reach the
// `exhausted` state, so merchants are aware without polling.
//
// Spec ref: spec § "Alerting" — "when a webhook reaches the exhausted state
// the UI surfaces a prominent alert so the merchant is aware without polling."
//
// The component subscribes to a DeliveryEventStore and re-renders reactively
// whenever the underlying delivery-event data changes.

import { DeliveryEventStore } from './delivery-event-store';
import { DeliveryEvent } from './delivery-events';

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Returns the unique webhook IDs whose latest status is `exhausted`.
 *
 * "Latest status" is determined by the highest attempt number for each
 * webhookId. This means a webhook that was exhausted but then manually
 * re-triggered (and has a subsequent non-exhausted attempt) will NOT appear
 * in the result.
 */
export function getExhaustedWebhookIds(events: readonly DeliveryEvent[]): string[] {
  // Build a map of webhookId → event with the highest attempt number.
  const latest = new Map<string, DeliveryEvent>();
  for (const event of events) {
    const existing = latest.get(event.webhookId);
    if (!existing || event.attempt > existing.attempt) {
      latest.set(event.webhookId, event);
    }
  }

  const exhausted: string[] = [];
  for (const [id, event] of latest) {
    if (event.status === 'exhausted') {
      exhausted.push(id);
    }
  }
  return exhausted.sort();
}

// ---------------------------------------------------------------------------
// DOM rendering
// ---------------------------------------------------------------------------

/**
 * Renders the alert element for a given list of exhausted webhook IDs.
 * Returns `null` when the list is empty (no alert needed).
 *
 * The returned element carries:
 *   - role="alert" for accessibility
 *   - class "exhausted-alert" for styling
 *   - a dismiss button with class "exhausted-alert__dismiss"
 */
export function renderExhaustedAlert(
  exhaustedIds: string[],
  onDismiss: () => void,
): HTMLElement | null {
  if (exhaustedIds.length === 0) return null;

  const root = document.createElement('div');
  root.className = 'exhausted-alert';
  root.setAttribute('role', 'alert');
  root.setAttribute('aria-live', 'assertive');

  const message = document.createElement('span');
  message.className = 'exhausted-alert__message';
  if (exhaustedIds.length === 1) {
    message.textContent = `Webhook ${exhaustedIds[0]} has exhausted all delivery attempts.`;
  } else {
    message.textContent =
      `${exhaustedIds.length} webhooks have exhausted all delivery attempts: ` +
      exhaustedIds.join(', ') + '.';
  }
  root.appendChild(message);

  const dismiss = document.createElement('button');
  dismiss.className = 'exhausted-alert__dismiss';
  dismiss.type = 'button';
  dismiss.textContent = 'Dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss exhausted-webhook alert');
  dismiss.addEventListener('click', onDismiss);
  root.appendChild(dismiss);

  return root;
}

// ---------------------------------------------------------------------------
// Reactive mount
// ---------------------------------------------------------------------------

/**
 * Mounts a reactive exhausted-webhook alert into `container`, subscribed to
 * `store`. Re-renders whenever the store's events change. Dismissed alerts
 * are hidden until the set of exhausted webhooks changes (new exhaustions
 * surface a fresh alert).
 *
 * Returns a disposer that unsubscribes and clears the rendered DOM.
 */
export function mountExhaustedAlert(
  container: HTMLElement,
  store: DeliveryEventStore,
): () => void {
  // Track which set of exhausted IDs the user has dismissed so we can
  // re-surface the alert if the set changes (e.g. a new webhook exhausts).
  let dismissedKey = '';

  const render = (events: readonly DeliveryEvent[]) => {
    const ids = getExhaustedWebhookIds(events);
    const key = ids.join(',');

    // If the user dismissed this exact set, keep it hidden.
    if (key === dismissedKey) {
      container.replaceChildren();
      return;
    }

    const alertEl = renderExhaustedAlert(ids, () => {
      dismissedKey = key;
      container.replaceChildren();
    });

    if (alertEl) {
      container.replaceChildren(alertEl);
    } else {
      container.replaceChildren();
    }
  };

  const unsubscribe = store.subscribe(render);

  return () => {
    unsubscribe();
    container.replaceChildren();
  };
}
