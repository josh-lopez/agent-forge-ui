#!/usr/bin/env bash
# Acceptance-criteria tests for Issue #160: time-to-delivery stats.
#
# Verifies:
#   AC1  – calculateTimeToDelivery function exists and returns overall +
#           per-event-type stats.
#   AC2  – duration measured from initial attempt to first delivered event.
#   AC5  – zero deliveries → safe null state (no crash, no NaN).
#   AC6  – 100 % failure → stats omitted / null.
#   AC7  – single attempt → median === p95 === that single value.
#   AC8  – representative multi-event fixture with correct median and p95.
#   AC9  – works with simulator-shaped data.
#
# Strategy: compile src/timeToDelivery.ts with tsc and exercise the compiled
# module via a Node.js ESM harness.  No DOM or external test framework needed.
#
# Percentile method: nearest-rank (lower-inclusive).
#   rank = ceil(p / 100 * N), value = sorted[rank - 1]

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TSC="$REPO_ROOT/node_modules/.bin/tsc"
SRC="$REPO_ROOT/src/timeToDelivery.ts"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── Pre-flight checks ─────────────────────────────────────────────────────────

if [ ! -f "$SRC" ]; then
  fail "pre-flight – src/timeToDelivery.ts does not exist"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – src/timeToDelivery.ts exists"

# Verify the module exports the expected function and types.
if grep -q "export function calculateTimeToDelivery" "$SRC"; then
  pass "pre-flight – calculateTimeToDelivery is exported"
else
  fail "pre-flight – calculateTimeToDelivery export not found"
fi

if grep -q "export interface DeliveryAttemptEvent" "$SRC"; then
  pass "pre-flight – DeliveryAttemptEvent interface is exported"
else
  fail "pre-flight – DeliveryAttemptEvent interface export not found"
fi

if grep -q "export interface TimeToDeliveryResult" "$SRC"; then
  pass "pre-flight – TimeToDeliveryResult interface is exported"
else
  fail "pre-flight – TimeToDeliveryResult interface export not found"
fi

# Verify the percentile method is documented.
if grep -q "nearest-rank" "$SRC"; then
  pass "pre-flight – interpolation method (nearest-rank) is documented in source"
else
  fail "pre-flight – interpolation method not documented in source"
fi

# Verify webhooks without 'delivered' are explicitly excluded.
if grep -q "status === 'delivered'" "$SRC"; then
  pass "pre-flight – explicit 'delivered' status check present in source"
else
  fail "pre-flight – 'delivered' status check not found in source"
fi

if [ ! -x "$TSC" ]; then
  fail "pre-flight – tsc not found at $TSC (run 'npm install' first)"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – tsc binary is available"

# ── Compile to a temp directory ───────────────────────────────────────────────

TMPDIR_160="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_160"' EXIT

TSC_OUT=$(
  "$TSC" \
    --module ESNext \
    --moduleResolution node \
    --target ES2020 \
    --outDir "$TMPDIR_160/out" \
    --noEmit false \
    --allowImportingTsExtensions false \
    --strict true \
    --skipLibCheck true \
    "$SRC" 2>&1
)
TSC_EXIT=$?

if [ "$TSC_EXIT" -eq 0 ]; then
  pass "compile – timeToDelivery.ts compiles without TypeScript errors"
else
  fail "compile – tsc exited with code $TSC_EXIT"
  echo "$TSC_OUT"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

echo '{"type":"module"}' > "$TMPDIR_160/out/package.json"

COMPILED="$TMPDIR_160/out/timeToDelivery.js"
HARNESS="$TMPDIR_160/harness.mjs"

# ── Write the Node.js test harness ───────────────────────────────────────────

cat > "$HARNESS" << 'EOF'
import { calculateTimeToDelivery } from "__COMPILED__";

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

function evt(webhookId, eventType, status, attemptIndex, timestamp) {
  return { webhookId, eventType, status, attemptIndex, timestamp };
}

// ── AC5: Zero deliveries ──────────────────────────────────────────────────────
const empty = calculateTimeToDelivery([]);
assert("AC5 – empty array: overall.medianMs is null",  empty.overall.medianMs === null);
assert("AC5 – empty array: overall.p95Ms is null",     empty.overall.p95Ms === null);
assert("AC5 – empty array: overall.sampleSize is 0",   empty.overall.sampleSize === 0);
assert("AC5 – empty array: byEventType is empty object",
  Object.keys(empty.byEventType).length === 0);
