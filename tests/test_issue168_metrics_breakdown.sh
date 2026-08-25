#!/usr/bin/env bash
# Tests for Issue #168: Event-type breakdown view in the metrics dashboard.
#
# Verifies structural and behavioural acceptance criteria:
#   AC1  – breakdown section lists every distinct event type in the data.
#   AC2  – each event-type row exposes all three metrics (success rate,
#           avg retry count, TTD median + p95).
#   AC3  – overall aggregate row is present alongside per-type rows.
#   AC4  – overall and per-type breakdown are co-located (single result object).
#   AC5  – a new event type appearing in the data produces a new row without
#           manual refresh (dynamic grouping).
#   AC6  – changing delivery-event data updates per-type metric values.
#   AC8  – edge cases handled gracefully (zero deliveries, 100% failure,
#           single attempt).
#   AC11 – event types are labelled and metric fields are consistently present.
#
# Strategy: compile src/metricsBreakdown.ts with tsc and exercise the compiled
# module via a Node.js ESM harness.  No DOM or external test framework needed.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TSC="$REPO_ROOT/node_modules/.bin/tsc"
SRC="$REPO_ROOT/src/metricsBreakdown.ts"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── Pre-flight: required files exist ─────────────────────────────────────────

if [ -f "$SRC" ]; then
  pass "pre-flight – src/metricsBreakdown.ts exists"
else
  fail "pre-flight – src/metricsBreakdown.ts does not exist"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

if [ -x "$TSC" ]; then
  pass "pre-flight – tsc binary is available"
else
  fail "pre-flight – tsc not found at $TSC (run 'npm install' first)"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# ── Source-level structural checks ───────────────────────────────────────────

# AC2 / AC11: module exports the three metric fields
for field in successRate avgRetryCount medianTTD p95TTD; do
  if grep -q "$field" "$SRC"; then
    pass "source – GroupMetrics exposes field: $field"
  else
    fail "source – GroupMetrics missing field: $field"
  fi
done

# AC1 / AC3: module exports calculateBreakdown (returns overall + byEventType)
if grep -q "export function calculateBreakdown" "$SRC"; then
  pass "source – calculateBreakdown is exported"
else
  fail "source – calculateBreakdown export not found"
fi

if grep -q "byEventType" "$SRC"; then
  pass "source – BreakdownResult contains byEventType field"
else
  fail "source – byEventType field not found in source"
fi

if grep -q "overall" "$SRC"; then
  pass "source – BreakdownResult contains overall field"
else
  fail "source – overall field not found in source"
fi

# AC5: dynamic grouping helper exported
if grep -q "export function groupByEventType" "$SRC"; then
  pass "source – groupByEventType is exported (supports dynamic event types)"
else
  fail "source – groupByEventType export not found"
fi

# ── Compile to a temp directory ───────────────────────────────────────────────

TMPDIR_COMPILE="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_COMPILE"' EXIT

TSC_OUTPUT=$(
  "$TSC" \
    --module ESNext \
    --moduleResolution node \
    --target ES2020 \
    --outDir "$TMPDIR_COMPILE/out" \
    --noEmit false \
    --allowImportingTsExtensions false \
    --strict true \
    --skipLibCheck true \
    "$SRC" 2>&1
)
TSC_EXIT=$?

if [ "$TSC_EXIT" -eq 0 ]; then
  pass "compile – src/metricsBreakdown.ts compiles without TypeScript errors"
else
  fail "compile – tsc exited with code $TSC_EXIT"
  echo "$TSC_OUTPUT"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

echo '{"type":"module"}' > "$TMPDIR_COMPILE/out/package.json"

COMPILED="$TMPDIR_COMPILE/out/metricsBreakdown.js"
HARNESS="$TMPDIR_COMPILE/harness.mjs"

# ── Write the Node.js test harness ───────────────────────────────────────────

cat > "$HARNESS" << 'HARNESS_EOF'
import {
  calculateBreakdown,
  calculateMetricsForGroup,
  groupByEventType,
} from "__COMPILED__";

