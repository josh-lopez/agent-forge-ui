/**
 * Webhook re-trigger UI component.
 *
 * Provides a minimal, testable component that:
 *   - Displays the current delivery status of a webhook.
 *   - Shows a re-trigger button only when the status is `failed` or `exhausted`.
 *   - Transitions the status to `pending` immediately when re-trigger is clicked.
 *   - Resolves to `delivered` or `failed` once the re-delivery attempt completes.
 *   - Guards against duplicate in-flight re-triggers (no-op while `pending`).
 *
 * Spec ref: spec § "Manual re-trigger" and "Delivery status visibility".
 *
 * Design notes:
 *   - The component is a plain DOM helper with no framework dependency.
 *   - The `retriggerFn` parameter is the seam for injecting a mock delivery
 *     function in tests, keeping the component deterministic and fast.
 *   - The component does NOT use the retry scheduler internally; callers supply
 *     the delivery function so they control retry behaviour.
 */

import { DeliveryStatus } from './delivery-events';

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * Result returned by a single re-trigger delivery attempt.
 * Mirrors the shape used by the retry scheduler so callers can bridge the two.
 */
export interface RetriggerResult {
  /** Whether the re-triggered delivery succeeded. */
  success: boolean;
  /** HTTP status code (0 if no response). */
  httpStatus: number;
  /** Short excerpt of the response body. */
  responseBodyExcerpt: string;
}

/**
 * A function that performs (or simulates) a single re-trigger delivery attempt.
 * May be synchronous or asynchronous.
 */
export type RetriggerFn = () => RetriggerResult | Promise<RetriggerResult>;

/**
 * Options for {@link mountWebhookRetrigger}.
 */
export interface WebhookRetriggerOptions {
  /** Initial delivery status of the webhook. */
  initialStatus: DeliveryStatus;
  /**
   * Called when the user clicks the re-trigger button.
   * Must return (or resolve to) a {@link RetriggerResult}.
   */
  retriggerFn: RetriggerFn;
  /**
   * Optional callback invoked whenever the displayed status changes.
   * Useful for tests and for wiring the component into a parent store.
   */
  onStatusChange?: (newStatus: DeliveryStatus) => void;
}

/**
 * Handle returned by {@link mountWebhookRetrigger}.
 * Exposes the current status and a disposer for cleanup.
 */
export interface WebhookRetriggerHandle {
  /** Returns the current displayed status. */
  getStatus(): DeliveryStatus;
  /**
   * Programmatically trigger a re-delivery (same as clicking the button).
   * No-ops if the current status is not `failed` or `exhausted`.
   * Returns a promise that resolves once the status has settled.
   */
  trigger(): Promise<void>;
  /** Unmounts the component and removes all DOM children from the container. */
  dispose(): void;
}

// ── Data attributes used in the DOM ──────────────────────────────────────────

/** Attribute on the status badge element. */
export const ATTR_STATUS_BADGE = 'data-webhook-status';
/** Attribute on the re-trigger button element. */
export const ATTR_RETRIGGER_BTN = 'data-webhook-retrigger';

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Mounts a webhook status panel into `container`.
 *
 * The panel renders:
 *   - A status badge (`[data-webhook-status]`) showing the current status text.
 *   - A re-trigger button (`[data-webhook-retrigger]`) that is present and
 *     enabled only when the status is `failed` or `exhausted`.
 *
 * @param container - The host element to render into.
 * @param options   - Configuration: initial status, delivery function, change callback.
 * @returns A {@link WebhookRetriggerHandle} for programmatic control and cleanup.
 */
export function mountWebhookRetrigger(
  container: HTMLElement,
  options: WebhookRetriggerOptions,
): WebhookRetriggerHandle {
  let currentStatus: DeliveryStatus = options.initialStatus;
  let inFlight = false;

  // ── DOM helpers ────────────────────────────────────────────────────────────

  function render(): void {
    container.innerHTML = '';

    // Status badge.
    const badge = document.createElement('span');
    badge.setAttribute(ATTR_STATUS_BADGE, currentStatus);
    badge.textContent = currentStatus;
    container.appendChild(badge);

    // Re-trigger button — only for actionable statuses.
    if (currentStatus === 'failed' || currentStatus === 'exhausted') {
      const btn = document.createElement('button');
      btn.setAttribute(ATTR_RETRIGGER_BTN, '');
      btn.type = 'button';
      btn.textContent = 'Re-trigger';
      btn.addEventListener('click', handleClick);
      container.appendChild(btn);
    }
  }

  // ── Status transition ──────────────────────────────────────────────────────

  function setStatus(next: DeliveryStatus): void {
    if (next === currentStatus) return;
    currentStatus = next;
    render();
    options.onStatusChange?.(next);
  }

  // ── Re-trigger logic ───────────────────────────────────────────────────────

  async function performRetrigger(): Promise<void> {
    // Guard: only trigger from an actionable state and when not already in-flight.
    if (currentStatus !== 'failed' && currentStatus !== 'exhausted') return;
    if (inFlight) return;

    inFlight = true;
    setStatus('pending');

    try {
      const result = await options.retriggerFn();
      setStatus(result.success ? 'delivered' : 'failed');
    } finally {
      inFlight = false;
    }
  }

  function handleClick(): void {
    void performRetrigger();
  }

  // ── Initial render ─────────────────────────────────────────────────────────

  render();

  // ── Public handle ──────────────────────────────────────────────────────────

  return {
    getStatus(): DeliveryStatus {
      return currentStatus;
    },

    trigger(): Promise<void> {
      return performRetrigger();
    },

    dispose(): void {
      container.innerHTML = '';
    },
  };
}

// ── Utility: is re-trigger available for a given status? ─────────────────────

/**
 * Returns `true` if the re-trigger control should be shown/enabled for the
 * given delivery status.
 *
 * Only `failed` and `exhausted` webhooks can be manually re-triggered; a
 * `pending` delivery is already in-flight and a `delivered` one needs no
 * action.
 */
export function isRetriggerAvailable(status: DeliveryStatus): boolean {
  return status === 'failed' || status === 'exhausted';
}
