/**
 * Event log component for the webhook delivery UI.
 *
 * Renders each delivery attempt as a table row showing:
 *   - timestamp (ISO-8601, as-is for precision; no locale formatting)
 *   - HTTP status code
 *   - response body excerpt
 *   - event type and status (for context)
 *
 * The component is a pure render function (data → DOM) so it can be unit-tested
 * without any global state. A reactive `mountEventLog` wrapper subscribes to a
 * DeliveryEventStore and re-renders on every change.
 *
 * Spec ref: spec § "Webhook delivery & retries — Event log"
 */

import { DeliveryEvent } from './delivery-events';
import { DeliveryEventStore } from './delivery-event-store';

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

// ── Column definitions ────────────────────────────────────────────────────────

const COLUMNS = [
  { label: 'Timestamp',     dataAttr: 'data-col-timestamp' },
  { label: 'HTTP Status',   dataAttr: 'data-col-http-status' },
  { label: 'Response Body', dataAttr: 'data-col-response-body' },
  { label: 'Event Type',    dataAttr: 'data-col-event-type' },
  { label: 'Status',        dataAttr: 'data-col-status' },
  { label: 'Attempt',       dataAttr: 'data-col-attempt' },
];

// ── Row rendering ─────────────────────────────────────────────────────────────

/**
 * Renders a single delivery-attempt row.
 *
 * Each cell carries a `data-col-*` attribute so tests (and CSS) can target
 * individual fields without relying on column order.
 */
export function renderEventLogRow(event: DeliveryEvent): HTMLTableRowElement {
  const tr = el('tr', { class: `event-log-row event-log-row--${event.status}` });

  // Timestamp — stored as ISO-8601; rendered verbatim for precision.
  const tsCell = el('td', { 'data-col-timestamp': '', class: 'event-log-cell' });
  tsCell.textContent = event.timestamp;
  tr.appendChild(tsCell);

  // HTTP status code.
  const httpCell = el('td', { 'data-col-http-status': '', class: 'event-log-cell' });
  httpCell.textContent = String(event.httpStatus);
  tr.appendChild(httpCell);

  // Response body excerpt — may be empty string; render as empty cell (not "null").
  const bodyCell = el('td', { 'data-col-response-body': '', class: 'event-log-cell' });
  bodyCell.textContent = event.responseBodyExcerpt ?? '';
  tr.appendChild(bodyCell);

  // Event type.
  const typeCell = el('td', { 'data-col-event-type': '', class: 'event-log-cell' });
  typeCell.textContent = event.eventType;
  tr.appendChild(typeCell);

  // Delivery status.
  const statusCell = el('td', { 'data-col-status': '', class: 'event-log-cell' });
  statusCell.textContent = event.status;
  tr.appendChild(statusCell);

  // Attempt number.
  const attemptCell = el('td', { 'data-col-attempt': '', class: 'event-log-cell' });
  attemptCell.textContent = String(event.attempt);
  tr.appendChild(attemptCell);

  return tr;
}

// ── Table rendering ───────────────────────────────────────────────────────────

/**
 * Renders the full event log table for a given list of delivery events.
 *
 * Returns a `<section>` containing a `<table>` with one row per attempt.
 * When `events` is empty, an empty-state row is shown instead.
 */
export function renderEventLog(events: readonly DeliveryEvent[]): HTMLElement {
  const section = el('section', {
    class: 'event-log',
    'aria-label': 'Delivery attempt log',
  });

  section.appendChild(el('h2', { class: 'event-log__title' }, 'Delivery attempt log'));

  const table = el('table', { class: 'event-log-table' });

  // Header row.
  const thead = el('thead');
  const headRow = el('tr');
  for (const col of COLUMNS) {
    const th = el('th', { class: 'event-log-th', [col.dataAttr]: '' });
    th.textContent = col.label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  // Body rows.
  const tbody = el('tbody');

  if (events.length === 0) {
    const emptyRow = el('tr', { class: 'event-log-row event-log-row--empty' });
    const emptyCell = el('td', { class: 'event-log-cell event-log-cell--empty', colspan: String(COLUMNS.length) });
    emptyCell.textContent = 'No delivery attempts yet.';
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
  } else {
    for (const event of events) {
      tbody.appendChild(renderEventLogRow(event));
    }
  }

  table.appendChild(tbody);
  section.appendChild(table);

  return section;
}

// ── Reactive mount ────────────────────────────────────────────────────────────

/**
 * Mounts a reactive event log into `container`, subscribed to `store`.
 * Re-renders whenever the store's events change.
 * Returns a disposer that unsubscribes and clears the rendered DOM.
 */
export function mountEventLog(
  container: HTMLElement,
  store: DeliveryEventStore,
): () => void {
  const render = () => {
    container.replaceChildren(renderEventLog([...store.getEvents()]));
  };

  const unsubscribe = store.subscribe(render);

  return () => {
    unsubscribe();
    container.replaceChildren();
  };
}
