#!/usr/bin/env bash
# Issue #147 — client-side webhook delivery simulator.
#
# These checks complement the Vitest unit tests (tests/webhookSimulator.test.ts)
# by verifying file presence, no real network calls in the module source, and
# that the simulator is tree-shaken out of the production bundle when the
# dev-mode flag is unset (AC13).
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

FAIL=0
fail() { echo "FAIL: $1"; FAIL=1; }
pass() { echo "PASS: $1"; }

SIM="src/webhookSimulator.ts"
TYPES="src/deliveryEvents.ts"

# AC1: standalone module exists under src/, alongside the shared event types.
if [ -f "$SIM" ]; then pass "simulator module exists at $SIM"; else fail "$SIM missing"; fi
if [ -f "$TYPES" ]; then pass "shared delivery-event types exist at $TYPES"; else fail "$TYPES missing"; fi

# AC1: the simulator imports only the shared event-type module from local code.
LOCAL_IMPORTS=$(grep -E "from '\./" "$SIM" | grep -v "deliveryEvents" || true)
if [ -z "$LOCAL_IMPORTS" ]; then
  pass "simulator has no local deps beyond ./deliveryEvents"
else
  fail "simulator imports unexpected local modules: $LOCAL_IMPORTS"
fi

# AC8: no real HTTP requests anywhere in the module source.
if grep -Eq "\bfetch\(|XMLHttpRequest|axios|http\.request|WebSocket\(|EventSource\(" "$SIM"; then
  fail "simulator source appears to make network calls"
else
  pass "simulator source makes no network calls"
fi

# AC2: successRate range validation present.
if grep -q "RangeError" "$SIM"; then
  pass "simulator validates successRate / maxAttempts (RangeError)"
else
  fail "no range validation found in simulator"
fi

# AC7/AC11: documented activation flag.
if grep -q "VITE_USE_SIMULATOR" "$SIM" && grep -q "VITE_USE_SIMULATOR" README.md; then
  pass "VITE_USE_SIMULATOR flag is implemented and documented"
else
  fail "VITE_USE_SIMULATOR flag missing in source and/or README"
fi

# AC11: README documents the simulator section.
if grep -q "Webhook delivery simulator (developer fixture)" README.md; then
  pass "README documents the simulator"
else
  fail "README is missing the simulator section"
fi

# AC13: tree-shaking — a production build with the flag unset must NOT contain
# the simulator's distinctive marker strings.
echo "==> Building production bundle (flag unset)…"
unset VITE_USE_SIMULATOR
if npm run build >/tmp/issue147_build.log 2>&1; then
  pass "production build succeeded"
  if grep -rqs "simulated delivery failure" dist; then
    fail "simulator code leaked into production bundle (not tree-shaken)"
  else
    pass "simulator excluded from production bundle (tree-shaken)"
  fi
else
  fail "production build failed (see /tmp/issue147_build.log)"
  tail -20 /tmp/issue147_build.log
fi

if [ "$FAIL" -ne 0 ]; then
  echo "issue147 webhook simulator checks FAILED"
  exit 1
fi
echo "issue147 webhook simulator checks PASSED"
exit 0
