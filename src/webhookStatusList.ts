/**
 * Webhook Delivery Status List component.
 *
 * Renders a list/table of webhooks, each showing its current delivery status
 * (pending / delivered / failed / exhausted) with colour-coded badges.
 * When a webhook transitions to `exhausted`, a prominent alert banner is
 * surfaced and remains visible until dismissed.
 *
 * The component is reactive: call `update(entries)` to push new data and the
 * DOM updates in-place without a page reload.
 *
 * Spec ref: spec § "Webhook delivery & retries — Delivery status visibility"
 */

/** The four delivery status values defined by the spec. */
export type WebhookStatus = 'pending' | 'delivered' | 'failed' | 'exhausted';

/** A single webhook entry displayed in the list. */
export interface WebhookEntry {
  /** Unique identifier for the webhook (e.g. event ID or webhook ID). */
  id: string;
  /** Human-readable event type, e.g. "payment.created". */
  eventType: string;
  /** Current delivery status. */
  status: WebhookStatus;
  /** ISO-8601 timestamp of the most recent delivery attempt. */
  timestamp: string;
}

/** CSS class names used for status badges. */
const STATUS_CLASS: Record<WebhookStatus, string> = {
  pending:   'wsl-badge wsl-badge--pending',
  delivered: 'wsl-badge wsl-badge--delivered',
  failed:    'wsl-badge wsl-badge--failed',
  exhausted: 'wsl-badge wsl-badge--exhausted',
};

/** Human-readable label for each status. */
const STATUS_LABEL: Record<WebhookStatus, string> = {
  pending:   'Pending',
  delivered: 'Delivered',
  failed:    'Failed',
  exhausted: 'Exhausted',
};

/**
 * Mount a WebhookStatusList component into `container`.
 *
 * Returns an `update` function that accepts a new array of `WebhookEntry`
 * objects and re-renders the list reactively.
 *
 * @param container - The DOM element that will host the component.
 * @returns An object with an `update(entries)` method for reactive updates.
 */
