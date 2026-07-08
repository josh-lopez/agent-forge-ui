/**
 * Active-filter indicator and clear-all control for the status filter.
 *
 * Provides pure, side-effect-free helpers that determine whether the status
 * filter is in a non-default (active) state, and a DOM-rendering function that
 * injects a visible indicator + keyboard-accessible clear-all button into a
 * container element.
 *
 * The "default" (inactive) state is represented by an empty `selectedStatuses`
 * array (meaning all statuses are shown / no filter is active).
 *
 * Spec ref: spec § "Event log filtering — Status filter"
 *   "Active-filter indicator: while a non-default selection is active, a
 *    visible indicator confirms the filter is active; a clear-all control
 *    removes it in one action."
 *
 * Design mirrors src/eventTypeFilterIndicator.ts for UX consistency.
 */

import type { DeliveryStatus } from './delivery-events';

// ── Pure state helpers ────────────────────────────────────────────────────────

/**
 * Returns `true` when the status filter is in a non-default (active) state,
 * i.e. one or more specific statuses are selected rather than "All".
 *
 * The "default" (inactive) state is represented by an empty
 * `selectedStatuses` array.  If every available status has been individually
 * re-selected the caller is responsible for normalising that back to an empty
 * array (equivalent to "All") before calling this function.
 *
 * @param selectedStatuses - The currently selected delivery statuses.
 * @returns `true` when at least one status is selected (filter is active).
 */
export function isStatusFilterActive(selectedStatuses: DeliveryStatus[]): boolean {
  return selectedStatuses.length > 0;
}

/**
 * Returns the number of statuses currently selected.
 *
 * Useful for rendering a count badge (e.g. "2 statuses selected").
 *
 * @param selectedStatuses - The currently selected delivery statuses.
 * @returns The count of selected statuses (0 when the filter is inactive).
 */
export function getActiveStatusCount(selectedStatuses: DeliveryStatus[]): number {
  return selectedStatuses.length;
}

/**
 * Returns the "cleared" (default) state for the status filter — an empty
 * array that signals "All statuses / no filter active".
 *
 * Calling this is the single action required to reset the filter (AC4).
 *
 * @returns An empty array representing the default (all-statuses) selection.
 */
export function clearStatusFilter(): DeliveryStatus[] {
  return [];
}

/**
 * Filter log entries by delivery status.
 *
 * @param entries          - The full list of log entries to filter.
 * @param selectedStatuses - The set of statuses to keep.
 *                           An empty array means no filter is active and the
 *                           full entry list is returned unchanged.
 * @returns A new array containing only entries whose `status` is included in
 *          `selectedStatuses`, or the original array when `selectedStatuses`
 *          is empty.
 */
export function filterByStatus<T extends { status: DeliveryStatus }>(
  entries: T[],
  selectedStatuses: DeliveryStatus[]
): T[] {
  if (selectedStatuses.length === 0) {
    return entries;
  }
  return entries.filter((entry) => selectedStatuses.includes(entry.status));
}

// ── DOM rendering helpers ─────────────────────────────────────────────────────

/**
 * Options accepted by {@link renderStatusFilterIndicator}.
 */
export interface StatusFilterIndicatorOptions {
  /** The currently selected delivery statuses. */
  selectedStatuses: DeliveryStatus[];
  /**
   * Callback invoked when the user activates the clear-all control.
   * The callback receives the new (empty) selection so the caller can update
   * its own state without importing `clearStatusFilter` separately.
   */
  onClearAll: (newSelection: DeliveryStatus[]) => void;
  /**
   * Optional accessible label for the clear-all button.
   * Defaults to "Clear status filter".
   */
  clearAllAriaLabel?: string;
}

/**
 * Renders (or removes) the active status filter indicator and clear-all
 * control inside `container`.
 *
 * - When the filter is **active** (`selectedStatuses.length > 0`): injects a
 *   `<span>` badge showing the count of selected statuses and a `<button>`
 *   with an accessible `aria-label` that clears the filter in one action.
 * - When the filter is **inactive** (`selectedStatuses.length === 0`): removes
 *   any previously rendered indicator so the container is empty.
 *
 * The function is idempotent — calling it repeatedly with the same state
 * produces the same DOM output.
 *
 * @param container - The DOM element that will host the indicator markup.
 * @param options   - Configuration (see {@link StatusFilterIndicatorOptions}).
 */
export function renderStatusFilterIndicator(
  container: HTMLElement,
  options: StatusFilterIndicatorOptions
): void {
  const {
    selectedStatuses,
    onClearAll,
    clearAllAriaLabel = 'Clear status filter',
  } = options;

  // Always start from a clean slate so re-renders are idempotent.
  container.innerHTML = '';

  if (!isStatusFilterActive(selectedStatuses)) {
    // Filter is inactive — leave the container empty (indicator hidden).
    return;
  }

  // ── Active-filter indicator ───────────────────────────────────────────────
  // Use a <span> with a data attribute so tests can locate it reliably.
  const indicator = document.createElement('span');
  indicator.dataset['statusFilterIndicator'] = 'true';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');

  const count = getActiveStatusCount(selectedStatuses);
  const statusWord = count === 1 ? 'status' : 'statuses';
  indicator.textContent = `${count} ${statusWord} selected`;

  // ── Clear-all button ──────────────────────────────────────────────────────
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.dataset['statusFilterClearAll'] = 'true';
  clearBtn.setAttribute('aria-label', clearAllAriaLabel);
  clearBtn.textContent = '✕ Clear';

  clearBtn.addEventListener('click', () => {
    onClearAll(clearStatusFilter());
  });

  // Keyboard: the button is naturally focusable and activatable via Enter/Space
  // because it is a <button> element — no extra keydown handler needed.

  container.appendChild(indicator);
  container.appendChild(clearBtn);
}
