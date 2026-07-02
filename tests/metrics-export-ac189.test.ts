/**
 * Supplementary unit tests for Issue #189: Metrics export to CSV / JSON.
 *
 * These tests extend the coverage in metrics-export.test.ts with additional
 * scenarios and explicit per-AC assertions to ensure every acceptance criterion
 * is independently verifiable.
 *
 * Acceptance criteria covered:
 *   AC1  – visible Export control present on the metrics dashboard component
 *   AC2  – clicking the control allows choosing between CSV and JSON
 *   AC3  – exported file contains all aggregate metrics (success rate, avg
 *           retry count, median and p95 TTD per event type)
 *   AC4  – exported file reflects data at the moment of export (snapshot)
 *   AC5  – downloaded file has appropriate filename and correct MIME type
 *   AC6  – JSON export is valid, well-formed JSON
 *   AC7  – CSV export is valid, parseable CSV with a header row
 *   AC8  – export works with simulator-produced data
 *   AC9  – no backend call; operation is entirely client-side
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  metricsToJson,
  metricsToCsv,
  buildExportFilename,
  downloadMetrics,
  createExportControl,
  type MetricsSnapshot,
  type ExportFormat,
} from '../src/metricsExport';

// ── Shared fixture ────────────────────────────────────────────────────────────

function makeSnapshot(overrides?: Partial<MetricsSnapshot>): MetricsSnapshot {
  return {
    exportedAt: '2024-06-15T10:30:00.000Z',
    overall: {
      successRate: 0.85,
      avgRetryCount: 1.25,
      ttd: { medianMs: 1200, p95Ms: 8500 },
    },
    byEventType: [
      {
        eventType: 'payment.created',
        successRate: 0.9,
        avgRetryCount: 1.0,
        ttd: { medianMs: 1000, p95Ms: 7000 },
      },
      {
        eventType: 'refund.issued',
        successRate: 0.75,
        avgRetryCount: 1.6,
        ttd: { medianMs: 1500, p95Ms: 10000 },
      },
    ],
    ...overrides,
  };
}

/** Simulator-style snapshot matching the retry schedule in the spec. */
function makeSimulatorSnapshot(): MetricsSnapshot {
  return {
    exportedAt: '2024-06-15T12:00:00.000Z',
    overall: {
      successRate: 0.6,
      avgRetryCount: 2.3,
      // Retry schedule: immediately, 1 min, 5 min, 30 min, 2 h, 8 h
      ttd: { medianMs: 300_000, p95Ms: 28_800_000 },
    },
    byEventType: [
      {
        eventType: 'payment.created',
        successRate: 0.7,
        avgRetryCount: 1.8,
        ttd: { medianMs: 60_000, p95Ms: 7_200_000 },
      },
      {
        eventType: 'refund.issued',
        successRate: 0.5,
        avgRetryCount: 3.0,
        ttd: { medianMs: 1_800_000, p95Ms: 28_800_000 },
      },
      {
        eventType: 'dispute.opened',
        successRate: 0.0,
        avgRetryCount: 5.0,
        ttd: { medianMs: 0, p95Ms: 0 },
      },
    ],
  };
}

// ── AC1: Visible Export control ───────────────────────────────────────────────

