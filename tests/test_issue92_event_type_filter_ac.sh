#!/usr/bin/env bash
# Acceptance-criteria tests for Issue #92: event-type filter.
#
# Independent verification of the three spec-mandated cases:
#   AC1 – single event type selected: only matching entries are returned.
#   AC2 – multiple event types selected: entries matching any selected type
#          are returned; entries of other types are excluded.
#   AC3 – all types cleared (empty selection / "All"): the full unfiltered
#          entry list is returned with no entries hidden.
#
# Spec ref: spec § "Event log filtering — Event-type filter" (test coverage)
#
# Strategy: compile src/eventTypeFilter.ts with tsc and exercise the compiled
# module via a Node.js ESM harness.  No DOM or external test framework needed.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TSC="$REPO_ROOT/node_modules/.bin/tsc"
FILTER_SRC="$REPO_ROOT/src/eventTypeFilter.ts"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── Pre-flight checks ─────────────────────────────────────────────────────────

if [ ! -f "$FILTER_SRC" ]; then
  fail "pre-flight – src/eventTypeFilter.ts does not exist"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – src/eventTypeFilter.ts exists"

# Verify the module exports the expected function and interface names.
if grep -q "export function filterByEventTypes" "$FILTER_SRC"; then
  pass "pre-flight – filterByEventTypes is exported from eventTypeFilter.ts"
else
  fail "pre-flight – filterByEventTypes export not found in eventTypeFilter.ts"
fi

if grep -q "export interface FilterableLogEntry" "$FILTER_SRC"; then
  pass "pre-flight – FilterableLogEntry interface is exported"
else
  fail "pre-flight – FilterableLogEntry interface export not found"
fi

# Verify the empty-selection short-circuit path is present in the source.
if grep -q "selectedTypes.length === 0" "$FILTER_SRC"; then
  pass "pre-flight – empty-selection short-circuit present in source"
else
  fail "pre-flight – empty-selection short-circuit not found in source"
fi

if [ ! -x "$TSC" ]; then
  fail "pre-flight – tsc not found at $TSC (run 'npm install' first)"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – tsc binary is available"

# ── Compile to a temp directory ───────────────────────────────────────────────

TMPDIR_AC="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_AC"' EXIT

TSC_OUT=$(
  "$TSC" \
    --module ESNext \
    --moduleResolution node \
    --target ES2020 \
    --outDir "$TMPDIR_AC/out" \
    --noEmit false \
    --allowImportingTsExtensions false \
    --strict true \
    --skipLibCheck true \
    "$FILTER_SRC" 2>&1
)
TSC_EXIT=$?

if [ "$TSC_EXIT" -eq 0 ]; then
  pass "compile – eventTypeFilter.ts compiles without TypeScript errors"
else
  fail "compile – tsc exited with code $TSC_EXIT"
  echo "$TSC_OUT"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# Mark output as ESM so Node can import it.
echo '{"type":"module"}' > "$TMPDIR_AC/out/package.json"

COMPILED="$TMPDIR_AC/out/eventTypeFilter.js"
HARNESS="$TMPDIR_AC/harness.mjs"

# ── Write the Node.js test harness ───────────────────────────────────────────

cat > "$HARNESS" << 'EOF'
import { filterByEventTypes } from "__COMPILED__";

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

// ── Fixture: 5 entries across 3 event types ───────────────────────────────────
const LOG = [
  { eventType: "payment.created", id: "a" },
  { eventType: "payment.created", id: "b" },
  { eventType: "refund.issued",   id: "c" },
  { eventType: "dispute.opened",  id: "d" },
  { eventType: "refund.issued",   id: "e" },
];

// ── AC1: Single event type selected ──────────────────────────────────────────
// Only entries whose eventType equals the selected type must be returned.
const ac1 = filterByEventTypes(LOG, ["payment.created"]);
assert("AC1 – single type: correct count (2 of 5)", ac1.length === 2);
assert("AC1 – single type: all returned entries match selected type",
  ac1.every(e => e.eventType === "payment.created"));
assert("AC1 – single type: no non-matching entries present",
  !ac1.some(e => e.eventType !== "payment.created"));

// Confirm with a second distinct type.
const ac1b = filterByEventTypes(LOG, ["dispute.opened"]);
assert("AC1 – single type (dispute.opened): correct count (1 of 5)", ac1b.length === 1);
assert("AC1 – single type (dispute.opened): returned entry matches",
  ac1b[0].eventType === "dispute.opened");

// ── AC2: Multiple event types selected ───────────────────────────────────────
// Entries matching ANY of the selected types are returned; others excluded.
const ac2 = filterByEventTypes(LOG, ["payment.created", "dispute.opened"]);
assert("AC2 – two types: correct count (3 of 5)", ac2.length === 3);
assert("AC2 – two types: payment.created entries included",
  ac2.some(e => e.eventType === "payment.created"));
assert("AC2 – two types: dispute.opened entries included",
  ac2.some(e => e.eventType === "dispute.opened"));
assert("AC2 – two types: refund.issued entries excluded",
  !ac2.some(e => e.eventType === "refund.issued"));

// All three types selected — must return every entry.
const ac2all = filterByEventTypes(LOG, ["payment.created", "refund.issued", "dispute.opened"]);
assert("AC2 – all three types selected: returns all 5 entries",
  ac2all.length === LOG.length);

// ── AC3: All types cleared (empty selectedTypes) ──────────────────────────────
// An empty array means no filter is active; the full list must be returned.
const ac3 = filterByEventTypes(LOG, []);
assert("AC3 – cleared: returns full list (5 entries)", ac3.length === LOG.length);
assert("AC3 – cleared: result is the same reference as input", ac3 === LOG);
assert("AC3 – cleared: all event types present in result",
  ["payment.created", "refund.issued", "dispute.opened"]
    .every(t => ac3.some(e => e.eventType === t)));

// ── Edge cases ────────────────────────────────────────────────────────────────
// Type not present in log → empty result.
const edgeUnknown = filterByEventTypes(LOG, ["charge.failed"]);
assert("edge – unknown type: returns empty array", edgeUnknown.length === 0);

// Empty log with a filter → empty result.
const edgeEmptyLog = filterByEventTypes([], ["payment.created"]);
assert("edge – empty log with filter: returns empty array", edgeEmptyLog.length === 0);

// Empty log, no filter → empty result.
const edgeEmptyBoth = filterByEventTypes([], []);
assert("edge – empty log, no filter: returns empty array", edgeEmptyBoth.length === 0);

// Generic type parameter preserved: extra fields survive filtering.
const rich = [
  { eventType: "payment.created", amount: 100, currency: "USD" },
  { eventType: "refund.issued",   amount: 50,  currency: "AUD" },
];
const richFiltered = filterByEventTypes(rich, ["payment.created"]);
assert("edge – generic T: extra fields preserved on returned entries",
  richFiltered.length === 1 && richFiltered[0].amount === 100);

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
