/**
 * Metrics calculation module for the webhook delivery metrics dashboard.
 *
 * All functions are pure and side-effect-free so they can be unit-tested
 * without a DOM environment.
 *
 * Spec ref: spec § "Webhook delivery metrics dashboard"
 */

// ── Delivery event types ──────────────────────────────────────────────────────

/** Status of a single delivery attempt. */
export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'exhausted';

/**
 * A single delivery attempt record.
 *
 * - `webhookId`       – unique identifier for the webhook (groups attempts
 *                       belonging to the same logical delivery).
 * - `eventType`       – e.g. "payment.created", "refund.issued".
 * - `status`          – outcome of this attempt.
 * - `attemptNumber`   – 1-based index of this attempt within the webhook.
 * - `timestamp`       – ISO-8601 string of when this attempt was made.
 * - `httpStatus`      – HTTP status code returned by the endpoint (or null if
 *                       the request never completed).
 * - `responseExcerpt` – first ~200 chars of the response body (or null).
 */
export interface DeliveryAttempt {
  webhookId: string;
  eventType: string;
  status: DeliveryStatus;
  attemptNumber: number;
  timestamp: string;
  httpStatus: number | null;
  responseExcerpt: string | null;
}

// ── Aggregate result types ────────────────────────────────────────────────────

/** Per-event-type breakdown row. */
export interface EventTypeMetrics {
  eventType: string;
  /** Fraction of webhooks (0–1) that reached `delivered`. */
  successRate: number;
  /** Mean number of attempts per webhook (across all webhooks of this type). */
  averageRetryCount: number;
  /** Median time-to-delivery in milliseconds (null when no delivered webhooks). */
  medianTimeToDeliveryMs: number | null;
  /** 95th-percentile time-to-delivery in ms (null when no delivered webhooks). */
  p95TimeToDeliveryMs: number | null;
}

/** Full metrics result returned by `calculateMetrics`. */
export interface MetricsResult {
  /** Overall aggregate across all event types. */
  overall: EventTypeMetrics;
  /** Per-event-type breakdown, one entry per distinct event type. */
  byEventType: EventTypeMetrics[];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Group attempts by webhookId.
 * Returns a Map<webhookId, DeliveryAttempt[]> sorted by attemptNumber asc.
 */
function groupByWebhook(
  attempts: DeliveryAttempt[]
): Map<string, DeliveryAttempt[]> {
  const map = new Map<string, DeliveryAttempt[]>();
  for (const attempt of attempts) {
    const existing = map.get(attempt.webhookId);
    if (existing) {
      existing.push(attempt);
    } else {
      map.set(attempt.webhookId, [attempt]);
    }
  }
  // Sort each group by attemptNumber ascending so attempt #1 is always first.
  for (const group of map.values()) {
    group.sort((a, b) => a.attemptNumber - b.attemptNumber);
  }
  return map;
}

/**
 * Compute the percentile value (0–100) of a sorted numeric array using the
 * nearest-rank method.  Returns null for an empty array.
 */
function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * Compute metrics for a set of webhook groups (already filtered to a single
 * event type or the full set).
 *
 * @param webhookGroups – Map of webhookId → attempts (sorted by attemptNumber).
 * @param eventType     – Label for the returned row.
 */
function computeMetricsForGroups(
  webhookGroups: Map<string, DeliveryAttempt[]>,
  eventType: string
): EventTypeMetrics {
  const totalWebhooks = webhookGroups.size;

  if (totalWebhooks === 0) {
    return {
      eventType,
      successRate: 0,
      averageRetryCount: 0,
      medianTimeToDeliveryMs: null,
      p95TimeToDeliveryMs: null,
    };
  }

  let deliveredCount = 0;
  let totalAttempts = 0;
  const timeToDeliveryMs: number[] = [];

  for (const attempts of webhookGroups.values()) {
    totalAttempts += attempts.length;

    // The first attempt is always attempt #1 (sorted above).
    const firstAttempt = attempts[0];
    const firstTs = new Date(firstAttempt.timestamp).getTime();

    // Find the first delivered attempt (if any).
    const deliveredAttempt = attempts.find((a) => a.status === 'delivered');
    if (deliveredAttempt) {
      deliveredCount++;
      const deliveredTs = new Date(deliveredAttempt.timestamp).getTime();
      timeToDeliveryMs.push(deliveredTs - firstTs);
    }
  }

  const successRate = deliveredCount / totalWebhooks;
  const averageRetryCount = totalAttempts / totalWebhooks;

  timeToDeliveryMs.sort((a, b) => a - b);
  const medianTimeToDeliveryMs = percentile(timeToDeliveryMs, 50);
  const p95TimeToDeliveryMs = percentile(timeToDeliveryMs, 95);

  return {
    eventType,
    successRate,
    averageRetryCount,
    medianTimeToDeliveryMs,
    p95TimeToDeliveryMs,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Calculate aggregate and per-event-type delivery metrics from a flat list of
 * delivery attempts.
 *
 * Each logical webhook delivery is identified by `webhookId`; multiple
 * attempts with the same `webhookId` represent retries of the same delivery.
 *
 * @param attempts – All delivery attempt records to analyse.
 * @returns        A `MetricsResult` with overall and per-event-type metrics.
 */
export function calculateMetrics(attempts: DeliveryAttempt[]): MetricsResult {
  // Overall (all event types combined).
  const allGroups = groupByWebhook(attempts);
  const overall = computeMetricsForGroups(allGroups, 'overall');

  // Per-event-type breakdown.
  const eventTypes = [...new Set(attempts.map((a) => a.eventType))].sort();
  const byEventType: EventTypeMetrics[] = eventTypes.map((et) => {
    const filtered = attempts.filter((a) => a.eventType === et);
    const groups = groupByWebhook(filtered);
    return computeMetricsForGroups(groups, et);
  });

  return { overall, byEventType };
}