assert("AC5 – empty array: no NaN in medianMs",
  empty.overall.medianMs !== empty.overall.medianMs === false); // null !== NaN

// ── AC6: 100% failure ─────────────────────────────────────────────────────────
const allFailed = calculateTimeToDelivery([
  evt("wh-1", "payment.created", "failed",    0, "2024-01-01T00:00:00Z"),
  evt("wh-1", "payment.created", "failed",    1, "2024-01-01T00:01:00Z"),
  evt("wh-1", "payment.created", "exhausted", 2, "2024-01-01T00:05:00Z"),
]);
assert("AC6 – all failed: overall.medianMs is null",  allFailed.overall.medianMs === null);
assert("AC6 – all failed: overall.p95Ms is null",     allFailed.overall.p95Ms === null);
assert("AC6 – all failed: overall.sampleSize is 0",   allFailed.overall.sampleSize === 0);
assert("AC6 – all failed: byEventType has no entries",
  Object.keys(allFailed.byEventType).length === 0);

// ── AC7: Single attempt ───────────────────────────────────────────────────────
const singleImmediate = calculateTimeToDelivery([
  evt("wh-1", "payment.created", "delivered", 0, "2024-01-01T00:00:00Z"),
]);
assert("AC7 – single immediate: sampleSize is 1",   singleImmediate.overall.sampleSize === 1);
assert("AC7 – single immediate: medianMs is 0",     singleImmediate.overall.medianMs === 0);
assert("AC7 – single immediate: p95Ms is 0",        singleImmediate.overall.p95Ms === 0);
assert("AC7 – single immediate: median === p95",
  singleImmediate.overall.medianMs === singleImmediate.overall.p95Ms);

const singleDelayed = calculateTimeToDelivery([
  evt("wh-1", "payment.created", "failed",    0, "2024-01-01T00:00:00Z"),
  evt("wh-1", "payment.created", "delivered", 1, "2024-01-01T00:05:00Z"),
]);
const expectedSingle = 5 * 60 * 1000; // 300 000 ms
assert("AC7 – single delayed: medianMs equals duration",
  singleDelayed.overall.medianMs === expectedSingle);
assert("AC7 – single delayed: p95Ms equals duration",
  singleDelayed.overall.p95Ms === expectedSingle);
assert("AC7 – single delayed: median === p95",
  singleDelayed.overall.medianMs === singleDelayed.overall.p95Ms);

// ── AC2: Duration measurement ─────────────────────────────────────────────────
// Measures from initial attempt (attemptIndex 0) to first delivered event.
const durationTest = calculateTimeToDelivery([
  evt("wh-1", "payment.created", "failed",    0, "2024-01-01T00:00:00Z"),
  evt("wh-1", "payment.created", "delivered", 1, "2024-01-01T00:02:00Z"),
  evt("wh-1", "payment.created", "delivered", 2, "2024-01-01T00:05:00Z"), // later — ignored
]);
assert("AC2 – uses first delivered, not last: medianMs is 120 000",
  durationTest.overall.medianMs === 2 * 60 * 1000);

// Out-of-order arrival.
const outOfOrder = calculateTimeToDelivery([
  evt("wh-1", "payment.created", "delivered", 2, "2024-01-01T00:10:00Z"),
  evt("wh-1", "payment.created", "failed",    1, "2024-01-01T00:05:00Z"),
  evt("wh-1", "payment.created", "failed",    0, "2024-01-01T00:00:00Z"),
]);
assert("AC2 – out-of-order: sorts by attemptIndex before measuring",
  outOfOrder.overall.medianMs === 10 * 60 * 1000);

// Epoch-ms timestamps.
const t0 = 1700000000000;
const epochTest = calculateTimeToDelivery([
  evt("wh-1", "payment.created", "failed",    0, t0),
  evt("wh-1", "payment.created", "delivered", 1, t0 + 45000),
]);
assert("AC2 – epoch-ms timestamps normalised correctly",
  epochTest.overall.medianMs === 45000);

// ── AC1 + AC8: Multi-event fixture ────────────────────────────────────────────
//
// payment.created durations: [60k, 120k, 180k, 240k, 300k]  N=5
//   median (p50): rank=ceil(2.5)=3 → 180 000
//   p95:          rank=ceil(4.75)=5 → 300 000
//
// refund.issued durations: [10k, 20k]  N=2
//   median (p50): rank=ceil(1)=1 → 10 000
//   p95:          rank=ceil(1.9)=2 → 20 000
//
// overall [10k, 20k, 60k, 120k, 180k, 240k, 300k]  N=7
//   median (p50): rank=ceil(3.5)=4 → 120 000
//   p95:          rank=ceil(6.65)=7 → 300 000

