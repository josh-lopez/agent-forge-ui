/**
 * Client-side export of the (filtered) delivery event log.
 *
 * Merchants can send compliance / support teams a targeted dataset matching
 * their current filter selection without manual log extraction. Everything here
 * runs entirely in the browser — no data is ever sent to a server endpoint
 * (spec § "The export is entirely client-side").
 *
 * The module is split into small, pure, individually-testable pieces:
 *   - `composeFilteredEvents` — applies the composed date-range / event-type /
 *     status filters, producing the exact post-filter result set the UI shows.
 *   - `eventsToCsv` — serialises events to RFC-4180-safe CSV.
 *   - `eventsToJson` — serialises events to a JSON array.
 *   - `buildExportFilename` — derives a distinguishable filename from the
 *     active filter context.
 *   - `triggerEventLogExport` — glues the above together and kicks off a
 *     browser download via a Blob + object URL.
 *
 * Spec ref: spec § "Event log filtering" and issue #192.
 */

import { DeliveryEvent } from './delivery-events';
import { filterByEventTypes } from './eventTypeFilter';

/** Machine-readable export formats supported by the exporter. */
export type ExportFormat = 'csv' | 'json';

/**
 * The composed filter state read at export time. Every dimension is optional;
 * an omitted (or empty) dimension means "no filter active" for that dimension,
 * mirroring how the individual filter controls behave.
 */
export interface EventLogFilterState {
  /**
   * Inclusive start of the date range. ISO-8601 string or epoch millis.
   * Entries whose timestamp is exactly equal to the start are included.
   */
  start?: string | number;
  /**
   * Inclusive end of the date range. ISO-8601 string or epoch millis.
   * Entries whose timestamp is exactly equal to the end are included.
   */
  end?: string | number;
  /** Selected event types; empty array = all types (no event-type filter). */
  eventTypes?: string[];
  /** Selected statuses; empty array = all statuses (no status filter). */
  statuses?: DeliveryEvent['status'][];
}

/** Columns exported, in order. Mirrors the columns shown in the event log view. */
export const EVENT_LOG_COLUMNS = [
  'timestamp',
  'eventType',
  'status',
  'httpStatus',
  'responseBodyExcerpt',
] as const;

type EventLogColumn = (typeof EVENT_LOG_COLUMNS)[number];

/** Human-friendly CSV header labels, aligned 1:1 with {@link EVENT_LOG_COLUMNS}. */
export const EVENT_LOG_COLUMN_HEADERS: Record<EventLogColumn, string> = {
  timestamp: 'Timestamp',
  eventType: 'Event Type',
  status: 'Status',
  httpStatus: 'HTTP Status',
  responseBodyExcerpt: 'Response Body Excerpt',
};

// ── Filter composition ────────────────────────────────────────────────────────

function toMillis(value: string | number): number {
  return typeof value === 'number' ? value : Date.parse(value);
}

/**
 * Returns `true` when *any* filter dimension is active. Used to decide whether
 * the filename should carry a filter marker and (indirectly) whether the export
 * is "full" vs "filtered".
 */
export function isFilterActive(filters: EventLogFilterState | undefined): boolean {
  if (!filters) return false;
  const hasDateRange = filters.start !== undefined || filters.end !== undefined;
  const hasTypes = (filters.eventTypes?.length ?? 0) > 0;
  const hasStatuses = (filters.statuses?.length ?? 0) > 0;
  return hasDateRange || hasTypes || hasStatuses;
}

/**
 * Applies the composed filter state to `events`, returning only the entries
 * that would be visible in the filtered view.
 *
 * The dimensions are ANDed together (an entry must satisfy every active
 * dimension). This is the single source of truth for "what the export
 * contains" — callers must never re-derive the visible set independently.
 */
export function composeFilteredEvents(
  events: readonly DeliveryEvent[],
  filters?: EventLogFilterState,
): DeliveryEvent[] {
  let result: DeliveryEvent[] = [...events];

  if (!filters) return result;

  // Date-range (inclusive boundaries).
  const startMs = filters.start !== undefined ? toMillis(filters.start) : undefined;
  const endMs = filters.end !== undefined ? toMillis(filters.end) : undefined;
  if (startMs !== undefined && !Number.isNaN(startMs)) {
    result = result.filter((e) => toMillis(e.timestamp) >= startMs);
  }
  if (endMs !== undefined && !Number.isNaN(endMs)) {
    result = result.filter((e) => toMillis(e.timestamp) <= endMs);
  }

  // Event-type (reuse the shared, tested helper for parity with the log view).
  if (filters.eventTypes && filters.eventTypes.length > 0) {
    result = filterByEventTypes(result, filters.eventTypes);
  }

  // Status.
  if (filters.statuses && filters.statuses.length > 0) {
    const set = new Set(filters.statuses);
    result = result.filter((e) => set.has(e.status));
  }

  return result;
}

// ── Serialisation ─────────────────────────────────────────────────────────────

/**
 * Escapes a single CSV field per RFC 4180: fields containing a comma, double
 * quote, CR or LF are wrapped in double quotes with embedded quotes doubled.
 */
