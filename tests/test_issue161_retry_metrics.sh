#!/usr/bin/env bash
# Tests for Issue #161: per-event-type retry count breakdown in metrics dashboard.
#
# Acceptance criteria verified here:
#   AC1 – src/retryMetrics.ts exports calcRetryCountByEventType
#   AC2 – breakdown is in the same module as overall metrics (no separate page)
#   AC4 – zero-delivery edge case handled gracefully (null / '—')
#   AC6 – unit tests exist and cover required cases
#   AC7 – breakdown is visually scannable (table with event-type column)
#
# Strategy: static source checks + compile + Node.js ESM harness.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TSC="$REPO_ROOT/node_modules/.bin/tsc"
METRICS_SRC="$REPO_ROOT/src/retryMetrics.ts"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── Pre-flight: source file exists ───────────────────────────────────────────

if [ -f "$METRICS_SRC" ]; then
  pass "pre-flight – src/retryMetrics.ts exists"
else
  fail "pre-flight – src/retryMetrics.ts does not exist"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# ── AC1: required exports present ────────────────────────────────────────────

if grep -q "export function calcRetryCountByEventType" "$METRICS_SRC"; then
  pass "AC1 – calcRetryCountByEventType is exported"
else
  fail "AC1 – calcRetryCountByEventType export not found"
fi

if grep -q "export interface RetryableWebhook" "$METRICS_SRC"; then
  pass "AC1 – RetryableWebhook interface is exported"
else
  fail "AC1 – RetryableWebhook interface export not found"
fi

if grep -q "export interface EventTypeRetryStats" "$METRICS_SRC"; then
  pass "AC1 – EventTypeRetryStats interface is exported"
else
  fail "AC1 – EventTypeRetryStats interface export not found"
fi

if grep -q "export function formatMeanRetryCount" "$METRICS_SRC"; then
  pass "AC1 – formatMeanRetryCount helper is exported"
else
  fail "AC1 – formatMeanRetryCount helper export not found"
fi

if grep -q "export function renderRetryBreakdownTable" "$METRICS_SRC"; then
  pass "AC1 – renderRetryBreakdownTable is exported"
else
  fail "AC1 – renderRetryBreakdownTable export not found"
fi

# ── AC4: null / graceful zero-delivery handling ───────────────────────────────

if grep -q "null" "$METRICS_SRC"; then
  pass "AC4 – null used for zero-delivery edge case"
else
  fail "AC4 – null not found in retryMetrics.ts (zero-delivery handling missing)"
fi

if grep -q "'—'" "$METRICS_SRC"; then
  pass "AC4 – '—' display value present for null case"
else
  fail "AC4 – '—' display value not found in retryMetrics.ts"
fi

# ── AC7: table rendering for scannability ────────────────────────────────────

if grep -q "retry-breakdown-table" "$METRICS_SRC"; then
  pass "AC7 – retry-breakdown-table CSS class present (scannable table)"
else
  fail "AC7 – retry-breakdown-table CSS class not found"
fi

if grep -q "retry-breakdown-event-type" "$METRICS_SRC"; then
  pass "AC7 – retry-breakdown-event-type CSS class present"
else
  fail "AC7 – retry-breakdown-event-type CSS class not found"
fi

# ── AC6: unit test file exists ────────────────────────────────────────────────

TEST_FILE="$REPO_ROOT/tests/retryMetrics.test.ts"
if [ -f "$TEST_FILE" ]; then
  pass "AC6 – tests/retryMetrics.test.ts exists"
else
  fail "AC6 – tests/retryMetrics.test.ts does not exist"
fi

# Check that the test file covers the required cases.
if grep -q "single event type" "$TEST_FILE" 2>/dev/null; then
  pass "AC6 – test covers single event type case"
else
  fail "AC6 – test does not cover single event type case"
fi

if grep -q "multiple distinct event types\|multiple event types" "$TEST_FILE" 2>/dev/null; then
  pass "AC6 – test covers multiple distinct event types case"
else
  fail "AC6 – test does not cover multiple distinct event types case"
fi

if grep -q "zero\|empty" "$TEST_FILE" 2>/dev/null; then
  pass "AC6 – test covers zero-delivery edge case"
else
  fail "AC6 – test does not cover zero-delivery edge case"
fi

if grep -q "100.*fail\|failure\|exhausted" "$TEST_FILE" 2>/dev/null; then
  pass "AC6 – test covers 100% failure edge case"
else
  fail "AC6 – test does not cover 100% failure edge case"
fi

# ── Compile check ─────────────────────────────────────────────────────────────

if [ ! -x "$TSC" ]; then
  fail "compile – tsc not found at $TSC (run 'npm install' first)"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

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
    "$METRICS_SRC" 2>&1
)
TSC_EXIT=$?

if [ "$TSC_EXIT" -eq 0 ]; then
  pass "compile – src/retryMetrics.ts compiles without TypeScript errors"
else
  fail "compile – tsc exited with code $TSC_EXIT"
  echo "$TSC_OUTPUT"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

echo '{"type":"module"}' > "$TMPDIR_COMPILE/out/package.json"

# ── Node.js ESM harness: runtime correctness ─────────────────────────────────

COMPILED="$TMPDIR_COMPILE/out/retryMetrics.js"
HARNESS="$TMPDIR_COMPILE/harness.mjs"

cat > "$HARNESS" << 'HARNESS_EOF'
import {
  calcRetryCountByEventType,
  formatMeanRetryCount,
  renderRetryBreakdownTable,
} from "__COMPILED__";

