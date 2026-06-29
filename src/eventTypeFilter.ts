/**
 * Event-type filter for the delivery event log.
 *
 * Provides a pure, side-effect-free function that filters log entries by
 * event type. The function is intentionally decoupled from any UI framework
 * so it can be unit-tested without a DOM environment.
 *
 * Spec ref: spec § "Event log filtering — Event-type filter"
 */

/** Minimal shape required by the filter — a superset of the full log entry. */
export interface FilterableLogEntry {
  /** e.g. "payment.created", "refund.issued", "dispute.opened" */
  eventType: string;
}

/**
 * Filter log entries by event type.
 *
 * @param entries       - The full list of log entries to filter.
 * @param selectedTypes - The set of event types to keep.
 *                        An empty array (or "All" cleared) means no filter is
 *                        active and the full entry list is returned unchanged.
 * @returns A new array containing only entries whose `eventType` is included
 *          in `selectedTypes`, or the original array when `selectedTypes` is
 *          empty.
 */
export function filterByEventTypes<T extends FilterableLogEntry>(
  entries: T[],
  selectedTypes: string[]
): T[] {
  if (selectedTypes.length === 0) {
    // No filter active — return the full unfiltered list.
    return entries;
  }
  return entries.filter((entry) => selectedTypes.includes(entry.eventType));
}
