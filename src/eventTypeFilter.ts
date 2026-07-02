/**
 * Event-type filter for the delivery event log.
 *
 * Provides pure, side-effect-free functions that filter log entries by
 * event type, date range, and status — and compose all three into a single
 * pass. The functions are intentionally decoupled from any UI framework so
 * they can be unit-tested without a DOM environment.
 *
 * Spec ref: spec § "Event log filtering — Event-type filter"
 */

/** Minimal shape required by the event-type filter. */
export interface FilterableLogEntry {
  /** e.g. "payment.created", "refund.issued", "dispute.opened" */
  eventType: string;
}

/** Extended shape that also supports date-range and status filtering. */
export interface FilterableLogEntryFull extends FilterableLogEntry {
  /** ISO-8601 timestamp of the delivery attempt. */
  timestamp: string;
  /** Delivery status: "pending" | "delivered" | "failed" | "exhausted" */
  status: string;
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

/**
 * Filter log entries by date range.
 *
 * @param entries   - The full list of log entries to filter.
 * @param startDate - ISO-8601 string (inclusive lower bound). Null/undefined
 *                    means no lower bound.
 * @param endDate   - ISO-8601 string (inclusive upper bound). Null/undefined
 *                    means no upper bound.
 * @returns A new array containing only entries whose `timestamp` falls within
 *          [startDate, endDate] (both bounds inclusive), or the original array
 *          when both bounds are absent.
 */
export function filterByDateRange<T extends FilterableLogEntryFull>(
  entries: T[],
  startDate: string | null | undefined,
  endDate: string | null | undefined
): T[] {
  if (!startDate && !endDate) {
    return entries;
  }
  return entries.filter((entry) => {
    const ts = entry.timestamp;
    if (startDate && ts < startDate) return false;
    if (endDate && ts > endDate) return false;
    return true;
  });
}

/**
 * Filter log entries by delivery status.
 *
 * @param entries         - The full list of log entries to filter.
 * @param selectedStatuses - The set of statuses to keep.
 *                           An empty array means no filter is active and the
 *                           full entry list is returned unchanged.
 * @returns A new array containing only entries whose `status` is included in
 *          `selectedStatuses`, or the original array when `selectedStatuses`
 *          is empty.
 */
export function filterByStatuses<T extends FilterableLogEntryFull>(
  entries: T[],
  selectedStatuses: string[]
): T[] {
  if (selectedStatuses.length === 0) {
    return entries;
  }
  return entries.filter((entry) => selectedStatuses.includes(entry.status));
}

/**
 * Apply all three filters (event-type, date-range, status) as a conjunction.
 *
 * Each filter dimension is applied independently; an entry must satisfy ALL
 * active constraints to appear in the result. A dimension with an empty /
 * null selection is treated as "no constraint" for that dimension.
 *
 * @param entries          - The full list of log entries to filter.
 * @param selectedTypes    - Event types to keep (empty = all).
 * @param startDate        - Inclusive lower bound timestamp (null = none).
 * @param endDate          - Inclusive upper bound timestamp (null = none).
 * @param selectedStatuses - Statuses to keep (empty = all).
 * @returns Entries satisfying all active filter constraints.
 */
export function applyFilters<T extends FilterableLogEntryFull>(
  entries: T[],
  selectedTypes: string[],
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  selectedStatuses: string[]
): T[] {
  let result = filterByEventTypes(entries, selectedTypes);
  result = filterByDateRange(result, startDate, endDate);
  result = filterByStatuses(result, selectedStatuses);
  return result;
}

/**
 * Derive the sorted, deduplicated list of event types present in the log.
 *
 * Used to populate the multi-select control dynamically so that new event
 * types appearing in the log are automatically reflected in the UI without
 * code changes (spec AC8).
 *
 * @param entries - The full list of log entries.
 * @returns A sorted array of unique event-type strings.
 */
export function deriveEventTypes<T extends FilterableLogEntry>(
  entries: T[]
): string[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    seen.add(entry.eventType);
  }
  return Array.from(seen).sort();
}
