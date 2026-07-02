/**
 * Webhook manual re-trigger control.
 *
 * Provides:
 *  - Type definitions for webhook delivery state.
 *  - `canRetrigger(status)` — pure predicate: true only for `failed` / `exhausted`.
 *  - `WebhookRetriggerButton` — a factory that creates an accessible button
 *    element wired to a caller-supplied retry callback.
 *  - `retriggerWebhook(webhook, retryFn)` — orchestrates a single re-trigger
 *    attempt: guards against duplicate in-flight calls, transitions state to
 *    `pending`, invokes the retry function, and handles errors.
 *
 * Spec ref: spec § "Manual re-trigger"
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** All possible delivery statuses for a webhook. */
export type WebhookStatus = 'pending' | 'delivered' | 'failed' | 'exhausted';

/** Minimal shape of a webhook record used by this module. */
export interface WebhookRecord {
  /** Unique identifier for this webhook. */
  id: string;
  /** Current delivery status. */
  status: WebhookStatus;
  /** Number of delivery attempts made so far (reset to 0 on re-trigger). */
  attemptCount: number;
  /** True while a re-trigger request is in flight (prevents duplicates). */
  retriggering?: boolean;
}

/**
 * Delivery event emitted by the retry mechanism (simulator or real service).
 * Mirrors the shape used by the webhook delivery simulator.
 */
export interface DeliveryEvent {
  webhookId: string;
  status: WebhookStatus;
  timestamp: string;
  httpStatus?: number;
  responseExcerpt?: string;
  /** True when this event was initiated by a manual re-trigger action. */
  manual?: boolean;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Returns `true` when a webhook in the given status is eligible for manual
 * re-triggering (i.e. `failed` or `exhausted`).
 *
 * AC1 / AC2: the re-trigger control is shown only for these two statuses.
 */
export function canRetrigger(status: WebhookStatus): boolean {
  return status === 'failed' || status === 'exhausted';
}

// ── Re-trigger orchestration ──────────────────────────────────────────────────

/**
 * Callback type supplied by the caller to perform the actual delivery attempt.
 * The callback receives the webhook record (with `attemptCount` already reset
 * to 0) and must return a Promise that resolves when the attempt is complete.
 */
export type RetryFn = (webhook: WebhookRecord) => Promise<void>;

/**
 * Orchestrates a manual re-trigger for a single webhook.
 *
 * Behaviour:
 *  - AC3: resets `attemptCount` to 0 (full retry budget) and calls `retryFn`.
 *  - AC4: transitions `status` to `'pending'` immediately (synchronously).
 *  - AC6: sets `retriggering = true` before the async call and clears it
 *         afterwards, preventing duplicate in-flight submissions.
 *  - Race-condition guard: if `webhook.retriggering` is already `true` the
 *         call is a no-op (returns immediately without calling `retryFn`).
 *
 * @param webhook  The webhook record to re-trigger (mutated in place).
 * @param retryFn  Async function that performs the delivery attempt.
 * @returns        A Promise that resolves when the attempt completes (or
 *                 rejects if `retryFn` throws and the error is not swallowed).
 */
export async function retriggerWebhook(
  webhook: WebhookRecord,
  retryFn: RetryFn,
): Promise<void> {
  // AC6 / race-condition guard: bail out if already in flight.
  if (webhook.retriggering) {
    return;
  }

  // AC6: mark as in-flight to prevent duplicate submissions.
  webhook.retriggering = true;

  // AC3: reset attempt counter so the full retry budget is available.
  webhook.attemptCount = 0;

  // AC4: transition to pending immediately (synchronous, no refresh needed).
  webhook.status = 'pending';

  try {
    await retryFn(webhook);
  } finally {
    // AC6: clear the in-flight flag regardless of success or failure.
    webhook.retriggering = false;
  }
}

// ── DOM component ─────────────────────────────────────────────────────────────

/**
 * Options for `createRetriggerButton`.
 */
export interface RetriggerButtonOptions {
  /** Called when the button is clicked and the webhook is eligible. */
  onRetrigger: (webhookId: string) => void;
  /** Optional custom label text (defaults to "Re-trigger"). */
  label?: string;
}

/**
 * Creates an accessible re-trigger button for a webhook row.
 *
 * AC1 / AC2: returns `null` when the webhook status is NOT `failed` or
 *            `exhausted` — the caller should not render the button at all.
 * AC6:       the button is disabled while `webhook.retriggering` is true.
 * AC9:       the button carries `aria-label="Re-trigger webhook"` and is a
 *            native `<button>` element (keyboard-operable by default).
 *
 * @param webhook  The webhook record for this row.
 * @param options  Callback and optional label.
 * @returns        An HTMLButtonElement, or `null` if the status is ineligible.
 */
export function createRetriggerButton(
  webhook: WebhookRecord,
  options: RetriggerButtonOptions,
): HTMLButtonElement | null {
  // AC1 / AC2: only render for failed / exhausted.
  if (!canRetrigger(webhook.status)) {
    return null;
  }

  const label = options.label ?? 'Re-trigger';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  // AC9: descriptive aria-label for screen readers.
  btn.setAttribute('aria-label', 'Re-trigger webhook');
  btn.className = 'webhook-retrigger-btn';

  // AC6: disable while a re-trigger is already in flight.
  if (webhook.retriggering) {
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
  }

  // AC3 / AC4 / AC6: clicking initiates the retry.
  btn.addEventListener('click', () => {
    if (!btn.disabled) {
      options.onRetrigger(webhook.id);
    }
  });

  return btn;
}
