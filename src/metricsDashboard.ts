// Webhook delivery metrics dashboard.
//
// Subscribes to the shared DeliveryEventStore and reactively renders aggregate
// delivery statistics. Integrated into the main merchant view (Issue #97).

import {
  type DeliveryEventStore,
  type DeliveryStats,
  computeStats,
} from './deliveryEvents.ts';

/** Render dashboard stats to an HTML string (DOM-free, easy to test). */
export function renderStatsHtml(stats: DeliveryStats): string {
  const rate = `${Math.round(stats.deliveryRate * 100)}%`;
  return [
    statCard('Total attempts', stats.totalAttempts, 'total-attempts'),
    statCard('Webhooks', stats.totalWebhooks, 'total-webhooks'),
    statCard('Delivered', stats.byStatus.delivered, 'stat-delivered'),
    statCard('Failed', stats.byStatus.failed, 'stat-failed'),
    statCard('Exhausted', stats.byStatus.exhausted, 'stat-exhausted'),
    statCard('Delivery rate', rate, 'stat-rate'),
  ].join('');
}

function statCard(label: string, value: number | string, id: string): string {
  return (
    `<div class="metric-card">` +
    `<span class="metric-value" id="metric-${id}">${value}</span>` +
    `<span class="metric-label">${label}</span>` +
    `</div>`
  );
}

/**
 * Mount the metrics dashboard into the given container element and keep it in
 * sync with the store. Returns an unsubscribe function.
 */
export function mountMetricsDashboard(
  container: HTMLElement,
  store: DeliveryEventStore,
): () => void {
  container.classList.add('metrics-dashboard');
  container.setAttribute('aria-label', 'Webhook delivery metrics');

  const heading = document.createElement('h2');
  heading.textContent = 'Delivery metrics';
  container.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'metrics-grid';
  container.appendChild(grid);

  const unsubscribe = store.subscribe((events) => {
    grid.innerHTML = renderStatsHtml(computeStats(events));
  });

  return unsubscribe;
}
