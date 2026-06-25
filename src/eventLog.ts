// Webhook delivery event log with date-range, event-type and status filters.
//
// Subscribes to the shared DeliveryEventStore so it stays in sync with the
// metrics dashboard. Provides per-attempt rows (timestamp, HTTP status,
// response excerpt), manual re-trigger, and a prominent exhausted alert.

import {
  type DeliveryEvent,
  type DeliveryEventStore,
  type DeliveryStatus,
} from './deliveryEvents.ts';

export interface LogFilter {
  /** Inclusive lower bound (epoch ms) or null for unbounded. */
  start: number | null;
  /** Inclusive upper bound (epoch ms) or null for unbounded. */
  end: number | null;
  /** Restrict to a single status, or null for all statuses. */
  status: DeliveryStatus | null;
}

export const EMPTY_FILTER: LogFilter = { start: null, end: null, status: null };

/** Whether any constraint is active (used for the active-filter indicator). */
export function isFilterActive(filter: LogFilter): boolean {
  return filter.start !== null || filter.end !== null || filter.status !== null;
}

/**
 * Apply a filter to a list of events. Date-range boundaries are inclusive:
 * entries whose timestamp exactly equals start or end are kept. Pure function
 * so range-applied / range-cleared / boundary cases are easy to unit-test.
 */
export function filterEvents(
  events: readonly DeliveryEvent[],
  filter: LogFilter,
): DeliveryEvent[] {
  return events.filter((event) => {
    const t = Date.parse(event.timestamp);
    if (filter.start !== null && t < filter.start) return false;
    if (filter.end !== null && t > filter.end) return false;
    if (filter.status !== null && event.status !== filter.status) return false;
    return true;
  });
}

/** Parse a datetime-local input value to epoch ms, or null when empty. */
export function parseDateInput(value: string): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export interface EventLogHandle {
  /** Unsubscribe from the store and stop rendering. */
  destroy: () => void;
  /** Current filter (read-only snapshot). */
  getFilter: () => LogFilter;
}

/**
 * Mount the event log into a container, wired to the shared store. Returns a
 * handle exposing the current filter and a destroy function.
 */
export function mountEventLog(
  container: HTMLElement,
  store: DeliveryEventStore,
): EventLogHandle {
  let filter: LogFilter = { ...EMPTY_FILTER };
  let latest: readonly DeliveryEvent[] = [];

  container.classList.add('event-log');

  const heading = document.createElement('h2');
  heading.textContent = 'Delivery event log';
  container.appendChild(heading);

  // Prominent alert region for exhausted webhooks.
  const alert = document.createElement('div');
  alert.className = 'exhausted-alert';
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  container.appendChild(alert);

  // ── Filter controls ────────────────────────────────────────────────────
  const controls = document.createElement('div');
  controls.className = 'log-filters';

  const startInput = dateField('Start', 'log-filter-start');
  const endInput = dateField('End', 'log-filter-end');
  controls.appendChild(startInput.wrapper);
  controls.appendChild(endInput.wrapper);

  const statusSelect = document.createElement('select');
  statusSelect.id = 'log-filter-status';
  statusSelect.setAttribute('aria-label', 'Filter by status');
  for (const opt of ['all', 'pending', 'delivered', 'failed', 'exhausted']) {
    const o = document.createElement('option');
    o.value = opt === 'all' ? '' : opt;
    o.textContent = opt === 'all' ? 'All statuses' : opt;
    statusSelect.appendChild(o);
  }
  controls.appendChild(statusSelect);

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'log-filter-clear';
  clearBtn.textContent = 'Clear filters';
  controls.appendChild(clearBtn);

  const indicator = document.createElement('span');
  indicator.className = 'log-filter-indicator';
  indicator.hidden = true;
  indicator.textContent = 'Filter active';
  controls.appendChild(indicator);

  container.appendChild(controls);

  // ── Scrollable list ────────────────────────────────────────────────────
  const list = document.createElement('div');
  list.className = 'log-entries';
  container.appendChild(list);

  function syncFilterFromControls(): void {
    filter = {
      start: parseDateInput(startInput.input.value),
      end: parseDateInput(endInput.input.value),
      status: (statusSelect.value || null) as DeliveryStatus | null,
    };
    render();
  }

  function render(): void {
    const active = isFilterActive(filter);
    indicator.hidden = !active;

    const visible = filterEvents(latest, filter);
    list.innerHTML = '';
    for (const event of visible) {
      list.appendChild(rowFor(event));
    }

    const exhausted = latest.filter((e) => e.status === 'exhausted');
    if (exhausted.length > 0) {
      alert.hidden = false;
      alert.textContent =
        `${exhausted.length} webhook(s) exhausted all retries — action required.`;
    } else {
      alert.hidden = true;
    }
  }

  function rowFor(event: DeliveryEvent): HTMLElement {
    const row = document.createElement('div');
    row.className = `log-entry status-${event.status}`;

    const meta = document.createElement('span');
    meta.className = 'log-entry-meta';
    meta.textContent =
      `${event.timestamp} · attempt ${event.attempt} · ` +
      `HTTP ${event.httpStatus} · ${event.status}`;
    row.appendChild(meta);

    const body = document.createElement('span');
    body.className = 'log-entry-body';
    body.textContent = event.responseExcerpt;
    row.appendChild(body);

    if (event.status === 'failed' || event.status === 'exhausted') {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'log-entry-retry';
      retry.textContent = 'Re-trigger';
      retry.addEventListener('click', () => {
        store.add({
          webhookId: event.webhookId,
          attempt: event.attempt + 1,
          status: 'pending',
          timestamp: new Date().toISOString(),
          httpStatus: 0,
          responseExcerpt: 'manual re-trigger requested',
        });
      });
      row.appendChild(retry);
    }

    return row;
  }

  startInput.input.addEventListener('change', syncFilterFromControls);
  endInput.input.addEventListener('change', syncFilterFromControls);
  statusSelect.addEventListener('change', syncFilterFromControls);
  clearBtn.addEventListener('click', () => {
    startInput.input.value = '';
    endInput.input.value = '';
    statusSelect.value = '';
    filter = { ...EMPTY_FILTER };
    render();
  });

  const unsubscribe = store.subscribe((events) => {
    latest = events;
    render();
  });

  return {
    destroy: unsubscribe,
    getFilter: () => ({ ...filter }),
  };
}

function dateField(
  label: string,
  id: string,
): { wrapper: HTMLElement; input: HTMLInputElement } {
  const wrapper = document.createElement('label');
  wrapper.className = 'log-filter-field';
  wrapper.textContent = label;
  const input = document.createElement('input');
  input.type = 'datetime-local';
  input.id = id;
  wrapper.appendChild(input);
  return { wrapper, input };
}