describe('AC1 – visible Export control', () => {
  it('createExportControl returns a non-null HTMLElement', () => {
    const ctrl = createExportControl(() => makeSnapshot());
    expect(ctrl).not.toBeNull();
    expect(ctrl).toBeInstanceOf(HTMLElement);
  });

  it('control element has a recognisable class name for styling', () => {
    const ctrl = createExportControl(() => makeSnapshot());
    expect(ctrl.className).toContain('metrics-export');
  });

  it('control contains at least one button element', () => {
    const ctrl = createExportControl(() => makeSnapshot());
    const buttons = ctrl.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('control has data-testid attribute for test/automation targeting', () => {
    const ctrl = createExportControl(() => makeSnapshot());
    expect(ctrl.getAttribute('data-testid')).toBeTruthy();
  });
});

// ── AC2: Format choice (CSV and JSON) ─────────────────────────────────────────

describe('AC2 – format choice', () => {
  it('control exposes a CSV export button', () => {
    const ctrl = createExportControl(() => makeSnapshot());
    const csvBtn = ctrl.querySelector('[data-testid="export-btn-csv"]');
    expect(csvBtn).not.toBeNull();
  });

  it('control exposes a JSON export button', () => {
    const ctrl = createExportControl(() => makeSnapshot());
    const jsonBtn = ctrl.querySelector('[data-testid="export-btn-json"]');
    expect(jsonBtn).not.toBeNull();
  });

  it('CSV button label mentions "CSV"', () => {
    const ctrl = createExportControl(() => makeSnapshot());
    const csvBtn = ctrl.querySelector('[data-testid="export-btn-csv"]')!;
    expect(csvBtn.textContent).toMatch(/csv/i);
  });

  it('JSON button label mentions "JSON"', () => {
    const ctrl = createExportControl(() => makeSnapshot());
    const jsonBtn = ctrl.querySelector('[data-testid="export-btn-json"]')!;
    expect(jsonBtn.textContent).toMatch(/json/i);
  });

  it('both buttons are of type="button" (not submit)', () => {
    const ctrl = createExportControl(() => makeSnapshot());
    const buttons = ctrl.querySelectorAll<HTMLButtonElement>('button');
    buttons.forEach((btn) => {
      expect(btn.type).toBe('button');
    });
  });
});

// ── AC3: All aggregate metrics present in export ──────────────────────────────

describe('AC3 – all aggregate metrics in JSON export', () => {
  it('JSON contains overall.successRate', () => {
    const snap = makeSnapshot();
    const parsed = JSON.parse(metricsToJson(snap)) as MetricsSnapshot;
    expect(typeof parsed.overall.successRate).toBe('number');
    expect(parsed.overall.successRate).toBe(0.85);
  });

  it('JSON contains overall.avgRetryCount', () => {
    const snap = makeSnapshot();
    const parsed = JSON.parse(metricsToJson(snap)) as MetricsSnapshot;
    expect(typeof parsed.overall.avgRetryCount).toBe('number');
    expect(parsed.overall.avgRetryCount).toBe(1.25);
  });

  it('JSON contains overall.ttd.medianMs', () => {
    const snap = makeSnapshot();
    const parsed = JSON.parse(metricsToJson(snap)) as MetricsSnapshot;
    expect(parsed.overall.ttd.medianMs).toBe(1200);
  });

  it('JSON contains overall.ttd.p95Ms', () => {
    const snap = makeSnapshot();
    const parsed = JSON.parse(metricsToJson(snap)) as MetricsSnapshot;
    expect(parsed.overall.ttd.p95Ms).toBe(8500);
  });

  it('JSON contains per-event-type successRate', () => {
    const snap = makeSnapshot();
    const parsed = JSON.parse(metricsToJson(snap)) as MetricsSnapshot;
    const ri = parsed.byEventType.find((r) => r.eventType === 'refund.issued');
    expect(ri).toBeDefined();
    expect(ri!.successRate).toBe(0.75);
  });

  it('JSON contains per-event-type avgRetryCount', () => {
    const snap = makeSnapshot();
    const parsed = JSON.parse(metricsToJson(snap)) as MetricsSnapshot;
    const ri = parsed.byEventType.find((r) => r.eventType === 'refund.issued');
    expect(ri!.avgRetryCount).toBe(1.6);
  });

  it('JSON contains per-event-type ttd.medianMs', () => {
    const snap = makeSnapshot();
    const parsed = JSON.parse(metricsToJson(snap)) as MetricsSnapshot;
    const ri = parsed.byEventType.find((r) => r.eventType === 'refund.issued');
    expect(ri!.ttd.medianMs).toBe(1500);
  });

  it('JSON contains per-event-type ttd.p95Ms', () => {
    const snap = makeSnapshot();
    const parsed = JSON.parse(metricsToJson(snap)) as MetricsSnapshot;
    const ri = parsed.byEventType.find((r) => r.eventType === 'refund.issued');
    expect(ri!.ttd.p95Ms).toBe(10000);
  });
});

describe('AC3 – all aggregate metrics in CSV export', () => {
  it('CSV overall row contains successRate', () => {
    const csv = metricsToCsv(makeSnapshot());
    const overallRow = csv.split('\r\n')[1];
    const fields = overallRow.split(',');
    expect(parseFloat(fields[1])).toBeCloseTo(0.85, 4);
  });

  it('CSV overall row contains avgRetryCount', () => {
    const csv = metricsToCsv(makeSnapshot());
    const overallRow = csv.split('\r\n')[1];
    const fields = overallRow.split(',');
    expect(parseFloat(fields[2])).toBeCloseTo(1.25, 4);
  });

  it('CSV overall row contains medianTtdMs', () => {
    const csv = metricsToCsv(makeSnapshot());
    const overallRow = csv.split('\r\n')[1];
    const fields = overallRow.split(',');
    expect(parseFloat(fields[3])).toBeCloseTo(1200, 0);
  });

  it('CSV overall row contains p95TtdMs', () => {
    const csv = metricsToCsv(makeSnapshot());
    const overallRow = csv.split('\r\n')[1];
    const fields = overallRow.split(',');
    expect(parseFloat(fields[4])).toBeCloseTo(8500, 0);
  });

  it('CSV per-event-type row contains all five columns', () => {
    const csv = metricsToCsv(makeSnapshot());
    const lines = csv.split('\r\n');
    // Row 2 = payment.created
    const fields = lines[2].split(',');
    expect(fields).toHaveLength(5);
    expect(fields[0]).toBe('payment.created');
    expect(isNaN(parseFloat(fields[1]))).toBe(false);
    expect(isNaN(parseFloat(fields[2]))).toBe(false);
    expect(isNaN(parseFloat(fields[3]))).toBe(false);
    expect(isNaN(parseFloat(fields[4]))).toBe(false);
  });
});

// ── AC4: Snapshot semantics ───────────────────────────────────────────────────

describe('AC4 – snapshot semantics', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.unstubAllGlobals();
  });

  it('getSnapshot is invoked at click time, not at control-creation time', () => {
    const getSnapshot = vi.fn(() => makeSnapshot());
    const ctrl = createExportControl(getSnapshot);
    container.appendChild(ctrl);

    // Not called yet
    expect(getSnapshot).not.toHaveBeenCalled();

    ctrl.querySelector<HTMLButtonElement>('[data-testid="export-btn-csv"]')!.click();
    expect(getSnapshot).toHaveBeenCalledTimes(1);
  });

  it('each button click invokes getSnapshot independently', () => {
    const getSnapshot = vi.fn(() => makeSnapshot());
    const ctrl = createExportControl(getSnapshot);
    container.appendChild(ctrl);

    ctrl.querySelector<HTMLButtonElement>('[data-testid="export-btn-csv"]')!.click();
    ctrl.querySelector<HTMLButtonElement>('[data-testid="export-btn-json"]')!.click();

    expect(getSnapshot).toHaveBeenCalledTimes(2);
  });

  it('exportedAt in JSON output matches the snapshot timestamp', () => {
    const ts = '2024-12-31T23:59:59.000Z';
    const snap = makeSnapshot({ exportedAt: ts });
    const parsed = JSON.parse(metricsToJson(snap)) as MetricsSnapshot;
    expect(parsed.exportedAt).toBe(ts);
  });

  it('mutating the original snapshot after serialisation does not affect JSON output', () => {
    const snap = makeSnapshot();
    const json = metricsToJson(snap);
    // Mutate after serialisation
    snap.overall.successRate = 0.0;
    const parsed = JSON.parse(json) as MetricsSnapshot;
    // JSON was captured before mutation
    expect(parsed.overall.successRate).toBe(0.85);
  });
});

