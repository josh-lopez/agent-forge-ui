/**
 * Date-range filter for the delivery event log.
 *
 * Provides pure, side-effect-free functions that filter log entries by a
 * start and/or end date-time, and DOM-rendering helpers for the active-filter
 * indicator and clear-all control.
 *
 * Design notes:
 * - Timestamps are compared as epoch milliseconds to avoid timezone ambiguity.
 *   The `toEpochMillis` helper from delivery-events.ts normalises ISO strings.
 * - Boundary entries (timestamp === start or timestamp === end) are INCLUDED
 *   (spec: "boundary entries … are included").
 * - An empty/null date range means no filter is active; the full entry list is
 *   returned unchanged.
 * - The filter is intentionally decoupled from any UI framework so it can be
 *   unit-tested without a DOM environment.
 *
 * Spec ref: spec § "Event log filtering — Date-range filter"
 */

import { toEpochMillis } from './delivery-events';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Minimal shape required by the date-range filter. */
export interface DateFilterableEntry {
  /** ISO-8601 timestamp of the delivery attempt. */
  timestamp: string;
}

/**
 * Represents the active date-range filter state.
 * Both fields are optional; omitting one means that boundary is open-ended.
 */
export interface DateRange {
  /** ISO-8601 or datetime-local string for the start of the range (inclusive). */
  start?: string;
  /** ISO-8601 or datetime-local string for the end of the range (inclusive). */
  end?: string;
}

// ── Pure state helpers ────────────────────────────────────────────────────────

/**
 * Returns `true` when the date-range filter is in an active (non-default)
 * state, i.e. at least one of `start` or `end` is set to a non-empty string.
 *
 * @param range - The current date-range filter state.
 * @returns `true` when the filter is active.
 */
export function isDateRangeFilterActive(range: DateRange): boolean {
  return Boolean(range.start?.trim()) || Boolean(range.end?.trim());
}

/**
 * Returns the "cleared" (default) state for the date-range filter — an object
 * with both `start` and `end` set to empty strings, signalling "no filter
 * active".
 *
 * Calling this is the single action required to reset the filter (AC6).
 *
 * @returns A `DateRange` with both fields cleared.
 */
export function clearDateRangeFilter(): DateRange {
  return { start: '', end: '' };
}

// ── Core filter function ──────────────────────────────────────────────────────

/**
 * Filter log entries by a date-time range.
 *
 * Boundary entries — whose timestamp exactly equals `start` or `end` — are
 * INCLUDED in the result (spec requirement).
 *
 * @param entries - The full list of log entries to filter.
 * @param range   - The active date-range filter. An empty/null range (both
 *                  `start` and `end` absent or empty) means no filter is
 *                  active and the full entry list is returned unchanged.
 * @returns A new array containing only entries whose `timestamp` falls within
 *          the specified range, or the original array when no range is active.
 */
export function filterByDateRange<T extends DateFilterableEntry>(
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
    const ts = toEpochMillis(entry.timestamp);
    if (Number.isNaN(ts)) return false; // unparseable timestamp — exclude
    return ts >= startMs && ts <= endMs;
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
   * Defaults to "Clear date-range filter".
   */
  clearAllAriaLabel?: string;
}

/**
 * Renders (or removes) the active date-range filter indicator and clear-all
 * control inside `container`.
 *
 * - When the filter is **active** (start or end is set): injects a `<span>`
 *   badge describing the active range and a `<button>` that clears the filter
 *   in one action.
 * - When the filter is **inactive**: removes any previously rendered indicator
 *   so the container is empty.
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

  const parts: string[] = [];
  if (range.start?.trim()) parts.push(`from ${range.start.trim()}`);
  if (range.end?.trim()) parts.push(`to ${range.end.trim()}`);
  indicator.textContent = `Date filter active: ${parts.join(' ')}`;

  // ── Clear-all button ──────────────────────────────────────────────────────
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.dataset['dateRangeFilterClearAll'] = 'true';
  clearBtn.setAttribute('aria-label', clearAllAriaLabel);
  clearBtn.textContent = '✕ Clear date filter';

  clearBtn.addEventListener('click', () => {
    onClearAll(clearDateRangeFilter());
  });

  container.appendChild(indicator);
  container.appendChild(clearBtn);
}

/**
 * Options accepted by {@link renderDateRangeFilterInputs}.
 */
export interface DateRangeFilterInputsOptions {
  /** The current date-range filter state. */
  range: DateRange;
  /**
   * Callback invoked whenever the start or end input changes.
   * The callback receives the updated range so the caller can apply the filter.
   */
  onChange: (newRange: DateRange) => void;
}

/**
 * Renders a start date-time input and an end date-time input into `container`.
 *
 * Both inputs are `<input type="datetime-local">` elements. Changing either
 * input immediately calls `onChange` with the updated range so the caller can
 * re-filter the log without requiring an explicit "Apply" button (spec allows
 * either immediate or on-Apply; we choose immediate for simplicity).
 *
 * The function is idempotent — calling it repeatedly with the same state
 * produces the same DOM output.
 *
 * @param container - The DOM element that will host the input markup.
 * @param options   - Configuration (see {@link DateRangeFilterInputsOptions}).
 */
export function renderDateRangeFilterInputs(
  container: HTMLElement,
  options: DateRangeFilterInputsOptions
): void {
  const { range, onChange } = options;

  // Always start from a clean slate so re-renders are idempotent.
  container.innerHTML = '';

  // ── Start input ───────────────────────────────────────────────────────────
  const startLabel = document.createElement('label');
  startLabel.textContent = 'From: ';
  startLabel.setAttribute('for', 'date-range-start');

  const startInput = document.createElement('input');
  startInput.type = 'datetime-local';
  startInput.id = 'date-range-start';
  startInput.dataset['dateRangeStart'] = 'true';
  startInput.value = range.start ?? '';
  startInput.setAttribute('aria-label', 'Filter start date-time');

  startInput.addEventListener('change', () => {
    onChange({ ...range, start: startInput.value });
  });

  // ── End input ─────────────────────────────────────────────────────────────
  const endLabel = document.createElement('label');
  endLabel.textContent = 'To: ';
  endLabel.setAttribute('for', 'date-range-end');

  const endInput = document.createElement('input');
  endInput.type = 'datetime-local';
  endInput.id = 'date-range-end';
  endInput.dataset['dateRangeEnd'] = 'true';
  endInput.value = range.end ?? '';
  endInput.setAttribute('aria-label', 'Filter end date-time');

  endInput.addEventListener('change', () => {
    onChange({ ...range, end: endInput.value });
  });

  startLabel.appendChild(startInput);
  endLabel.appendChild(endInput);

  container.appendChild(startLabel);
  container.appendChild(endLabel);
}
