#!/usr/bin/env bash
# Tests for Issue #92: Unit tests for event-type filter logic.
#
# Covers the three cases mandated by the spec:
#   AC1 – single event type selected: only matching entries are returned.
#   AC2 – multiple event types selected: entries matching any selected type
#          are returned; entries of other types are excluded.
#   AC3 – all types cleared (empty selection): the full unfiltered entry list
#          is returned with no entries hidden.
#
# Spec ref: spec § "Event log filtering — Event-type filter" (test coverage)
#
# Strategy: compile src/eventTypeFilter.ts to a temp directory with tsc and
# run a Node.js ESM test harness against the compiled output.  No DOM or
# external test framework is required.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TSC="$REPO_ROOT/node_modules/.bin/tsc"
FILTER_SRC="$REPO_ROOT/src/eventTypeFilter.ts"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── Pre-flight: required files exist ─────────────────────────────────────────

if [ ! -f "$FILTER_SRC" ]; then
  fail "pre-flight – src/eventTypeFilter.ts does not exist"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – src/eventTypeFilter.ts exists"

if [ ! -x "$TSC" ]; then
  fail "pre-flight – tsc not found at $TSC (run 'npm install' first)"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – tsc binary is available"

# ── Compile src/eventTypeFilter.ts to a temp directory ───────────────────────

TMPDIR_COMPILE="$(mktemp -d)"
# Ensure cleanup on exit
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
    "$FILTER_SRC" 2>&1
)
TSC_EXIT=$?

if [ "$TSC_EXIT" -eq 0 ]; then
  pass "compile – src/eventTypeFilter.ts compiles without errors"
else
  fail "compile – tsc exited with code $TSC_EXIT"
  echo "$TSC_OUTPUT"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# Mark the output directory as an ES module package so Node can import it.
echo '{"type":"module"}' > "$TMPDIR_COMPILE/out/package.json"

# ── Write the Node.js test harness ───────────────────────────────────────────

HARNESS="$TMPDIR_COMPILE/run_tests.mjs"
COMPILED_FILTER="$TMPDIR_COMPILE/out/eventTypeFilter.js"

cat > "$HARNESS" << 'HARNESS_EOF'
// Node.js ESM test harness for filterByEventTypes.
// Imported path is injected by the shell script via sed below.
import { filterByEventTypes } from "__FILTER_PATH__";

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

// ── Fixture dataset ───────────────────────────────────────────────────────────
// Three distinct event types; at least two entries per type to make the
// single-type and multi-type cases meaningful (avoids false-positive passes).
const entries = [
  { id: 1, eventType: "payment.created", timestamp: "2024-01-01T00:00:00Z", status: "delivered" },
  { id: 2, eventType: "refund.issued",   timestamp: "2024-01-01T01:00:00Z", status: "delivered" },
  { id: 3, eventType: "payment.created", timestamp: "2024-01-01T02:00:00Z", status: "failed"    },
  { id: 4, eventType: "dispute.opened",  timestamp: "2024-01-01T03:00:00Z", status: "pending"   },
  { id: 5, eventType: "refund.issued",   timestamp: "2024-01-01T04:00:00Z", status: "failed"    },
  { id: 6, eventType: "dispute.opened",  timestamp: "2024-01-01T05:00:00Z", status: "delivered" },
];

// ── AC1: Single event type selected ──────────────────────────────────────────
// Only entries whose eventType matches the single selected type are returned.
const single = filterByEventTypes(entries, ["payment.created"]);
check("AC1 – single type: result count matches fixture (2)", single.length === 2);
check("AC1 – single type: every returned entry matches selected type",
  single.every(e => e.eventType === "payment.created"));
check("AC1 – single type: no entries of other types included",
  single.every(e => e.eventType !== "refund.issued" && e.eventType !== "dispute.opened"));

// Verify with a different single type to rule out hard-coded behaviour.
const singleRefund = filterByEventTypes(entries, ["refund.issued"]);
check("AC1 – single type (refund.issued): result count matches fixture (2)",
  singleRefund.length === 2);
check("AC1 – single type (refund.issued): every returned entry matches selected type",
  singleRefund.every(e => e.eventType === "refund.issued"));

// ── AC2: Multiple event types selected ───────────────────────────────────────
// Entries matching any one of the selected types are returned; others excluded.
const multi = filterByEventTypes(entries, ["payment.created", "refund.issued"]);
check("AC2 – multiple types: result count matches fixture (4)", multi.length === 4);
check("AC2 – multiple types: includes entries of first selected type",
  multi.some(e => e.eventType === "payment.created"));
check("AC2 – multiple types: includes entries of second selected type",
  multi.some(e => e.eventType === "refund.issued"));
check("AC2 – multiple types: excludes entries of unselected type",
  multi.every(e => e.eventType !== "dispute.opened"));

// All three types selected — should return all entries.
const allThree = filterByEventTypes(entries, ["payment.created", "refund.issued", "dispute.opened"]);
check("AC2 – all three types explicitly selected: returns all entries",
  allThree.length === entries.length);

// ── AC3: All types cleared (empty selection) ──────────────────────────────────
// An empty selectedTypes array means no filter is active; the full list is returned.
const cleared = filterByEventTypes(entries, []);
check("AC3 – all cleared: returns full entry list", cleared.length === entries.length);
check("AC3 – all cleared: includes payment.created entries",
  cleared.some(e => e.eventType === "payment.created"));
check("AC3 – all cleared: includes refund.issued entries",
  cleared.some(e => e.eventType === "refund.issued"));
check("AC3 – all cleared: includes dispute.opened entries",
  cleared.some(e => e.eventType === "dispute.opened"));

// ── Edge cases ────────────────────────────────────────────────────────────────
// Type that does not exist in the fixture → empty result.
const noMatch = filterByEventTypes(entries, ["charge.failed"]);
check("edge – unknown type: returns empty array", noMatch.length === 0);

// Empty entries list → always returns empty regardless of filter.
const emptyEntries = filterByEventTypes([], ["payment.created"]);
check("edge – empty entries with filter: returns empty array", emptyEntries.length === 0);

const emptyBoth = filterByEventTypes([], []);
check("edge – empty entries, no filter: returns empty array", emptyBoth.length === 0);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  throw new Error(`${fail} test(s) failed`);
}
HARNESS_EOF

# Inject the compiled filter path (use | as sed delimiter to avoid / conflicts).
sed -i "s|__FILTER_PATH__|$COMPILED_FILTER|g" "$HARNESS"

# ── Run the harness ───────────────────────────────────────────────────────────

HARNESS_OUTPUT=$(node "$HARNESS" 2>&1)
HARNESS_EXIT=$?

# Parse individual PASS/FAIL lines from the harness output and relay them.
while IFS= read -r line; do
  case "$line" in
    PASS:*) pass "${line#PASS: }" ;;
    FAIL:*) fail "${line#FAIL: }" ;;
    *)      echo "$line" ;;
  esac
done <<< "$HARNESS_OUTPUT"

if [ "$HARNESS_EXIT" -ne 0 ] && ! echo "$HARNESS_OUTPUT" | grep -q "^FAIL:"; then
  # Harness threw an uncaught error not already counted above.
  fail "harness – node exited with code $HARNESS_EXIT (unexpected error)"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
