/**
 * Retry-count metrics for the webhook delivery metrics dashboard.
 *
 * Calculates the mean number of retry attempts per webhook, broken down by
 * event type, so merchants can identify event types that are
 * disproportionately unreliable.
 *
 * Retry count definition: a webhook that required N total delivery attempts
 * has (N - 1) retries.  A webhook delivered on the first attempt contributes
 * 0 retries to the mean; a webhook that needed 3 attempts contributes 2.
 *
 * Spec ref: spec § "Webhook delivery metrics dashboard — Average retry count"
 */

/**
 * Minimal shape required by the retry-metrics calculation.
 * A real delivery-event record is a superset of this interface.
 */
export interface RetryableWebhook {
  /** e.g. "payment.created", "refund.issued", "dispute.opened" */
  eventType: string;
  /**
   * Total number of delivery attempts made for this webhook (including the
   * initial attempt).  Must be >= 1.
   */
  attemptCount: number;
}

/**
 * Per-event-type mean retry count result.
 */
export interface EventTypeRetryStats {
  /** The event type label (e.g. "payment.created"). */
  eventType: string;
  /**
   * Mean number of retries across all webhooks of this event type.
   * Retries = attemptCount - 1 per webhook.
   * `null` when there are zero webhooks for this event type (graceful
   * edge-case — callers should render '—' or '0' as appropriate).
   */
  meanRetryCount: number | null;
  /** Total number of webhooks of this event type in the dataset. */
  webhookCount: number;
}

/**
 * Calculate the mean retry count per event type from a list of webhooks.
 *
 * The function is pure and side-effect-free so it can be called on every
 * reactive update without risk.
 *
 * @param webhooks - Array of webhook records.  May be empty.
 * @returns An array of {@link EventTypeRetryStats}, one entry per distinct
 *          event type found in `webhooks`, sorted alphabetically by
 *          `eventType` for a stable, scannable display order.
 *          Returns an empty array when `webhooks` is empty.
 */
export function calcRetryCountByEventType(
  webhooks: RetryableWebhook[]
): EventTypeRetryStats[] {
  if (webhooks.length === 0) {
    return [];
  }

  // Group webhooks by event type.
  const groups = new Map<string, number[]>();
  for (const wh of webhooks) {
    const retryCounts = groups.get(wh.eventType);
    // retries = total attempts - 1 (initial attempt is not a retry)
    const retries = Math.max(0, wh.attemptCount - 1);
    if (retryCounts === undefined) {
      groups.set(wh.eventType, [retries]);
    } else {
      retryCounts.push(retries);
    }
  }

  // Build result array, sorted alphabetically for stable rendering.
  const result: EventTypeRetryStats[] = [];
  for (const [eventType, retryCounts] of groups) {
    const webhookCount = retryCounts.length;
    const meanRetryCount =
      webhookCount === 0
        ? null
        : retryCounts.reduce((sum, r) => sum + r, 0) / webhookCount;
    result.push({ eventType, meanRetryCount, webhookCount });
  }

  result.sort((a, b) => a.eventType.localeCompare(b.eventType));
  return result;
}

/**
 * Format a mean retry count value for display in the dashboard.
 *
 * @param value - The mean retry count, or `null` for zero-delivery edge case.
 * @param decimals - Number of decimal places (default 2).
 * @returns A human-readable string: '—' for null, otherwise the number
 *          formatted to `decimals` decimal places.
 */
export function formatMeanRetryCount(
  value: number | null,
  decimals = 2
): string {
  if (value === null) {
    return '—';
  }
  return value.toFixed(decimals);
}

/**
 * Render the per-event-type retry count breakdown as an HTML table string.
 *
 * This is a pure function that produces a self-contained `<table>` element
 * suitable for injection into any container element.  It has no side effects
 * and requires no DOM environment, making it straightforward to unit-test.
 *
 * @param stats - Output of {@link calcRetryCountByEventType}.
 * @returns An HTML string containing a `<table>` with one row per event type.
 *          Returns a `<p>` with a "no data" message when `stats` is empty.
 */
export function renderRetryBreakdownTable(stats: EventTypeRetryStats[]): string {
  if (stats.length === 0) {
    return '<p class="retry-breakdown-empty">No delivery data available.</p>';
  }

  const rows = stats
    .map(
      (s) =>
        `<tr>` +
        `<td class="retry-breakdown-event-type">${escapeHtml(s.eventType)}</td>` +
        `<td class="retry-breakdown-mean">${escapeHtml(formatMeanRetryCount(s.meanRetryCount))}</td>` +
        `<td class="retry-breakdown-count">${s.webhookCount}</td>` +
        `</tr>`
    )
    .join('\n');

  return (
    `<table class="retry-breakdown-table">` +
    `<thead><tr>` +
    `<th>Event Type</th>` +
    `<th>Mean Retries</th>` +
    `<th>Webhooks</th>` +
    `</tr></thead>` +
    `<tbody>\n${rows}\n</tbody>` +
    `</table>`
  );
}

/** Minimal HTML escaping to prevent XSS in rendered event-type labels. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
