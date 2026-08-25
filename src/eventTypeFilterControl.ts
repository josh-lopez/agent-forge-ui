/**
 * Event-type filter multi-select control for the delivery event log.
 *
 * Renders a `<select multiple>` (or equivalent) control that:
 *   - lists all distinct event types present in the current log data
 *   - dynamically updates its option list when new event types appear
 *   - limits visible log entries to those whose event type matches the selection
 *   - provides an explicit "All" option that restores the full unfiltered view
 *   - shows a visible active-filter indicator when a non-default selection is set
 *   - provides a clear-all control that removes the filter in one action
 *   - composes correctly with date-range and status filters
 *
 * The control is intentionally decoupled from any UI framework and uses only
 * the DOM APIs available in a jsdom/browser environment.
 *
 * Spec ref: spec § "Event log filtering — Event-type filter"
 */

import { filterByEventTypes, FilterableLogEntry } from './eventTypeFilter';
import {
  isEventTypeFilterActive,
  clearEventTypeFilter,
  renderEventTypeFilterIndicator,
} from './eventTypeFilterIndicator';

export { filterByEventTypes, isEventTypeFilterActive, clearEventTypeFilter };

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Derives the sorted list of distinct event types from a set of log entries.
 * Returns an empty array when the log is empty (graceful empty state).
 *
 * @param entries - The full list of log entries.
 * @returns A sorted array of unique event-type strings.
 */
export function getDistinctEventTypes<T extends FilterableLogEntry>(
  entries: readonly T[],
): string[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.eventType) seen.add(entry.eventType);
  }
  return Array.from(seen).sort();
}

/**
 * Applies the event-type filter to a list of entries.
 * Re-exported from eventTypeFilter for convenience so callers only need to
 * import from this module.
 *
 * @param entries       - The full list of log entries.
 * @param selectedTypes - The currently selected event types (empty = all).
 * @returns Filtered entries.
 */
export function applyEventTypeFilter<T extends FilterableLogEntry>(
  entries: T[],
  selectedTypes: string[],
): T[] {
  return filterByEventTypes(entries, selectedTypes);
}

// ── DOM rendering ─────────────────────────────────────────────────────────────

/**
 * Options accepted by {@link mountEventTypeFilterControl}.
 */
export interface EventTypeFilterControlOptions {
  /**
   * The currently selected event types.
   * An empty array means "All" (no filter active).
   */
  selectedTypes: string[];

  /**
   * The full list of available event types to populate the control.
   * Typically derived via {@link getDistinctEventTypes} from the live log.
   */
  availableTypes: string[];

  /**
   * Callback invoked whenever the selection changes.
   * Receives the new selected-types array (empty = "All" / no filter).
   */
  onChange: (newSelectedTypes: string[]) => void;

  /**
   * Optional label text for the "All" option.
   * Defaults to "All event types".
   */
  allOptionLabel?: string;

  /**
   * Optional accessible label for the `<select>` element.
   * Defaults to "Filter by event type".
   */
  selectAriaLabel?: string;
}

/**
 * Renders (or re-renders) the event-type filter multi-select control inside
 * `container`.
 *
 * The control consists of:
 *   - A `<label>` + `<select multiple>` listing all available event types plus
 *     an "All event types" option at the top.
 *   - An indicator/clear-all region (rendered via
 *     {@link renderEventTypeFilterIndicator}) that appears when the filter is
 *     active.
 *
 * The function is idempotent — calling it repeatedly with the same state
 * produces the same DOM output.
 *
 * @param container - The DOM element that will host the control markup.
 * @param options   - Configuration (see {@link EventTypeFilterControlOptions}).
 */
