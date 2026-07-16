// Delivery event log component.
//
// Renders the per-attempt delivery event log as a table and provides a visible
// "Export" control that downloads the *currently visible* (post-filter) set as
// a machine-readable file — see issue #192 and spec § "Event log filtering".
//
// The component owns the composed filter state (date-range / event-type /
// status). The export reads that composed state at click time so the exported
// file always matches what the merchant sees, and the filename reflects the
// active filter context. Everything is client-side; no data leaves the browser.

import { DeliveryEventStore } from './delivery-event-store';
import { DeliveryEvent } from './delivery-events';
import {
  EVENT_LOG_COLUMNS,
  EVENT_LOG_COLUMN_HEADERS,
  EventLogFilterState,
  ExportFormat,
  composeFilteredEvents,
  isFilterActive,
  triggerEventLogExport,
} from './eventLogExport';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderTable(events: readonly DeliveryEvent[]): HTMLElement {
  const table = el('table', 'event-log__table');

  const thead = el('thead');
  const headRow = el('tr');
  for (const col of EVENT_LOG_COLUMNS) {
    headRow.appendChild(el('th', 'event-log__th', EVENT_LOG_COLUMN_HEADERS[col]));
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  if (events.length === 0) {
    const emptyRow = el('tr', 'event-log__row event-log__row--empty');
    const cell = el('td', 'event-log__cell event-log__cell--empty', 'No delivery events match the current filters.');
    cell.colSpan = EVENT_LOG_COLUMNS.length;
    emptyRow.appendChild(cell);
    tbody.appendChild(emptyRow);
  } else {
    for (const event of events) {
      const tr = el('tr', 'event-log__row');
      for (const col of EVENT_LOG_COLUMNS) {
        tr.appendChild(el('td', 'event-log__cell', String(event[col])));
      }
      tbody.appendChild(tr);
    }
  }
  table.appendChild(tbody);
  return table;
}

/** Options for {@link mountEventLog}. */
export interface EventLogOptions {
  /** Initial composed filter state. Defaults to no filters. */
  filters?: EventLogFilterState;
  /** Export format. Defaults to CSV. */
  exportFormat?: ExportFormat;
}

/** Handle returned by {@link mountEventLog} for programmatic control / cleanup. */
export interface EventLogHandle {
  /** Updates the composed filter state and re-renders. */
  setFilters(filters: EventLogFilterState): void;
  /** Triggers an export of the currently visible (filtered) rows. */
  exportNow(): void;
  /** Unsubscribes from the store and clears the rendered DOM. */
  dispose(): void;
}

/**
 * Mounts a reactive event log into `container`, subscribed to `store`.
 * Re-renders whenever the store changes or the filters change, and wires the
 * visible Export button to download the composed post-filter result set.
 */
export function mountEventLog(
  container: HTMLElement,
  store: DeliveryEventStore,
  options: EventLogOptions = {},
): EventLogHandle {
  let filters: EventLogFilterState | undefined = options.filters;
  const format: ExportFormat = options.exportFormat ?? 'csv';

  const render = () => {
    const all = store.getEvents();
    const visible = composeFilteredEvents(all, filters);

    const root = el('section', 'event-log');
    root.setAttribute('aria-label', 'Webhook delivery event log');

    const header = el('div', 'event-log__header');
    header.appendChild(el('h2', 'event-log__title', 'Delivery event log'));

    // Visible Export control (AC1). Enabled whenever the log is displayed —
    // including when the filtered set is empty, so an empty export still
    // produces a valid file (AC7).
    const exportBtn = el('button', 'event-log__export');
    exportBtn.type = 'button';
    exportBtn.dataset['eventLogExport'] = 'true';
    exportBtn.setAttribute('aria-label', 'Export event log');
    exportBtn.textContent = isFilterActive(filters)
      ? `Export ${visible.length} filtered ${visible.length === 1 ? 'entry' : 'entries'}`
      : 'Export event log';
    exportBtn.addEventListener('click', () => {
      // Read the composed filter state at click time so the export always
      // matches the current view and filename (issue #192 risks).
      triggerEventLogExport(store.getEvents(), filters, format);
    });
    header.appendChild(exportBtn);
    root.appendChild(header);

    root.appendChild(renderTable(visible));
    container.replaceChildren(root);
  };

  const unsubscribe = store.subscribe(render);

  return {
    setFilters(next: EventLogFilterState) {
      filters = next;
      render();
    },
    exportNow() {
      triggerEventLogExport(store.getEvents(), filters, format);
    },
    dispose() {
      unsubscribe();
      container.replaceChildren();
    },
  };
}
