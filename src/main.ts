// Main entry point for agent-forge-ui
// The heading is in index.html for static rendering; this module wires up the
// interactive components (metrics dashboard and event-type filter control).

import { DeliveryEventStore } from './delivery-event-store';
import { mountMetricsDashboard } from './metrics-dashboard';
import { generateSimulatedEvents } from './webhook-simulator';
import {
  mountEventTypeFilterControl,
  applyEventTypeFilter,
} from './eventTypeFilterControl';

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

  // Mount the event-type filter control and event log entries section.
  const filterEl = document.getElementById('event-type-filter');
  const logEntriesEl = document.getElementById('event-log-entries');
  if (filterEl instanceof HTMLElement && logEntriesEl instanceof HTMLElement) {
    // Render the filtered event log entries into the entries container.
    function renderLogEntries(entries: ReturnType<typeof store.getEvents>, selectedTypes: string[]): void {
      const filtered = applyEventTypeFilter([...entries], selectedTypes);
      logEntriesEl!.innerHTML = '';
      if (filtered.length === 0) {
        const empty = document.createElement('p');
        empty.textContent = 'No delivery events match the current filter.';
        empty.dataset['eventLogEmpty'] = 'true';
        logEntriesEl!.appendChild(empty);
        return;
      }
      const table = document.createElement('table');
      table.dataset['eventLogTable'] = 'true';
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      for (const heading of ['Event type', 'Status', 'Attempt', 'Timestamp', 'HTTP', 'Response']) {
        const th = document.createElement('th');
        th.textContent = heading;
        headRow.appendChild(th);
      }
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      for (const ev of filtered) {
        const tr = document.createElement('tr');
        tr.dataset['eventLogRow'] = 'true';
        for (const val of [ev.eventType, ev.status, String(ev.attempt), ev.timestamp, String(ev.httpStatus), ev.responseBodyExcerpt]) {
          const td = document.createElement('td');
          td.textContent = val;
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      logEntriesEl!.appendChild(table);
    }

    // Mount the filter control; it calls onFilterChange whenever the selection changes.
    const filterCtrl = mountEventTypeFilterControl(
      filterEl,
      store.getEvents(),
      (selectedTypes) => {
        renderLogEntries(store.getEvents(), selectedTypes);
      },
    );

    // Subscribe to store changes to keep the filter options and log in sync.
    store.subscribe((events) => {
      filterCtrl.update(events);
      renderLogEntries(events, filterCtrl.getSelectedTypes());
    });
  }

  // Seed with simulated delivery events in dev/demo mode only. Because the store
  // is reactive, appending these events causes the dashboard to recalculate and
  // re-render automatically — no manual refresh.
  if (simulatorEnabled()) {
    store.reset(generateSimulatedEvents({ count: 12, successRate: 0.7 }));
  }

  return store;
}