// ── AC5: Filename and MIME type ───────────────────────────────────────────────

describe('AC5 – filename and MIME type', () => {
  it('buildExportFilename produces webhook-metrics-<timestamp>.csv', () => {
    const name = buildExportFilename('csv', '2024-06-15T10:30:00.000Z');
    expect(name).toMatch(/^webhook-metrics-.+\.csv$/);
  });

  it('buildExportFilename produces webhook-metrics-<timestamp>.json', () => {
    const name = buildExportFilename('json', '2024-06-15T10:30:00.000Z');
    expect(name).toMatch(/^webhook-metrics-.+\.json$/);
  });

  it('filename contains a timestamp-derived segment', () => {
    const name = buildExportFilename('csv', '2024-06-15T10:30:00.000Z');
    // Should contain the date portion
    expect(name).toContain('2024-06-15');
  });

  it('filename has no colon characters (OS-safe)', () => {
    const name = buildExportFilename('json', '2024-06-15T10:30:00.000Z');
    expect(name).not.toContain(':');
  });

  it('downloadMetrics creates a Blob with text/csv MIME type for CSV', () => {
    const blobSpy = vi.spyOn(globalThis, 'Blob').mockImplementation(
      (parts, opts) => ({ parts, opts } as unknown as Blob),
    );
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });

    downloadMetrics(makeSnapshot(), 'csv');

    expect(blobSpy).toHaveBeenCalledOnce();
    const [, opts] = blobSpy.mock.calls[0];
    expect((opts as BlobPropertyBag).type).toMatch(/text\/csv/);

    blobSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('downloadMetrics creates a Blob with application/json MIME type for JSON', () => {
    const blobSpy = vi.spyOn(globalThis, 'Blob').mockImplementation(
      (parts, opts) => ({ parts, opts } as unknown as Blob),
    );
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });

    downloadMetrics(makeSnapshot(), 'json');

    expect(blobSpy).toHaveBeenCalledOnce();
    const [, opts] = blobSpy.mock.calls[0];
    expect((opts as BlobPropertyBag).type).toMatch(/application\/json/);

    blobSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('downloadMetrics sets anchor.download to the generated filename', () => {
    const anchors: HTMLAnchorElement[] = [];
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') anchors.push(el as HTMLAnchorElement);
      return el;
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });

    const snap = makeSnapshot();
    downloadMetrics(snap, 'csv');

    expect(anchors.length).toBeGreaterThanOrEqual(1);
    const anchor = anchors[anchors.length - 1];
    expect(anchor.download).toMatch(/^webhook-metrics-.+\.csv$/);

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});

