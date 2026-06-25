#!/usr/bin/env bash
# Tests for Issue #97: Integrate MetricsDashboard into the main merchant UI view.
#
# Combines static assertions (the dashboard is wired into the main view and
# shares the event-log data source) with a headless integration smoke test that
# mounts the view, drives the simulator, and asserts non-zero dashboard stats.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO_ROOT/src"
MAIN="$SRC/main.ts"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: MetricsDashboard is rendered in the main view (no separate route) ────
if [ -f "$MAIN" ]; then
  pass "AC1 – src/main.ts (main merchant view) exists"
else
  fail "AC1 – src/main.ts is missing"
fi

if grep -q "mountMetricsDashboard" "$MAIN"; then
  pass "AC1 – main view mounts the metrics dashboard"
else
  fail "AC1 – main view does NOT mount the metrics dashboard"
fi

if grep -q "mountEventLog" "$MAIN"; then
  pass "AC1 – main view mounts the event log alongside the dashboard"
else
  fail "AC1 – main view does NOT mount the event log"
fi

# ── AC2: dashboard and event log share the SAME store instance ────────────────
if grep -qE "mountMetricsDashboard\([^,]+,\s*store\)" "$MAIN" \
   && grep -qE "mountEventLog\([^,]+,\s*store\)" "$MAIN"; then
  pass "AC2 – dashboard and event log are wired to the same shared store"
else
  fail "AC2 – dashboard and event log are NOT wired to the same shared store"
fi

# ── AC1 (no separate navigation step): index.html mounts the view inline ──────
if grep -q 'id="app"' "$REPO_ROOT/index.html" \
   && grep -q "main.ts" "$REPO_ROOT/index.html"; then
  pass "AC1 – index.html mounts the main view inline (no reload / separate route)"
else
  fail "AC1 – index.html does NOT mount the main view inline"
fi

# ── AC3: desktop layout is scannable (no horizontal scroll machinery) ─────────
APP_CSS="$SRC/app.css"
if [ -f "$APP_CSS" ] && grep -q "box-sizing: border-box" "$APP_CSS"; then
  pass "AC3 – layout uses border-box sizing (guards against horizontal scroll)"
else
  fail "AC3 – layout CSS missing border-box sizing"
fi

if grep -qE "overflow-x:\s*scroll|white-space:\s*nowrap" "$APP_CSS"; then
  fail "AC3 – layout CSS forces horizontal scrolling"
else
  pass "AC3 – layout CSS does not force horizontal scrolling"
fi

# ── AC4 + AC2 + AC5–AC8: headless integration smoke test ──────────────────────
# Requires node_modules (esbuild) — install if absent so the test is runnable
# on a clean checkout.
if [ ! -d "$REPO_ROOT/node_modules/esbuild" ]; then
  echo "info: installing dependencies for the integration smoke test…"
  ( cd "$REPO_ROOT" && npm ci >/dev/null 2>&1 ) || \
    ( cd "$REPO_ROOT" && npm install >/dev/null 2>&1 )
fi

if [ -d "$REPO_ROOT/node_modules/esbuild" ]; then
  SMOKE_OUT="$(cd "$REPO_ROOT" && node tests/integration/smoke.mjs 2>&1)"
  SMOKE_RC=$?
  echo "$SMOKE_OUT" | sed 's/^/    /'
  if [ "$SMOKE_RC" -eq 0 ]; then
    pass "AC4 – integration smoke test: dashboard mounts and shows non-zero stats"
  else
    fail "AC4 – integration smoke test failed (see output above)"
  fi
else
  fail "AC4 – could not run integration smoke test (esbuild unavailable)"
fi

# ── Unit tests: shared model (computeStats + date-range filter) ───────────────
if [ -d "$REPO_ROOT/node_modules/esbuild" ]; then
  UNIT_OUT="$(cd "$REPO_ROOT" && node tests/integration/units.mjs 2>&1)"
  UNIT_RC=$?
  echo "$UNIT_OUT" | sed 's/^/    /'
  if [ "$UNIT_RC" -eq 0 ]; then
    pass "AC5/AC6 – unit tests: computeStats + date-range filter (applied/cleared/boundary)"
  else
    fail "AC5/AC6 – unit tests failed (see output above)"
  fi
else
  fail "AC5/AC6 – could not run unit tests (esbuild unavailable)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
