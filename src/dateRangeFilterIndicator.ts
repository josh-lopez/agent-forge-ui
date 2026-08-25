/**
 * Active-filter indicator and clear-all control for the date-range filter.
 *
 * Provides pure, side-effect-free helpers that determine whether the
 * date-range filter is in an active state (both start and end inputs
 * populated), and a DOM-rendering function that injects a visible indicator
 * + keyboard-accessible clear-all button into a container element.
 *
 * Spec ref: spec § "Event log filtering — Date-range filter"
 *   "Active-filter indicator: while a date range is set, a visible indicator
 *    confirms the filter is active; a clear-all control removes the range in
 *    one action."
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Represents the date-range filter state.
 * Both `start` and `end` must be non-empty strings for the filter to be
 * considered active. A partial range (only one populated) is treated as
 * inactive to avoid ambiguous filtering behaviour.
 */
export interface DateRange {
  /** ISO 8601 date-time string (or empty string when not set). */
  start: string;
  /** ISO 8601 date-time string (or empty string when not set). */
  end: string;
}

// ── Pure state helpers ────────────────────────────────────────────────────────

/**
 * Returns `true` when the date-range filter is active, i.e. **both** start
 * and end values are non-empty strings.
 *
 * A partial range (only one of the two inputs populated) is treated as
 * inactive — the spec requires both inputs to be set before the filter
 * applies, preventing ambiguous log states.
 *
 * @param range - The current date-range filter state.
 * @returns `true` when both start and end are non-empty.
 */
export function isDateRangeFilterActive(range: DateRange): boolean {
  return range.start.trim().length > 0 && range.end.trim().length > 0;
}

/**
 * Returns the cleared (default) state for the date-range filter — both
 * `start` and `end` set to empty strings.
 *
 * Calling this is the single action required to reset the filter (AC3).
 *
 * @returns A `DateRange` with both fields set to empty strings.
 */
export function clearDateRangeFilter(): DateRange {
  return { start: '', end: '' };
}

/**
 * Filters an array of log entries to those whose `timestamp` falls within
 * the given date range (inclusive of boundary values).
 *
 * When the range is inactive (either field empty) the full entry list is
 * returned unchanged.
 *
 * @param entries - The full list of log entries to filter.
 * @param range   - The active date-range filter state.
 * @returns A new array containing only entries within the range, or the
 *          original array when the range is inactive.
 */
export function filterByDateRange<T extends { timestamp: string }>(
  entries: T[],
  range: DateRange
): T[] {
  if (!isDateRangeFilterActive(range)) {
    return entries;
  }
  return entries.filter(
    (entry) => entry.timestamp >= range.start && entry.timestamp <= range.end
  );
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
   * its own state and reset the date-time inputs without importing
   * `clearDateRangeFilter` separately.
   */
  onClearAll: (newRange: DateRange) => void;
  /**
   * Optional accessible label for the clear-all button.
   * Defaults to "Clear date-range filter".
   */
  clearAllAriaLabel?: string;
}

/**
 * Renders (or removes) the active-filter indicator and clear-all control
 * inside `container`.
 *
 * - When the filter is **active** (both start and end non-empty): injects a
 *   `<span>` badge confirming the range is active and a `<button>` with an
 *   accessible `aria-label` that clears the filter in one action.
 * - When the filter is **inactive** (either field empty): removes any
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
    clearAllAriaLabel = 'Clear date-range filter',
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
  indicator.textContent = `Date filter active: ${range.start} – ${range.end}`;

  // ── Clear-all button ──────────────────────────────────────────────────────
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.dataset['dateRangeFilterClearAll'] = 'true';
  clearBtn.setAttribute('aria-label', clearAllAriaLabel);
  clearBtn.textContent = '✕ Clear filter';

  clearBtn.addEventListener('click', () => {
    onClearAll(clearDateRangeFilter());
  });

  // Keyboard: the button is naturally focusable and activatable via Enter/Space
  // because it is a <button> element — no extra keydown handler needed.

  container.appendChild(indicator);
  container.appendChild(clearBtn);
}
