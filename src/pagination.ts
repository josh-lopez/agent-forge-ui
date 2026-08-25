/**
 * Pagination utilities for the delivery event log.
 *
 * Provides pure, side-effect-free functions for slicing a (post-filter)
 * dataset into fixed-size pages and for computing pagination metadata.
 *
 * Design decisions:
 *  - Pages are 1-indexed (page 1 is the first page) for human-readable UI.
 *  - Page size defaults to PAGE_SIZE_DEFAULT but is configurable per call.
 *  - All functions are stateless; the caller owns pagination state.
 *  - Pagination always operates on the post-filter dataset so that filter
 *    composition (date-range × event-type × status) is handled upstream and
 *    this module stays focused on slicing.
 *
 * Spec ref: spec § "Event log filtering" + Issue #191 acceptance criteria.
 */

/** Default number of entries shown per page. */
export const PAGE_SIZE_DEFAULT = 25;

/** Metadata describing the current pagination state. */
export interface PaginationMeta {
  /** Current 1-indexed page number. */
  currentPage: number;
  /** Number of entries per page. */
  pageSize: number;
  /** Total number of entries in the (post-filter) dataset. */
  totalEntries: number;
  /** Total number of pages (≥ 1, even when totalEntries is 0). */
  totalPages: number;
  /** Whether a previous page exists. */
  hasPrev: boolean;
  /** Whether a next page exists. */
  hasNext: boolean;
  /** 1-indexed position of the first entry on the current page (0 when empty). */
  firstEntry: number;
  /** 1-indexed position of the last entry on the current page (0 when empty). */
  lastEntry: number;
}

/**
 * Clamp `page` to the valid range [1, totalPages].
 *
 * @param page       - Requested 1-indexed page number.
 * @param totalPages - Total number of pages available.
 * @returns A page number guaranteed to be within [1, totalPages].
 */
export function clampPage(page: number, totalPages: number): number {
  const tp = Math.max(1, totalPages);
  return Math.min(Math.max(1, Math.floor(page)), tp);
}

/**
 * Compute pagination metadata for a dataset.
 *
 * @param totalEntries - Total number of entries in the post-filter dataset.
 * @param currentPage  - Requested 1-indexed page number (will be clamped).
 * @param pageSize     - Number of entries per page (defaults to PAGE_SIZE_DEFAULT).
 * @returns A {@link PaginationMeta} object describing the current state.
 */
export function getPaginationMeta(
  totalEntries: number,
  currentPage: number,
  pageSize: number = PAGE_SIZE_DEFAULT
): PaginationMeta {
  const size = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(totalEntries / size));
  const page = clampPage(currentPage, totalPages);

  const isEmpty = totalEntries === 0;
  const firstEntry = isEmpty ? 0 : (page - 1) * size + 1;
  const lastEntry = isEmpty ? 0 : Math.min(page * size, totalEntries);

  return {
    currentPage: page,
    pageSize: size,
    totalEntries,
    totalPages,
    hasPrev: page > 1,
    hasNext: page < totalPages,
    firstEntry,
    lastEntry,
  };
}

/**
 * Slice a dataset to the entries that belong on the requested page.
 *
 * The input array should already be filtered (date-range, event-type, status)
 * and sorted in the desired display order before being passed here.
 *
 * @param entries     - The full post-filter, sorted dataset.
 * @param currentPage - 1-indexed page number to retrieve.
 * @param pageSize    - Number of entries per page (defaults to PAGE_SIZE_DEFAULT).
 * @returns A new array containing only the entries for the requested page.
 */
export function getPage<T>(
  entries: T[],
  currentPage: number,
  pageSize: number = PAGE_SIZE_DEFAULT
): T[] {
  const size = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(entries.length / size));
  const page = clampPage(currentPage, totalPages);
  const start = (page - 1) * size;
  return entries.slice(start, start + size);
}

/**
 * Reset pagination to page 1 when a filter changes.
 *
 * This is a trivial helper that makes the intent explicit at call sites:
 * whenever a filter is applied or cleared, call this to get the new page.
 *
 * @returns Always returns 1.
 */
export function resetPage(): number {
  return 1;
}

/**
 * Build a human-readable summary string for the pagination control.
 *
 * Examples:
 *   "Showing 1–25 of 1,000 entries"
 *   "Showing 0 entries"
 *
 * @param meta - The {@link PaginationMeta} for the current state.
 * @returns A localised summary string.
 */
export function paginationSummary(meta: PaginationMeta): string {
  if (meta.totalEntries === 0) {
    return 'Showing 0 entries';
  }
  const total = meta.totalEntries.toLocaleString();
  return `Showing ${meta.firstEntry}–${meta.lastEntry} of ${total} entries`;
}
