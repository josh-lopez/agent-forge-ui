/**
 * Metrics export module for the webhook delivery metrics dashboard.
 *
 * Provides pure, side-effect-free functions for serialising aggregate metrics
 * to CSV and JSON, plus a browser-side download helper.
 *
 * Spec ref: spec § "Webhook delivery metrics dashboard" and Issue #189
 *           (Build delivery metrics export to CSV or JSON)
 *
 * Design notes:
 *  - All serialisation is synchronous and client-side only (no backend calls).
 *  - The CSV flattening strategy: one row per event type, plus an "overall"
 *    aggregate row.  Columns: eventType, successRate, avgRetryCount,
 *    medianTtd, p95Ttd.  Numeric values are rounded to 4 decimal places.
 *  - The JSON export mirrors the same structure as a plain JS object so it
 *    round-trips cleanly through JSON.parse.
 */

// ── Data model ────────────────────────────────────────────────────────────────

/** Time-to-delivery statistics (milliseconds). */
export interface TtdStats {
  /** Median time from first attempt to first successful delivery (ms). */
  medianMs: number;
  /** 95th-percentile time-to-delivery (ms). */
  p95Ms: number;
}

/** Per-event-type metrics row. */
export interface EventTypeMetrics {
  /** e.g. "payment.created", "refund.issued" */
  eventType: string;
  /** Fraction of delivery attempts that reached `delivered` (0–1). */
  successRate: number;
  /** Mean number of retry attempts for this event type. */
  avgRetryCount: number;
  /** Time-to-delivery statistics for this event type. */
  ttd: TtdStats;
}

/** Full metrics snapshot as displayed on the dashboard. */
export interface MetricsSnapshot {
  /** ISO-8601 timestamp captured at the moment of export. */
  exportedAt: string;
  /** Overall aggregate across all event types. */
  overall: {
    successRate: number;
    avgRetryCount: number;
    ttd: TtdStats;
  };
  /** Per-event-type breakdown. */
  byEventType: EventTypeMetrics[];
}

// ── JSON serialisation ────────────────────────────────────────────────────────

/**
 * Serialise a metrics snapshot to a well-formed JSON string.
 *
 * @param snapshot - The metrics snapshot to serialise.
 * @returns A pretty-printed JSON string.
 */
export function metricsToJson(snapshot: MetricsSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

// ── CSV serialisation ─────────────────────────────────────────────────────────

/** CSV column headers — one row per event type plus an "overall" aggregate. */
const CSV_HEADERS = [
  'eventType',
  'successRate',
  'avgRetryCount',
  'medianTtdMs',
  'p95TtdMs',
] as const;

/**
 * Escape a CSV field value.
 *
 * Per RFC 4180: if the value contains a comma, double-quote, or newline it
 * must be wrapped in double-quotes, and any embedded double-quotes must be
 * doubled.
 */
function escapeCsvField(value: string | number): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/** Round a number to at most 4 decimal places for CSV readability. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Serialise a metrics snapshot to a valid, parseable CSV string with a header
 * row.
 *
 * Layout:
 *   - Header row: eventType, successRate, avgRetryCount, medianTtdMs, p95TtdMs
 *   - One row for the overall aggregate (eventType = "overall")
 *   - One row per event type in byEventType order
 *
 * @param snapshot - The metrics snapshot to serialise.
 * @returns A CSV string (CRLF line endings per RFC 4180).
 */
export function metricsToCsv(snapshot: MetricsSnapshot): string {
  const rows: string[][] = [];

  // Header row
  rows.push([...CSV_HEADERS]);

  // Overall aggregate row
  rows.push([
    'overall',
    String(round4(snapshot.overall.successRate)),
    String(round4(snapshot.overall.avgRetryCount)),
    String(round4(snapshot.overall.ttd.medianMs)),
    String(round4(snapshot.overall.ttd.p95Ms)),
  ]);

  // Per-event-type rows
  for (const row of snapshot.byEventType) {
    rows.push([
      row.eventType,
      String(round4(row.successRate)),
      String(round4(row.avgRetryCount)),
      String(round4(row.ttd.medianMs)),
      String(round4(row.ttd.p95Ms)),
    ]);
  }

  return rows
    .map((fields) => fields.map(escapeCsvField).join(','))
    .join('\r\n');
}

// ── Browser download helper ───────────────────────────────────────────────────

/** Supported export formats. */
export type ExportFormat = 'csv' | 'json';

/**
 * Generate a filename for the exported file.
 *
 * @param format    - 'csv' or 'json'
 * @param timestamp - ISO-8601 string used to derive the timestamp suffix.
 *                    Defaults to the current time.
 * @returns e.g. "webhook-metrics-2024-01-15T10-30-00.csv"
 */
export function buildExportFilename(format: ExportFormat, timestamp?: string): string {
  const ts = (timestamp ?? new Date().toISOString())
    // Replace colons and dots that are invalid in filenames on some OSes.
    .replace(/:/g, '-')
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/Z$/, '');
  return `webhook-metrics-${ts}.${format}`;
}

/**
 * Trigger a browser download of the serialised metrics.
 *
 * Uses the Blob + URL.createObjectURL approach which is supported in all
 * modern browsers.  No server-side call is made.
 *
 * @param snapshot - The metrics snapshot to export.
 * @param format   - 'csv' or 'json'
 */
export function downloadMetrics(snapshot: MetricsSnapshot, format: ExportFormat): void {
  const content = format === 'json' ? metricsToJson(snapshot) : metricsToCsv(snapshot);
  const mimeType = format === 'json' ? 'application/json' : 'text/csv';
  const filename = buildExportFilename(format, snapshot.exportedAt);

  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Release the object URL after a short delay to allow the download to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Export control factory ────────────────────────────────────────────────────

/**
 * Create and return the export control UI element (a container with two
 * buttons: "Export CSV" and "Export JSON").
 *
 * The caller is responsible for appending the returned element to the DOM and
 * for providing a `getSnapshot` callback that returns the current metrics
 * snapshot at the moment the user clicks.
 *
 * @param getSnapshot - Callback invoked on click to obtain the current snapshot.
 * @returns A `<div>` element containing the export buttons.
 */
export function createExportControl(
  getSnapshot: () => MetricsSnapshot,
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'metrics-export-controls';
  container.setAttribute('data-testid', 'metrics-export-controls');

  const label = document.createElement('span');
  label.className = 'metrics-export-label';
  label.textContent = 'Export: ';
  container.appendChild(label);

  for (const format of ['csv', 'json'] as ExportFormat[]) {
    const btn = document.createElement('button');
    btn.className = `metrics-export-btn metrics-export-btn--${format}`;
    btn.setAttribute('data-testid', `export-btn-${format}`);
    btn.textContent = format === 'csv' ? 'Export CSV' : 'Export JSON';
    btn.type = 'button';
    btn.addEventListener('click', () => {
      const snapshot = getSnapshot();
      downloadMetrics(snapshot, format);
    });
    container.appendChild(btn);
  }

  return container;
}
