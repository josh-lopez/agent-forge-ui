/**
 * Unit tests for Issue #190: Bulk re-trigger action for exhausted webhooks.
 *
 * Covers the acceptance criteria mandated by the spec:
 *   AC2  – bulk action re-triggers all currently exhausted webhooks.
 *   AC3  – each re-triggered webhook transitions from 'exhausted' → 'pending'.
 *   AC5  – no-op (empty retriggeredIds) when there are no exhausted webhooks.
 *   AC8  – webhooks in other states (pending/delivered/failed) are unaffected.
 *   AC9  – unit tests cover: multiple exhausted, none exhausted, correct
 *           state transition per re-triggered webhook.
 *
 * Spec ref: spec § "Webhook delivery & retries — Manual re-trigger"
 */

import { describe, expect, it } from 'vitest';
import { bulkRetriggerExhausted, hasExhaustedWebhooks } from '../src/bulkRetrigger.ts';
import type { WebhookEntry } from '../src/webhookTypes.ts';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeEntry(
  id: string,
  status: WebhookEntry['status'],
  eventType = 'payment.created',
): WebhookEntry {
  return {
    id,
    eventType,
    status,
    attempts: [],
  };
}

// ── bulkRetriggerExhausted ────────────────────────────────────────────────────

describe('bulkRetriggerExhausted', () => {
  // AC9 – multiple exhausted webhooks
  it('re-triggers all exhausted webhooks when multiple are present', () => {
    const entries: WebhookEntry[] = [
      makeEntry('w1', 'exhausted'),
      makeEntry('w2', 'exhausted'),
      makeEntry('w3', 'exhausted'),
    ];

    const { updatedEntries, retriggeredIds } = bulkRetriggerExhausted(entries);

    // All three should be re-triggered.
    expect(retriggeredIds).toHaveLength(3);
    expect(retriggeredIds).toContain('w1');
    expect(retriggeredIds).toContain('w2');
    expect(retriggeredIds).toContain('w3');

    // All entries should now be 'pending'.
    expect(updatedEntries).toHaveLength(3);
    updatedEntries.forEach((e) => expect(e.status).toBe('pending'));
  });

  // AC9 – no exhausted webhooks (no-op)
  it('returns empty retriggeredIds when no webhooks are exhausted', () => {
    const entries: WebhookEntry[] = [
      makeEntry('w1', 'pending'),
      makeEntry('w2', 'delivered'),
      makeEntry('w3', 'failed'),
    ];

    const { updatedEntries, retriggeredIds } = bulkRetriggerExhausted(entries);

    // Nothing should be re-triggered.
    expect(retriggeredIds).toHaveLength(0);

    // All entries should be unchanged.
    expect(updatedEntries).toHaveLength(3);
    expect(updatedEntries[0].status).toBe('pending');
    expect(updatedEntries[1].status).toBe('delivered');
    expect(updatedEntries[2].status).toBe('failed');
  });

  // AC9 – correct state transition for each re-triggered webhook
  it('transitions each exhausted webhook from exhausted to pending', () => {
    const exhaustedEntry = makeEntry('w1', 'exhausted');
    const { updatedEntries } = bulkRetriggerExhausted([exhaustedEntry]);

    expect(updatedEntries[0].status).toBe('pending');
    // The id and other fields must be preserved.
    expect(updatedEntries[0].id).toBe('w1');
    expect(updatedEntries[0].eventType).toBe('payment.created');
  });

  // AC8 – only exhausted webhooks are affected; others remain unchanged
  it('does not affect webhooks in pending, delivered, or failed states', () => {
    const pending = makeEntry('p1', 'pending');
    const delivered = makeEntry('d1', 'delivered');
    const failed = makeEntry('f1', 'failed');
    const exhausted = makeEntry('e1', 'exhausted');

    const { updatedEntries, retriggeredIds } = bulkRetriggerExhausted([
      pending,
      delivered,
      failed,
      exhausted,
    ]);

    // Only the exhausted entry should be re-triggered.
    expect(retriggeredIds).toEqual(['e1']);

    // Non-exhausted entries must be the same object references (not copied).
    expect(updatedEntries[0]).toBe(pending);
    expect(updatedEntries[1]).toBe(delivered);
    expect(updatedEntries[2]).toBe(failed);

    // The exhausted entry should now be pending.
    expect(updatedEntries[3].status).toBe('pending');
    expect(updatedEntries[3].id).toBe('e1');
  });

  // AC3 – state transition preserves all other fields
  it('preserves all fields other than status when transitioning exhausted → pending', () => {
    const entry: WebhookEntry = {
      id: 'w42',
      eventType: 'refund.issued',
      status: 'exhausted',
      attempts: [
        { timestamp: '2024-01-01T00:00:00Z', httpStatus: 500, responseExcerpt: 'Server Error' },
      ],
    };

    const { updatedEntries } = bulkRetriggerExhausted([entry]);
    const updated = updatedEntries[0];

    expect(updated.status).toBe('pending');
    expect(updated.id).toBe('w42');
    expect(updated.eventType).toBe('refund.issued');
    expect(updated.attempts).toHaveLength(1);
    expect(updated.attempts[0].httpStatus).toBe(500);
  });

  // Pure function: input array must not be mutated
  it('does not mutate the input entries array', () => {
    const entries: WebhookEntry[] = [
      makeEntry('w1', 'exhausted'),
      makeEntry('w2', 'pending'),
    ];
    const originalStatuses = entries.map((e) => e.status);

    bulkRetriggerExhausted(entries);

    // Original entries must be unchanged.
    entries.forEach((e, i) => expect(e.status).toBe(originalStatuses[i]));
  });

  // Edge case: empty list
  it('handles an empty entry list gracefully', () => {
    const { updatedEntries, retriggeredIds } = bulkRetriggerExhausted([]);

    expect(updatedEntries).toHaveLength(0);
    expect(retriggeredIds).toHaveLength(0);
  });

  // Edge case: mixed exhausted and non-exhausted
  it('re-triggers only exhausted entries in a mixed list', () => {
    const entries: WebhookEntry[] = [
      makeEntry('e1', 'exhausted', 'payment.created'),
      makeEntry('p1', 'pending', 'refund.issued'),
      makeEntry('e2', 'exhausted', 'dispute.opened'),
      makeEntry('d1', 'delivered', 'payment.created'),
    ];

    const { updatedEntries, retriggeredIds } = bulkRetriggerExhausted(entries);

    expect(retriggeredIds).toHaveLength(2);
    expect(retriggeredIds).toContain('e1');
    expect(retriggeredIds).toContain('e2');

    // e1 and e2 should now be pending.
    const e1 = updatedEntries.find((e) => e.id === 'e1')!;
    const e2 = updatedEntries.find((e) => e.id === 'e2')!;
    expect(e1.status).toBe('pending');
    expect(e2.status).toBe('pending');

    // p1 and d1 should be unchanged.
    const p1 = updatedEntries.find((e) => e.id === 'p1')!;
    const d1 = updatedEntries.find((e) => e.id === 'd1')!;
    expect(p1.status).toBe('pending');
    expect(d1.status).toBe('delivered');
  });

  // Simulator compatibility: works with entries that have attempt history
  it('works correctly with entries that have delivery attempt history (simulator data)', () => {
    const simulatorEntries: WebhookEntry[] = [
      {
        id: 'sim-1',
        eventType: 'payment.created',
        status: 'exhausted',
        attempts: [
          { timestamp: '2024-01-01T00:00:00Z', httpStatus: 500, responseExcerpt: 'Error' },
          { timestamp: '2024-01-01T00:01:00Z', httpStatus: 503, responseExcerpt: 'Unavailable' },
          { timestamp: '2024-01-01T00:06:00Z', httpStatus: 500, responseExcerpt: 'Error' },
        ],
      },
      {
        id: 'sim-2',
        eventType: 'refund.issued',
        status: 'delivered',
        attempts: [
          { timestamp: '2024-01-01T00:00:00Z', httpStatus: 200, responseExcerpt: 'OK' },
        ],
      },
    ];

    const { updatedEntries, retriggeredIds } = bulkRetriggerExhausted(simulatorEntries);

    expect(retriggeredIds).toEqual(['sim-1']);
    expect(updatedEntries[0].status).toBe('pending');
    // Attempt history is preserved.
    expect(updatedEntries[0].attempts).toHaveLength(3);
    // Delivered entry is unchanged.
    expect(updatedEntries[1]).toBe(simulatorEntries[1]);
  });
});

