/**
 * Status filter for the delivery event log.
 *
 * Provides a pure, side-effect-free function that filters log entries by
 * delivery status. The function is intentionally decoupled from any UI
 * framework so it can be unit-tested without a DOM environment.
 *
 * Spec ref: spec § "Webhook delivery & retries — Delivery status visibility"
 */

/** Delivery status values as defined by the spec. */
export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'exhausted';

/** Minimal shape required by the filter. */
export interface StatusFilterableLogEntry {
  /** One of: "pending", "delivered", "failed", "exhausted" */
  status: string;
}

/**
 * Filter log entries by delivery status.
 *
 * @param entries          - The full list of log entries to filter.
 * @param selectedStatuses - The set of statuses to keep.
 *                           An empty array means no filter is active and the
 *                           full entry list is returned unchanged.
 * @returns A new array containing only entries whose `status` is included in
 *          `selectedStatuses`, or the original array when `selectedStatuses`
 *          is empty.
 */
export function filterByStatuses<T extends StatusFilterableLogEntry>(
  entries: T[],
  selectedStatuses: string[]
): T[] {
  if (selectedStatuses.length === 0) {
    // No filter active — return the full unfiltered list.
    return entries;
  }
  return entries.filter((entry) => selectedStatuses.includes(entry.status));
}
