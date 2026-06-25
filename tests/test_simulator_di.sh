#!/usr/bin/env bash
# Tests for Issue #80: Add dev-mode toggle and environment flag to activate the
# webhook delivery simulator.
#
# Covers:
#  - AC1/AC7  env flag swaps real delivery for the simulator at the DI seam
#  - AC2      flag unset -> real mechanism, no simulator code present
#  - AC3/AC4  production build (flag unset) contains ZERO simulator code
#             (real Vite/Rollup bundle-content check) and the simulator import
#             is fully tree-shaken
#  - AC8      simulator emits the same delivery-event shape as the real contract
#  - AC9      no real endpoints / backend required (pure client-side simulator)
#
# Uses Vite (already a dev dependency) for the production-style bundle so the
# tree-shaking assertion matches exactly what `vite build` would emit.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

PASS=0
FAIL=0
pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

MARKER="WEBHOOK_SIMULATOR_MODULE_MARKER_v1"
VITE="$REPO_ROOT/node_modules/.bin/vite"
ESBUILD="$REPO_ROOT/node_modules/.bin/esbuild"
DELIVERY_DIR="$REPO_ROOT/src/delivery"
SELECTOR="$DELIVERY_DIR/index.ts"
SIMULATOR="$DELIVERY_DIR/simulator.ts"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# ── Source-level wiring ───────────────────────────────────────────────────────

if [ -f "$SELECTOR" ] && [ -f "$SIMULATOR" ] && [ -f "$DELIVERY_DIR/realDeliveryService.ts" ]; then
  pass "AC7 – delivery DI seam exists (index.ts + simulator.ts + realDeliveryService.ts)"
else
  fail "AC7 – delivery DI seam is missing one or more modules"
fi

# The flag must be the Vite-exposed VITE_-prefixed env var, read via import.meta.env.
if grep -q 'import.meta.env.VITE_USE_WEBHOOK_SIMULATOR' "$SELECTOR"; then
  pass "AC1 – DI seam reads VITE_USE_WEBHOOK_SIMULATOR via import.meta.env"
else
  fail "AC1 – DI seam does not read VITE_USE_WEBHOOK_SIMULATOR via import.meta.env"
fi

# The simulator must be imported ONLY via a guarded dynamic import (so it can be
# tree-shaken). A top-level static `import ... from './simulator'` would defeat
# dead-code elimination.
if grep -qE "^\s*import\s+.*from\s+['\"]\./simulator['\"]" "$SELECTOR"; then
  fail "AC4 – DI seam statically imports ./simulator (prevents tree-shaking)"
else
  pass "AC4 – DI seam has no static top-level import of ./simulator"
fi
if grep -qE "await import\(['\"]\./simulator['\"]\)" "$SELECTOR"; then
  pass "AC4 – DI seam loads the simulator via a guarded dynamic import()"
else
  fail "AC4 – DI seam does not use a guarded dynamic import() for the simulator"
fi

# AC7/AC8: no UI component contains simulator-specific logic — only the delivery
# layer references the simulator module.
SIM_REFS_OUTSIDE=$(grep -rl "delivery/simulator" "$REPO_ROOT/src" 2>/dev/null | grep -v "src/delivery/" || true)
if [ -z "$SIM_REFS_OUTSIDE" ]; then
  pass "AC7 – no module outside src/delivery references the simulator directly"
else
  fail "AC7 – simulator referenced outside the delivery layer: $SIM_REFS_OUTSIDE"
fi

# AC9: the simulator must not call any real endpoint (no fetch/XHR/network).
if grep -qE '\b(fetch|XMLHttpRequest|WebSocket|EventSource)\b' "$SIMULATOR"; then
  fail "AC9 – simulator references a network API (must be fully client-side)"
else
  pass "AC9 – simulator makes no network calls (pure client-side fixture)"
fi

# ── Production bundle-content check (flag UNSET) ──────────────────────────────

if [ -x "$VITE" ]; then
  PROD_OUT="$WORK/prod"
  if SIM_BUNDLE_OUTDIR="$PROD_OUT" "$VITE" build \
        --config "$REPO_ROOT/tests/fixtures/vite.simulator-bundle.config.mjs" \
        > "$WORK/prod-build.log" 2>&1; then
    pass "AC2 – production-style build (flag unset) succeeds"
  else
    fail "AC2 – production-style build (flag unset) failed (see log below)"
    tail -20 "$WORK/prod-build.log"
  fi

  if grep -rq "$MARKER" "$PROD_OUT" 2>/dev/null; then
    fail "AC3 – production bundle CONTAINS simulator code (marker present)"
  else
    pass "AC3 – production bundle contains NO simulator code (marker absent)"
  fi

  # No simulator chunk file emitted at all -> import fully tree-shaken.
  if ls "$PROD_OUT"/simulator-*.js >/dev/null 2>&1; then
    fail "AC4 – production build emitted a simulator chunk (not tree-shaken)"
  else
    pass "AC4 – simulator import is fully tree-shaken from the production build"
  fi

  # ── Dev bundle (flag SET) must INCLUDE the simulator ───────────────────────
  DEV_OUT="$WORK/dev"
  if VITE_USE_WEBHOOK_SIMULATOR=true SIM_BUNDLE_OUTDIR="$DEV_OUT" "$VITE" build \
        --config "$REPO_ROOT/tests/fixtures/vite.simulator-bundle.config.mjs" \
        > "$WORK/dev-build.log" 2>&1; then
    pass "AC1 – dev build with flag set succeeds"
  else
    fail "AC1 – dev build with flag set failed"
    tail -20 "$WORK/dev-build.log"
  fi

  if grep -rq "$MARKER" "$DEV_OUT" 2>/dev/null; then
    pass "AC1 – dev build (flag set) INCLUDES the simulator (marker present)"
  else
    fail "AC1 – dev build (flag set) is missing the simulator (marker absent)"
  fi
else
  fail "vite binary not found at $VITE (run npm ci)"
fi

# ── Runtime unit tests (event shape, retry flow, configuration) ───────────────

if [ -x "$ESBUILD" ]; then
  mkdir -p "$REPO_ROOT/tests/_build"
  if "$ESBUILD" "$SIMULATOR" --bundle --format=esm \
        --outfile="$REPO_ROOT/tests/_build/simulator.mjs" \
        > "$WORK/esbuild.log" 2>&1; then
    if node "$REPO_ROOT/tests/simulator_unit.mjs" > "$WORK/unit.log" 2>&1; then
      pass "AC8 – simulator unit tests pass (event shape + retry flow)"
      grep '^PASS:' "$WORK/unit.log" | sed 's/^/    /'
    else
      fail "AC8 – simulator unit tests failed"
      cat "$WORK/unit.log"
    fi
  else
    fail "AC8 – could not transpile simulator for unit tests"
    cat "$WORK/esbuild.log"
  fi
  rm -rf "$REPO_ROOT/tests/_build"
else
  fail "esbuild binary not found at $ESBUILD (run npm ci)"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -gt 0 ] && exit 1
exit 0