// ── AC6: Valid JSON ───────────────────────────────────────────────────────────

describe('AC6 – valid JSON output', () => {
  it('metricsToJson output parses without throwing', () => {
    expect(() => JSON.parse(metricsToJson(makeSnapshot()))).not.toThrow();
  });

  it('JSON output is pretty-printed (contains newlines)', () => {
    const json = metricsToJson(makeSnapshot());
    expect(json).toContain('\n');
  });

  it('JSON output starts with "{" and ends with "}"', () => {
    const json = metricsToJson(makeSnapshot()).trim();
    expect(json.startsWith('{')).toBe(true);
    expect(json.endsWith('}')).toBe(true);
  });

  it('JSON preserves floating-point precision for successRate', () => {
    const snap = makeSnapshot({
      overall: { successRate: 0.123456789, avgRetryCount: 0, ttd: { medianMs: 0, p95Ms: 0 } },
      byEventType: [],
    });
    const parsed = JSON.parse(metricsToJson(snap)) as MetricsSnapshot;
    expect(parsed.overall.successRate).toBeCloseTo(0.123456789, 6);
  });

  it('JSON output for empty byEventType is an empty array, not null', () => {
    const snap = makeSnapshot({
      overall: { successRate: 0, avgRetryCount: 0, ttd: { medianMs: 0, p95Ms: 0 } },
      byEventType: [],
    });
    const parsed = JSON.parse(metricsToJson(snap)) as MetricsSnapshot;
    expect(Array.isArray(parsed.byEventType)).toBe(true);
    expect(parsed.byEventType).toHaveLength(0);
  });
});

// ── AC7: Valid CSV ────────────────────────────────────────────────────────────

describe('AC7 – valid CSV output', () => {
  it('first line is the header row', () => {
    const csv = metricsToCsv(makeSnapshot());
    const firstLine = csv.split('\r\n')[0];
    expect(firstLine).toBe('eventType,successRate,avgRetryCount,medianTtdMs,p95TtdMs');
  });

  it('header has exactly 5 columns', () => {
    const csv = metricsToCsv(makeSnapshot());
    const headerFields = csv.split('\r\n')[0].split(',');
    expect(headerFields).toHaveLength(5);
  });

  it('all data rows have the same number of columns as the header', () => {
    const csv = metricsToCsv(makeSnapshot());
    const lines = csv.split('\r\n');
    const headerCount = lines[0].split(',').length;
    // Skip header; check all data rows (simple split — no embedded commas in fixture)
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i].split(',').length).toBe(headerCount);
    }
  });

  it('uses CRLF (\\r\\n) line endings throughout', () => {
    const csv = metricsToCsv(makeSnapshot());
    // Strip all CRLF; no bare LF should remain
    const stripped = csv.replace(/\r\n/g, '');
    expect(stripped.includes('\n')).toBe(false);
  });

  it('numeric fields are parseable as floats', () => {
    const csv = metricsToCsv(makeSnapshot());
    const lines = csv.split('\r\n');
    // Check every data row (skip header)
    for (let i = 1; i < lines.length; i++) {
      const fields = lines[i].split(',');
      // Columns 1-4 must be numeric
      for (let col = 1; col <= 4; col++) {
        expect(isNaN(parseFloat(fields[col]))).toBe(false);
      }
    }
  });

  it('event type field containing a newline is quoted', () => {
    const snap = makeSnapshot({
      byEventType: [
        {
          eventType: 'event\nwith\nnewlines',
          successRate: 1,
          avgRetryCount: 0,
          ttd: { medianMs: 100, p95Ms: 200 },
        },
      ],
    });
    const csv = metricsToCsv(snap);
    expect(csv).toContain('"event\nwith\nnewlines"');
  });
});

