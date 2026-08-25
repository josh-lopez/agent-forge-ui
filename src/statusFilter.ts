/**
 * Status filter for the delivery event log.
 *
 * Provides a pure, side-effect-free function that filters log entries by
 * delivery status. The function is intentionally decoupled from any UI
 * framework so it can be unit-tested without a DOM environment.
 *
 * Spec ref: spec § "Event log filtering — status filter" (Issue #151)
 */

/** The four delivery statuses defined by the spec. */
export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'exhausted';

/** All four statuses in display order. */
export const ALL_STATUSES: DeliveryStatus[] = [
  'pending',
  'delivered',
  'failed',
  'exhausted',
];

/** Minimal shape required by the filter — a superset of the full log entry. */
export interface StatusFilterableEntry {
  /** Delivery status of this log entry. */
  status: DeliveryStatus;
}

/**
 * Filter log entries by delivery status.
 *
 * @param entries          - The full list of log entries to filter.
 * @param selectedStatuses - The set of statuses to keep.
 *                           An empty array (or "All" cleared) means no filter
 *                           is active and the full entry list is returned
 *                           unchanged.
 * @returns A new array containing only entries whose `status` is included in
 *          `selectedStatuses`, or the original array when `selectedStatuses`
 *          is empty.
 */
export function filterByStatuses<T extends StatusFilterableEntry>(
  entries: T[],
  selectedStatuses: DeliveryStatus[]
): T[] {
  if (selectedStatuses.length === 0) {
    // No filter active — return the full unfiltered list.
    return entries;
  }
  return entries.filter((entry) => selectedStatuses.includes(entry.status));
}

/**
 * Apply all three filter dimensions (date-range, event-type, status) in
 * composition. Each dimension is only applied when its selection is non-empty
 * (or, for date-range, when the bound is non-null). Entries must satisfy ALL
 * active filters simultaneously (AND semantics across dimensions).
 *
 * This helper is the single source of truth for filter composition so that
 * the UI and tests share identical logic.
 *
 * @param entries          - Full list of log entries.
 * @param startDate        - Inclusive lower bound (null = no lower bound).
 * @param endDate          - Inclusive upper bound (null = no upper bound).
 * @param selectedTypes    - Event-type filter; empty = inactive.
 * @param selectedStatuses - Status filter; empty = inactive.
 * @returns Entries satisfying all active filter dimensions.
 */
export function applyAllFilters<
  T extends StatusFilterableEntry & { eventType: string; timestamp: string }
>(
  entries: T[],
  startDate: Date | null,
  endDate: Date | null,
  selectedTypes: string[],
  selectedStatuses: DeliveryStatus[]
): T[] {
  return entries.filter((entry) => {
    // Date-range dimension
    if (startDate !== null || endDate !== null) {
      const ts = new Date(entry.timestamp).getTime();
      if (startDate !== null && ts < startDate.getTime()) return false;
      if (endDate !== null && ts > endDate.getTime()) return false;
    }

    // Event-type dimension
    if (selectedTypes.length > 0 && !selectedTypes.includes(entry.eventType)) {
      return false;
    }

    // Status dimension
    if (
      selectedStatuses.length > 0 &&
      !selectedStatuses.includes(entry.status)
    ) {
      return false;
    }

    return true;
  });
}
