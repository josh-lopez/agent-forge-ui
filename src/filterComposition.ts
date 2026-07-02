/**
 * Filter composition for the delivery event log.
 *
 * Combines the date-range, event-type, and status filters into a single
 * pure function that applies all active filters as an AND-composition
 * (only entries matching every active constraint are returned).
 *
 * Spec ref: spec § "Event log filtering" — "Filter composition" requirements
 * for both the date-range and event-type filter sections.
 */

import { filterByDateRange, type DateFilterableLogEntry } from './dateRangeFilter.js';
import { filterByEventTypes, type FilterableLogEntry } from './eventTypeFilter.js';
import { filterByStatuses, type StatusFilterableLogEntry } from './statusFilter.js';

/** Combined shape required by the composed filter. */
export interface ComposableLogEntry
  extends DateFilterableLogEntry,
    FilterableLogEntry,
    StatusFilterableLogEntry {}

/** Active filter state passed to applyFilters. */
export interface FilterState {
  /** Inclusive lower bound for timestamp (ISO-8601) or null/undefined for none. */
  startDate?: string | null;
  /** Inclusive upper bound for timestamp (ISO-8601) or null/undefined for none. */
  endDate?: string | null;
  /** Selected event types; empty array means "all types" (no filter). */
  selectedEventTypes?: string[];
  /** Selected statuses; empty array means "all statuses" (no filter). */
  selectedStatuses?: string[];
}

/**
 * Apply all active filters to a list of log entries.
 *
 * Each filter dimension is applied independently to the full dataset and the
 * results are intersected (AND-composition). A filter dimension is considered
 * inactive when its value is absent, null, empty string, or an empty array —
 * inactive dimensions do not restrict the result set.
 *
 * @param entries - The full list of log entries.
 * @param filters - The current filter state.
 * @returns A new array containing only entries that satisfy every active filter.
 */
export function applyFilters<T extends ComposableLogEntry>(
  entries: T[],
  filters: FilterState
): T[] {
  let result = entries;

  result = filterByDateRange(result, filters.startDate, filters.endDate);
  result = filterByEventTypes(result, filters.selectedEventTypes ?? []);
  result = filterByStatuses(result, filters.selectedStatuses ?? []);

  return result;
}
