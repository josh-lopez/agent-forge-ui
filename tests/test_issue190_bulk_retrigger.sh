#!/usr/bin/env bash
# Acceptance-criteria tests for Issue #190: Bulk re-trigger action for
# exhausted webhooks.
#
# Verifies the following acceptance criteria via source inspection and a
# compiled Node.js ESM harness:
#
#   AC1  – bulk action control is visible when one or more webhooks are
#           in the 'exhausted' state (hasExhaustedWebhooks returns true).
#   AC2  – activating the bulk action re-triggers all currently exhausted
#           webhooks in a single call.
#   AC3  – each re-triggered webhook transitions from 'exhausted' → 'pending'.
#   AC5  – control is disabled/hidden when no exhausted webhooks exist
#           (hasExhaustedWebhooks returns false).
#   AC8  – webhooks in other states (pending/delivered/failed) are unaffected.
#   AC9  – unit tests cover: multiple exhausted, none exhausted, correct
#           state transition per re-triggered webhook.
#
# Strategy: compile src/bulkRetrigger.ts and src/webhookTypes.ts with tsc and
# exercise the compiled modules via a Node.js ESM harness. No DOM or external
# test framework is required.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TSC="$REPO_ROOT/node_modules/.bin/tsc"
BULK_SRC="$REPO_ROOT/src/bulkRetrigger.ts"
TYPES_SRC="$REPO_ROOT/src/webhookTypes.ts"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── Pre-flight checks ─────────────────────────────────────────────────────────

if [ ! -f "$BULK_SRC" ]; then
  fail "pre-flight – src/bulkRetrigger.ts does not exist"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – src/bulkRetrigger.ts exists"

if [ ! -f "$TYPES_SRC" ]; then
  fail "pre-flight – src/webhookTypes.ts does not exist"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – src/webhookTypes.ts exists"

# Verify the module exports the expected function names.
if grep -q "export function bulkRetriggerExhausted" "$BULK_SRC"; then
  pass "pre-flight – bulkRetriggerExhausted is exported from bulkRetrigger.ts"
else
  fail "pre-flight – bulkRetriggerExhausted export not found in bulkRetrigger.ts"
fi

if grep -q "export function hasExhaustedWebhooks" "$BULK_SRC"; then
  pass "pre-flight – hasExhaustedWebhooks is exported from bulkRetrigger.ts"
else
  fail "pre-flight – hasExhaustedWebhooks export not found in bulkRetrigger.ts"
fi

# Verify the BulkRetriggerResult interface is exported.
if grep -q "export interface BulkRetriggerResult" "$BULK_SRC"; then
  pass "pre-flight – BulkRetriggerResult interface is exported"
else
  fail "pre-flight – BulkRetriggerResult interface export not found"
fi

# Verify the WebhookStatus type includes 'exhausted'.
if grep -q "exhausted" "$TYPES_SRC"; then
  pass "pre-flight – 'exhausted' status is defined in webhookTypes.ts"
else
  fail "pre-flight – 'exhausted' status not found in webhookTypes.ts"
fi

# Verify the pure-function contract: no mutation of input.
if grep -q "\.\.\.entry" "$BULK_SRC"; then
  pass "pre-flight – spread copy used (immutable update pattern)"
else
  fail "pre-flight – spread copy not found; input may be mutated"
fi

if [ ! -x "$TSC" ]; then
  fail "pre-flight – tsc not found at $TSC (run 'npm install' first)"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – tsc binary is available"

# ── Compile to a temp directory ───────────────────────────────────────────────

TMPDIR_190="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_190"' EXIT

TSC_OUT=$(
  "$TSC" \
    --module ESNext \
    --moduleResolution node \
    --target ES2020 \
    --outDir "$TMPDIR_190/out" \
    --noEmit false \
    --allowImportingTsExtensions false \
    --strict true \
    --skipLibCheck true \
    "$BULK_SRC" "$TYPES_SRC" 2>&1
)
TSC_EXIT=$?

