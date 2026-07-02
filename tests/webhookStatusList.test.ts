/**
 * Unit tests for Issue #140: Webhook Delivery Status List component.
 *
 * Covers all acceptance criteria:
 *   AC1  – renders a list/table with status for each webhook.
 *   AC2  – status labels are visually distinct (colour-coded badges).
 *   AC3  – reactive update: status changes when update() is called.
 *   AC4  – exhausted alert is surfaced when a webhook reaches `exhausted`.
 *   AC5  – alert remains visible until dismissed; dismiss button works.
 *   AC6  – all four status values render correctly with simulator-style data.
 *   AC7  – empty list renders gracefully with an empty-state message.
 *   AC8  – unit tests cover rendering of each status value.
 *   AC9  – exhausted alert shown for `exhausted`, not shown for other statuses.
 *   AC10 – reactive status update when a new delivery event changes status.
 *
 * Spec ref: spec § "Webhook delivery & retries — Delivery status visibility"
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  mountWebhookStatusList,
  type WebhookEntry,
  type WebhookStatus,
} from '../src/webhookStatusList';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a fresh container div and mount the component into it. */
function setup() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const { update } = mountWebhookStatusList(container);
  return { container, update };
}

/** Build a minimal WebhookEntry fixture. */
function entry(
  id: string,
  status: WebhookStatus,
  eventType = 'payment.created',
  timestamp = '2024-01-01T00:00:00Z',
): WebhookEntry {
  return { id, status, eventType, timestamp };
}

// Clean up the DOM between tests so state doesn't bleed across.
beforeEach(() => {
  document.body.innerHTML = '';
  // Remove injected styles so each test starts fresh.
  const existing = document.getElementById('wsl-styles');
  if (existing) existing.remove();
});

// ── AC7: Empty list ───────────────────────────────────────────────────────────

describe('AC7 – empty webhook list', () => {
  it('renders an empty-state message and no table when list is empty', () => {
    const { container, update } = setup();
    update([]);

    const emptyMsg = container.querySelector('[data-testid="webhook-status-empty"]');
    expect(emptyMsg).not.toBeNull();
    expect(emptyMsg?.textContent).toMatch(/no webhooks/i);

    const table = container.querySelector('[data-testid="webhook-status-table"]');
    expect(table).toBeNull();
  });

  it('does not throw when called with an empty array', () => {
    const { update } = setup();
    expect(() => update([])).not.toThrow();
  });
});

// ── AC1 & AC8: Renders each status value ─────────────────────────────────────

