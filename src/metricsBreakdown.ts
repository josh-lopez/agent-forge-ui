/**
 * Metrics breakdown module for the webhook delivery dashboard.
 *
 * Computes per-event-type and overall aggregate metrics from a flat list of
 * delivery events.  All computation is pure / side-effect-free so the module
 * can be unit-tested without a DOM environment and reused by any UI component.
 *
 * Spec ref: spec § "Webhook delivery metrics dashboard — Event-type breakdown"
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A single delivery-attempt record emitted by the real delivery mechanism or
 * the webhook delivery simulator.
 */
export interface DeliveryEvent {
  /** e.g. "payment.created", "refund.issued" */
  eventType: string;
  /** ISO-8601 timestamp of this attempt */
  timestamp: string;
  /** Outcome of this attempt */
  status: 'pending' | 'delivered' | 'failed' | 'exhausted';
  /** HTTP status code returned by the endpoint (0 if no response) */
  httpStatus: number;
  /** Short excerpt of the response body */
  responseExcerpt: string;
  /**
   * 1-based attempt number within the retry schedule for this webhook.
   * Attempt 1 is the initial delivery; 2+ are retries.
   */
  attemptNumber: number;
  /**
   * Stable identifier that groups all attempts for the same logical webhook
   * delivery (initial + retries).  Used to compute per-webhook retry counts
   * and time-to-delivery.
   */
  webhookId: string;
}

/**
 * Computed metrics for a group of delivery events (either all events or a
 * single event-type slice).
 */
export interface GroupMetrics {
  /**
   * Percentage of webhooks that reached `delivered` status.
   * Range: 0–100.  NaN when there are no webhooks in the group.
   */
  successRate: number;
  /**
   * Mean number of attempts (initial + retries) across all webhooks in the
   * group.  NaN when there are no webhooks.
   */
  avgRetryCount: number;
  /**
   * Median time-to-delivery in milliseconds, measured from the first attempt
   * timestamp to the `delivered` attempt timestamp for each webhook.
   * NaN when no webhook in the group has been delivered.
   */
  medianTTD: number;
  /**
   * 95th-percentile time-to-delivery in milliseconds.
   * NaN when no webhook in the group has been delivered.
   */
  p95TTD: number;
  /** Total number of distinct webhooks in this group. */
  totalWebhooks: number;
  /** Number of webhooks that reached `delivered`. */
  deliveredCount: number;
}

/** Metrics for a single event type. */
export interface EventTypeBreakdown {
  eventType: string;
  metrics: GroupMetrics;
}

/** Full breakdown result: overall aggregate + per-event-type slices. */
export interface BreakdownResult {
  /** Metrics computed across all event types combined. */
  overall: GroupMetrics;
  /** One entry per distinct event type, sorted alphabetically by eventType. */
  byEventType: EventTypeBreakdown[];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Group events by their `webhookId`, returning a map from webhookId to the
 * list of attempts for that webhook.
 */
function groupByWebhookId(events: DeliveryEvent[]): Map<string, DeliveryEvent[]> {
  const map = new Map<string, DeliveryEvent[]>();
  for (const ev of events) {
    const existing = map.get(ev.webhookId);
    if (existing) {
      existing.push(ev);
    } else {
      map.set(ev.webhookId, [ev]);
    }
  }
  return map;
}

/**
 * Compute the percentile value (0–100) of a sorted numeric array using the
 * nearest-rank method.  Returns NaN for an empty array.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * Compute GroupMetrics for a flat list of delivery events.
 *
 * The function groups events by webhookId internally so it can be called with
 * any slice of the full event list (all events, or a single event-type slice).
 */
export function calculateMetricsForGroup(events: DeliveryEvent[]): GroupMetrics {
  const byWebhook = groupByWebhookId(events);

  if (byWebhook.size === 0) {
    return {
      successRate: NaN,
      avgRetryCount: NaN,
      medianTTD: NaN,
      p95TTD: NaN,
      totalWebhooks: 0,
      deliveredCount: 0,
    };
  }

  let deliveredCount = 0;
  let totalAttempts = 0;
  const ttdValues: number[] = [];

  for (const [, attempts] of byWebhook) {
    // Sort attempts by attemptNumber ascending so we can find the first and
    // the delivered attempt reliably.
    const sorted = [...attempts].sort((a, b) => a.attemptNumber - b.attemptNumber);

    // Count total attempts for this webhook.
    totalAttempts += sorted.length;

    // Check if any attempt reached `delivered`.
    const deliveredAttempt = sorted.find((a) => a.status === 'delivered');
    if (deliveredAttempt) {
      deliveredCount++;

      // Time-to-delivery: from first attempt to delivered attempt.
      const firstTs = new Date(sorted[0].timestamp).getTime();
      const deliveredTs = new Date(deliveredAttempt.timestamp).getTime();
      const ttd = deliveredTs - firstTs;
      // Guard against clock skew / same-millisecond delivery.
      ttdValues.push(Math.max(0, ttd));
    }
  }

  const totalWebhooks = byWebhook.size;
  const successRate = (deliveredCount / totalWebhooks) * 100;
  const avgRetryCount = totalAttempts / totalWebhooks;

  ttdValues.sort((a, b) => a - b);
  const medianTTD = percentile(ttdValues, 50);
  const p95TTD = percentile(ttdValues, 95);

  return {
    successRate,
    avgRetryCount,
    medianTTD,
    p95TTD,
    totalWebhooks,
    deliveredCount,
  };
}

/**
 * Group a flat list of delivery events by their `eventType` field.
 *
 * Returns a Map whose keys are the distinct event types found in `events` and
 * whose values are the sub-arrays of events for that type.  The Map preserves
 * insertion order (i.e. the order in which each event type first appears).
 */
export function groupByEventType(
  events: DeliveryEvent[]
): Map<string, DeliveryEvent[]> {
  const map = new Map<string, DeliveryEvent[]>();
  for (const ev of events) {
    const existing = map.get(ev.eventType);
    if (existing) {
      existing.push(ev);
    } else {
      map.set(ev.eventType, [ev]);
    }
  }
  return map;
}

/**
 * Compute the full metrics breakdown from a flat list of delivery events.
 *
 * Returns an overall aggregate (all events combined) and a per-event-type
 * breakdown sorted alphabetically by event type.
 *
 * This is the primary entry point for UI components.
 */
export function calculateBreakdown(events: DeliveryEvent[]): BreakdownResult {
  const overall = calculateMetricsForGroup(events);

  const grouped = groupByEventType(events);

  // Sort event types alphabetically for a stable, scannable layout.
  const sortedTypes = [...grouped.keys()].sort();

  const byEventType: EventTypeBreakdown[] = sortedTypes.map((eventType) => ({
    eventType,
    metrics: calculateMetricsForGroup(grouped.get(eventType)!),
  }));

  return { overall, byEventType };
}