// ── hasExhaustedWebhooks ──────────────────────────────────────────────────────

describe('hasExhaustedWebhooks', () => {
  // AC1 – control visible when one or more webhooks are exhausted
  it('returns true when at least one webhook is exhausted', () => {
    const entries: WebhookEntry[] = [
      makeEntry('w1', 'pending'),
      makeEntry('w2', 'exhausted'),
    ];
    expect(hasExhaustedWebhooks(entries)).toBe(true);
  });

  it('returns true when all webhooks are exhausted', () => {
    const entries: WebhookEntry[] = [
      makeEntry('w1', 'exhausted'),
      makeEntry('w2', 'exhausted'),
    ];
    expect(hasExhaustedWebhooks(entries)).toBe(true);
  });

  // AC5 – control disabled/hidden when no exhausted webhooks
  it('returns false when no webhooks are exhausted', () => {
    const entries: WebhookEntry[] = [
      makeEntry('w1', 'pending'),
      makeEntry('w2', 'delivered'),
      makeEntry('w3', 'failed'),
    ];
    expect(hasExhaustedWebhooks(entries)).toBe(false);
  });

  it('returns false for an empty list', () => {
    expect(hasExhaustedWebhooks([])).toBe(false);
  });

  it('returns false when all webhooks are delivered', () => {
    const entries: WebhookEntry[] = [
      makeEntry('w1', 'delivered'),
      makeEntry('w2', 'delivered'),
    ];
    expect(hasExhaustedWebhooks(entries)).toBe(false);
  });
});
