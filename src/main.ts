// Main entry point for agent-forge-ui
// The heading is in index.html for static rendering; this module wires up the
// interactive components (currently the webhook delivery metrics dashboard).

import { DeliveryEventStore } from './delivery-event-store';
import { mountMetricsDashboard } from './metrics-dashboard';
import { generateSimulatedEvents } from './webhook-simulator';

/**
 * Determines whether the client-side webhook delivery simulator should seed the
 * store. The simulator is gated behind a dev-mode flag so it has zero impact on
 * production builds:
 *   - `import.meta.env.DEV` is true under `vite dev`.
 *   - `?simulate` (or `?demo`) query param force-enables it for previews.
 */
function simulatorEnabled(): boolean {
  try {
    const env = (import.meta as { env?: { DEV?: boolean } }).env;
    if (env?.DEV) return true;
  } catch {
    // import.meta.env may be undefined outside Vite — fall through.
  }
  if (typeof window !== 'undefined' && window.location) {
    const params = new URLSearchParams(window.location.search);
    if (params.has('simulate') || params.has('demo')) return true;
  }
  return false;
}

/**
 * Mounts the application's interactive components into the static index.html
 * shell. Safe to call once on page load; no-ops gracefully if mount points are
 * missing (e.g. when imported in a test that has not set up the DOM).
 */
export function mountApp(): DeliveryEventStore {
  const store = new DeliveryEventStore();

  const dashboardEl = document.getElementById('metrics-dashboard');
  if (dashboardEl instanceof HTMLElement) {
    mountMetricsDashboard(dashboardEl, store);
  }

  // Seed with simulated delivery events in dev/demo mode only. Because the store
  // is reactive, appending these events causes the dashboard to recalculate and
  // re-render automatically — no manual refresh.
  if (simulatorEnabled()) {
    store.reset(generateSimulatedEvents({ count: 12, successRate: 0.7 }));
  }

  return store;
}