if [ "$TSC_EXIT" -eq 0 ]; then
  pass "compile – bulkRetrigger.ts and webhookTypes.ts compile without errors"
else
  fail "compile – tsc exited with code $TSC_EXIT"
  echo "$TSC_OUT"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# Mark output as ESM so Node can import it.
echo '{"type":"module"}' > "$TMPDIR_190/out/package.json"

COMPILED_BULK="$TMPDIR_190/out/bulkRetrigger.js"
HARNESS="$TMPDIR_190/harness.mjs"

# ── Write the Node.js test harness ───────────────────────────────────────────

cat > "$HARNESS" << 'EOF'
import { bulkRetriggerExhausted, hasExhaustedWebhooks } from "__COMPILED_BULK__";

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

function makeEntry(id, status, eventType = "payment.created") {
  return { id, eventType, status, attempts: [] };
}

// ── AC9: Multiple exhausted webhooks ─────────────────────────────────────────
const multiExhausted = [
  makeEntry("w1", "exhausted"),
  makeEntry("w2", "exhausted"),
  makeEntry("w3", "exhausted"),
];
const multiResult = bulkRetriggerExhausted(multiExhausted);
assert("AC9/AC2 – multiple exhausted: retriggeredIds has 3 entries",
  multiResult.retriggeredIds.length === 3);
assert("AC9/AC2 – multiple exhausted: w1 is in retriggeredIds",
  multiResult.retriggeredIds.includes("w1"));
assert("AC9/AC2 – multiple exhausted: w2 is in retriggeredIds",
  multiResult.retriggeredIds.includes("w2"));
assert("AC9/AC2 – multiple exhausted: w3 is in retriggeredIds",
  multiResult.retriggeredIds.includes("w3"));
assert("AC9/AC3 – multiple exhausted: all updated entries are pending",
  multiResult.updatedEntries.every(e => e.status === "pending"));

// ── AC9: No exhausted webhooks ────────────────────────────────────────────────
const noneExhausted = [
  makeEntry("p1", "pending"),
  makeEntry("d1", "delivered"),
  makeEntry("f1", "failed"),
];
const noneResult = bulkRetriggerExhausted(noneExhausted);
assert("AC9/AC5 – no exhausted: retriggeredIds is empty",
  noneResult.retriggeredIds.length === 0);
assert("AC9/AC5 – no exhausted: updatedEntries count unchanged",
  noneResult.updatedEntries.length === 3);
assert("AC9/AC8 – no exhausted: pending entry status unchanged",
  noneResult.updatedEntries[0].status === "pending");
assert("AC9/AC8 – no exhausted: delivered entry status unchanged",
  noneResult.updatedEntries[1].status === "delivered");
assert("AC9/AC8 – no exhausted: failed entry status unchanged",
  noneResult.updatedEntries[2].status === "failed");

// ── AC9: Correct state transition per re-triggered webhook ────────────────────
const singleExhausted = [makeEntry("e1", "exhausted", "refund.issued")];
const singleResult = bulkRetriggerExhausted(singleExhausted);
assert("AC9/AC3 – single exhausted: status transitions to pending",
  singleResult.updatedEntries[0].status === "pending");
assert("AC9/AC3 – single exhausted: id preserved",
  singleResult.updatedEntries[0].id === "e1");
assert("AC9/AC3 – single exhausted: eventType preserved",
  singleResult.updatedEntries[0].eventType === "refund.issued");
assert("AC9/AC3 – single exhausted: retriggeredIds contains e1",
  singleResult.retriggeredIds[0] === "e1");

// ── AC8: Only exhausted webhooks are affected ─────────────────────────────────
const mixed = [
  makeEntry("p1", "pending"),
  makeEntry("e1", "exhausted"),
  makeEntry("d1", "delivered"),
  makeEntry("f1", "failed"),
  makeEntry("e2", "exhausted"),
];
const mixedResult = bulkRetriggerExhausted(mixed);
assert("AC8 – mixed: only 2 entries re-triggered",
  mixedResult.retriggeredIds.length === 2);
