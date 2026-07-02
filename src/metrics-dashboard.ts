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
 * Returns true when any event type in the report has at least one webhook that
 * reached the `exhausted` state. Used to decide whether to show the alert.
 */
function hasExhaustedWebhooks(report: MetricsReport): boolean {
  // The overall summary covers all event types; if any webhook is exhausted its
  // attempt will be counted in the overall total but not in deliveredAttempts.
  // We detect exhausted webhooks by checking the raw event data via the report's
  // per-type breakdown: a type row with 0 delivered but > 0 attempts that are
  // not all `failed` implies exhausted. However, the cleanest signal is to
  // expose a dedicated count — but since MetricsReport doesn't carry raw events,
  // we rely on the caller passing the events separately.
  //
  // This overload accepts an optional exhaustedCount injected by mountMetricsDashboard.
  return (report as MetricsReportWithExhausted)._exhaustedCount > 0;
}

/** Internal extension of MetricsReport used only within this module. */
interface MetricsReportWithExhausted extends MetricsReport {
  _exhaustedCount: number;
}

/**
 * Builds the dashboard DOM for a given metrics report. Pure render of data →
 * DOM; used by both the live component and tests.
 */
export function renderMetricsDashboard(report: MetricsReport): HTMLElement {
  const root = el('section', 'metrics-dashboard');
  root.setAttribute('aria-label', 'Webhook delivery metrics');

  root.appendChild(el('h2', 'metrics-dashboard__title', 'Webhook delivery metrics'));

  // Exhausted-alert banner: shown prominently when any webhook has reached the
  // exhausted state so merchants are aware without polling (spec requirement).
  if (hasExhaustedWebhooks(report)) {
    const alert = el('div', 'metrics-alert metrics-alert--exhausted');
    alert.setAttribute('role', 'alert');
    alert.setAttribute('aria-live', 'polite');
    alert.textContent =
      '⚠ One or more webhooks have exhausted all retry attempts. ' +
      'Please review the event log and re-trigger manually if needed.';
    root.appendChild(alert);
  }

  root.appendChild(renderSummaryCards(report.overall));
  root.appendChild(renderTable(report));

  return root;
}

/**
 * Mounts a reactive metrics dashboard into `container`, subscribed to `store`.
 * Re-renders whenever the store's events change. Returns a disposer that
 * unsubscribes and clears the rendered DOM.
 *
 * Reactive wiring: `store.subscribe()` invokes the render callback immediately
 * with the current snapshot (initial render) and again on every subsequent
 * `add`, `addMany`, or `reset` call — so metrics always reflect the latest
 * delivery-event data within the same synchronous call as the data change.
 * No manual refresh is required or possible.
 */
export function mountMetricsDashboard(
  container: HTMLElement,
  store: DeliveryEventStore,
): () => void {
  const render = (events: readonly import('./delivery-events').DeliveryEvent[]) => {
    const eventsArray = [...events];
    const report = calculateMetrics(eventsArray) as MetricsReportWithExhausted;
    // Count webhooks that have reached the exhausted state so the alert banner
    // can be shown reactively without a separate query.
    report._exhaustedCount = eventsArray.filter((e) => e.status === 'exhausted').length;
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
