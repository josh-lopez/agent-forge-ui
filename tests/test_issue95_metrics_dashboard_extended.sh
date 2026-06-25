#!/usr/bin/env bash
# Extended tests for Issue #95: MetricsDashboard UI component (aggregate stats panel).
#
# Covers additional acceptance criteria edge cases:
#   - AC1:  all three stat DOM nodes are present and labelled
#   - AC2:  success rate rendered value matches calculateMetrics output exactly
#   - AC3:  average retry count rendered value matches calculateMetrics output exactly
#   - AC4:  median + p95 time-to-delivery rendered values match calculateMetrics output
#   - AC5:  reactive binding — setEvents() immediately updates rendered values
#   - AC6:  empty/zero state — placeholder text shown, empty-state note visible
#   - AC7:  no network API calls in component or metrics module
#   - AC8:  simulator-shaped events (full event shape) produce correct output
#   - AC9:  representative fixture dataset produces correct rendered values
#   - AC10: empty array input renders the empty/zero state
#   - AC11: changing the input array causes rendered values to update

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$REPO_ROOT/src"
TSC="$REPO_ROOT/node_modules/.bin/tsc"
HARNESS="$REPO_ROOT/tests/metrics_dashboard_extended_test.mjs"

PASS=0
FAIL=0
pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC7: no network calls in component or metrics module ─────────────────────
for src_file in "$SRC_DIR/MetricsDashboard.ts" "$SRC_DIR/metrics.ts"; do
  base="$(basename "$src_file")"
  if grep -qE "\bfetch\b|XMLHttpRequest|WebSocket|axios|http\.request|https\.request" \
       "$src_file" 2>/dev/null; then
    fail "AC7 – $base must not reference network APIs"
  else
    pass "AC7 – $base makes no network calls"
  fi
done

# ── AC1: component exports MetricsDashboard class ────────────────────────────
if grep -qE "export (class MetricsDashboard|function mountMetricsDashboard)" \
     "$SRC_DIR/MetricsDashboard.ts" 2>/dev/null; then
  pass "AC1 – MetricsDashboard is exported from MetricsDashboard.ts"
else
  fail "AC1 – MetricsDashboard export not found in MetricsDashboard.ts"
fi

# ── AC1: component renders all three stat test-ids ───────────────────────────
# The source uses single-quoted strings; match either quote style.
for testid in metric-success-rate metric-average-retries metric-time-to-delivery; do
  if grep -qE "'${testid}'|\"${testid}\"" "$SRC_DIR/MetricsDashboard.ts" 2>/dev/null; then
    pass "AC1 – stat node '${testid}' is defined in MetricsDashboard.ts"
  else
    fail "AC1 – stat node '${testid}' NOT found in MetricsDashboard.ts"
  fi
done

# ── AC6: empty-state node is defined ─────────────────────────────────────────
if grep -q "metrics-empty-state" "$SRC_DIR/MetricsDashboard.ts" 2>/dev/null; then
  pass "AC6 – empty-state node (metrics-empty-state) is defined in MetricsDashboard.ts"
else
  fail "AC6 – empty-state node NOT found in MetricsDashboard.ts"
fi

# ── AC5: setEvents method exists (reactive entry point) ──────────────────────
if grep -qE "setEvents\s*\(" "$SRC_DIR/MetricsDashboard.ts" 2>/dev/null; then
  pass "AC5 – setEvents() reactive method is defined in MetricsDashboard.ts"
else
  fail "AC5 – setEvents() method NOT found in MetricsDashboard.ts"
fi

# ── AC2/AC3/AC4: formatting helpers are exported from metrics.ts ─────────────
for fn in formatSuccessRate formatAverageRetryCount formatTimeToDelivery calculateMetrics; do
  if grep -qE "export function ${fn}" "$SRC_DIR/metrics.ts" 2>/dev/null; then
    pass "AC2/3/4 – ${fn} is exported from metrics.ts"
  else
    fail "AC2/3/4 – ${fn} NOT exported from metrics.ts"
  fi
done

# ── Component behaviour tests via compiled output ────────────────────────────
if [ ! -x "$TSC" ]; then
  echo "SKIP: tsc not found — run 'npm install' to exercise component tests"
else
  DIST_DIR="$(mktemp -d)"
  trap 'rm -rf "$DIST_DIR"' EXIT

  if "$TSC" \
        --module ESNext \
        --target ES2020 \
        --moduleResolution node \
        --lib ES2020,DOM,DOM.Iterable \
        --strict \
        --skipLibCheck \
        --outDir "$DIST_DIR" \
        "$SRC_DIR/metrics.ts" "$SRC_DIR/MetricsDashboard.ts" > "$DIST_DIR/tsc.log" 2>&1; then
    pass "TypeScript sources compile cleanly (extended check)"
  else
    fail "TypeScript compilation failed (extended check):"
    cat "$DIST_DIR/tsc.log"
  fi

  if [ -f "$DIST_DIR/MetricsDashboard.js" ] && [ -f "$DIST_DIR/metrics.js" ]; then
    if DASHBOARD_DIST="file://$DIST_DIR" node "$HARNESS"; then
      pass "extended component behaviour tests passed"
    else
      fail "extended component behaviour tests FAILED"
    fi
  else
    fail "compiled output missing — skipping extended behaviour tests"
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -gt 0 ] && exit 1
exit 0
