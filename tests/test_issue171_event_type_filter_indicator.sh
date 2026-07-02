#!/usr/bin/env bash
# Tests for Issue #171: Active-filter indicator and clear-all control for the
# event-type filter.
#
# Acceptance criteria verified here:
#   AC1  – indicator rendered when ≥1 type selected
#   AC2  – indicator NOT rendered when no filter applied
#   AC3  – clear-all control rendered alongside indicator when active
#   AC4  – clear-all resets to default (empty array) in one action
#   AC5  – after clear-all, indicator disappears
#   AC6  – clearing event-type filter does not affect other filter state
#   AC7  – unit tests cover the three mandated cases (verified via vitest)
#   AC8  – clear-all button has aria-label (keyboard-accessible)
#
# Strategy: compile src/eventTypeFilterIndicator.ts with tsc and exercise the
# compiled module via a Node.js ESM harness.  DOM interactions are simulated
# using jsdom (available as a project devDependency), loaded via createRequire.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TSC="$REPO_ROOT/node_modules/.bin/tsc"
INDICATOR_SRC="$REPO_ROOT/src/eventTypeFilterIndicator.ts"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── Pre-flight: required files exist ─────────────────────────────────────────

if [ ! -f "$INDICATOR_SRC" ]; then
  fail "pre-flight – src/eventTypeFilterIndicator.ts does not exist"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – src/eventTypeFilterIndicator.ts exists"

if [ ! -x "$TSC" ]; then
  fail "pre-flight – tsc not found at $TSC (run 'npm install' first)"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi
pass "pre-flight – tsc binary is available"

# ── Source-level checks ───────────────────────────────────────────────────────

# isEventTypeFilterActive must be exported
if grep -q "export function isEventTypeFilterActive" "$INDICATOR_SRC"; then
  pass "source – isEventTypeFilterActive is exported"
else
  fail "source – isEventTypeFilterActive export not found"
fi

# clearEventTypeFilter must be exported
if grep -q "export function clearEventTypeFilter" "$INDICATOR_SRC"; then
  pass "source – clearEventTypeFilter is exported"
else
  fail "source – clearEventTypeFilter export not found"
fi

# renderEventTypeFilterIndicator must be exported
if grep -q "export function renderEventTypeFilterIndicator" "$INDICATOR_SRC"; then
  pass "source – renderEventTypeFilterIndicator is exported"
else
  fail "source – renderEventTypeFilterIndicator export not found"
fi

# aria-label must be present in the DOM rendering code (AC8)
if grep -q "aria-label" "$INDICATOR_SRC"; then
  pass "source – aria-label attribute is set on the clear-all control (AC8)"
else
  fail "source – aria-label attribute not found in renderEventTypeFilterIndicator (AC8)"
fi

# The clear-all control must be a <button> element (keyboard-accessible, AC8)
if grep -q "createElement('button')" "$INDICATOR_SRC" || grep -q 'createElement("button")' "$INDICATOR_SRC"; then
  pass "source – clear-all control uses a <button> element (natively keyboard-accessible, AC8)"
else
  fail "source – clear-all control does not use a <button> element (AC8)"
fi

# ── Compile src/eventTypeFilterIndicator.ts ───────────────────────────────────

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
    --lib "ES2020,DOM" \
    "$INDICATOR_SRC" 2>&1
)
TSC_EXIT=$?

if [ "$TSC_EXIT" -eq 0 ]; then
  pass "compile – src/eventTypeFilterIndicator.ts compiles without errors"
else
  fail "compile – tsc exited with code $TSC_EXIT"
  echo "$TSC_OUTPUT"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

echo '{"type":"module"}' > "$TMPDIR_COMPILE/out/package.json"

# ── Write the Node.js test harness ───────────────────────────────────────────

HARNESS="$TMPDIR_COMPILE/run_tests.mjs"
COMPILED_INDICATOR="$TMPDIR_COMPILE/out/eventTypeFilterIndicator.js"

cat > "$HARNESS" << 'HARNESS_EOF'
// Load jsdom via createRequire (jsdom is CJS; this harness is ESM).
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { JSDOM } = require("__JSDOM_REQUIRE__");

import {
  isEventTypeFilterActive,
  getActiveEventTypeCount,
  clearEventTypeFilter,
  renderEventTypeFilterIndicator,
} from "__INDICATOR_PATH__";

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

// Set up a jsdom environment for DOM tests
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
const { document } = dom.window;

// Patch global document so renderEventTypeFilterIndicator can use it
global.document = document;

