// Extended component-level tests for MetricsDashboard (Issue #95).
//
// These tests provide additional coverage of the acceptance criteria with
// extra edge cases and explicit per-AC assertions, complementing the
// primary test harness (metrics_dashboard_test.mjs).
//
// Run via tests/test_issue95_metrics_dashboard_extended.sh, which compiles
// the TypeScript sources and sets DASHBOARD_DIST.

import assert from 'node:assert/strict';

// ── Minimal DOM shim ─────────────────────────────────────────────────────────
class FakeElement {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.className = '';
    this._textContent = '';
    this.hidden = false;
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  set textContent(value) {
    this._textContent = value == null ? '' : String(value);
    this.children = [];
  }
  get textContent() {
    if (this.children.length === 0) return this._textContent;
    return this.children.map((c) => c.textContent).join('');
  }
  _find(predicate) {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const found = child._find(predicate);
      if (found) return found;
    }
    return null;
  }
  queryByTestId(id) {
    return this._find((el) => el.dataset && el.dataset.testid === id);
  }
}

globalThis.document = {
  createElement: (tag) => new FakeElement(tag),
};

// ── Load compiled component ──────────────────────────────────────────────────
const dist = process.env.DASHBOARD_DIST;
assert.ok(dist, 'DASHBOARD_DIST env var must point at compiled output');