// ── AC8: Simulator compatibility ──────────────────────────────────────────────

describe('AC8 – simulator compatibility', () => {
  it('simulator snapshot serialises to valid JSON', () => {
    const snap = makeSimulatorSnapshot();
    expect(() => JSON.parse(metricsToJson(snap))).not.toThrow();
  });

  it('simulator JSON preserves all three event types', () => {
    const snap = makeSimulatorSnapshot();
    const parsed = JSON.parse(metricsToJson(snap)) as MetricsSnapshot;
    expect(parsed.byEventType).toHaveLength(3);
    const types = parsed.byEventType.map((r) => r.eventType);
    expect(types).toContain('payment.created');
    expect(types).toContain('refund.issued');
    expect(types).toContain('dispute.opened');
  });

  it('simulator CSV has correct row count (header + overall + 3 event types)', () => {
    const snap = makeSimulatorSnapshot();
    const csv = metricsToCsv(snap);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(5); // header + overall + 3
  });

  it('simulator exhausted event type (successRate=0) serialises correctly in CSV', () => {
    const snap = makeSimulatorSnapshot();
    const csv = metricsToCsv(snap);
    const lines = csv.split('\r\n');
    const disputeRow = lines.find((l) => l.startsWith('dispute.opened,'));
    expect(disputeRow).toBeDefined();
    const fields = disputeRow!.split(',');
    expect(parseFloat(fields[1])).toBe(0); // successRate = 0
    expect(parseFloat(fields[2])).toBe(5); // avgRetryCount = 5
  });

  it('simulator large TTD values (hours in ms) round-trip through JSON', () => {
    const snap = makeSimulatorSnapshot();
    const parsed = JSON.parse(metricsToJson(snap)) as MetricsSnapshot;
    // 8 hours = 28,800,000 ms
    expect(parsed.overall.ttd.p95Ms).toBe(28_800_000);
  });

  it('simulator large TTD values appear correctly in CSV', () => {
    const snap = makeSimulatorSnapshot();
    const csv = metricsToCsv(snap);
    const lines = csv.split('\r\n');
    const refundRow = lines.find((l) => l.startsWith('refund.issued,'));
    expect(refundRow).toBeDefined();
    const fields = refundRow!.split(',');
    // p95TtdMs = 28,800,000
    expect(parseFloat(fields[4])).toBe(28_800_000);
  });

  it('buildExportFilename works with simulator exportedAt timestamp', () => {
    const snap = makeSimulatorSnapshot();
    const csvName = buildExportFilename('csv', snap.exportedAt);
    const jsonName = buildExportFilename('json', snap.exportedAt);
    expect(csvName).toMatch(/^webhook-metrics-.+\.csv$/);
    expect(jsonName).toMatch(/^webhook-metrics-.+\.json$/);
    expect(csvName).not.toContain(':');
    expect(jsonName).not.toContain(':');
  });
});

// ── AC9: No backend call ──────────────────────────────────────────────────────

describe('AC9 – entirely client-side, no backend call', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('downloadMetrics does not call fetch', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });

    downloadMetrics(makeSnapshot(), 'csv');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('downloadMetrics does not call XMLHttpRequest', () => {
    const xhrSpy = vi.fn();
    vi.stubGlobal('XMLHttpRequest', xhrSpy);
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });

    downloadMetrics(makeSnapshot(), 'json');
    expect(xhrSpy).not.toHaveBeenCalled();
  });

  it('downloadMetrics uses URL.createObjectURL (Blob-based download)', () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    downloadMetrics(makeSnapshot(), 'csv');
    expect(createObjectURL).toHaveBeenCalledOnce();
  });

  it('clicking CSV export button does not call fetch', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });

    const ctrl = createExportControl(() => makeSnapshot());
    container.appendChild(ctrl);
    ctrl.querySelector<HTMLButtonElement>('[data-testid="export-btn-csv"]')!.click();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('clicking JSON export button does not call fetch', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });

    const ctrl = createExportControl(() => makeSnapshot());
    container.appendChild(ctrl);
    ctrl.querySelector<HTMLButtonElement>('[data-testid="export-btn-json"]')!.click();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('metricsToJson is a pure function with no side effects', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const snap = makeSnapshot();
    metricsToJson(snap);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('metricsToCsv is a pure function with no side effects', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const snap = makeSnapshot();
    metricsToCsv(snap);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