let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) {
    console.log("PASS: " + label);
    pass++;
  } else {
    console.log("FAIL: " + label);
    fail++;
  }
}

function approxEqual(a, b, eps = 1e-9) {
  return Math.abs(a - b) < eps;
}

// ── AC6: zero deliveries ──────────────────────────────────────────────────────
const empty = calcRetryCountByEventType([]);
check("AC6 – empty input returns empty array", empty.length === 0);

// ── AC6: single event type, single attempt ────────────────────────────────────
const single = calcRetryCountByEventType([{ eventType: "payment.created", attemptCount: 1 }]);
check("AC6 – single type, 1 attempt: one result", single.length === 1);
check("AC6 – single type, 1 attempt: meanRetryCount = 0", approxEqual(single[0].meanRetryCount, 0));
check("AC6 – single type, 1 attempt: webhookCount = 1", single[0].webhookCount === 1);

// ── AC6: single event type, multiple webhooks ─────────────────────────────────
// attempts: 1 (0 retries), 3 (2 retries), 2 (1 retry) → mean = 1.0
const singleMulti = calcRetryCountByEventType([
  { eventType: "payment.created", attemptCount: 1 },
  { eventType: "payment.created", attemptCount: 3 },
  { eventType: "payment.created", attemptCount: 2 },
]);
check("AC6 – single type, 3 webhooks: one result", singleMulti.length === 1);
check("AC6 – single type, 3 webhooks: meanRetryCount = 1.0",
  approxEqual(singleMulti[0].meanRetryCount, 1.0));
check("AC6 – single type, 3 webhooks: webhookCount = 3", singleMulti[0].webhookCount === 3);

// ── AC6: multiple distinct event types ───────────────────────────────────────
// payment.created: 1 (0), 3 (2) → mean = 1.0
// refund.issued:   2 (1), 4 (3) → mean = 2.0
const multi = calcRetryCountByEventType([
  { eventType: "payment.created", attemptCount: 1 },
  { eventType: "payment.created", attemptCount: 3 },
  { eventType: "refund.issued",   attemptCount: 2 },
  { eventType: "refund.issued",   attemptCount: 4 },
]);
check("AC6 – multiple types: two results", multi.length === 2);
const pc = multi.find(r => r.eventType === "payment.created");
const ri = multi.find(r => r.eventType === "refund.issued");
check("AC6 – multiple types: payment.created present", pc !== undefined);
check("AC6 – multiple types: payment.created mean = 1.0",
  pc && approxEqual(pc.meanRetryCount, 1.0));
check("AC6 – multiple types: refund.issued present", ri !== undefined);
check("AC6 – multiple types: refund.issued mean = 2.0",
  ri && approxEqual(ri.meanRetryCount, 2.0));

// ── AC6: 100% failure (all exhausted after max retries) ───────────────────────
// 3 webhooks × 6 attempts each → 5 retries each → mean = 5.0
const allFailed = calcRetryCountByEventType([
  { eventType: "payment.created", attemptCount: 6 },
  { eventType: "payment.created", attemptCount: 6 },
  { eventType: "payment.created", attemptCount: 6 },
]);
check("AC6 – 100% failure: one result", allFailed.length === 1);
check("AC6 – 100% failure: meanRetryCount = 5.0",
  approxEqual(allFailed[0].meanRetryCount, 5.0));

// ── AC4: zero-delivery graceful handling ──────────────────────────────────────
// formatMeanRetryCount(null) must return '—' without throwing
let nullFormatOk = false;
try {
  const formatted = formatMeanRetryCount(null);
  nullFormatOk = formatted === "—";
} catch (e) {
  nullFormatOk = false;
}
check("AC4 – formatMeanRetryCount(null) returns '—' without error", nullFormatOk);

// renderRetryBreakdownTable([]) must not throw
let emptyRenderOk = false;
try {
  const html = renderRetryBreakdownTable([]);
  emptyRenderOk = typeof html === "string" && html.length > 0;
} catch (e) {
  emptyRenderOk = false;
}
check("AC4 – renderRetryBreakdownTable([]) returns string without error", emptyRenderOk);

// ── AC1: alphabetical sort for scannability ───────────────────────────────────
const unsorted = calcRetryCountByEventType([
  { eventType: "refund.issued",   attemptCount: 1 },
  { eventType: "payment.created", attemptCount: 1 },
  { eventType: "dispute.opened",  attemptCount: 1 },
]);
check("AC1 – results sorted alphabetically",
  unsorted[0].eventType === "dispute.opened" &&
  unsorted[1].eventType === "payment.created" &&
  unsorted[2].eventType === "refund.issued");

// ── AC7: table rendering ──────────────────────────────────────────────────────
const tableHtml = renderRetryBreakdownTable([
  { eventType: "payment.created", meanRetryCount: 1.0, webhookCount: 2 },
]);
check("AC7 – renderRetryBreakdownTable produces <table>", tableHtml.includes("<table"));
check("AC7 – table includes event type", tableHtml.includes("payment.created"));
check("AC7 – table includes mean retry value", tableHtml.includes("1.00"));
check("AC7 – table includes webhook count", tableHtml.includes("2"));

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  throw new Error(`${fail} test(s) failed`);
}
HARNESS_EOF

sed -i "s|__COMPILED__|$COMPILED|g" "$HARNESS"

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

# ── Final summary ─────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
