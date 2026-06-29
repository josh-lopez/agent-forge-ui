/**
 * Date-range filter for the delivery event log.
 *
 * Provides a pure, side-effect-free function that filters log entries by a
 * date/time range. The function is intentionally decoupled from any UI
 * framework so it can be unit-tested without a DOM environment.
 *
 * Boundary semantics: entries whose timestamp is exactly equal to the start
 * or end of the range are **included** (closed interval [start, end]).
 *
 * Spec ref: spec § "Event log filtering — Date-range filter"
 */

/** Minimal shape required by the filter — a superset of the full log entry. */
export interface DateFilterableLogEntry {
  /**
   * ISO 8601 timestamp string (e.g. "2024-01-15T10:30:00Z") representing
   * when the delivery attempt occurred.
   */
  timestamp: string;
}

/**
 * Filter log entries by a date/time range.
 *
 * @param entries  - The full list of log entries to filter.
 * @param start    - Inclusive range start as an ISO 8601 string, or null/undefined
 *                   to indicate no lower bound.
 * @param end      - Inclusive range end as an ISO 8601 string, or null/undefined
 *                   to indicate no upper bound.
 * @returns A new array containing only entries whose `timestamp` falls within
 *          [start, end] (both boundaries inclusive). When both `start` and
 *          `end` are null/undefined the original array is returned unchanged
 *          (no filter active).
 */
export function filterByDateRange<T extends DateFilterableLogEntry>(
  entries: T[],
  start: string | null | undefined,
  end: string | null | undefined
): T[] {
  // No filter active — return the full unfiltered list.
  if (!start && !end) {
    return entries;
  }

  const startMs = start ? new Date(start).getTime() : -Infinity;
  const endMs = end ? new Date(end).getTime() : Infinity;

  return entries.filter((entry) => {
    const entryMs = new Date(entry.timestamp).getTime();
    return entryMs >= startMs && entryMs <= endMs;
  });
}
