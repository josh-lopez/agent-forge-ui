#!/usr/bin/env bash
# Tests for Issue #95: MetricsDashboard UI component (aggregate stats panel).
#
# Strategy: compile the TypeScript component + metrics module to a temp dir,
# then run a Node harness (metrics_dashboard_test.mjs) that uses a tiny DOM
# shim to assert the rendered values. Falls back gracefully (skip) if the
# TypeScript toolchain is not installed.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$REPO_ROOT/src"
TSC="$REPO_ROOT/node_modules/.bin/tsc"
HARNESS="$REPO_ROOT/tests/metrics_dashboard_test.mjs"

PASS=0
FAIL=0
pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC: source files exist ───────────────────────────────────────────────────
if [ -f "$SRC_DIR/metrics.ts" ]; then
  pass "metrics calculation module (src/metrics.ts) exists"
else
  fail "src/metrics.ts does NOT exist"
fi

if [ -f "$SRC_DIR/MetricsDashboard.ts" ]; then
  pass "MetricsDashboard component (src/MetricsDashboard.ts) exists"
else
  fail "src/MetricsDashboard.ts does NOT exist"
fi

# AC7: component must not call real endpoints — guard against network APIs.
if grep -qE "\bfetch\b|XMLHttpRequest|WebSocket|axios|http\.request" \
     "$SRC_DIR/MetricsDashboard.ts" "$SRC_DIR/metrics.ts" 2>/dev/null; then
  fail "component/metrics reference a network API (must be client-side only)"
else
  pass "component/metrics make no network calls (client-side only)"
fi

# ── Component behaviour tests via compiled output ────────────────────────────
if [ ! -x "$TSC" ]; then
  echo "SKIP: tsc not found — run 'npm install' to exercise component tests"
else
  DIST_DIR="$(mktemp -d)"
  trap 'rm -rf "$DIST_DIR"' EXIT

  # Emit plain ESM JS. We override the project's noEmit/allowImportingTsExtensions
  # so the .js-suffixed imports resolve at runtime under Node.
  if "$TSC" \
        --module ESNext \
        --target ES2020 \
        --moduleResolution node \
        --lib ES2020,DOM,DOM.Iterable \
        --strict \
        --skipLibCheck \
        --outDir "$DIST_DIR" \
        "$SRC_DIR/metrics.ts" "$SRC_DIR/MetricsDashboard.ts" > "$DIST_DIR/tsc.log" 2>&1; then
    pass "TypeScript sources compile cleanly"
  else
    fail "TypeScript compilation failed:"
    cat "$DIST_DIR/tsc.log"
  fi

  if [ -f "$DIST_DIR/MetricsDashboard.js" ] && [ -f "$DIST_DIR/metrics.js" ]; then
    if DASHBOARD_DIST="file://$DIST_DIR" node "$HARNESS"; then
      pass "component behaviour tests passed"
    else
      fail "component behaviour tests FAILED"
    fi
  else
    fail "compiled output missing — skipping behaviour tests"
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -gt 0 ] && exit 1
exit 0
