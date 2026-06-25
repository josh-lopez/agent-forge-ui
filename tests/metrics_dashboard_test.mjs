// Component-level tests for the MetricsDashboard and its metrics module.
//
// Run via tests/test_issue95_metrics_dashboard.sh, which first compiles the
// TypeScript sources to a temp dir and points this harness at the output via
// the DASHBOARD_DIST env var.
//
// A tiny DOM shim is provided so the component's element-building logic can run
// under plain Node without jsdom or any extra dependency.

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
  // Depth-first search for a descendant (or self) matching predicate.
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
const { MetricsDashboard } = await import(`${dist}/MetricsDashboard.js`);
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

// ── Representative fixture dataset ───────────────────────────────────────────
// 10 events: 8 delivered, 1 failed, 1 exhausted -> 80% success rate.
// Retry counts (attempts-1): 0,0,1,1,2,3,0,1,5,5 -> total 18 -> avg 1.8.
// Delivered time-to-delivery (ms): the 8 delivered events.
const delivered = (timeToDeliveryMs, attempts) => ({
  status: 'delivered',
  attempts,
  timeToDeliveryMs,
  timestamp: '2026-01-01T00:00:00.000Z',
  httpStatus: 200,
  responseBody: 'OK',
});
const fixture = [
  delivered(1000, 1),
  delivered(2000, 1),
  delivered(3000, 2),
  delivered(4000, 2),
  delivered(5000, 3),
  delivered(8000, 4),
  delivered(40000, 1),
  delivered(38000, 2),
  { status: 'failed', attempts: 6, httpStatus: 500, responseBody: 'err' },
  { status: 'exhausted', attempts: 6, httpStatus: 503, responseBody: 'gone' },
];

// AC2/AC3/AC4: rendered values match the metrics module for the fixture.
check('renders all three stats matching the metrics module', () => {
  const dash = new MetricsDashboard({ events: fixture });
  const m = calculateMetrics(fixture);

  assert.equal(m.successRate, 0.8, 'fixture success rate should be 0.8');
  assert.equal(m.averageRetryCount, 1.8, 'fixture avg retry should be 1.8');

  const successNode = dash.element.queryByTestId('metric-success-rate');
  const retryNode = dash.element.queryByTestId('metric-average-retries');
  const ttdNode = dash.element.queryByTestId('metric-time-to-delivery');

  assert.ok(successNode && retryNode && ttdNode, 'all three stat nodes render');

  assert.equal(successNode.textContent, formatSuccessRate(m.successRate));
  assert.equal(successNode.textContent, '80.0 %');

  assert.equal(retryNode.textContent, formatAverageRetryCount(m.averageRetryCount));
  assert.equal(retryNode.textContent, '1.8 retries / webhook');

  assert.equal(
    ttdNode.textContent,
    formatTimeToDelivery(m.medianTimeToDeliveryMs, m.p95TimeToDeliveryMs),
  );
  // Median of [1000,2000,3000,4000,5000,8000,38000,40000] = (4000+5000)/2 = 4500ms.
  assert.equal(m.medianTimeToDeliveryMs, 4500);
  // p95 over the 8 sorted delivered times (rank = 0.95*7 = 6.65):
  // between 38000 (idx6) and 40000 (idx7): 38000 + 0.65*2000 = 39300ms.
  assert.equal(m.p95TimeToDeliveryMs, 39300);
  assert.equal(ttdNode.textContent, 'median 4.5 s · p95 39.3 s');
});

// AC6/AC10: empty/zero state.
check('renders empty/zero state for an empty array', () => {
  const dash = new MetricsDashboard({ events: [] });
  assert.equal(dash.element.dataset.empty, 'true');
  const emptyNote = dash.element.queryByTestId('metrics-empty-state');
  assert.ok(emptyNote, 'empty-state node renders');
  assert.equal(emptyNote.hidden, false, 'empty-state note is visible');
  // Stat values show the placeholder rather than misleading zeros.
  assert.equal(dash.element.queryByTestId('metric-success-rate').textContent, '—');
  assert.equal(dash.element.queryByTestId('metric-average-retries').textContent, '—');
  assert.equal(dash.element.queryByTestId('metric-time-to-delivery').textContent, '—');
});

// AC1: default (no events) is also empty state.
check('defaults to empty state when no events are provided', () => {
  const dash = new MetricsDashboard();
  assert.equal(dash.element.dataset.empty, 'true');
});

// AC5/AC11: reactive update when the input array changes.
check('updates rendered values reactively when events change', () => {
  const dash = new MetricsDashboard({ events: [] });
  assert.equal(dash.element.dataset.empty, 'true');

  dash.setEvents(fixture);
  assert.equal(dash.element.dataset.empty, 'false');
  assert.equal(
    dash.element.queryByTestId('metric-success-rate').textContent,
    '80.0 %',
  );

  // A different dataset produces different rendered values without any refresh.
  const allDelivered = [delivered(1000, 1), delivered(1000, 1)];
  dash.setEvents(allDelivered);
  assert.equal(
    dash.element.queryByTestId('metric-success-rate').textContent,
    '100.0 %',
  );
  assert.equal(
    dash.element.queryByTestId('metric-average-retries').textContent,
    '0.0 retries / webhook',
  );

  // Returning to empty restores the empty state.
  dash.setEvents([]);
  assert.equal(dash.element.dataset.empty, 'true');
});

// AC7/AC8: works with simulator-shaped data, no network access.
check('works with simulator-produced event shape', () => {
  // Same shape the simulator emits: status/timestamp/httpStatus/responseBody.
  const simulated = [
    {
      status: 'delivered',
      attempts: 3,
      timeToDeliveryMs: 6000,
      timestamp: new Date().toISOString(),
      httpStatus: 200,
      responseBody: '{"ok":true}',
    },
    {
      status: 'exhausted',
      attempts: 6,
      timestamp: new Date().toISOString(),
      httpStatus: 500,
      responseBody: '{"error":"boom"}',
    },
  ];
  const dash = new MetricsDashboard({ events: simulated });
  const m = dash.getMetrics();
  assert.equal(m.successRate, 0.5);
  assert.equal(
    dash.element.queryByTestId('metric-success-rate').textContent,
    '50.0 %',
  );
});

console.log(`\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
