/**
 * Date-range filter for the delivery event log.
 *
 * Provides a pure, side-effect-free function that filters log entries by
 * a start and/or end date-time. Boundary entries (exactly equal to start
 * or end) are included.
 *
 * Spec ref: spec § "Event log filtering — Date-range filter"
 */

/** Minimal shape required by the filter. */
export interface DateFilterableLogEntry {
  /** ISO-8601 timestamp string, e.g. "2024-01-15T10:30:00Z" */
  timestamp: string;
}

/**
 * Filter log entries by a date-time range.
 *
 * @param entries   - The full list of log entries to filter.
 * @param startDate - Inclusive lower bound (ISO-8601 string or null/undefined
 *                    to indicate no lower bound).
 * @param endDate   - Inclusive upper bound (ISO-8601 string or null/undefined
 *                    to indicate no upper bound).
 * @returns A new array containing only entries whose `timestamp` falls within
 *          [startDate, endDate] (both bounds inclusive). When both bounds are
 *          absent the original array is returned unchanged.
 */
export function filterByDateRange<T extends DateFilterableLogEntry>(
  entries: T[],
  startDate: string | null | undefined,
  endDate: string | null | undefined
): T[] {
  const hasStart = startDate != null && startDate !== '';
  const hasEnd = endDate != null && endDate !== '';

  if (!hasStart && !hasEnd) {
    // No filter active — return the full unfiltered list.
    return entries;
  }

  const start = hasStart ? new Date(startDate as string).getTime() : -Infinity;
  const end = hasEnd ? new Date(endDate as string).getTime() : Infinity;

  return entries.filter((entry) => {
    const ts = new Date(entry.timestamp).getTime();
    return ts >= start && ts <= end;
  });
}
