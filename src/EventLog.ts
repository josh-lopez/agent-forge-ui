/**
 * EventLog — DOM component that displays a list of webhook delivery attempts.
 *
 * Each entry shows:
 *   • Attempt timestamp (human-readable, locale-formatted)
 *   • HTTP status code (or "—" when not yet available)
 *   • Response body excerpt (truncated to EXCERPT_MAX_LENGTH chars)
 *   • Event type and delivery status (for scannability)
 *   • Attempt number
 *
 * Display order: most-recent first (documented per spec AC6).
 *
 * The component subscribes to a DeliveryEventStore and re-renders whenever
 * new events arrive, satisfying the reactive-update requirement (spec AC3).
 *
 * Spec ref: spec § "Webhook delivery & retries" — event log requirement.
 * Spec ref: spec § "Event log filtering" — exposes the data structure required
 *   by date-range and event-type filters (AC9).
 */

import type { DeliveryEvent, DeliveryStatus } from './deliveryEvent.ts';
import type { DeliveryEventStore } from './DeliveryEventStore.ts';

/** Maximum characters shown for a response body excerpt in the log. */
const EXCERPT_MAX_LENGTH = 200;

/**
 * Format an ISO-8601 timestamp into a human-readable local date/time string.
 *
 * Uses a fixed, locale-independent format (YYYY-MM-DD HH:MM:SS) so the
 * display is consistent across environments regardless of the user's locale
 * settings (spec risk: "Timestamp formatting can produce inconsistent display
 * across environments").
 */
export function formatTimestamp(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  if (isNaN(d.getTime())) {
    return isoTimestamp; // Return raw string if unparseable.
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/**
 * Truncate a response body excerpt to at most EXCERPT_MAX_LENGTH characters.
 *
 * Appends "…" when truncation occurs so the user knows the text was cut.
 * Returns an empty string when the input is null/undefined.
 */
export function truncateExcerpt(excerpt: string | null | undefined): string {
  if (!excerpt) return '';
  if (excerpt.length <= EXCERPT_MAX_LENGTH) return excerpt;
  return excerpt.slice(0, EXCERPT_MAX_LENGTH) + '…';
}

/**
 * Map a DeliveryStatus to a short CSS class name used for colour-coding.
 *
 * The class names are intentionally simple so they can be styled in style.css
 * without a CSS-in-JS dependency.
 */
function statusClass(status: DeliveryStatus): string {
  switch (status) {
    case 'delivered':
      return 'status-delivered';
    case 'failed':
      return 'status-failed';
    case 'exhausted':
      return 'status-exhausted';
    case 'pending':
    default:
      return 'status-pending';
  }
}

/**
 * Build the HTML string for a single log entry.
 *
 * Kept as a pure function so it can be unit-tested without a DOM.
 */
export function renderEntry(event: DeliveryEvent): string {
  const ts = formatTimestamp(event.timestamp);
  const httpCode =
    event.httpStatusCode !== null ? String(event.httpStatusCode) : '—';
  const excerpt = truncateExcerpt(event.responseBodyExcerpt);
  const cls = statusClass(event.status);

  // Escape user-supplied strings to prevent XSS.
  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  return `
    <li class="event-log-entry ${cls}" data-event-id="${esc(event.id)}" data-event-type="${esc(event.eventType)}" data-status="${esc(event.status)}" data-timestamp="${esc(event.timestamp)}">
      <span class="entry-timestamp">${esc(ts)}</span>
      <span class="entry-event-type">${esc(event.eventType)}</span>
      <span class="entry-attempt">attempt #${event.attemptNumber}</span>
      <span class="entry-status ${cls}">${esc(event.status)}</span>
      <span class="entry-http-code">HTTP ${esc(httpCode)}</span>
      ${excerpt ? `<span class="entry-excerpt">${esc(excerpt)}</span>` : ''}
    </li>`.trim();
}

/**
 * Mount the EventLog component into the given container element.
 *
 * The component subscribes to the provided store and re-renders the list
 * whenever the store emits an update.
 *
 * @param container - The DOM element that will contain the log.
 * @param store     - The shared DeliveryEventStore instance.
 * @returns An unsubscribe function.  Call it to detach the component from the
 *          store (useful in tests and when unmounting).
 */
export function mountEventLog(
  container: HTMLElement,
  store: DeliveryEventStore,
): () => void {
  // Build the static shell once.
  container.innerHTML = `
    <section class="event-log" aria-label="Webhook delivery event log">
      <h2 class="event-log-title">Delivery Event Log</h2>
      <p class="event-log-order-note">Entries are shown most-recent first.</p>
      <ul class="event-log-list" role="list" aria-live="polite" aria-label="Delivery attempts">
      </ul>
      <p class="event-log-empty" aria-live="polite">No delivery attempts recorded yet.</p>
    </section>
  `.trim();

  const list = container.querySelector<HTMLUListElement>('.event-log-list')!;
  const emptyMsg = container.querySelector<HTMLParagraphElement>('.event-log-empty')!;

  function render(events: DeliveryEvent[]): void {
    if (events.length === 0) {
      list.innerHTML = '';
      emptyMsg.style.display = '';
    } else {
      list.innerHTML = events.map(renderEntry).join('\n');
      emptyMsg.style.display = 'none';
    }
  }

  // subscribe() calls render() immediately with the current event list.
  return store.subscribe(render);
}
