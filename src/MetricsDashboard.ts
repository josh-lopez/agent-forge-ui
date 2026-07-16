/**
 * MetricsDashboard component.
 *
 * Renders aggregate webhook delivery metrics into a container element and
 * updates reactively whenever the underlying delivery-event data changes.
 *
 * Usage:
 *   const dashboard = document.getElementById('metrics-dashboard')!;
 *   const { update } = mountMetricsDashboard(dashboard);
 *   // Call update(events) whenever the event list changes.
 *
 * Spec ref: spec § "Webhook delivery metrics dashboard"
 */

import type { DeliveryEvent } from './deliveryEvent.js';
import { calculateSuccessRate, formatSuccessRate } from './metrics.js';

/** Handle returned by mountMetricsDashboard for reactive updates. */
export interface MetricsDashboardHandle {
  /**
   * Re-render the dashboard with a new snapshot of delivery events.
   * Call this whenever the underlying data changes.
   */
  update(events: DeliveryEvent[]): void;
}

/**
 * Mount the metrics dashboard into `container` and return an update handle.
 *
 * The dashboard is rendered immediately with an empty dataset; call
 * `handle.update(events)` to populate it.
 *
 * @param container - The DOM element that will host the dashboard markup.
 * @returns A handle with an `update` method for reactive re-renders.
 */
export function mountMetricsDashboard(container: HTMLElement): MetricsDashboardHandle {
  // Initial render with empty data.
  render(container, null);

  return {
    update(events: DeliveryEvent[]): void {
      const rate = calculateSuccessRate(events);
      render(container, rate);
    },
  };
}

// ── Internal rendering ────────────────────────────────────────────────────────

/**
 * (Re-)render the dashboard HTML into `container`.
 *
 * @param container - Host element.
 * @param rate      - Pre-computed success rate (null = no data).
 */
function render(container: HTMLElement, rate: number | null): void {
  const displayValue = formatSuccessRate(rate);
  const isActive = rate !== null;

  container.innerHTML = `
    <section class="metrics-dashboard" aria-label="Webhook delivery metrics">
      <h2 class="metrics-dashboard__title">Delivery Metrics</h2>
      <div class="metrics-dashboard__grid">
        <div class="metrics-dashboard__card metrics-dashboard__card--success-rate"
             aria-label="Aggregate success rate">
          <span class="metrics-dashboard__label">Aggregate Success Rate</span>
          <span class="metrics-dashboard__value${isActive ? ' metrics-dashboard__value--active' : ''}"
                data-testid="success-rate-value">
            ${displayValue}
          </span>
          ${isActive ? '<span class="metrics-dashboard__badge metrics-dashboard__badge--active">Live</span>' : ''}
        </div>
      </div>
    </section>
  `.trim();
}
