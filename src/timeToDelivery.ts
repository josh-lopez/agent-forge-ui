/**
 * Time-to-delivery statistics for the webhook metrics dashboard.
 *
 * Calculates median (p50) and 95th-percentile (p95) time-to-delivery values,
 * both overall and segmented by event type.
 *
 * **Measurement**: time-to-delivery is the duration (in milliseconds) from the
 * timestamp of the *initial* delivery attempt to the timestamp of the *first*
 * `delivered` status event for the same webhook.  Webhooks that never reach
 * `delivered` are explicitly excluded from the pool.
 *
 * **Percentile method**: nearest-rank (lower-inclusive).  For a sorted array
 * of N values, the p-th percentile is the value at index
 * `Math.ceil(p / 100 * N) - 1` (0-based).  This method is deterministic on
 * small datasets and matches the behaviour documented in the unit tests.
 *
 * Spec ref: spec § "Webhook delivery metrics dashboard — Time-to-delivery stats"
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Minimal shape of a delivery attempt event required by this module.
 * A superset of the full log entry is accepted so the function works with
 * both the real delivery mechanism and the simulator without special-casing.
 */
export interface DeliveryAttemptEvent {
  /** Unique identifier for the webhook (groups attempts for the same webhook). */
  webhookId: string;
  /** Event type key, e.g. "payment.created", "refund.issued". */
  eventType: string;
  /** Delivery status for this attempt. */
  status: 'pending' | 'delivered' | 'failed' | 'exhausted' | string;
  /**
   * Timestamp of this attempt.  Accepts ISO 8601 strings or epoch-millisecond
   * numbers; both are normalised to milliseconds before arithmetic.
   */
  timestamp: string | number;
  /** Attempt index (0-based).  Used to identify the initial attempt. */
  attemptIndex: number;
}

/** Median and p95 time-to-delivery in milliseconds, or null when unavailable. */
export interface TimeToDeliveryStats {
  /** Median (p50) time-to-delivery in ms, or null when no data. */
  medianMs: number | null;
  /** 95th-percentile time-to-delivery in ms, or null when no data. */
  p95Ms: number | null;
  /** Number of webhooks included in the calculation. */
  sampleSize: number;
}

/** Overall and per-event-type time-to-delivery statistics. */
export interface TimeToDeliveryResult {
  /** Aggregate stats across all event types. */
  overall: TimeToDeliveryStats;
  /** Per-event-type stats, keyed by event type string. */
  byEventType: Record<string, TimeToDeliveryStats>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise a timestamp to epoch milliseconds.
 * Accepts ISO 8601 strings (e.g. "2024-01-01T00:00:00Z") or numeric epoch ms.
 */
function toMs(timestamp: string | number): number {
  if (typeof timestamp === 'number') {
    return timestamp;
  }
  return new Date(timestamp).getTime();
}

/**
 * Compute the nearest-rank percentile of a *sorted* array of numbers.
 *
 * @param sorted - Values sorted in ascending order (must be non-empty).
 * @param p      - Percentile in the range [0, 100].
 * @returns The value at the nearest rank.
 */
function nearestRankPercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    throw new RangeError('nearestRankPercentile: array must be non-empty');
  }
  // Nearest-rank formula: rank = ceil(p / 100 * N), clamped to [1, N].
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

/**
 * Build a stats object from an array of durations (in ms).
 * Returns null values when the array is empty.
 */
function buildStats(durationsMs: number[]): TimeToDeliveryStats {
  if (durationsMs.length === 0) {
    return { medianMs: null, p95Ms: null, sampleSize: 0 };
  }
  const sorted = [...durationsMs].sort((a, b) => a - b);
  return {
    medianMs: nearestRankPercentile(sorted, 50),
    p95Ms: nearestRankPercentile(sorted, 95),
    sampleSize: sorted.length,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Calculate time-to-delivery statistics from a dataset of delivery attempt
 * events.
 *
 * For each webhook (grouped by `webhookId`):
 *  1. Find the initial attempt (`attemptIndex === 0`).
 *  2. Find the first attempt whose `status === 'delivered'`.
 *  3. Compute the duration between those two timestamps.
 *  4. Webhooks with no `delivered` attempt are excluded from the pool.
 *
 * If delivery events for a single webhook arrive out of chronological order,
 * the function still selects the attempt with the *lowest* `attemptIndex` as
 * the initial attempt and the *lowest* `attemptIndex` among `delivered` events
 * as the first successful delivery.
 *
 * @param events - Array of delivery attempt events (may be empty).
 * @returns Overall and per-event-type median / p95 statistics.
 */
export function calculateTimeToDelivery(
  events: DeliveryAttemptEvent[]
): TimeToDeliveryResult {
  // Group events by webhookId.
  const byWebhook = new Map<string, DeliveryAttemptEvent[]>();
  for (const event of events) {
    const bucket = byWebhook.get(event.webhookId);
    if (bucket) {
      bucket.push(event);
    } else {
      byWebhook.set(event.webhookId, [event]);
    }
  }

  // For each webhook, compute the time-to-delivery (if it reached 'delivered').
  // Collect durations both overall and per event type.
  const overallDurations: number[] = [];
  const byTypeDurations = new Map<string, number[]>();

  for (const [, attempts] of byWebhook) {
    // Sort by attemptIndex to handle out-of-order arrival.
    const sorted = [...attempts].sort((a, b) => a.attemptIndex - b.attemptIndex);

    // Initial attempt is the one with the lowest attemptIndex.
    const initial = sorted[0];
    if (!initial) continue;

    // First delivered attempt (lowest attemptIndex among delivered events).
    const firstDelivered = sorted.find((a) => a.status === 'delivered');
    if (!firstDelivered) continue; // Exclude webhooks that never delivered.

    const durationMs = toMs(firstDelivered.timestamp) - toMs(initial.timestamp);

    // Use the event type from the initial attempt (consistent grouping).
    const eventType = initial.eventType;

    overallDurations.push(durationMs);

    const typeBucket = byTypeDurations.get(eventType);
    if (typeBucket) {
      typeBucket.push(durationMs);
    } else {
      byTypeDurations.set(eventType, [durationMs]);
    }
  }

  // Build per-event-type stats.
  const byEventType: Record<string, TimeToDeliveryStats> = {};
  for (const [eventType, durations] of byTypeDurations) {
    byEventType[eventType] = buildStats(durations);
  }

  return {
    overall: buildStats(overallDurations),
    byEventType,
  };
}
