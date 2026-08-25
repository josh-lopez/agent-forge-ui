/**
 * Bulk re-trigger action for exhausted webhooks.
 *
 * Provides a pure, side-effect-free function that transitions all webhooks
 * currently in the 'exhausted' state back to 'pending', re-entering the
 * retry schedule. The function is intentionally decoupled from any UI
 * framework so it can be unit-tested without a DOM environment.
 *
 * Spec ref: spec § "Webhook delivery & retries — Manual re-trigger"
 * Issue: #190 – Add bulk re-trigger action for exhausted webhooks
 *
 * Acceptance criteria addressed:
 *   AC2 – re-triggers all currently exhausted webhooks in a single call.
 *   AC3 – each re-triggered webhook transitions from 'exhausted' → 'pending'.
 *   AC5 – returns an empty result (no-op) when there are no exhausted webhooks.
 *   AC8 – does not affect webhooks in other states (pending/delivered/failed).
 */

import type { WebhookEntry } from './webhookTypes.ts';

/**
 * Result of a bulk re-trigger operation.
 */
export interface BulkRetriggerResult {
  /**
   * The updated list of all webhook entries.
   * Exhausted entries have been transitioned to 'pending'; all others are
   * returned unchanged (same object references).
   */
  updatedEntries: WebhookEntry[];
  /**
   * The IDs of the webhooks that were re-triggered (i.e. those that were
   * 'exhausted' at the time of the call).
   */
  retriggeredIds: string[];
}

/**
 * Transition all 'exhausted' webhooks back to 'pending'.
 *
 * This is a pure function: it does not mutate the input array or any of its
 * entries. It returns a new array where exhausted entries are replaced with
 * shallow copies that have `status` set to `'pending'`.
 *
 * Webhooks in states other than 'exhausted' (pending, delivered, failed) are
 * returned as-is (same object reference, no copy).
 *
 * @param entries - The current list of all webhook entries.
 * @returns A {@link BulkRetriggerResult} containing the updated entry list and
 *          the IDs of the webhooks that were re-triggered.
 */
export function bulkRetriggerExhausted(entries: WebhookEntry[]): BulkRetriggerResult {
  const retriggeredIds: string[] = [];

  const updatedEntries = entries.map((entry) => {
    if (entry.status === 'exhausted') {
      retriggeredIds.push(entry.id);
      // Return a shallow copy with status reset to 'pending'.
      return { ...entry, status: 'pending' as const };
    }
    // Non-exhausted entries are returned unchanged (same reference).
    return entry;
  });

  return { updatedEntries, retriggeredIds };
}

/**
 * Returns true when at least one webhook in the list is in the 'exhausted'
 * state. Use this to determine whether the bulk re-trigger control should be
 * visible/enabled in the UI.
 *
 * Spec ref: AC1 – control visible when one or more webhooks are exhausted.
 * Spec ref: AC5 – control disabled/hidden when no exhausted webhooks exist.
 *
 * @param entries - The current list of all webhook entries.
 */
export function hasExhaustedWebhooks(entries: WebhookEntry[]): boolean {
  return entries.some((entry) => entry.status === 'exhausted');
}