export function renderEventTypeFilterControl(
  container: HTMLElement,
  options: EventTypeFilterControlOptions,
): void {
  const {
    selectedTypes,
    availableTypes,
    onChange,
    allOptionLabel = 'All event types',
    selectAriaLabel = 'Filter by event type',
  } = options;

  // Always start from a clean slate so re-renders are idempotent.
  container.innerHTML = '';

  // ── Wrapper ───────────────────────────────────────────────────────────────
  const wrapper = document.createElement('div');
  wrapper.dataset['eventTypeFilterControl'] = 'true';

  // ── Label ─────────────────────────────────────────────────────────────────
  const label = document.createElement('label');
  label.setAttribute('for', 'event-type-filter-select');
  label.textContent = 'Event type:';
  label.dataset['eventTypeFilterLabel'] = 'true';

  // ── Select ────────────────────────────────────────────────────────────────
  const select = document.createElement('select');
  select.id = 'event-type-filter-select';
  select.multiple = true;
  select.dataset['eventTypeFilterSelect'] = 'true';
  select.setAttribute('aria-label', selectAriaLabel);

  // "All" option — selecting this (or having nothing selected) means no filter.
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = allOptionLabel;
  allOption.dataset['eventTypeFilterAllOption'] = 'true';
  // "All" is selected when no specific types are chosen.
  allOption.selected = selectedTypes.length === 0;
  select.appendChild(allOption);

  // One option per available event type.
  for (const type of availableTypes) {
    const opt = document.createElement('option');
    opt.value = type;
    opt.textContent = type;
    opt.selected = selectedTypes.includes(type);
    select.appendChild(opt);
  }

  // Handle selection changes.
  select.addEventListener('change', () => {
    const selected: string[] = [];
    for (const opt of Array.from(select.options)) {
      if (opt.selected && opt.value !== '') {
        selected.push(opt.value);
      }
    }

    // If the "All" option was explicitly selected (or nothing else is selected),
    // treat it as clearing the filter.
    const allOptSelected = allOption.selected;
    if (allOptSelected || selected.length === 0) {
      // Deselect all type-specific options and keep only "All" selected.
      for (const opt of Array.from(select.options)) {
        opt.selected = opt.value === '';
      }
      onChange([]);
    } else {
      // Deselect the "All" option when specific types are chosen.
      allOption.selected = false;
      onChange(selected);
    }
  });

  // ── Indicator / clear-all region ──────────────────────────────────────────
  const indicatorContainer = document.createElement('div');
  indicatorContainer.dataset['eventTypeFilterIndicatorContainer'] = 'true';

  renderEventTypeFilterIndicator(indicatorContainer, {
    selectedTypes,
    onClearAll: (newSelection) => {
      onChange(newSelection);
    },
  });

  wrapper.appendChild(label);
  wrapper.appendChild(select);
  wrapper.appendChild(indicatorContainer);
  container.appendChild(wrapper);
}

// ── Reactive mount ────────────────────────────────────────────────────────────

/**
 * State managed by the mounted event-type filter control.
 */
export interface EventTypeFilterState {
  /** Currently selected event types (empty = "All" / no filter active). */
  selectedTypes: string[];
}

/**
 * Mounts a reactive event-type filter control into `container`.
 *
 * The control re-renders whenever:
 *   - The caller invokes the returned `update(entries)` function with a new
 *     set of log entries (e.g. when the store emits a change).
 *   - The user changes the selection (internal state update + re-render).
 *
 * @param container     - The DOM element that will host the control.
 * @param initialEntries - The initial set of log entries used to populate the
 *                         option list.
 * @param onFilterChange - Callback invoked whenever the active filter changes.
 *                         Receives the new selected-types array.
 * @returns An object with:
 *   - `update(entries)`: call this when the log data changes to refresh the
 *     available-types list while preserving the current selection.
 *   - `getSelectedTypes()`: returns the current selection.
 *   - `reset()`: programmatically clears the filter to "All".
 */
export function mountEventTypeFilterControl(
  container: HTMLElement,
  initialEntries: readonly FilterableLogEntry[],
  onFilterChange: (selectedTypes: string[]) => void,
): {
  update: (entries: readonly FilterableLogEntry[]) => void;
  getSelectedTypes: () => string[];
  reset: () => void;
} {
  let selectedTypes: string[] = [];
  let availableTypes: string[] = getDistinctEventTypes(initialEntries);

  function render(): void {
    renderEventTypeFilterControl(container, {
      selectedTypes,
      availableTypes,
      onChange: (newTypes) => {
        selectedTypes = newTypes;
        render();
        onFilterChange(selectedTypes);
      },
    });
  }

  // Initial render.
  render();

  return {
    update(entries: readonly FilterableLogEntry[]): void {
      const newTypes = getDistinctEventTypes(entries);
      // Only re-render if the available types have changed.
      const changed =
        newTypes.length !== availableTypes.length ||
        newTypes.some((t, i) => t !== availableTypes[i]);
      if (changed) {
        availableTypes = newTypes;
        // Prune any selected types that are no longer available.
        selectedTypes = selectedTypes.filter((t) => availableTypes.includes(t));
        render();
      }
    },
    getSelectedTypes(): string[] {
      return selectedTypes;
    },
    reset(): void {
      selectedTypes = clearEventTypeFilter();
      render();
      onFilterChange(selectedTypes);
    },
  };
}
