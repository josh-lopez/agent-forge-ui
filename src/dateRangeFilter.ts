/**
 * Date-range filter for the delivery event log.
 *
 * Provides a pure, side-effect-free function that filters log entries by a
 * start and/or end date-time. Boundary entries (timestamps exactly equal to
 * start or end) are included (inclusive on both ends).
 *
 * Timestamps are compared as UTC epoch milliseconds to avoid timezone-offset
 * bugs where a boundary entry would be incorrectly excluded.
 *
 * Spec ref: spec § "Event log filtering — Date-range filter"
 */

import { toEpochMillis } from './delivery-events';

/** Minimal shape required by the filter — a superset of the full log entry. */
export interface DateFilterableLogEntry {
  /**
   * ISO-8601 timestamp of the delivery attempt.
   * Must be parseable by `Date.parse` (e.g. "2024-01-15T10:30:00.000Z").
   */
  timestamp: string;
}

/**
 * The active date-range selection.
 *
 * Both fields are optional so callers can set only a start, only an end, or
 * both. An empty object (or `undefined` for both fields) means no filter is
 * active and the full entry list is returned unchanged.
 */
export interface DateRange {
  /**
   * ISO-8601 string representing the inclusive start of the range.
   * Entries whose timestamp is strictly before this value are hidden.
   * Omit (or set to `undefined`) to apply no lower bound.
   */
  start?: string;
  /**
   * ISO-8601 string representing the inclusive end of the range.
   * Entries whose timestamp is strictly after this value are hidden.
   * Omit (or set to `undefined`) to apply no upper bound.
   */
  end?: string;
}

/**
 * Returns `true` when the date-range filter has at least one bound set.
 *
 * @param range - The current date-range selection.
 * @returns `true` when `start` or `end` (or both) are non-empty strings.
 */
export function isDateRangeFilterActive(range: DateRange): boolean {
  return Boolean(range.start?.trim()) || Boolean(range.end?.trim());
}

/**
 * Returns the "cleared" (default) state for the date-range filter — an object
 * with no bounds set, which signals "no filter active".
 *
 * @returns An empty `DateRange` representing the default (unfiltered) state.
 */
export function clearDateRangeFilter(): DateRange {
  return {};
}

/**
 * Filter log entries by a date-range.
 *
 * Comparison is performed in UTC epoch milliseconds so that boundary entries
 * (timestamps exactly equal to `start` or `end`) are always included,
 * regardless of the local timezone.
 *
 * @param entries - The full list of log entries to filter.
 * @param range   - The active date-range selection.
 *                  An empty object (both bounds absent) means no filter is
 *                  active and the full entry list is returned unchanged.
 * @returns A new array containing only entries whose `timestamp` falls within
 *          the selected range (inclusive), or the original array when no
 *          bounds are set.
 */
export function filterByDateRange<T extends DateFilterableLogEntry>(
  entries: T[],
  range: DateRange
): T[] {
  const hasStart = Boolean(range.start?.trim());
  const hasEnd = Boolean(range.end?.trim());

  // No filter active — return the full unfiltered list.
  if (!hasStart && !hasEnd) {
    return entries;
  }

  const startMs = hasStart ? toEpochMillis(range.start!) : -Infinity;
  const endMs = hasEnd ? toEpochMillis(range.end!) : Infinity;

  return entries.filter((entry) => {
    const entryMs = toEpochMillis(entry.timestamp);
    if (Number.isNaN(entryMs)) {
      // Unparseable timestamp — exclude the entry rather than silently passing it.
      return false;
    }
    return entryMs >= startMs && entryMs <= endMs;
  });
}

/**
 * Composes the date-range filter with the event-type and status filters.
 *
 * This is a convenience helper that applies all three filter dimensions in
 * sequence so callers do not need to chain them manually. Each dimension is
 * independent: clearing one does not affect the others.
 *
 * @param entries       - The full list of log entries.
 * @param dateRange     - Active date-range bounds (empty object = inactive).
 * @param selectedTypes - Active event-type selection (empty array = inactive).
 * @param selectedStatus - Active status selection (empty string = inactive).
 * @returns Entries that satisfy all active filter dimensions simultaneously.
 */
export function composeFilters<
  T extends DateFilterableLogEntry & { eventType: string; status: string }
>(
  entries: T[],
  dateRange: DateRange,
  selectedTypes: string[],
  selectedStatus: string
): T[] {
  let result = filterByDateRange(entries, dateRange);

  if (selectedTypes.length > 0) {
    result = result.filter((e) => selectedTypes.includes(e.eventType));
  }

  if (selectedStatus.trim()) {
    result = result.filter((e) => e.status === selectedStatus);
  }

  return result;
}