function makeContainer() {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

// ── isEventTypeFilterActive ───────────────────────────────────────────────────

check("isEventTypeFilterActive – false for empty array (default state)",
  isEventTypeFilterActive([]) === false);
check("isEventTypeFilterActive – true for one type selected",
  isEventTypeFilterActive(["payment.created"]) === true);
check("isEventTypeFilterActive – true for multiple types selected",
  isEventTypeFilterActive(["payment.created", "refund.issued"]) === true);

// ── getActiveEventTypeCount ───────────────────────────────────────────────────

check("getActiveEventTypeCount – 0 for empty array",
  getActiveEventTypeCount([]) === 0);
check("getActiveEventTypeCount – 1 for single type",
  getActiveEventTypeCount(["payment.created"]) === 1);
check("getActiveEventTypeCount – 3 for three types",
  getActiveEventTypeCount(["payment.created", "refund.issued", "dispute.opened"]) === 3);

// ── clearEventTypeFilter ──────────────────────────────────────────────────────

const cleared = clearEventTypeFilter();
check("clearEventTypeFilter – returns an array",
  Array.isArray(cleared));
check("clearEventTypeFilter – returns an empty array",
  cleared.length === 0);
check("clearEventTypeFilter – result is inactive (AC4)",
  isEventTypeFilterActive(cleared) === false);

// ── renderEventTypeFilterIndicator – AC2: inactive state ─────────────────────

const c1 = makeContainer();
renderEventTypeFilterIndicator(c1, {
  selectedTypes: [],
  onClearAll: () => {},
});
check("AC2 – no indicator rendered when selectedTypes is empty",
  c1.querySelector("[data-event-type-filter-indicator]") === null);
check("AC2 – no clear-all button rendered when selectedTypes is empty",
  c1.querySelector("[data-event-type-filter-clear-all]") === null);
check("AC2 – container is empty when filter is inactive",
  c1.innerHTML === "");

// ── renderEventTypeFilterIndicator – AC1: active state ───────────────────────

const c2 = makeContainer();
renderEventTypeFilterIndicator(c2, {
  selectedTypes: ["payment.created"],
  onClearAll: () => {},
});
check("AC1 – indicator rendered when one type is selected",
  c2.querySelector("[data-event-type-filter-indicator]") !== null);
check("AC1 – indicator text contains count",
  c2.querySelector("[data-event-type-filter-indicator]")?.textContent?.includes("1") === true);

const c3 = makeContainer();
renderEventTypeFilterIndicator(c3, {
  selectedTypes: ["payment.created", "refund.issued"],
  onClearAll: () => {},
});
check("AC1 – indicator rendered when multiple types are selected",
  c3.querySelector("[data-event-type-filter-indicator]") !== null);
check("AC1 – indicator text contains count (2)",
  c3.querySelector("[data-event-type-filter-indicator]")?.textContent?.includes("2") === true);

// ── renderEventTypeFilterIndicator – AC3: clear-all control ──────────────────

const c4 = makeContainer();
renderEventTypeFilterIndicator(c4, {
  selectedTypes: ["payment.created"],
  onClearAll: () => {},
});
const clearBtn = c4.querySelector("[data-event-type-filter-clear-all]");
check("AC3 – clear-all button rendered when filter is active",
  clearBtn !== null);
check("AC3 – clear-all control is a <button> element",
  clearBtn?.tagName?.toLowerCase() === "button");

// ── AC8: aria-label on clear-all button ──────────────────────────────────────

check("AC8 – clear-all button has an aria-label attribute",
  clearBtn?.getAttribute("aria-label") !== null &&
  clearBtn?.getAttribute("aria-label") !== "");

const c5 = makeContainer();
renderEventTypeFilterIndicator(c5, {
  selectedTypes: ["payment.created"],
  onClearAll: () => {},
  clearAllAriaLabel: "Remove event-type filter",
});
check("AC8 – custom aria-label is applied to clear-all button",
  c5.querySelector("[data-event-type-filter-clear-all]")?.getAttribute("aria-label") === "Remove event-type filter");

// ── AC4: clear-all resets to default in one action ───────────────────────────

let receivedSelection = null;
const c6 = makeContainer();
renderEventTypeFilterIndicator(c6, {
  selectedTypes: ["payment.created", "refund.issued"],
  onClearAll: (newSel) => { receivedSelection = newSel; },
});
const btn6 = c6.querySelector("[data-event-type-filter-clear-all]");
btn6.click();
check("AC4 – onClearAll called when clear-all button is clicked",
  receivedSelection !== null);
check("AC4 – onClearAll receives an empty array (default state)",
  Array.isArray(receivedSelection) && receivedSelection.length === 0);
check("AC4 – result of clear-all is inactive",
  isEventTypeFilterActive(receivedSelection) === false);

// ── AC5: after clear-all, indicator disappears ────────────────────────────────

const c7 = makeContainer();
renderEventTypeFilterIndicator(c7, {
  selectedTypes: ["payment.created"],
  onClearAll: () => {},
});
check("AC5 – indicator present before clear",
  c7.querySelector("[data-event-type-filter-indicator]") !== null);

// Simulate the caller re-rendering with empty selection after clear-all
renderEventTypeFilterIndicator(c7, {
  selectedTypes: [],
  onClearAll: () => {},
});
check("AC5 – indicator absent after re-render with empty selection",
  c7.querySelector("[data-event-type-filter-indicator]") === null);
check("AC5 – clear-all button absent after re-render with empty selection",
  c7.querySelector("[data-event-type-filter-clear-all]") === null);

// ── AC6: clearing event-type filter does not affect other filter state ─────────

const composedState = {
  selectedTypes: ["payment.created"],
  dateRange: { start: "2024-01-01", end: "2024-01-31" },
  status: "failed",
};
const newTypes = clearEventTypeFilter();
const newState = { ...composedState, selectedTypes: newTypes };
check("AC6 – event-type cleared",
  newState.selectedTypes.length === 0);
check("AC6 – date-range filter unchanged",
  newState.dateRange.start === "2024-01-01" && newState.dateRange.end === "2024-01-31");
check("AC6 – status filter unchanged",
  newState.status === "failed");

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  throw new Error(`${fail} test(s) failed`);
}
HARNESS_EOF

# Inject paths (use | as delimiter to avoid / conflicts)
sed -i "s|__INDICATOR_PATH__|$COMPILED_INDICATOR|g" "$HARNESS"
sed -i "s|__JSDOM_REQUIRE__|$REPO_ROOT/node_modules/jsdom|g" "$HARNESS"

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