export function mountWebhookStatusList(container: HTMLElement): {
  update: (entries: WebhookEntry[]) => void;
} {
  // ── Inject component styles ──────────────────────────────────────────────
  _injectStyles();

  // ── Build the skeleton DOM ───────────────────────────────────────────────
  const root = document.createElement('div');
  root.className = 'wsl-root';
  root.setAttribute('data-testid', 'webhook-status-list');

  // Alert banner for exhausted webhooks (hidden by default).
  const alertBanner = document.createElement('div');
  alertBanner.className = 'wsl-alert wsl-alert--hidden';
  alertBanner.setAttribute('role', 'alert');
  alertBanner.setAttribute('data-testid', 'exhausted-alert');

  const alertText = document.createElement('span');
  alertText.className = 'wsl-alert__text';
  alertText.setAttribute('data-testid', 'exhausted-alert-text');

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'wsl-alert__dismiss';
  dismissBtn.setAttribute('aria-label', 'Dismiss exhausted webhook alert');
  dismissBtn.setAttribute('data-testid', 'exhausted-alert-dismiss');
  dismissBtn.textContent = '✕';
  dismissBtn.addEventListener('click', () => {
    alertBanner.classList.add('wsl-alert--hidden');
    alertBanner.classList.remove('wsl-alert--visible');
  });

  alertBanner.appendChild(alertText);
  alertBanner.appendChild(dismissBtn);

  // Table / list area.
  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'wsl-table-wrapper';

  root.appendChild(alertBanner);
  root.appendChild(tableWrapper);
  container.appendChild(root);

  // ── Internal state ───────────────────────────────────────────────────────
  // Track which exhausted IDs have already triggered the alert so we only
  // surface it when a *new* exhausted entry appears (or on first render).
  const _knownExhausted = new Set<string>();

  // ── Render function ──────────────────────────────────────────────────────
  function update(entries: WebhookEntry[]): void {
    // Re-render the table.
    tableWrapper.innerHTML = '';

    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'wsl-empty';
      empty.setAttribute('data-testid', 'webhook-status-empty');
      empty.textContent = 'No webhooks to display.';
      tableWrapper.appendChild(empty);
      return;
    }

    const table = document.createElement('table');
    table.className = 'wsl-table';
    table.setAttribute('data-testid', 'webhook-status-table');

    // Header row.
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th scope="col">ID</th>
        <th scope="col">Event Type</th>
        <th scope="col">Status</th>
        <th scope="col">Last Attempt</th>
      </tr>`;
    table.appendChild(thead);

    // Body rows.
    const tbody = document.createElement('tbody');
    let hasNewExhausted = false;
    const exhaustedIds: string[] = [];

    for (const entry of entries) {
      const tr = document.createElement('tr');
      tr.className = `wsl-row wsl-row--${entry.status}`;
      tr.setAttribute('data-testid', `webhook-row-${entry.id}`);
      tr.setAttribute('data-status', entry.status);

      const tdId = document.createElement('td');
      tdId.textContent = entry.id;
      tdId.className = 'wsl-cell wsl-cell--id';

      const tdType = document.createElement('td');
      tdType.textContent = entry.eventType;
      tdType.className = 'wsl-cell wsl-cell--type';

      const tdStatus = document.createElement('td');
      tdStatus.className = 'wsl-cell wsl-cell--status';
      const badge = document.createElement('span');
      badge.className = STATUS_CLASS[entry.status];
      badge.setAttribute('data-testid', `status-badge-${entry.id}`);
      badge.textContent = STATUS_LABEL[entry.status];
      tdStatus.appendChild(badge);

      const tdTime = document.createElement('td');
      tdTime.textContent = entry.timestamp;
      tdTime.className = 'wsl-cell wsl-cell--time';

      tr.appendChild(tdId);
      tr.appendChild(tdType);
      tr.appendChild(tdStatus);
      tr.appendChild(tdTime);
      tbody.appendChild(tr);

      // Track exhausted entries for the alert.
      if (entry.status === 'exhausted') {
        exhaustedIds.push(entry.id);
        if (!_knownExhausted.has(entry.id)) {
          hasNewExhausted = true;
          _knownExhausted.add(entry.id);
        }
      }
    }

    table.appendChild(tbody);
    tableWrapper.appendChild(table);

    // ── Exhausted alert ────────────────────────────────────────────────────
    if (exhaustedIds.length > 0) {
      // Show the alert (either newly triggered or already visible).
      const plural = exhaustedIds.length === 1 ? 'webhook has' : 'webhooks have';
      alertText.textContent =
        `⚠ ${exhaustedIds.length} ${plural} reached the exhausted state ` +
        `and will no longer be retried automatically: ${exhaustedIds.join(', ')}`;

      if (hasNewExhausted || alertBanner.classList.contains('wsl-alert--visible')) {
        alertBanner.classList.remove('wsl-alert--hidden');
        alertBanner.classList.add('wsl-alert--visible');
      }
    } else {
      // No exhausted entries — hide the alert.
      alertBanner.classList.add('wsl-alert--hidden');
      alertBanner.classList.remove('wsl-alert--visible');
    }
  }

  return { update };
}

// ── Style injection (idempotent) ─────────────────────────────────────────────

const _STYLE_ID = 'wsl-styles';

function _injectStyles(): void {
  if (document.getElementById(_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = _STYLE_ID;
  style.textContent = `
/* ── WebhookStatusList component styles ─────────────────────────────────── */
.wsl-root {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  margin: 1rem 0;
}

/* Alert banner */
.wsl-alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 4px;
  background: #fff3cd;
  border: 2px solid #ffc107;
  color: #856404;
  font-weight: 600;
  margin-bottom: 1rem;
}
.wsl-alert--hidden { display: none; }
.wsl-alert--visible { display: flex; }
.wsl-alert__dismiss {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  color: inherit;
  padding: 0 0.25rem;
  line-height: 1;
}
.wsl-alert__dismiss:hover { opacity: 0.7; }

/* Table */
.wsl-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.wsl-table th,
.wsl-table td {
  padding: 0.5rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid #dee2e6;
}
.wsl-table thead th {
  background: #f8f9fa;
  font-weight: 600;
  color: #495057;
}
.wsl-row--exhausted {
  background: #fff3cd;
}

/* Status badges */
.wsl-badge {
  display: inline-block;
  padding: 0.2em 0.6em;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.wsl-badge--pending   { background: #e2e3e5; color: #383d41; }
.wsl-badge--delivered { background: #d4edda; color: #155724; }
.wsl-badge--failed    { background: #f8d7da; color: #721c24; }
.wsl-badge--exhausted { background: #ffc107; color: #212529; }

/* Empty state */
.wsl-empty {
  color: #6c757d;
  font-style: italic;
  padding: 1rem 0;
}
`;
  document.head.appendChild(style);
}