const BASE = new Date("2024-01-01T00:00:00Z").getTime();
function makeWebhook(id, eventType, durationMs) {
  return [
    evt(id, eventType, "failed",    0, BASE),
    evt(id, eventType, "delivered", 1, BASE + durationMs),
  ];
}

const fixture = [
  ...makeWebhook("pc-1", "payment.created",  60000),
  ...makeWebhook("pc-2", "payment.created", 120000),
  ...makeWebhook("pc-3", "payment.created", 180000),
  ...makeWebhook("pc-4", "payment.created", 240000),
  ...makeWebhook("pc-5", "payment.created", 300000),
  ...makeWebhook("ri-1", "refund.issued",    10000),
  ...makeWebhook("ri-2", "refund.issued",    20000),
];

const multi = calculateTimeToDelivery(fixture);

assert("AC1 – result has 'overall' key",     "overall" in multi);
assert("AC1 – result has 'byEventType' key", "byEventType" in multi);
assert("AC8 – overall sampleSize is 7",      multi.overall.sampleSize === 7);
assert("AC8 – overall median is 120 000",    multi.overall.medianMs === 120000);
assert("AC8 – overall p95 is 300 000",       multi.overall.p95Ms === 300000);

const pc = multi.byEventType["payment.created"];
assert("AC8 – payment.created exists in byEventType", pc !== undefined);
assert("AC8 – payment.created sampleSize is 5",       pc && pc.sampleSize === 5);
assert("AC8 – payment.created median is 180 000",     pc && pc.medianMs === 180000);
assert("AC8 – payment.created p95 is 300 000",        pc && pc.p95Ms === 300000);

const ri = multi.byEventType["refund.issued"];
assert("AC8 – refund.issued exists in byEventType",   ri !== undefined);
assert("AC8 – refund.issued sampleSize is 2",         ri && ri.sampleSize === 2);
assert("AC8 – refund.issued median is 10 000",        ri && ri.medianMs === 10000);
assert("AC8 – refund.issued p95 is 20 000",           ri && ri.p95Ms === 20000);

assert("AC8 – dispute.opened not in byEventType",
  multi.byEventType["dispute.opened"] === undefined);

// ── AC9: Simulator-shaped data ────────────────────────────────────────────────
const simEvents = [
  {
    webhookId: "sim-wh-001",
    eventType: "payment.created",
    status: "failed",
    attemptIndex: 0,
    timestamp: "2024-03-01T10:00:00.000Z",
  },
  {
    webhookId: "sim-wh-001",
    eventType: "payment.created",
    status: "failed",
    attemptIndex: 1,
    timestamp: "2024-03-01T10:01:00.000Z",
  },
  {
    webhookId: "sim-wh-001",
    eventType: "payment.created",
    status: "delivered",
    attemptIndex: 2,
    timestamp: "2024-03-01T10:06:00.000Z",
  },
];
const simResult = calculateTimeToDelivery(simEvents);
assert("AC9 – simulator data: sampleSize is 1",         simResult.overall.sampleSize === 1);
assert("AC9 – simulator data: medianMs is 360 000",     simResult.overall.medianMs === 360000);
assert("AC9 – simulator data: p95Ms is 360 000",        simResult.overall.p95Ms === 360000);
assert("AC9 – simulator data: byEventType has payment.created",
  simResult.byEventType["payment.created"] !== undefined);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  throw new Error(`${fail} test(s) failed`);
}
EOF

# Inject the compiled module path.
sed -i "s|__COMPILED__|$COMPILED|g" "$HARNESS"

# ── Run the harness ───────────────────────────────────────────────────────────

HARNESS_OUT=$(node "$HARNESS" 2>&1)
HARNESS_EXIT=$?

while IFS= read -r line; do
  case "$line" in
    PASS:*) pass "${line#PASS: }" ;;
    FAIL:*) fail "${line#FAIL: }" ;;
    *)      echo "$line" ;;
  esac
done <<< "$HARNESS_OUT"

if [ "$HARNESS_EXIT" -ne 0 ] && ! echo "$HARNESS_OUT" | grep -q "^FAIL:"; then
  fail "harness – node exited with code $HARNESS_EXIT (unexpected error)"
fi

# ── Final summary ─────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
