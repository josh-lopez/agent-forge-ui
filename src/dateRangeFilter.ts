/**
 * Date-range filter for the delivery event log.
 *
 * Provides pure, side-effect-free helpers that determine whether the
 * date-range filter is active, and a DOM-rendering function that injects a
 * visible indicator + keyboard-accessible clear-all button into a container
 * element.
 *
 * Spec ref: spec § "Event log filtering — Date-range filter"
 *   "Active-filter indicator: while a date range is set, a visible indicator
 *    confirms the filter is active; a clear-all control removes the range in
 *    one action."
 *
 * Issue #170
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Represents the date-range filter state.
 * Either or both values may be empty strings (meaning that bound is unset).
 */
export interface DateRange {
  /** ISO-8601 date-time string (or empty string when unset). */
  start: string;
  /** ISO-8601 date-time string (or empty string when unset). */
  end: string;
}

/** Minimal shape required by the date-range filter. */
export interface DateFilterableEntry {
  /** ISO-8601 date-time string representing the attempt timestamp. */
  timestamp: string;
}

// ── Pure state helpers ────────────────────────────────────────────────────────

/**
 * Returns `true` when the date-range filter is active, i.e. at least one of
 * `start` or `end` has a non-empty value.
 *
 * Per the spec's most conservative interpretation: a partial range (only one
 * bound set) also triggers the indicator.
 *
 * @param range - The current date-range filter state.
 * @returns `true` when at least one bound is set.
 */
export function isDateRangeFilterActive(range: DateRange): boolean {
  return range.start.trim() !== '' || range.end.trim() !== '';
}

/**
 * Returns the "cleared" (default) state for the date-range filter — both
 * bounds set to empty strings.
 *
 * Calling this is the single action required to reset the filter (AC4).
 *
 * @returns A {@link DateRange} with both bounds empty.
 */
export function clearDateRangeFilter(): DateRange {
  return { start: '', end: '' };
}

/**
 * Filter log entries by date range.
 *
 * Entries whose `timestamp` falls within [start, end] (inclusive) are kept.
 * An unset bound (empty string) is treated as open-ended on that side.
 *
 * @param entries - The full list of log entries to filter.
 * @param range   - The active date-range filter state.
 * @returns A new array containing only entries within the range, or the
 *          original array when both bounds are empty (no filter active).
 */
export function filterByDateRange<T extends DateFilterableEntry>(
  entries: T[],
  range: DateRange
): T[] {
  if (!isDateRangeFilterActive(range)) {
    // No filter active — return the full unfiltered list.
    return entries;
  }

  return entries.filter((entry) => {
    const ts = entry.timestamp;
    if (range.start.trim() !== '' && ts < range.start) return false;
    if (range.end.trim() !== '' && ts > range.end) return false;
    return true;
  });
}

// ── DOM rendering helpers ─────────────────────────────────────────────────────

/**
 * Options accepted by {@link renderDateRangeFilterIndicator}.
 */
export interface DateRangeFilterIndicatorOptions {
  /** The current date-range filter state. */
  range: DateRange;
  /**
   * Callback invoked when the user activates the clear-all control.
   * The callback receives the new (cleared) range so the caller can update
   * its own state without importing `clearDateRangeFilter` separately.
   */
  onClearAll: (newRange: DateRange) => void;
  /**
   * Optional accessible label for the clear-all button.
   * Defaults to "Clear date range filter".
   */
  clearAllAriaLabel?: string;
}

/**
 * Renders (or removes) the active-filter indicator and clear-all control
 * inside `container`.
 *
 * - When the filter is **active** (at least one bound is set): injects a
 *   `<span>` badge describing the active range and a `<button>` with an
 *   accessible `aria-label` that clears both bounds in one action.
 * - When the filter is **inactive** (both bounds empty): removes any
 *   previously rendered indicator so the container is empty.
 *
 * The function is idempotent — calling it repeatedly with the same state
 * produces the same DOM output.
 *
 * @param container - The DOM element that will host the indicator markup.
 * @param options   - Configuration (see {@link DateRangeFilterIndicatorOptions}).
 */
export function renderDateRangeFilterIndicator(
  container: HTMLElement,
  options: DateRangeFilterIndicatorOptions
): void {
  const {
    range,
    onClearAll,
    clearAllAriaLabel = 'Clear date range filter',
  } = options;

  // Always start from a clean slate so re-renders are idempotent.
  container.innerHTML = '';

  if (!isDateRangeFilterActive(range)) {
    // Filter is inactive — leave the container empty (indicator hidden).
    return;
  }

  // ── Active-filter indicator ───────────────────────────────────────────────
  const indicator = document.createElement('span');
  indicator.dataset['dateRangeFilterIndicator'] = 'true';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');

  // Build a human-readable description of the active range.
  const parts: string[] = [];
  if (range.start.trim() !== '') parts.push(`from ${range.start}`);
  if (range.end.trim() !== '') parts.push(`to ${range.end}`);
  indicator.textContent = `Date filter active: ${parts.join(' ')}`;

  // ── Clear-all button ──────────────────────────────────────────────────────
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.dataset['dateRangeFilterClearAll'] = 'true';
  clearBtn.setAttribute('aria-label', clearAllAriaLabel);
  clearBtn.textContent = '✕ Clear';

  clearBtn.addEventListener('click', () => {
    onClearAll(clearDateRangeFilter());
  });

  // Keyboard: the button is naturally focusable and activatable via Enter/Space
  // because it is a <button> element — no extra keydown handler needed.

  container.appendChild(indicator);
  container.appendChild(clearBtn);
}
