// Webhook delivery metrics dashboard component.
//
// Renders an at-a-glance, scannable view of aggregate delivery reliability:
//   - overall delivery success rate
//   - mean retry count per webhook, broken down by event type
//   - time-to-delivery (median + 95th-percentile) per event type
// Every metric is shown both as an overall aggregate and segmented by event
// type in a single view.
//
// The component subscribes to a DeliveryEventStore and recalculates reactively
// whenever the underlying delivery-event data changes — no manual refresh.
// It is a thin DOM view over the pure `metrics` module.

import { DeliveryEventStore } from './delivery-event-store';
import {
  MetricsReport,
  MetricsSummary,
  calculateMetrics,
  formatDuration,
  formatRetryCount,
  formatSuccessRate,
} from './metrics';

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

function renderSummaryCards(overall: MetricsSummary): HTMLElement {
  const wrap = el('div', 'metrics-cards');

  const cards: Array<[string, string]> = [
    ['Success rate', formatSuccessRate(overall.successRate)],
    ['Avg. retries / webhook', formatRetryCount(overall.averageRetryCount)],
    ['Median time-to-delivery', formatDuration(overall.timeToDelivery.medianMs)],
    ['95th-pct time-to-delivery', formatDuration(overall.timeToDelivery.p95Ms)],
  ];

  for (const [label, value] of cards) {
    const card = el('div', 'metrics-card');
    card.appendChild(el('div', 'metrics-card__value', value));
    card.appendChild(el('div', 'metrics-card__label', label));
    wrap.appendChild(card);
  }
  return wrap;
}

function renderRow(summary: MetricsSummary, isAggregate: boolean): HTMLTableRowElement {
  const tr = el('tr', isAggregate ? 'metrics-row metrics-row--aggregate' : 'metrics-row');

  const typeCell = el('td', 'metrics-cell metrics-cell--type');
  typeCell.textContent = isAggregate ? 'All event types' : (summary.eventType ?? '');
  tr.appendChild(typeCell);

  tr.appendChild(el('td', 'metrics-cell', formatSuccessRate(summary.successRate)));
  tr.appendChild(el('td', 'metrics-cell', formatRetryCount(summary.averageRetryCount)));
  tr.appendChild(el('td', 'metrics-cell', formatDuration(summary.timeToDelivery.medianMs)));
  tr.appendChild(el('td', 'metrics-cell', formatDuration(summary.timeToDelivery.p95Ms)));
  tr.appendChild(el('td', 'metrics-cell', String(summary.totalAttempts)));

  return tr;
}

function renderTable(report: MetricsReport): HTMLElement {
  const table = el('table', 'metrics-table');

  const thead = el('thead');
  const headRow = el('tr');
  for (const heading of [
    'Event type',
    'Success rate',
    'Avg. retries',
    'Median TTD',
    'p95 TTD',
    'Attempts',
  ]) {
    headRow.appendChild(el('th', 'metrics-th', heading));
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  // Aggregate row first, then one row per event type.
  tbody.appendChild(renderRow(report.overall, true));

  if (report.byEventType.length === 0) {
    const emptyRow = el('tr', 'metrics-row metrics-row--empty');
    const cell = el('td', 'metrics-cell metrics-cell--empty');
    cell.colSpan = 6;
    cell.textContent = 'No delivery events yet.';
    emptyRow.appendChild(cell);
    tbody.appendChild(emptyRow);
  } else {
    for (const summary of report.byEventType) {
      tbody.appendChild(renderRow(summary, false));
    }
  }

  table.appendChild(tbody);
  return table;
}

/**
 * Builds the dashboard DOM for a given metrics report. Pure render of data →
 * DOM; used by both the live component and tests.
 */
export function renderMetricsDashboard(report: MetricsReport): HTMLElement {
  const root = el('section', 'metrics-dashboard');
  root.setAttribute('aria-label', 'Webhook delivery metrics');

  root.appendChild(el('h2', 'metrics-dashboard__title', 'Webhook delivery metrics'));
  root.appendChild(renderSummaryCards(report.overall));
  root.appendChild(renderTable(report));

  return root;
}

/**
 * Mounts a reactive metrics dashboard into `container`, subscribed to `store`.
 * Re-renders whenever the store's events change. Returns a disposer that
 * unsubscribes and clears the rendered DOM.
 */
export function mountMetricsDashboard(
  container: HTMLElement,
  store: DeliveryEventStore,
): () => void {
  const render = () => {
    const report = calculateMetrics([...store.getEvents()]);
    container.replaceChildren(renderMetricsDashboard(report));
  };

  // subscribe() invokes the listener immediately with the current snapshot, so
  // the dashboard renders initial state without a separate first render call.
  const unsubscribe = store.subscribe(render);

  return () => {
    unsubscribe();
    container.replaceChildren();
  };
}