let pass = 0;
let fail = 0;

function assert(label, condition) {
  if (condition) {
    console.log("PASS: " + label);
    pass++;
  } else {
    console.log("FAIL: " + label);
    fail++;
  }
}

// ── Fixture helpers ───────────────────────────────────────────────────────────

function ev(webhookId, eventType, status, attemptNumber, timestamp, httpStatus) {
  return {
    webhookId,
    eventType,
    status,
    attemptNumber,
    timestamp: timestamp || "2024-01-01T00:00:00.000Z",
    httpStatus: httpStatus !== undefined ? httpStatus : (status === "delivered" ? 200 : 500),
    responseExcerpt: "",
  };
}

// Representative fixture: 3 event types, mix of outcomes
const FIXTURE = [
  ev("pc-1", "payment.created", "delivered", 1, "2024-01-01T00:00:00.000Z", 200),
  ev("pc-2", "payment.created", "failed",    1, "2024-01-01T01:00:00.000Z"),
  ev("pc-2", "payment.created", "delivered", 2, "2024-01-01T01:05:00.000Z", 200),
  ev("pc-3", "payment.created", "failed",    1, "2024-01-01T02:00:00.000Z"),
  ev("ri-1", "refund.issued",   "delivered", 1, "2024-01-01T03:00:00.000Z", 200),
  ev("ri-2", "refund.issued",   "failed",    1, "2024-01-01T04:00:00.000Z"),
  ev("ri-2", "refund.issued",   "exhausted", 2, "2024-01-01T04:30:00.000Z"),
  ev("do-1", "dispute.opened",  "delivered", 1, "2024-01-01T05:00:00.000Z", 200),
];

// ── AC1: breakdown lists every distinct event type ────────────────────────────
const result = calculateBreakdown(FIXTURE);
assert("AC1 – byEventType has 3 entries (one per distinct event type)",
  result.byEventType.length === 3);
const types = result.byEventType.map(b => b.eventType);
assert("AC1 – payment.created is present in breakdown", types.includes("payment.created"));
assert("AC1 – refund.issued is present in breakdown",   types.includes("refund.issued"));
assert("AC1 – dispute.opened is present in breakdown",  types.includes("dispute.opened"));

// ── AC2: each row exposes all three metrics ───────────────────────────────────
for (const breakdown of result.byEventType) {
  const m = breakdown.metrics;
  assert(`AC2 – ${breakdown.eventType}: successRate field present`,
    "successRate" in m);
  assert(`AC2 – ${breakdown.eventType}: avgRetryCount field present`,
    "avgRetryCount" in m);
  assert(`AC2 – ${breakdown.eventType}: medianTTD field present`,
    "medianTTD" in m);
  assert(`AC2 – ${breakdown.eventType}: p95TTD field present`,
    "p95TTD" in m);
}

// ── AC3: overall aggregate is present ────────────────────────────────────────
assert("AC3 – result.overall is present", result.overall !== undefined);
assert("AC3 – overall.totalWebhooks is 6", result.overall.totalWebhooks === 6);
assert("AC3 – overall.deliveredCount is 4", result.overall.deliveredCount === 4);

// ── AC4: overall and byEventType are co-located in one result object ──────────
assert("AC4 – result has both overall and byEventType keys",
  "overall" in result && "byEventType" in result);

// ── AC5: new event type added dynamically produces a new row ──────────────────
const withNew = [...FIXTURE, ev("charge-1", "charge.failed", "failed", 1)];
const resultWithNew = calculateBreakdown(withNew);
assert("AC5 – new event type charge.failed appears in breakdown",
  resultWithNew.byEventType.some(b => b.eventType === "charge.failed"));
assert("AC5 – byEventType now has 4 entries after new type added",
  resultWithNew.byEventType.length === 4);

