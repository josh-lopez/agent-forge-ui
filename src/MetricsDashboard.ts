// MetricsDashboard UI component.
//
// Renders the three aggregate webhook-delivery stats in a single, scannable
// panel:
//   - Overall delivery success rate            (e.g. "94.2 %")
//   - Overall average retry count              (e.g. "1.3 retries / webhook")
//   - Overall median + p95 time-to-delivery    (e.g. "median 4 s · p95 38 s")
//
// The component is framework-agnostic vanilla TypeScript operating on the DOM.
// It accepts the delivery-event array as its sole data input and recalculates
// metrics reactively whenever that array changes (via `setEvents`) — no manual
// refresh is required. All calculation is delegated to the metrics module, so
// the rendered values always match what `calculateMetrics` reports.
//
// The component makes no network calls; it works equally with real and
// simulator-produced delivery events because they share the same event shape.

import {
  DeliveryEvent,
  DeliveryMetrics,
  calculateMetrics,
  formatSuccessRate,
  formatAverageRetryCount,
  formatTimeToDelivery,
} from './metrics.js';

export interface MetricsDashboardOptions {
  /** Initial delivery events. Defaults to an empty array (empty state). */
  events?: readonly DeliveryEvent[];
}

const EMPTY_PLACEHOLDER = '—';

export class MetricsDashboard {
  readonly element: HTMLElement;

  private events: readonly DeliveryEvent[];

  // Cached references to the value nodes so reactive updates touch only text.
  private readonly successRateValue: HTMLElement;
  private readonly retryCountValue: HTMLElement;
  private readonly timeToDeliveryValue: HTMLElement;
  private readonly emptyNote: HTMLElement;

  constructor(options: MetricsDashboardOptions = {}) {
    this.events = options.events ? options.events.slice() : [];

    const root = document.createElement('section');
    root.className = 'metrics-dashboard';
    root.setAttribute('aria-label', 'Webhook delivery metrics');
    root.dataset.testid = 'metrics-dashboard';

    const heading = document.createElement('h2');
    heading.className = 'metrics-dashboard__heading';
    heading.textContent = 'Delivery metrics';
    root.appendChild(heading);

    const list = document.createElement('dl');
    list.className = 'metrics-dashboard__stats';

    this.successRateValue = MetricsDashboard.appendStat(
      list,
      'Success rate',
      'metric-success-rate',
    );
    this.retryCountValue = MetricsDashboard.appendStat(
      list,
      'Average retries',
      'metric-average-retries',
    );
    this.timeToDeliveryValue = MetricsDashboard.appendStat(
      list,
      'Time to delivery',
      'metric-time-to-delivery',
    );

    root.appendChild(list);

    this.emptyNote = document.createElement('p');
    this.emptyNote.className = 'metrics-dashboard__empty';
    this.emptyNote.dataset.testid = 'metrics-empty-state';
    this.emptyNote.textContent = 'No delivery events yet.';
    root.appendChild(this.emptyNote);

    this.element = root;
    this.render();
  }

  /** Build a single labelled stat entry and return its value node. */
  private static appendStat(
    list: HTMLElement,
    label: string,
    testid: string,
  ): HTMLElement {
    const dt = document.createElement('dt');
    dt.className = 'metrics-dashboard__label';
    dt.textContent = label;

    const dd = document.createElement('dd');
    dd.className = 'metrics-dashboard__value';
    dd.dataset.testid = testid;

    list.appendChild(dt);
    list.appendChild(dd);
    return dd;
  }

  /**
   * Replace the delivery-event data and re-render. This is the reactive entry
   * point: calling it with a new array immediately updates every rendered stat.
   */
  setEvents(events: readonly DeliveryEvent[]): void {
    this.events = events ? events.slice() : [];
    this.render();
  }

  /** Current metrics, computed from the metrics module. */
  getMetrics(): DeliveryMetrics {
    return calculateMetrics(this.events);
  }

  /** Recompute metrics and update the rendered DOM. */
  private render(): void {
    const isEmpty = this.events.length === 0;
    const metrics = calculateMetrics(this.events);

    this.element.dataset.empty = isEmpty ? 'true' : 'false';

    if (isEmpty) {
      this.successRateValue.textContent = EMPTY_PLACEHOLDER;
      this.retryCountValue.textContent = EMPTY_PLACEHOLDER;
      this.timeToDeliveryValue.textContent = EMPTY_PLACEHOLDER;
      this.emptyNote.hidden = false;
      return;
    }

    this.emptyNote.hidden = true;
    this.successRateValue.textContent = formatSuccessRate(metrics.successRate);
    this.retryCountValue.textContent = formatAverageRetryCount(
      metrics.averageRetryCount,
    );
    this.timeToDeliveryValue.textContent = formatTimeToDelivery(
      metrics.medianTimeToDeliveryMs,
      metrics.p95TimeToDeliveryMs,
    );
  }
}

/**
 * Convenience factory: create a MetricsDashboard and mount it into a parent
 * element. Returns the component instance so callers can later call
 * `setEvents` for reactive updates.
 */
export function mountMetricsDashboard(
  parent: HTMLElement,
  events: readonly DeliveryEvent[] = [],
): MetricsDashboard {
  const dashboard = new MetricsDashboard({ events });
  parent.appendChild(dashboard.element);
  return dashboard;
}
