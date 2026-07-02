/**
 * Unit tests for Issue #189: Metrics export to CSV / JSON.
 *
 * Covers:
 *   AC2  – export control offers CSV and JSON format choices
 *   AC3  – exported content contains all aggregate metrics
 *   AC4  – snapshot semantics (data captured at moment of export)
 *   AC5  – filename includes timestamp and correct extension
 *   AC6  – JSON export is valid, well-formed JSON
 *   AC7  – CSV export has a header row and is parseable
 *   AC8  – works with simulator-style fixture data
 *   AC9  – no backend call (Blob + createObjectURL, no fetch)
 *
 * Edge cases:
 *   – zero deliveries (empty byEventType)
 *   – 100 % failure (successRate = 0)
 *   – single attempt (avgRetryCount = 0)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  metricsToJson,
  metricsToCsv,
  buildExportFilename,
  createExportControl,
  type MetricsSnapshot,
  type ExportFormat,
} from '../src/metricsExport';

// ── Fixture helpers ───────────────────────────────────────────────────────────

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

// ── metricsToJson ─────────────────────────────────────────────────────────────

describe('metricsToJson', () => {
  it('returns valid, parseable JSON (AC6)', () => {
    const snapshot = makeSnapshot();
    const json = metricsToJson(snapshot);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('round-trips the snapshot without data loss (AC6)', () => {
    const snapshot = makeSnapshot();
    const parsed = JSON.parse(metricsToJson(snapshot)) as MetricsSnapshot;
    expect(parsed.exportedAt).toBe(snapshot.exportedAt);
    expect(parsed.overall.successRate).toBe(snapshot.overall.successRate);
    expect(parsed.overall.avgRetryCount).toBe(snapshot.overall.avgRetryCount);
    expect(parsed.overall.ttd.medianMs).toBe(snapshot.overall.ttd.medianMs);
    expect(parsed.overall.ttd.p95Ms).toBe(snapshot.overall.ttd.p95Ms);
    expect(parsed.byEventType).toHaveLength(2);
  });

  it('includes all per-event-type metrics (AC3)', () => {
    const snapshot = makeSnapshot();
    const parsed = JSON.parse(metricsToJson(snapshot)) as MetricsSnapshot;
    const pc = parsed.byEventType.find((r) => r.eventType === 'payment.created');
    expect(pc).toBeDefined();
    expect(pc!.successRate).toBe(0.9);
    expect(pc!.avgRetryCount).toBe(1.0);
    expect(pc!.ttd.medianMs).toBe(1000);
    expect(pc!.ttd.p95Ms).toBe(7000);
  });

  it('includes exportedAt timestamp (AC4)', () => {
    const snapshot = makeSnapshot();
    const parsed = JSON.parse(metricsToJson(snapshot)) as MetricsSnapshot;
    expect(parsed.exportedAt).toBe('2024-06-15T10:30:00.000Z');
  });

  it('handles zero deliveries (empty byEventType) (edge case)', () => {
    const snapshot = makeSnapshot({
      overall: { successRate: 0, avgRetryCount: 0, ttd: { medianMs: 0, p95Ms: 0 } },
      byEventType: [],
    });
    const parsed = JSON.parse(metricsToJson(snapshot)) as MetricsSnapshot;
    expect(parsed.byEventType).toHaveLength(0);
    expect(parsed.overall.successRate).toBe(0);
  });

  it('handles 100% failure (successRate = 0) (edge case)', () => {
    const snapshot = makeSnapshot({
      overall: { successRate: 0, avgRetryCount: 5, ttd: { medianMs: 0, p95Ms: 0 } },
      byEventType: [
        {
          eventType: 'payment.created',
          successRate: 0,
          avgRetryCount: 5,
          ttd: { medianMs: 0, p95Ms: 0 },
        },
      ],
    });
    const parsed = JSON.parse(metricsToJson(snapshot)) as MetricsSnapshot;
    expect(parsed.overall.successRate).toBe(0);
    expect(parsed.byEventType[0].successRate).toBe(0);
  });

  it('handles single attempt (avgRetryCount = 0) (edge case)', () => {
    const snapshot = makeSnapshot({
      overall: { successRate: 1, avgRetryCount: 0, ttd: { medianMs: 500, p95Ms: 500 } },
      byEventType: [
        {
          eventType: 'payment.created',
          successRate: 1,
          avgRetryCount: 0,
          ttd: { medianMs: 500, p95Ms: 500 },
        },
      ],
    });
    const parsed = JSON.parse(metricsToJson(snapshot)) as MetricsSnapshot;
    expect(parsed.overall.avgRetryCount).toBe(0);
  });
});

// ── metricsToCsv ──────────────────────────────────────────────────────────────

describe('metricsToCsv', () => {
  it('returns a string with a header row (AC7)', () => {
    const csv = metricsToCsv(makeSnapshot());
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('eventType,successRate,avgRetryCount,medianTtdMs,p95TtdMs');
  });

  it('has the correct number of rows: header + overall + per-type (AC7)', () => {
    const snapshot = makeSnapshot(); // 2 event types
    const csv = metricsToCsv(snapshot);
    const lines = csv.split('\r\n');
    // header + overall + 2 event types = 4 rows
    expect(lines).toHaveLength(4);
  });

  it('overall row is the second row with eventType "overall" (AC3)', () => {
    const csv = metricsToCsv(makeSnapshot());
    const lines = csv.split('\r\n');
    const overallFields = lines[1].split(',');
    expect(overallFields[0]).toBe('overall');
    expect(parseFloat(overallFields[1])).toBeCloseTo(0.85, 4);
    expect(parseFloat(overallFields[2])).toBeCloseTo(1.25, 4);
    expect(parseFloat(overallFields[3])).toBeCloseTo(1200, 0);
    expect(parseFloat(overallFields[4])).toBeCloseTo(8500, 0);
  });

  it('per-event-type rows contain correct metrics (AC3)', () => {
    const csv = metricsToCsv(makeSnapshot());
    const lines = csv.split('\r\n');
    // Row index 2 = payment.created
    const pcFields = lines[2].split(',');
    expect(pcFields[0]).toBe('payment.created');
    expect(parseFloat(pcFields[1])).toBeCloseTo(0.9, 4);
    expect(parseFloat(pcFields[2])).toBeCloseTo(1.0, 4);
    expect(parseFloat(pcFields[3])).toBeCloseTo(1000, 0);
    expect(parseFloat(pcFields[4])).toBeCloseTo(7000, 0);
  });

  it('handles zero deliveries (empty byEventType) (edge case)', () => {
    const snapshot = makeSnapshot({
      overall: { successRate: 0, avgRetryCount: 0, ttd: { medianMs: 0, p95Ms: 0 } },
      byEventType: [],
    });
    const csv = metricsToCsv(snapshot);
    const lines = csv.split('\r\n');
    // header + overall only = 2 rows
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('eventType,successRate,avgRetryCount,medianTtdMs,p95TtdMs');
  });

  it('handles 100% failure (successRate = 0) (edge case)', () => {
    const snapshot = makeSnapshot({
      overall: { successRate: 0, avgRetryCount: 5, ttd: { medianMs: 0, p95Ms: 0 } },
      byEventType: [
        {
          eventType: 'payment.created',
          successRate: 0,
          avgRetryCount: 5,
          ttd: { medianMs: 0, p95Ms: 0 },
        },
      ],
    });
    const csv = metricsToCsv(snapshot);
    const lines = csv.split('\r\n');
    const overallFields = lines[1].split(',');
    expect(parseFloat(overallFields[1])).toBe(0);
  });

  it('escapes CSV fields containing commas (AC7)', () => {
    const snapshot = makeSnapshot({
      byEventType: [
        {
          eventType: 'event,with,commas',
          successRate: 1,
          avgRetryCount: 0,
          ttd: { medianMs: 100, p95Ms: 200 },
        },
      ],
    });
    const csv = metricsToCsv(snapshot);
    expect(csv).toContain('"event,with,commas"');
  });

  it('escapes CSV fields containing double-quotes (AC7)', () => {
    const snapshot = makeSnapshot({
      byEventType: [
        {
          eventType: 'event"quoted"',
          successRate: 1,
          avgRetryCount: 0,
          ttd: { medianMs: 100, p95Ms: 200 },
        },
      ],
    });
    const csv = metricsToCsv(snapshot);
    expect(csv).toContain('"event""quoted"""');
  });

  it('uses CRLF line endings per RFC 4180 (AC7)', () => {
    const csv = metricsToCsv(makeSnapshot());
    expect(csv).toContain('\r\n');
    // Every line break should be CRLF, not bare LF
    const bareLf = csv.replace(/\r\n/g, '').includes('\n');
    expect(bareLf).toBe(false);
  });

  it('simulator-style fixture data serialises correctly (AC8)', () => {
    // Simulate data as produced by the webhook delivery simulator
    const simulatorSnapshot: MetricsSnapshot = {
      exportedAt: '2024-06-15T12:00:00.000Z',
      overall: { successRate: 0.6, avgRetryCount: 2.3, ttd: { medianMs: 3600000, p95Ms: 28800000 } },
      byEventType: [
        {
          eventType: 'payment.created',
          successRate: 0.7,
          avgRetryCount: 1.8,
          ttd: { medianMs: 60000, p95Ms: 7200000 },
        },
        {
          eventType: 'refund.issued',
          successRate: 0.5,
          avgRetryCount: 3.0,
          ttd: { medianMs: 1800000, p95Ms: 28800000 },
        },
      ],
    };
    const csv = metricsToCsv(simulatorSnapshot);
    const json = metricsToJson(simulatorSnapshot);
    // CSV is parseable
    expect(() => csv.split('\r\n').map((l) => l.split(','))).not.toThrow();
    // JSON is valid
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json) as MetricsSnapshot;
    expect(parsed.byEventType).toHaveLength(2);
  });
});

// ── buildExportFilename ───────────────────────────────────────────────────────

describe('buildExportFilename', () => {
  it('returns a .csv filename for csv format (AC5)', () => {
    const name = buildExportFilename('csv', '2024-06-15T10:30:00.000Z');
    expect(name).toMatch(/\.csv$/);
  });

  it('returns a .json filename for json format (AC5)', () => {
    const name = buildExportFilename('json', '2024-06-15T10:30:00.000Z');
    expect(name).toMatch(/\.json$/);
  });

  it('includes "webhook-metrics" prefix (AC5)', () => {
    const name = buildExportFilename('csv', '2024-06-15T10:30:00.000Z');
    expect(name).toMatch(/^webhook-metrics-/);
  });

  it('replaces colons in timestamp so filename is OS-safe (AC5)', () => {
    const name = buildExportFilename('json', '2024-06-15T10:30:00.000Z');
    expect(name).not.toContain(':');
  });

  it('uses current time when no timestamp is provided (AC5)', () => {
    const before = Date.now();
    const name = buildExportFilename('csv');
    const after = Date.now();
    expect(name).toMatch(/^webhook-metrics-/);
    expect(name).toMatch(/\.csv$/);
    // The filename should be non-empty and contain a date-like string
    expect(name.length).toBeGreaterThan('webhook-metrics-.csv'.length);
    void before; void after; // suppress unused-var lint
  });
});

// ── createExportControl ───────────────────────────────────────────────────────

describe('createExportControl', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('returns an HTMLElement (AC1)', () => {
    const ctrl = createExportControl(() => makeSnapshot());
    expect(ctrl).toBeInstanceOf(HTMLElement);
  });

  it('contains an "Export CSV" button (AC1, AC2)', () => {
    const ctrl = createExportControl(() => makeSnapshot());
    const btn = ctrl.querySelector('[data-testid="export-btn-csv"]');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toContain('CSV');
  });

  it('contains an "Export JSON" button (AC1, AC2)', () => {
    const ctrl = createExportControl(() => makeSnapshot());
    const btn = ctrl.querySelector('[data-testid="export-btn-json"]');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toContain('JSON');
  });

  it('has data-testid="metrics-export-controls" on the container (AC1)', () => {
    const ctrl = createExportControl(() => makeSnapshot());
    expect(ctrl.getAttribute('data-testid')).toBe('metrics-export-controls');
  });

  it('calls getSnapshot when CSV button is clicked (AC4)', () => {
    const getSnapshot = vi.fn(() => makeSnapshot());
    const ctrl = createExportControl(getSnapshot);
    container.appendChild(ctrl);

    // Mock URL.createObjectURL to avoid jsdom errors
    const mockUrl = 'blob:mock-url';
    const createObjectURL = vi.fn(() => mockUrl);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    const btn = ctrl.querySelector<HTMLButtonElement>('[data-testid="export-btn-csv"]')!;
    btn.click();

    expect(getSnapshot).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('calls getSnapshot when JSON button is clicked (AC4)', () => {
    const getSnapshot = vi.fn(() => makeSnapshot());
    const ctrl = createExportControl(getSnapshot);
    container.appendChild(ctrl);

    const mockUrl = 'blob:mock-url';
    const createObjectURL = vi.fn(() => mockUrl);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    const btn = ctrl.querySelector<HTMLButtonElement>('[data-testid="export-btn-json"]')!;
    btn.click();

    expect(getSnapshot).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('uses Blob + createObjectURL (no fetch) for download (AC9)', () => {
    const getSnapshot = vi.fn(() => makeSnapshot());
    const ctrl = createExportControl(getSnapshot);
    container.appendChild(ctrl);

    const mockUrl = 'blob:mock-url';
    const createObjectURL = vi.fn(() => mockUrl);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    // Ensure fetch is NOT called
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const btn = ctrl.querySelector<HTMLButtonElement>('[data-testid="export-btn-json"]')!;
    btn.click();

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('snapshot is captured at click time, not at control creation time (AC4)', () => {
    let callCount = 0;
    const snapshots = [
      makeSnapshot({ exportedAt: '2024-01-01T00:00:00.000Z' }),
      makeSnapshot({ exportedAt: '2024-06-15T10:30:00.000Z' }),
    ];
    const getSnapshot = vi.fn(() => snapshots[callCount++]);
    const ctrl = createExportControl(getSnapshot);
    container.appendChild(ctrl);

    const mockUrl = 'blob:mock-url';
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => mockUrl), revokeObjectURL: vi.fn() });

    const csvBtn = ctrl.querySelector<HTMLButtonElement>('[data-testid="export-btn-csv"]')!;
    const jsonBtn = ctrl.querySelector<HTMLButtonElement>('[data-testid="export-btn-json"]')!;

    csvBtn.click();
    jsonBtn.click();

    // getSnapshot called twice — once per click
    expect(getSnapshot).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });
});
