/**
 * Active-filter indicator and clear-all control for the event-type filter.
 *
 * Provides pure, side-effect-free helpers that determine whether the
 * event-type filter is in a non-default (active) state, and a DOM-rendering
 * function that injects a visible indicator + keyboard-accessible clear-all
 * button into a container element.
 *
 * Spec ref: spec § "Event log filtering — Event-type filter"
 *   "Active-filter indicator: while a non-default selection is active, a
 *    visible indicator confirms the filter is active; a clear-all control
 *    removes it in one action."
 */

// ── Pure state helpers ────────────────────────────────────────────────────────

/**
 * Returns `true` when the event-type filter is in a non-default (active)
 * state, i.e. one or more specific types are selected rather than "All".
 *
 * The "default" (inactive) state is represented by an empty `selectedTypes`
 * array.  If every available type has been individually re-selected the caller
 * is responsible for normalising that back to an empty array (equivalent to
 * "All") before calling this function.
 *
 * @param selectedTypes - The currently selected event types.
 * @returns `true` when at least one type is selected (filter is active).
 */
export function isEventTypeFilterActive(selectedTypes: string[]): boolean {
  return selectedTypes.length > 0;
}

/**
 * Returns the number of event types currently selected.
 *
 * Useful for rendering a count badge (e.g. "2 types selected").
 *
 * @param selectedTypes - The currently selected event types.
 * @returns The count of selected types (0 when the filter is inactive).
 */
export function getActiveEventTypeCount(selectedTypes: string[]): number {
  return selectedTypes.length;
}

/**
 * Returns the "cleared" (default) state for the event-type filter — an empty
 * array that signals "All types / no filter active".
 *
 * Calling this is the single action required to reset the filter (AC4).
 *
 * @returns An empty array representing the default (all-types) selection.
 */
export function clearEventTypeFilter(): string[] {
  return [];
}

// ── DOM rendering helpers ─────────────────────────────────────────────────────

/**
 * Options accepted by {@link renderEventTypeFilterIndicator}.
 */
export interface EventTypeFilterIndicatorOptions {
  /** The currently selected event types. */
  selectedTypes: string[];
  /**
   * Callback invoked when the user activates the clear-all control.
   * The callback receives the new (empty) selection so the caller can update
   * its own state without importing `clearEventTypeFilter` separately.
   */
  onClearAll: (newSelection: string[]) => void;
  /**
   * Optional accessible label for the clear-all button.
   * Defaults to "Clear event-type filter".
   */
  clearAllAriaLabel?: string;
}

/**
 * Renders (or removes) the active-filter indicator and clear-all control
 * inside `container`.
 *
 * - When the filter is **active** (`selectedTypes.length > 0`): injects a
 *   `<span>` badge showing the count of selected types and a `<button>` with
 *   an accessible `aria-label` that clears the filter in one action.
 * - When the filter is **inactive** (`selectedTypes.length === 0`): removes
 *   any previously rendered indicator so the container is empty.
 *
 * The function is idempotent — calling it repeatedly with the same state
 * produces the same DOM output.
 *
 * @param container - The DOM element that will host the indicator markup.
 * @param options   - Configuration (see {@link EventTypeFilterIndicatorOptions}).
 */
export function renderEventTypeFilterIndicator(
  container: HTMLElement,
  options: EventTypeFilterIndicatorOptions
): void {
  const {
    selectedTypes,
    onClearAll,
    clearAllAriaLabel = 'Clear event-type filter',
  } = options;

  // Always start from a clean slate so re-renders are idempotent.
  container.innerHTML = '';

  if (!isEventTypeFilterActive(selectedTypes)) {
    // Filter is inactive — leave the container empty (indicator hidden).
    return;
  }

  // ── Active-filter indicator ───────────────────────────────────────────────
  // Use a <span> with a data attribute so tests can locate it reliably.
  const indicator = document.createElement('span');
  indicator.dataset['eventTypeFilterIndicator'] = 'true';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');

  const count = getActiveEventTypeCount(selectedTypes);
  const typeWord = count === 1 ? 'type' : 'types';
  indicator.textContent = `${count} event ${typeWord} selected`;

  // ── Clear-all button ──────────────────────────────────────────────────────
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.dataset['eventTypeFilterClearAll'] = 'true';
  clearBtn.setAttribute('aria-label', clearAllAriaLabel);
  clearBtn.textContent = '✕ Clear';

  clearBtn.addEventListener('click', () => {
    onClearAll(clearEventTypeFilter());
  });

  // Keyboard: the button is naturally focusable and activatable via Enter/Space
  // because it is a <button> element — no extra keydown handler needed.

  container.appendChild(indicator);
  container.appendChild(clearBtn);
}