const metrics = await import(`${dist}/metrics.js`);
const { MetricsDashboard, mountMetricsDashboard } = await import(`${dist}/MetricsDashboard.js`);
const {
  calculateMetrics,
  formatSuccessRate,
  formatAverageRetryCount,
  formatTimeToDelivery,
} = metrics;

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    pass += 1;
  } catch (err) {
    console.log(`FAIL: ${name}\n      ${err && err.message}`);
    fail += 1;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const delivered = (timeToDeliveryMs, attempts) => ({
  status: 'delivered',
  attempts,
  timeToDeliveryMs,
  timestamp: '2026-01-01T00:00:00.000Z',
  httpStatus: 200,
  responseBody: 'OK',
});

// ── AC1: component renders all three aggregate stat nodes ────────────────────
check('AC1 – all three stat nodes are present in the rendered element', () => {
  const dash = new MetricsDashboard({ events: [delivered(1000, 1)] });
  const successNode = dash.element.queryByTestId('metric-success-rate');
  const retryNode = dash.element.queryByTestId('metric-average-retries');
  const ttdNode = dash.element.queryByTestId('metric-time-to-delivery');
  assert.ok(successNode, 'metric-success-rate node must exist');
  assert.ok(retryNode, 'metric-average-retries node must exist');
  assert.ok(ttdNode, 'metric-time-to-delivery node must exist');
  // All three must have non-empty text when events are present.
  assert.ok(successNode.textContent.length > 0, 'success rate must have text');
  assert.ok(retryNode.textContent.length > 0, 'retry count must have text');
  assert.ok(ttdNode.textContent.length > 0, 'time-to-delivery must have text');
});

// ── AC2: success rate rendered value matches calculateMetrics ────────────────
check('AC2 – rendered success rate matches calculateMetrics for 100% success', () => {
  const events = [delivered(500, 1), delivered(1000, 2), delivered(2000, 1)];
  const dash = new MetricsDashboard({ events });
  const m = calculateMetrics(events);
  assert.equal(m.successRate, 1.0, 'all delivered → 100% success rate');
  const node = dash.element.queryByTestId('metric-success-rate');
  assert.equal(node.textContent, formatSuccessRate(m.successRate));
  assert.equal(node.textContent, '100.0 %');
});

check('AC2 – rendered success rate matches calculateMetrics for 0% success', () => {
  const events = [
    { status: 'failed', attempts: 6, httpStatus: 500, responseBody: 'err' },
    { status: 'exhausted', attempts: 6, httpStatus: 503, responseBody: 'gone' },
  ];
  const dash = new MetricsDashboard({ events });
  const m = calculateMetrics(events);
  assert.equal(m.successRate, 0.0, '0 delivered → 0% success rate');
  const node = dash.element.queryByTestId('metric-success-rate');
  assert.equal(node.textContent, formatSuccessRate(m.successRate));
  assert.equal(node.textContent, '0.0 %');
});

check('AC2 – rendered success rate matches calculateMetrics for partial success', () => {
  const events = [
    delivered(1000, 1),
    { status: 'failed', attempts: 3, httpStatus: 500, responseBody: 'err' },
    { status: 'failed', attempts: 3, httpStatus: 500, responseBody: 'err' },
    { status: 'failed', attempts: 3, httpStatus: 500, responseBody: 'err' },
  ];
  const dash = new MetricsDashboard({ events });
  const m = calculateMetrics(events);
  assert.equal(m.successRate, 0.25, '1 of 4 delivered → 25% success rate');
  const node = dash.element.queryByTestId('metric-success-rate');
  assert.equal(node.textContent, formatSuccessRate(m.successRate));
  assert.equal(node.textContent, '25.0 %');
});

// ── AC3: average retry count rendered value matches calculateMetrics ──────────
check('AC3 – rendered retry count matches calculateMetrics for zero retries', () => {
  // All single-attempt deliveries → 0 retries each.
  const events = [delivered(500, 1), delivered(600, 1)];
  const dash = new MetricsDashboard({ events });
  const m = calculateMetrics(events);
  assert.equal(m.averageRetryCount, 0.0, 'single-attempt events → 0 avg retries');
  const node = dash.element.queryByTestId('metric-average-retries');
  assert.equal(node.textContent, formatAverageRetryCount(m.averageRetryCount));
  assert.equal(node.textContent, '0.0 retries / webhook');
});

check('AC3 – rendered retry count matches calculateMetrics for mixed attempts', () => {
  // attempts: 1, 3, 5 → retries: 0, 2, 4 → total 6 / 3 = 2.0 avg
  const events = [
    delivered(1000, 1),
    delivered(3000, 3),
    delivered(5000, 5),
  ];
  const dash = new MetricsDashboard({ events });
  const m = calculateMetrics(events);
  assert.equal(m.averageRetryCount, 2.0, 'mixed attempts → 2.0 avg retries');
  const node = dash.element.queryByTestId('metric-average-retries');
  assert.equal(node.textContent, formatAverageRetryCount(m.averageRetryCount));
  assert.equal(node.textContent, '2.0 retries / webhook');
});

// ── AC4: median + p95 time-to-delivery rendered values match calculateMetrics ─
check('AC4 – rendered time-to-delivery matches calculateMetrics for single event', () => {
  // Single delivered event: median = p95 = that value.
  const events = [delivered(5000, 1)];
  const dash = new MetricsDashboard({ events });
  const m = calculateMetrics(events);
  assert.equal(m.medianTimeToDeliveryMs, 5000);
  assert.equal(m.p95TimeToDeliveryMs, 5000);
  const node = dash.element.queryByTestId('metric-time-to-delivery');
  assert.equal(node.textContent, formatTimeToDelivery(m.medianTimeToDeliveryMs, m.p95TimeToDeliveryMs));
  assert.equal(node.textContent, 'median 5 s · p95 5 s');
});

check('AC4 – rendered time-to-delivery matches calculateMetrics for multiple events', () => {
  // 5 delivered events: [1000, 2000, 3000, 4000, 5000] ms
  // median (5 values, index 2) = 3000ms = 3s
  // p95 rank = 0.95*4 = 3.8 → 4000 + 0.8*(5000-4000) = 4800ms = 4.8s
  const events = [
    delivered(1000, 1),
    delivered(2000, 1),
    delivered(3000, 1),
    delivered(4000, 1),
    delivered(5000, 1),
  ];
  const dash = new MetricsDashboard({ events });
  const m = calculateMetrics(events);
  assert.equal(m.medianTimeToDeliveryMs, 3000);
  // p95 = 4800ms exactly (no floating-point imprecision with these values)
  assert.equal(m.p95TimeToDeliveryMs, 4800);
  const node = dash.element.queryByTestId('metric-time-to-delivery');
  // Rendered value must match the formatter applied to the metrics module output.
  assert.equal(node.textContent, formatTimeToDelivery(m.medianTimeToDeliveryMs, m.p95TimeToDeliveryMs));
  assert.equal(node.textContent, 'median 3 s · p95 4.8 s');
});

check('AC4 – time-to-delivery is 0 when no delivered events exist', () => {
  // Only failed events → no delivery times → median and p95 are 0.
  const events = [
    { status: 'failed', attempts: 3, httpStatus: 500, responseBody: 'err' },
    { status: 'exhausted', attempts: 6, httpStatus: 503, responseBody: 'gone' },
  ];
  const dash = new MetricsDashboard({ events });
  const m = calculateMetrics(events);
  assert.equal(m.medianTimeToDeliveryMs, 0);
  assert.equal(m.p95TimeToDeliveryMs, 0);
  const node = dash.element.queryByTestId('metric-time-to-delivery');
  assert.equal(node.textContent, formatTimeToDelivery(0, 0));
  assert.equal(node.textContent, 'median 0 s · p95 0 s');
});

// ── AC5/AC11: reactive binding — setEvents() immediately updates rendered values
check('AC5/AC11 – setEvents() updates success rate without manual refresh', () => {
  const dash = new MetricsDashboard({ events: [] });
  // Start empty.
  assert.equal(dash.element.dataset.empty, 'true');

  // Add one delivered event → 100% success rate.
  dash.setEvents([delivered(1000, 1)]);
  assert.equal(dash.element.dataset.empty, 'false');
  assert.equal(
    dash.element.queryByTestId('metric-success-rate').textContent,
    '100.0 %',
  );

  // Add a failed event → 50% success rate.
  dash.setEvents([
    delivered(1000, 1),
    { status: 'failed', attempts: 3, httpStatus: 500, responseBody: 'err' },
  ]);
  assert.equal(
    dash.element.queryByTestId('metric-success-rate').textContent,
    '50.0 %',
  );
});

check('AC5/AC11 – setEvents() updates retry count without manual refresh', () => {
  const dash = new MetricsDashboard({ events: [delivered(1000, 1)] });
  assert.equal(
    dash.element.queryByTestId('metric-average-retries').textContent,
    '0.0 retries / webhook',
  );

  // Replace with events that have retries.
  dash.setEvents([delivered(1000, 4), delivered(2000, 4)]);
  // retries per event: 3, 3 → avg 3.0
  assert.equal(
    dash.element.queryByTestId('metric-average-retries').textContent,
    '3.0 retries / webhook',
  );
});

check('AC5/AC11 – setEvents() updates time-to-delivery without manual refresh', () => {
  const dash = new MetricsDashboard({ events: [delivered(1000, 1)] });
  assert.equal(
    dash.element.queryByTestId('metric-time-to-delivery').textContent,
    'median 1 s · p95 1 s',
  );

  dash.setEvents([delivered(10000, 1)]);
  assert.equal(
    dash.element.queryByTestId('metric-time-to-delivery').textContent,
    'median 10 s · p95 10 s',
  );
});

check('AC5/AC11 – setEvents([]) transitions back to empty state', () => {
  const dash = new MetricsDashboard({ events: [delivered(1000, 1)] });
  assert.equal(dash.element.dataset.empty, 'false');

  dash.setEvents([]);
  assert.equal(dash.element.dataset.empty, 'true');
  assert.equal(
    dash.element.queryByTestId('metric-success-rate').textContent,
    '—',
  );
});

// ── AC6/AC10: empty/zero state ────────────────────────────────────────────────
check('AC6/AC10 – empty array shows placeholder dashes for all three stats', () => {
  const dash = new MetricsDashboard({ events: [] });
  assert.equal(dash.element.dataset.empty, 'true');
  assert.equal(dash.element.queryByTestId('metric-success-rate').textContent, '—');
  assert.equal(dash.element.queryByTestId('metric-average-retries').textContent, '—');
  assert.equal(dash.element.queryByTestId('metric-time-to-delivery').textContent, '—');
});

check('AC6/AC10 – empty state note is visible when no events', () => {
  const dash = new MetricsDashboard({ events: [] });
  const emptyNote = dash.element.queryByTestId('metrics-empty-state');
  assert.ok(emptyNote, 'metrics-empty-state node must exist');
  assert.equal(emptyNote.hidden, false, 'empty-state note must be visible');
});

check('AC6/AC10 – empty state note is hidden when events are present', () => {
  const dash = new MetricsDashboard({ events: [delivered(1000, 1)] });
  const emptyNote = dash.element.queryByTestId('metrics-empty-state');
  assert.ok(emptyNote, 'metrics-empty-state node must exist');
  assert.equal(emptyNote.hidden, true, 'empty-state note must be hidden when events present');
});

check('AC6/AC10 – no-arg constructor also produces empty state', () => {
  const dash = new MetricsDashboard();
  assert.equal(dash.element.dataset.empty, 'true');
  const emptyNote = dash.element.queryByTestId('metrics-empty-state');
  assert.ok(emptyNote, 'metrics-empty-state node must exist');
  assert.equal(emptyNote.hidden, false);
});

// ── AC7: component accepts delivery-event array as sole data input ────────────
check('AC7 – getMetrics() returns EMPTY_METRICS shape for empty events', () => {
  const dash = new MetricsDashboard({ events: [] });
  const m = dash.getMetrics();
  assert.equal(m.totalEvents, 0);
  assert.equal(m.deliveredCount, 0);
  assert.equal(m.successRate, 0);
  assert.equal(m.averageRetryCount, 0);
  assert.equal(m.medianTimeToDeliveryMs, 0);
  assert.equal(m.p95TimeToDeliveryMs, 0);
});

check('AC7 – getMetrics() returns correct values for non-empty events', () => {
  const events = [delivered(2000, 2), delivered(4000, 3)];
  const dash = new MetricsDashboard({ events });
  const m = dash.getMetrics();
  assert.equal(m.totalEvents, 2);
  assert.equal(m.deliveredCount, 2);
  assert.equal(m.successRate, 1.0);
  // retries: 1 + 2 = 3 / 2 = 1.5
  assert.equal(m.averageRetryCount, 1.5);
});

// ── AC8: simulator-produced event shape ───────────────────────────────────────
check('AC8 – full simulator event shape (all optional fields) renders correctly', () => {
  const simulatedEvents = [
    {
      status: 'delivered',
      attempts: 2,
      timeToDeliveryMs: 3000,
      timestamp: new Date().toISOString(),
      httpStatus: 200,
      responseBody: '{"id":"evt_001","type":"payment.created"}',
    },
    {
      status: 'delivered',
      attempts: 1,
      timeToDeliveryMs: 1000,
      timestamp: new Date().toISOString(),
      httpStatus: 200,
      responseBody: '{"id":"evt_002","type":"refund.issued"}',
    },
    {
      status: 'exhausted',
      attempts: 6,
      timestamp: new Date().toISOString(),
      httpStatus: 503,
      responseBody: '{"error":"service unavailable"}',
    },
  ];
  const dash = new MetricsDashboard({ events: simulatedEvents });
  const m = calculateMetrics(simulatedEvents);

  // 2 of 3 delivered → ~66.7%
  assert.ok(Math.abs(m.successRate - 2 / 3) < 1e-10, 'success rate should be 2/3');
  const successNode = dash.element.queryByTestId('metric-success-rate');
  assert.equal(successNode.textContent, formatSuccessRate(m.successRate));
  assert.equal(successNode.textContent, '66.7 %');

  // retries: 1 + 0 + 5 = 6 / 3 = 2.0
  assert.equal(m.averageRetryCount, 2.0);
  const retryNode = dash.element.queryByTestId('metric-average-retries');
  assert.equal(retryNode.textContent, '2.0 retries / webhook');

  // Delivered times: [1000, 3000] → median = 2000ms = 2s
  assert.equal(m.medianTimeToDeliveryMs, 2000);
  const ttdNode = dash.element.queryByTestId('metric-time-to-delivery');
  assert.equal(ttdNode.textContent, formatTimeToDelivery(m.medianTimeToDeliveryMs, m.p95TimeToDeliveryMs));
  assert.ok(ttdNode.textContent.startsWith('median 2 s'), `expected 'median 2 s …', got '${ttdNode.textContent}'`);
});

check('AC8 – simulator events with retry progression render correctly', () => {
  // Simulate a webhook that went through the full retry schedule before delivery.
  const retryEvent = {
    status: 'delivered',
    attempts: 6,  // exhausted all retries before final success
    timeToDeliveryMs: 28800000,  // 8 hours in ms
    timestamp: new Date().toISOString(),
    httpStatus: 200,
    responseBody: '{"ok":true}',
  };
  const dash = new MetricsDashboard({ events: [retryEvent] });
  const m = dash.getMetrics();
  assert.equal(m.successRate, 1.0);
  assert.equal(m.averageRetryCount, 5.0);  // 6 attempts - 1 = 5 retries
  assert.equal(m.medianTimeToDeliveryMs, 28800000);
  const ttdNode = dash.element.queryByTestId('metric-time-to-delivery');
  // 28800000ms = 28800s
  assert.equal(ttdNode.textContent, 'median 28800 s · p95 28800 s');
});

// ── AC9: representative fixture dataset ───────────────────────────────────────
check('AC9 – representative fixture: 5 delivered, 3 failed, 2 exhausted', () => {
  const fixture = [
    delivered(1000, 1),
    delivered(2000, 2),
    delivered(5000, 3),
    delivered(10000, 4),
    delivered(20000, 1),
    { status: 'failed', attempts: 3, httpStatus: 500, responseBody: 'err' },
    { status: 'failed', attempts: 3, httpStatus: 500, responseBody: 'err' },
    { status: 'failed', attempts: 3, httpStatus: 500, responseBody: 'err' },
    { status: 'exhausted', attempts: 6, httpStatus: 503, responseBody: 'gone' },
    { status: 'exhausted', attempts: 6, httpStatus: 503, responseBody: 'gone' },
  ];
  const dash = new MetricsDashboard({ events: fixture });
  const m = calculateMetrics(fixture);

  // 5 of 10 delivered → 50%
  assert.equal(m.successRate, 0.5);
  assert.equal(
    dash.element.queryByTestId('metric-success-rate').textContent,
    '50.0 %',
  );

  // retries: 0+1+2+3+0+2+2+2+5+5 = 22 / 10 = 2.2
  assert.equal(m.averageRetryCount, 2.2);
  assert.equal(
    dash.element.queryByTestId('metric-average-retries').textContent,
    '2.2 retries / webhook',
  );

  // Delivered times sorted: [1000, 2000, 5000, 10000, 20000]
  // median (5 values) = 5000ms = 5s
  assert.equal(m.medianTimeToDeliveryMs, 5000);
  const ttdText = dash.element.queryByTestId('metric-time-to-delivery').textContent;
  assert.ok(ttdText.startsWith('median 5 s'), `expected 'median 5 s …', got '${ttdText}'`);
});

// ── mountMetricsDashboard convenience factory ─────────────────────────────────
check('mountMetricsDashboard factory mounts component into parent element', () => {
  const parent = new FakeElement('div');
  const dash = mountMetricsDashboard(parent, [delivered(1000, 1)]);
  assert.ok(dash instanceof MetricsDashboard, 'returns a MetricsDashboard instance');
  assert.ok(parent.children.includes(dash.element), 'element is appended to parent');
  assert.equal(dash.element.dataset.empty, 'false');
});

check('mountMetricsDashboard factory defaults to empty state with no events', () => {
  const parent = new FakeElement('div');
  const dash = mountMetricsDashboard(parent);
  assert.equal(dash.element.dataset.empty, 'true');
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
