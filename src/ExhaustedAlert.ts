/**
 * ExhaustedAlert
 *
 * Renders a prominent, dismissible alert banner whenever a webhook transitions
 * to the `exhausted` state.  Each newly-exhausted webhook produces its own
 * alert; alerts persist until the merchant explicitly dismisses them.
 *
 * Accessibility: each alert uses role="alert" so screen readers announce it
 * immediately, and the dismiss button has an aria-label.
 *
 * Usage:
 *   const alertContainer = document.getElementById('exhausted-alerts')!;
 *   const alert = new ExhaustedAlert(alertContainer, store);
 *   // Call alert.destroy() to unsubscribe when tearing down.
 */

import type { DeliveryEvent } from './DeliveryEventStore.ts';
import type { DeliveryEventStore } from './DeliveryEventStore.ts';

export class ExhaustedAlert {
  private container: HTMLElement;
  private unsubscribe: () => void;
  /**
   * Track which webhookIds have already had an alert rendered in the current
   * "alert session".  An alert session resets when the webhook is dismissed
   * (so re-triggering and re-exhausting produces a fresh alert — AC interaction
   * with #141).
   */
  private alertedIds: Set<string> = new Set();

  constructor(container: HTMLElement, store: DeliveryEventStore) {
    this.container = container;
    this.unsubscribe = store.subscribe((events) => this.onStoreUpdate(events));
  }

  /** Unsubscribe from the store (call when removing the component). */
  destroy(): void {
    this.unsubscribe();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private onStoreUpdate(events: ReadonlyArray<DeliveryEvent>): void {
    for (const event of events) {
      if (event.status === 'exhausted' && !this.alertedIds.has(event.webhookId)) {
        this.alertedIds.add(event.webhookId);
        this.renderAlert(event);
      }
    }
  }

  private renderAlert(event: DeliveryEvent): void {
    const banner = document.createElement('div');
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'assertive');
    banner.setAttribute('data-webhook-id', event.webhookId);
    banner.className = 'exhausted-alert';

    // Icon + message
    const icon = document.createElement('span');
    icon.className = 'exhausted-alert__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '⚠️';

    const message = document.createElement('span');
    message.className = 'exhausted-alert__message';
    message.textContent =
      `Webhook exhausted — all retry attempts failed. ` +
      `ID: ${event.webhookId} · Event: ${event.eventType}`;

    // Dismiss button
    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'exhausted-alert__dismiss';
    dismissBtn.setAttribute('aria-label', `Dismiss alert for webhook ${event.webhookId}`);
    dismissBtn.textContent = '✕';
    dismissBtn.addEventListener('click', () => {
      banner.remove();
      // Allow a future re-exhaustion of the same webhook to surface a new alert
      // (e.g. after a manual re-trigger via #141).
      this.alertedIds.delete(event.webhookId);
    });

    banner.appendChild(icon);
    banner.appendChild(message);
    banner.appendChild(dismissBtn);

    this.container.appendChild(banner);
  }
}