describe('AC1 / AC8 – renders all four status values', () => {
  it('renders a table row for each webhook entry', () => {
    const { container, update } = setup();
    update([
      entry('wh-1', 'pending'),
      entry('wh-2', 'delivered'),
      entry('wh-3', 'failed'),
      entry('wh-4', 'exhausted'),
    ]);

    const rows = container.querySelectorAll('[data-testid^="webhook-row-"]');
    expect(rows.length).toBe(4);
  });

  it('renders a "pending" status badge', () => {
    const { container, update } = setup();
    update([entry('wh-1', 'pending')]);

    const badge = container.querySelector('[data-testid="status-badge-wh-1"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent?.toLowerCase()).toContain('pending');
    expect(badge?.className).toContain('wsl-badge--pending');
  });

  it('renders a "delivered" status badge', () => {
    const { container, update } = setup();
    update([entry('wh-2', 'delivered')]);

    const badge = container.querySelector('[data-testid="status-badge-wh-2"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent?.toLowerCase()).toContain('delivered');
    expect(badge?.className).toContain('wsl-badge--delivered');
  });

  it('renders a "failed" status badge', () => {
    const { container, update } = setup();
    update([entry('wh-3', 'failed')]);

    const badge = container.querySelector('[data-testid="status-badge-wh-3"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent?.toLowerCase()).toContain('failed');
    expect(badge?.className).toContain('wsl-badge--failed');
  });

  it('renders an "exhausted" status badge', () => {
    const { container, update } = setup();
    update([entry('wh-4', 'exhausted')]);

    const badge = container.querySelector('[data-testid="status-badge-wh-4"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent?.toLowerCase()).toContain('exhausted');
    expect(badge?.className).toContain('wsl-badge--exhausted');
  });

  it('renders the event type for each row', () => {
    const { container, update } = setup();
    update([entry('wh-1', 'pending', 'refund.issued')]);

    const row = container.querySelector('[data-testid="webhook-row-wh-1"]');
    expect(row?.textContent).toContain('refund.issued');
  });

  it('renders the timestamp for each row', () => {
    const { container, update } = setup();
    update([entry('wh-1', 'delivered', 'payment.created', '2024-06-15T12:30:00Z')]);

    const row = container.querySelector('[data-testid="webhook-row-wh-1"]');
    expect(row?.textContent).toContain('2024-06-15T12:30:00Z');
  });
});

// ── AC2: Visual distinction ───────────────────────────────────────────────────

describe('AC2 – status badges are visually distinct', () => {
  it('each status has a unique CSS class on its badge', () => {
    const { container, update } = setup();
    update([
      entry('wh-1', 'pending'),
      entry('wh-2', 'delivered'),
      entry('wh-3', 'failed'),
      entry('wh-4', 'exhausted'),
    ]);

    const classes = (['wh-1', 'wh-2', 'wh-3', 'wh-4'] as const).map((id) => {
      const badge = container.querySelector(`[data-testid="status-badge-${id}"]`);
      return badge?.className ?? '';
    });

    // All four class strings must be distinct.
    const unique = new Set(classes);
    expect(unique.size).toBe(4);
  });

  it('exhausted row has a distinct row-level class', () => {
    const { container, update } = setup();
    update([entry('wh-4', 'exhausted')]);

    const row = container.querySelector('[data-testid="webhook-row-wh-4"]');
    expect(row?.className).toContain('wsl-row--exhausted');
  });
});

// ── AC9: Exhausted alert shown/hidden ─────────────────────────────────────────

describe('AC9 – exhausted alert visibility', () => {
  it('alert is NOT shown when all webhooks are pending', () => {
    const { container, update } = setup();
    update([entry('wh-1', 'pending'), entry('wh-2', 'pending')]);

    const alert = container.querySelector('[data-testid="exhausted-alert"]');
    expect(alert?.className).toContain('wsl-alert--hidden');
    expect(alert?.className).not.toContain('wsl-alert--visible');
  });

  it('alert is NOT shown when all webhooks are delivered', () => {
    const { container, update } = setup();
    update([entry('wh-1', 'delivered'), entry('wh-2', 'delivered')]);

    const alert = container.querySelector('[data-testid="exhausted-alert"]');
    expect(alert?.className).toContain('wsl-alert--hidden');
  });

  it('alert is NOT shown when all webhooks are failed', () => {
    const { container, update } = setup();
    update([entry('wh-1', 'failed')]);

    const alert = container.querySelector('[data-testid="exhausted-alert"]');
    expect(alert?.className).toContain('wsl-alert--hidden');
  });

  it('alert IS shown when at least one webhook is exhausted', () => {
    const { container, update } = setup();
    update([entry('wh-1', 'exhausted')]);

    const alert = container.querySelector('[data-testid="exhausted-alert"]');
    expect(alert?.className).toContain('wsl-alert--visible');
    expect(alert?.className).not.toContain('wsl-alert--hidden');
  });

  it('alert text mentions the exhausted webhook ID', () => {
    const { container, update } = setup();
    update([entry('wh-99', 'exhausted')]);

    const alertText = container.querySelector('[data-testid="exhausted-alert-text"]');
    expect(alertText?.textContent).toContain('wh-99');
  });

  it('alert is shown when some webhooks are exhausted and others are not', () => {
    const { container, update } = setup();
    update([
      entry('wh-1', 'delivered'),
      entry('wh-2', 'exhausted'),
      entry('wh-3', 'pending'),
    ]);

    const alert = container.querySelector('[data-testid="exhausted-alert"]');
    expect(alert?.className).toContain('wsl-alert--visible');
  });

  it('alert lists all exhausted webhook IDs', () => {
    const { container, update } = setup();
    update([
      entry('wh-A', 'exhausted'),
      entry('wh-B', 'exhausted'),
      entry('wh-C', 'delivered'),
    ]);

    const alertText = container.querySelector('[data-testid="exhausted-alert-text"]');
    expect(alertText?.textContent).toContain('wh-A');
    expect(alertText?.textContent).toContain('wh-B');
  });
});

// ── AC5: Alert dismiss ────────────────────────────────────────────────────────

describe('AC5 – alert dismiss button', () => {
  it('dismiss button hides the alert', () => {
    const { container, update } = setup();
    update([entry('wh-1', 'exhausted')]);

    const alert = container.querySelector('[data-testid="exhausted-alert"]');
    expect(alert?.className).toContain('wsl-alert--visible');

    const dismissBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="exhausted-alert-dismiss"]',
    );
    expect(dismissBtn).not.toBeNull();
    dismissBtn!.click();

    expect(alert?.className).toContain('wsl-alert--hidden');
    expect(alert?.className).not.toContain('wsl-alert--visible');
  });
});

// ── AC3 & AC10: Reactive updates ─────────────────────────────────────────────

describe('AC3 / AC10 – reactive status updates', () => {
  it('status badge updates when update() is called with new data', () => {
    const { container, update } = setup();

    // Initial state: pending.
    update([entry('wh-1', 'pending')]);
    let badge = container.querySelector('[data-testid="status-badge-wh-1"]');
    expect(badge?.className).toContain('wsl-badge--pending');

    // Reactive update: now delivered.
    update([entry('wh-1', 'delivered')]);
    badge = container.querySelector('[data-testid="status-badge-wh-1"]');
    expect(badge?.className).toContain('wsl-badge--delivered');
    expect(badge?.className).not.toContain('wsl-badge--pending');
  });

  it('transitions from failed to exhausted and shows alert', () => {
    const { container, update } = setup();

    // First: failed — no alert.
    update([entry('wh-1', 'failed')]);
    let alert = container.querySelector('[data-testid="exhausted-alert"]');
    expect(alert?.className).toContain('wsl-alert--hidden');

    // Then: exhausted — alert appears.
    update([entry('wh-1', 'exhausted')]);
    alert = container.querySelector('[data-testid="exhausted-alert"]');
    expect(alert?.className).toContain('wsl-alert--visible');
  });

  it('transitions from pending → failed → delivered without errors', () => {
    const { container, update } = setup();

    update([entry('wh-1', 'pending')]);
    expect(container.querySelector('[data-testid="status-badge-wh-1"]')?.className)
      .toContain('wsl-badge--pending');

    update([entry('wh-1', 'failed')]);
    expect(container.querySelector('[data-testid="status-badge-wh-1"]')?.className)
      .toContain('wsl-badge--failed');

    update([entry('wh-1', 'delivered')]);
    expect(container.querySelector('[data-testid="status-badge-wh-1"]')?.className)
      .toContain('wsl-badge--delivered');
  });

  it('adding a new webhook entry to the list renders it correctly', () => {
    const { container, update } = setup();

    update([entry('wh-1', 'pending')]);
    expect(container.querySelectorAll('[data-testid^="webhook-row-"]').length).toBe(1);

    update([entry('wh-1', 'pending'), entry('wh-2', 'delivered')]);
    expect(container.querySelectorAll('[data-testid^="webhook-row-"]').length).toBe(2);
  });

  it('removing all entries transitions to empty state', () => {
    const { container, update } = setup();

    update([entry('wh-1', 'pending')]);
    expect(container.querySelector('[data-testid="webhook-status-table"]')).not.toBeNull();

    update([]);
    expect(container.querySelector('[data-testid="webhook-status-table"]')).toBeNull();
    expect(container.querySelector('[data-testid="webhook-status-empty"]')).not.toBeNull();
  });
});

// ── AC4: Prominent alert ──────────────────────────────────────────────────────

describe('AC4 – prominent exhausted alert', () => {
  it('alert has role="alert" for accessibility', () => {
    const { container, update } = setup();
    update([entry('wh-1', 'exhausted')]);

    const alert = container.querySelector('[data-testid="exhausted-alert"]');
    expect(alert?.getAttribute('role')).toBe('alert');
  });

  it('alert contains a dismiss button', () => {
    const { container, update } = setup();
    update([entry('wh-1', 'exhausted')]);

    const dismissBtn = container.querySelector('[data-testid="exhausted-alert-dismiss"]');
    expect(dismissBtn).not.toBeNull();
  });

  it('alert is rendered inside the component root', () => {
    const { container, update } = setup();
    update([entry('wh-1', 'exhausted')]);

    const root = container.querySelector('[data-testid="webhook-status-list"]');
    const alert = root?.querySelector('[data-testid="exhausted-alert"]');
    expect(alert).not.toBeNull();
  });
});

// ── AC6: Simulator-produced data ─────────────────────────────────────────────

describe('AC6 – simulator-produced delivery events', () => {
  it('renders all four statuses from a simulator-style event batch', () => {
    const { container, update } = setup();

    // Simulate a batch of events as the simulator would emit them.
    const simulatorEvents: WebhookEntry[] = [
      {
        id: 'evt-001',
        eventType: 'payment.created',
        status: 'pending',
        timestamp: '2024-01-01T10:00:00Z',
      },
      {
        id: 'evt-002',
        eventType: 'refund.issued',
        status: 'delivered',
        timestamp: '2024-01-01T10:01:00Z',
      },
      {
        id: 'evt-003',
        eventType: 'dispute.opened',
        status: 'failed',
        timestamp: '2024-01-01T10:02:00Z',
      },
      {
        id: 'evt-004',
        eventType: 'payment.created',
        status: 'exhausted',
        timestamp: '2024-01-01T10:03:00Z',
      },
    ];

    update(simulatorEvents);

    // All four rows rendered.
    expect(container.querySelectorAll('[data-testid^="webhook-row-"]').length).toBe(4);

    // Each badge has the correct status class.
    expect(
      container.querySelector('[data-testid="status-badge-evt-001"]')?.className,
    ).toContain('wsl-badge--pending');
    expect(
      container.querySelector('[data-testid="status-badge-evt-002"]')?.className,
    ).toContain('wsl-badge--delivered');
    expect(
      container.querySelector('[data-testid="status-badge-evt-003"]')?.className,
    ).toContain('wsl-badge--failed');
    expect(
      container.querySelector('[data-testid="status-badge-evt-004"]')?.className,
    ).toContain('wsl-badge--exhausted');

    // Exhausted alert is shown.
    const alert = container.querySelector('[data-testid="exhausted-alert"]');
    expect(alert?.className).toContain('wsl-alert--visible');
  });

  it('handles a progressive simulator retry sequence', () => {
    const { container, update } = setup();

    // Attempt 1: pending.
    update([entry('evt-sim-1', 'pending', 'payment.created', '2024-01-01T10:00:00Z')]);
    expect(
      container.querySelector('[data-testid="status-badge-evt-sim-1"]')?.className,
    ).toContain('wsl-badge--pending');

    // Attempt 2: failed.
    update([entry('evt-sim-1', 'failed', 'payment.created', '2024-01-01T10:01:00Z')]);
    expect(
      container.querySelector('[data-testid="status-badge-evt-sim-1"]')?.className,
    ).toContain('wsl-badge--failed');

    // Attempt 3: exhausted.
    update([entry('evt-sim-1', 'exhausted', 'payment.created', '2024-01-01T10:02:00Z')]);
    expect(
      container.querySelector('[data-testid="status-badge-evt-sim-1"]')?.className,
    ).toContain('wsl-badge--exhausted');

    // Alert is now visible.
    expect(
      container.querySelector('[data-testid="exhausted-alert"]')?.className,
    ).toContain('wsl-alert--visible');
  });
});