assert("AC8 – mixed: pending entry is same reference (not copied)",
  mixedResult.updatedEntries[0] === mixed[0]);
assert("AC8 – mixed: delivered entry is same reference (not copied)",
  mixedResult.updatedEntries[2] === mixed[2]);
assert("AC8 – mixed: failed entry is same reference (not copied)",
  mixedResult.updatedEntries[3] === mixed[3]);
assert("AC8 – mixed: exhausted e1 is now pending",
  mixedResult.updatedEntries[1].status === "pending");
assert("AC8 – mixed: exhausted e2 is now pending",
  mixedResult.updatedEntries[4].status === "pending");

// ── AC1/AC5: hasExhaustedWebhooks ─────────────────────────────────────────────
assert("AC1 – hasExhaustedWebhooks: true when one exhausted entry present",
  hasExhaustedWebhooks([makeEntry("e1", "exhausted")]) === true);
assert("AC1 – hasExhaustedWebhooks: true when multiple exhausted entries present",
  hasExhaustedWebhooks([makeEntry("e1", "exhausted"), makeEntry("e2", "exhausted")]) === true);
assert("AC5 – hasExhaustedWebhooks: false when no exhausted entries",
  hasExhaustedWebhooks([makeEntry("p1", "pending"), makeEntry("d1", "delivered")]) === false);
assert("AC5 – hasExhaustedWebhooks: false for empty list",
  hasExhaustedWebhooks([]) === false);

// ── Immutability: input must not be mutated ───────────────────────────────────
const immutCheck = [makeEntry("e1", "exhausted")];
const originalStatus = immutCheck[0].status;
bulkRetriggerExhausted(immutCheck);
assert("immutability – input entry status not mutated",
  immutCheck[0].status === originalStatus);

// ── Edge case: empty list ─────────────────────────────────────────────────────
const emptyResult = bulkRetriggerExhausted([]);
assert("edge – empty list: updatedEntries is empty", emptyResult.updatedEntries.length === 0);
assert("edge – empty list: retriggeredIds is empty", emptyResult.retriggeredIds.length === 0);

// ── Simulator compatibility: entries with attempt history ─────────────────────
const simEntries = [
  {
    id: "sim-1",
    eventType: "payment.created",
    status: "exhausted",
    attempts: [
      { timestamp: "2024-01-01T00:00:00Z", httpStatus: 500, responseExcerpt: "Error" },
      { timestamp: "2024-01-01T00:01:00Z", httpStatus: 503, responseExcerpt: "Unavailable" },
    ],
  },
  {
    id: "sim-2",
    eventType: "refund.issued",
    status: "delivered",
    attempts: [
      { timestamp: "2024-01-01T00:00:00Z", httpStatus: 200, responseExcerpt: "OK" },
    ],
  },
];
const simResult = bulkRetriggerExhausted(simEntries);
assert("AC7 – simulator: exhausted entry re-triggered",
  simResult.retriggeredIds[0] === "sim-1");
assert("AC7 – simulator: re-triggered entry is pending",
  simResult.updatedEntries[0].status === "pending");
assert("AC7 – simulator: attempt history preserved",
  simResult.updatedEntries[0].attempts.length === 2);
assert("AC7 – simulator: delivered entry unchanged",
  simResult.updatedEntries[1] === simEntries[1]);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  throw new Error(`${fail} test(s) failed`);
}
EOF

# Inject the compiled module path.
sed -i "s|__COMPILED_BULK__|$COMPILED_BULK|g" "$HARNESS"

# ── Run the harness ───────────────────────────────────────────────────────────

HARNESS_OUT=$(node "$HARNESS" 2>&1)
HARNESS_EXIT=$?

# Relay individual PASS/FAIL lines to the shell counters.
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
