/**
 * Event log component for the webhook delivery UI.
 *
 * Renders a filterable table of delivery events. Supports:
 *   - Date-range filter (start/end datetime-local inputs, immediate filtering)
 *   - Event-type filter (multi-select, immediate filtering)
 *   - Status filter (select, immediate filtering)
 *   - Active-filter indicators with clear-all controls
 *   - Filter composition: all three filters are ANDed together
 *
 * Spec ref: spec § "Event log filtering — Date-range filter"
 *           spec § "Event log filtering — Event-type filter"
 */

import { DeliveryEvent } from './delivery-events';
import { DeliveryEventStore } from './delivery-event-store';
import {
  DateRange,
  filterByDateRange,
  renderDateRangeFilterInputs,
  renderDateRangeFilterIndicator,
} from './dateRangeFilter';
import { filterByEventTypes } from './eventTypeFilter';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Internal filter state for the event log. */
interface EventLogFilterState {
  dateRange: DateRange;
  selectedEventTypes: string[];
  selectedStatus: string; // '' means all statuses
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Derives the sorted list of unique event types present in the given events.
 */
function getEventTypes(events: readonly DeliveryEvent[]): string[] {
  const types = new Set<string>();
  for (const e of events) types.add(e.eventType);
  return [...types].sort();
}

/**
 * Applies all active filters to the event list and returns the filtered result.
 * Filters are ANDed: an entry must satisfy every active filter to be included.
 */
function applyFilters(
  events: readonly DeliveryEvent[],
  state: EventLogFilterState,
): DeliveryEvent[] {
  let result: DeliveryEvent[] = [...events];

  // 1. Date-range filter
  result = filterByDateRange(result, state.dateRange) as DeliveryEvent[];

  // 2. Event-type filter
  result = filterByEventTypes(result, state.selectedEventTypes) as DeliveryEvent[];

  // 3. Status filter
  if (state.selectedStatus) {
    result = result.filter((e) => e.status === state.selectedStatus);
  }

  return result;
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      node.setAttribute(k, v);
    }
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

// ── Event log table renderer ──────────────────────────────────────────────────

function renderTable(events: DeliveryEvent[]): HTMLElement {
  const wrapper = el('div', { class: 'event-log__table-wrapper' });

  if (events.length === 0) {
    const empty = el('p', { class: 'event-log__empty', 'data-event-log-empty': 'true' });
    empty.textContent = 'No delivery events match the current filters.';
    wrapper.appendChild(empty);
    return wrapper;
  }

  const table = el('table', { class: 'event-log__table', 'data-event-log-table': 'true' });

  // Header
  const thead = el('thead');
  const headRow = el('tr');
  for (const heading of ['Timestamp', 'Webhook ID', 'Event type', 'Status', 'Attempt', 'HTTP', 'Response']) {
    headRow.appendChild(el('th', { class: 'event-log__th' }, heading));
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  // Body
  const tbody = el('tbody');
  for (const event of events) {
    const tr = el('tr', { class: `event-log__row event-log__row--${event.status}`, 'data-event-log-row': 'true' });

    const cells: string[] = [
      event.timestamp,
      event.webhookId,
      event.eventType,
      event.status,
      String(event.attempt),
      String(event.httpStatus),
      event.responseBodyExcerpt,
    ];

    for (const text of cells) {
      tr.appendChild(el('td', { class: 'event-log__td' }, text));
    }

    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

// ── Event-type multi-select renderer ─────────────────────────────────────────

function renderEventTypeSelect(
  container: HTMLElement,
  allTypes: string[],
  selectedTypes: string[],
  onChange: (newTypes: string[]) => void,
): void {
  container.innerHTML = '';

  const label = el('label', { for: 'event-log-event-type-filter', class: 'event-log__filter-label' });
  label.textContent = 'Event type: ';

  const select = el('select', {
    id: 'event-log-event-type-filter',
    class: 'event-log__event-type-select',
    'data-event-type-select': 'true',
    multiple: 'true',
    'aria-label': 'Filter by event type',
    size: String(Math.min(Math.max(allTypes.length + 1, 2), 6)),
  });

  // "All" option
  const allOpt = el('option', { value: '', 'data-event-type-all': 'true' });
  allOpt.textContent = 'All';
  if (selectedTypes.length === 0) allOpt.selected = true;
  select.appendChild(allOpt);

  for (const type of allTypes) {
    const opt = el('option', { value: type });
    opt.textContent = type;
    if (selectedTypes.includes(type)) opt.selected = true;
    select.appendChild(opt);
  }

  select.addEventListener('change', () => {
    const selected: string[] = [];
    for (const opt of Array.from(select.options)) {
      if (opt.selected && opt.value !== '') {
        selected.push(opt.value);
      }
    }
    // If "All" is selected or nothing specific is selected, return empty (= all)
    const allOptSelected = (select.options[0] as HTMLOptionElement).selected;
    onChange(allOptSelected ? [] : selected);
  });

  label.appendChild(select);
  container.appendChild(label);
}

// ── Status filter renderer ────────────────────────────────────────────────────

function renderStatusSelect(
  container: HTMLElement,
  selectedStatus: string,
  onChange: (newStatus: string) => void,
): void {
  container.innerHTML = '';

  const label = el('label', { for: 'event-log-status-filter', class: 'event-log__filter-label' });
  label.textContent = 'Status: ';

  const select = el('select', {
    id: 'event-log-status-filter',
    class: 'event-log__status-select',
    'data-status-select': 'true',
    'aria-label': 'Filter by status',
  });

  const statuses: Array<[string, string]> = [
    ['', 'All statuses'],
    ['pending', 'Pending'],
    ['delivered', 'Delivered'],
    ['failed', 'Failed'],
    ['exhausted', 'Exhausted'],
  ];

  for (const [value, label_] of statuses) {
    const opt = el('option', { value });
    opt.textContent = label_;
    if (value === selectedStatus) opt.selected = true;
    select.appendChild(opt);
  }

  select.addEventListener('change', () => {
    onChange(select.value);
  });

  label.appendChild(select);
  container.appendChild(label);
}

// ── Main mount function ───────────────────────────────────────────────────────

/**
 * Mounts a reactive, filterable event log into `container`, subscribed to
 * `store`. Re-renders whenever the store's events change. Returns a disposer
 * that unsubscribes and clears the rendered DOM.
 *
 * The event log renders:
 *   - Date-range filter inputs (start/end datetime-local) — AC1
 *   - Active date-range filter indicator + clear-all button — AC5, AC6
 *   - Event-type multi-select filter — AC7
 *   - Status filter — AC7
 *   - A table of filtered delivery events — AC2, AC3, AC4
 *
 * All filters compose correctly (AND logic) — AC7.
 */
export function mountEventLog(
  container: HTMLElement,
  store: DeliveryEventStore,
): () => void {
  // ── Filter state ────────────────────────────────────────────────────────────
  let filterState: EventLogFilterState = {
    dateRange: {},
    selectedEventTypes: [],
    selectedStatus: '',
  };

  // ── DOM structure ───────────────────────────────────────────────────────────
  container.innerHTML = '';
  container.setAttribute('data-event-log', 'true');

  // Title
  const title = el('h2', { class: 'event-log__title' });
  title.textContent = 'Delivery event log';
  container.appendChild(title);

  // Filters section
  const filtersSection = el('div', { class: 'event-log__filters', 'data-event-log-filters': 'true' });

  // Date-range inputs container (AC1: rendered above the log)
  const dateRangeInputsContainer = el('div', {
    class: 'event-log__date-range-inputs',
    'data-date-range-inputs-container': 'true',
  });
  filtersSection.appendChild(dateRangeInputsContainer);

  // Date-range indicator container (AC5: visible indicator when active)
  const dateRangeIndicatorContainer = el('div', {
    class: 'event-log__date-range-indicator',
    'data-date-range-indicator-container': 'true',
  });
  filtersSection.appendChild(dateRangeIndicatorContainer);

  // Event-type filter container
  const eventTypeFilterContainer = el('div', {
    class: 'event-log__event-type-filter',
    'data-event-type-filter-container': 'true',
  });
  filtersSection.appendChild(eventTypeFilterContainer);

  // Status filter container
  const statusFilterContainer = el('div', {
    class: 'event-log__status-filter',
    'data-status-filter-container': 'true',
  });
  filtersSection.appendChild(statusFilterContainer);

  container.appendChild(filtersSection);

  // Table container
  const tableContainer = el('div', { class: 'event-log__content', 'data-event-log-content': 'true' });
  container.appendChild(tableContainer);

  // ── Render helpers ──────────────────────────────────────────────────────────

  /** Re-renders the date-range inputs with the current filter state. */
  function renderDateInputs(): void {
    renderDateRangeFilterInputs(dateRangeInputsContainer, {
      range: filterState.dateRange,
      onChange: (newRange: DateRange) => {
        filterState = { ...filterState, dateRange: newRange };
        renderDateInputs();
        renderIndicator();
        renderLog(store.getEvents());
      },
    });
  }

  /** Re-renders the date-range active-filter indicator. */
  function renderIndicator(): void {
    renderDateRangeFilterIndicator(dateRangeIndicatorContainer, {
      range: filterState.dateRange,
      onClearAll: (newRange: DateRange) => {
        filterState = { ...filterState, dateRange: newRange };
        renderDateInputs();
        renderIndicator();
        renderLog(store.getEvents());
      },
    });
  }

  /** Re-renders the event-type multi-select. */
  function renderEventTypeFilter(allTypes: string[]): void {
    renderEventTypeSelect(
      eventTypeFilterContainer,
      allTypes,
      filterState.selectedEventTypes,
      (newTypes: string[]) => {
        filterState = { ...filterState, selectedEventTypes: newTypes };
        renderLog(store.getEvents());
      },
    );
  }

  /** Re-renders the status filter. */
  function renderStatusFilter(): void {
    renderStatusSelect(
      statusFilterContainer,
      filterState.selectedStatus,
      (newStatus: string) => {
        filterState = { ...filterState, selectedStatus: newStatus };
        renderLog(store.getEvents());
      },
    );
  }

  /** Re-renders the event table with the current filter state applied. */
  function renderLog(events: readonly DeliveryEvent[]): void {
    const filtered = applyFilters(events, filterState);
    tableContainer.replaceChildren(renderTable(filtered));
  }

  // ── Subscribe to store ──────────────────────────────────────────────────────

  const unsubscribe = store.subscribe((events) => {
    const allTypes = getEventTypes(events);

    // Initial render of all controls
    renderDateInputs();
    renderIndicator();
    renderEventTypeFilter(allTypes);
    renderStatusFilter();
    renderLog(events);
  });

  // ── Disposer ────────────────────────────────────────────────────────────────

  return () => {
    unsubscribe();
    container.replaceChildren();
  };
}
