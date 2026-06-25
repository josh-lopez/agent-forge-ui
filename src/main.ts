// Main entry point for agent-forge-ui.
//
// Mounts the merchant-facing view: the metrics dashboard rendered above the
// delivery event log, both wired to a single shared DeliveryEventStore so a new
// delivery event updates both views simultaneously (Issue #97).

import './app.css';
import { DeliveryEventStore } from './deliveryEvents.ts';
import { mountMetricsDashboard } from './metricsDashboard.ts';
import { mountEventLog } from './eventLog.ts';
import { WebhookDeliverySimulator, isSimulatorEnabled } from './simulator.ts';

export interface AppHandle {
  store: DeliveryEventStore;
  destroy: () => void;
}

/**
 * Build the merchant view inside `root`, wiring the dashboard and event log to
 * a shared store. Optionally activates the developer simulator.
 */
export function mountApp(
  root: HTMLElement,
  options: { store?: DeliveryEventStore; simulate?: boolean } = {},
): AppHandle {
  const store = options.store ?? new DeliveryEventStore();

  const view = document.createElement('main');
  view.className = 'merchant-view';

  const dashboard = document.createElement('section');
  dashboard.id = 'metrics-dashboard';
  view.appendChild(dashboard);

  const log = document.createElement('section');
  log.id = 'event-log';
  view.appendChild(log);

  root.appendChild(view);

  const unmountDashboard = mountMetricsDashboard(dashboard, store);
  const eventLog = mountEventLog(log, store);

  if (options.simulate) {
    const simulator = new WebhookDeliverySimulator(store, { successRate: 0.6 });
    simulator.deliverMany(6);
  }

  return {
    store,
    destroy: () => {
      unmountDashboard();
      eventLog.destroy();
      view.remove();
    },
  };
}

// Auto-bootstrap when running in a browser with a DOM available.
if (typeof document !== 'undefined') {
  const start = (): void => {
    const root = document.getElementById('app');
    if (root) {
      mountApp(root, { simulate: isSimulatorEnabled() });
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}