// ── AC6: changing data updates per-type metric values ────────────────────────
// Add a delivered event for pc-3 (previously failed) and recompute.
const updated = [
  ...FIXTURE,
  ev("pc-3", "payment.created", "delivered", 2, "2024-01-01T02:05:00.000Z", 200),
];
const resultUpdated = calculateBreakdown(updated);
const pcUpdated = resultUpdated.byEventType.find(b => b.eventType === "payment.created");
assert("AC6 – payment.created success rate increases after new delivered event",
  pcUpdated.metrics.successRate > result.byEventType.find(b => b.eventType === "payment.created").metrics.successRate);
assert("AC6 – payment.created deliveredCount is now 3",
  pcUpdated.metrics.deliveredCount === 3);

// ── AC8: edge case – zero deliveries (empty list) ─────────────────────────────
const emptyResult = calculateBreakdown([]);
assert("AC8 – empty list: byEventType is empty", emptyResult.byEventType.length === 0);
assert("AC8 – empty list: overall.totalWebhooks is 0", emptyResult.overall.totalWebhooks === 0);
assert("AC8 – empty list: overall.successRate is NaN", isNaN(emptyResult.overall.successRate));

// ── AC8: edge case – 100% failure ─────────────────────────────────────────────
const allFailed = [
  ev("f-1", "payment.created", "failed",    1),
  ev("f-2", "payment.created", "exhausted", 1),
  ev("f-3", "refund.issued",   "failed",    1),
];
const failedResult = calculateBreakdown(allFailed);
assert("AC8 – 100% failure: overall successRate is 0",
  failedResult.overall.successRate === 0);
assert("AC8 – 100% failure: overall medianTTD is NaN",
  isNaN(failedResult.overall.medianTTD));
for (const b of failedResult.byEventType) {
  assert(`AC8 – 100% failure: ${b.eventType} successRate is 0`,
    b.metrics.successRate === 0);
}

// ── AC8: edge case – single attempt per event type ────────────────────────────
const singleAttempts = [
  ev("sa-1", "payment.created", "delivered", 1, "2024-06-01T10:00:00.000Z", 200),
  ev("sa-2", "refund.issued",   "failed",    1, "2024-06-01T11:00:00.000Z"),
];
const singleResult = calculateBreakdown(singleAttempts);
const saPc = singleResult.byEventType.find(b => b.eventType === "payment.created");
const saRi = singleResult.byEventType.find(b => b.eventType === "refund.issued");
assert("AC8 – single attempt: payment.created successRate is 100",
  saPc.metrics.successRate === 100);
assert("AC8 – single attempt: refund.issued successRate is 0",
  saRi.metrics.successRate === 0);
assert("AC8 – single attempt: avgRetryCount is 1 for each type",
  saPc.metrics.avgRetryCount === 1 && saRi.metrics.avgRetryCount === 1);

// ── AC11: event types are labelled and metrics consistently present ────────────
for (const breakdown of result.byEventType) {
  assert(`AC11 – ${breakdown.eventType}: eventType label is a non-empty string`,
    typeof breakdown.eventType === "string" && breakdown.eventType.length > 0);
  const m = breakdown.metrics;
  const fields = ["successRate", "avgRetryCount", "medianTTD", "p95TTD",
                  "totalWebhooks", "deliveredCount"];
  for (const f of fields) {
    assert(`AC11 – ${breakdown.eventType}: metrics.${f} is present`,
      f in m);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  throw new Error(`${fail} test(s) failed`);
}
HARNESS_EOF

# Inject the compiled module path.
sed -i "s|__COMPILED__|$COMPILED|g" "$HARNESS"

# ── Run the harness ───────────────────────────────────────────────────────────

HARNESS_OUTPUT=$(node "$HARNESS" 2>&1)
HARNESS_EXIT=$?

while IFS= read -r line; do
  case "$line" in
    PASS:*) pass "${line#PASS: }" ;;
    FAIL:*) fail "${line#FAIL: }" ;;
    *)      echo "$line" ;;
  esac
done <<< "$HARNESS_OUTPUT"

if [ "$HARNESS_EXIT" -ne 0 ] && ! echo "$HARNESS_OUTPUT" | grep -q "^FAIL:"; then
  fail "harness – node exited with code $HARNESS_EXIT (unexpected error)"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