export function escapeCsvField(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serialises delivery events to CSV. Always emits a header row, so an empty
 * event set yields a valid headers-only file rather than an error (AC7).
 */
export function eventsToCsv(events: readonly DeliveryEvent[]): string {
  const header = EVENT_LOG_COLUMNS.map((c) => escapeCsvField(EVENT_LOG_COLUMN_HEADERS[c])).join(',');
  const rows = events.map((e) =>
    EVENT_LOG_COLUMNS.map((c) => escapeCsvField(e[c])).join(','),
  );
  return [header, ...rows].join('\r\n');
}

/**
 * Serialises delivery events to a JSON array (only the exported columns).
 * An empty event set yields a valid `[]` rather than an error (AC7).
 */
export function eventsToJson(events: readonly DeliveryEvent[]): string {
  const projected = events.map((e) => {
    const row: Record<string, unknown> = {};
    for (const c of EVENT_LOG_COLUMNS) row[c] = e[c];
    return row;
  });
  return JSON.stringify(projected, null, 2);
}

/** Serialises `events` in the requested `format`. */
export function serializeEvents(
  events: readonly DeliveryEvent[],
  format: ExportFormat,
): string {
  return format === 'json' ? eventsToJson(events) : eventsToCsv(events);
}

// ── Filename generation ───────────────────────────────────────────────────────

function isoDatePart(value: string | number): string {
  const ms = toMillis(value);
  if (Number.isNaN(ms)) return '';
  // YYYYMMDD portion of the ISO string.
  return new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Builds a distinguishable download filename reflecting the active filter
 * context so multiple exports don't collide (AC6).
 *
 * Examples:
 *   event-log_all_20240115T101500Z.csv                 (no filters)
 *   event-log_20240101-20240131_20240115T101500Z.csv   (date range)
 *   event-log_types-payment-created_...csv             (event-type filter)
 */
export function buildExportFilename(
  filters: EventLogFilterState | undefined,
  format: ExportFormat,
  now: Date = new Date(),
): string {
  const parts: string[] = ['event-log'];

  if (isFilterActive(filters) && filters) {
    if (filters.start !== undefined || filters.end !== undefined) {
      const s = filters.start !== undefined ? isoDatePart(filters.start) : '';
      const e = filters.end !== undefined ? isoDatePart(filters.end) : '';
      parts.push(`${s}-${e}`);
    }
    if (filters.eventTypes && filters.eventTypes.length > 0) {
      const slug = filters.eventTypes
        .map((t) => t.replace(/[^a-zA-Z0-9]+/g, '-'))
        .join('_');
      parts.push(`types-${slug}`);
    }
    if (filters.statuses && filters.statuses.length > 0) {
      parts.push(`status-${filters.statuses.join('-')}`);
    }
  } else {
    parts.push('all');
  }

  // Compact ISO timestamp (YYYYMMDDTHHMMSSZ) keeps the name filesystem-safe and
  // makes repeated exports distinguishable.
  const stamp = now
    .toISOString()
    .replace(/\.\d+Z$/, 'Z') // drop milliseconds
    .replace(/[-:]/g, ''); // strip date/time separators
  parts.push(stamp);

  return `${parts.join('_')}.${format}`;
}

// ── Download trigger ──────────────────────────────────────────────────────────

/** MIME type for each supported format. */
const MIME_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv;charset=utf-8',
  json: 'application/json;charset=utf-8',
};

/** Result of an export, returned for testing / callers that want the payload. */
export interface ExportResult {
  filename: string;
  content: string;
  format: ExportFormat;
  /** Number of event rows exported (excludes the CSV header). */
  count: number;
}

/**
 * Computes the export payload (filtered content + filename) without touching the
 * DOM. Kept separate from {@link triggerEventLogExport} so it is trivially
 * unit-testable and reusable.
 */
export function buildEventLogExport(
  events: readonly DeliveryEvent[],
  filters?: EventLogFilterState,
  format: ExportFormat = 'csv',
  now: Date = new Date(),
): ExportResult {
  const filtered = composeFilteredEvents(events, filters);
  return {
    filename: buildExportFilename(filters, format, now),
    content: serializeEvents(filtered, format),
    format,
    count: filtered.length,
  };
}

/**
 * Performs the client-side download of the export. Uses a Blob + object URL and
 * a programmatic anchor click — no network request is made. Returns the
 * {@link ExportResult} so callers/tests can assert on what was exported.
 *
 * Guarded so it is a safe no-op in non-DOM environments (returns the payload
 * without attempting a download).
 */
export function triggerEventLogExport(
  events: readonly DeliveryEvent[],
  filters?: EventLogFilterState,
  format: ExportFormat = 'csv',
  now: Date = new Date(),
): ExportResult {
  const result = buildEventLogExport(events, filters, format, now);

  if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
    return result;
  }

  const blob = new Blob([result.content], { type: MIME_TYPES[format] });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    if (URL.revokeObjectURL) URL.revokeObjectURL(url);
  }

  return result;
}
