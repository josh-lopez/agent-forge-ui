#!/usr/bin/env bash
# Tests for Issue #158: Ensure the webhook delivery simulator has no impact on
# production builds.
#
# Acceptance criteria covered:
#   AC1 – production build excludes simulator module code from the output bundle
#   AC2 – exclusion is gated on an environment-based condition (mode/PROD)
#   AC3 – a development build retains the simulator and it stays importable
#   AC4 – a documented verification step exists (build:analyze + assert script)
#   AC5 – existing build/typecheck still pass (covered by the rest of the suite;
#          here we additionally confirm the plugin doesn't break a normal build)
#
# Strategy: rather than mutate the area-owned src/ tree, we drive the build
# config from a throwaway temp project that imports a fixture "simulator.ts" via
# the repo's vite.config.ts, then assert the simulator code is absent from a
# production build and present in a development build.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE_JSON="$REPO_ROOT/package.json"
VITE_CONFIG="$REPO_ROOT/vite.config.ts"
VITE_BIN="$REPO_ROOT/node_modules/.bin/vite"

PASS=0
FAIL=0
pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# A marker string that lives ONLY inside the simulator module body, never in the
# entry module. If it survives a production build, simulator source leaked.
MARKER="ISSUE158_SIMULATOR_BODY_MARKER"

# ── AC4: documented verification step exists ─────────────────────────────────
ANALYZE_SCRIPT=$(node -e "const p=require('$PACKAGE_JSON'); console.log((p.scripts&&p.scripts['build:analyze'])||'')" 2>/dev/null || echo "")
if [ -n "$ANALYZE_SCRIPT" ]; then
  pass "AC4 – 'build:analyze' verification script is defined: $ANALYZE_SCRIPT"
else
  fail "AC4 – 'build:analyze' verification script is NOT defined in package.json"
fi

if [ -f "$REPO_ROOT/scripts/assert-no-simulator.mjs" ]; then
  pass "AC4 – scripts/assert-no-simulator.mjs verification helper exists"
else
  fail "AC4 – scripts/assert-no-simulator.mjs verification helper is missing"
fi

# ── AC2: exclusion is environment/mode based ─────────────────────────────────
if grep -qE "isProduction|import\.meta\.env\.PROD|mode === 'production'|apply: 'build'" "$VITE_CONFIG"; then
  pass "AC2 – vite.config.ts gates simulator exclusion on an environment condition"
else
  fail "AC2 – vite.config.ts does not appear to gate exclusion on environment"
fi

# ── sideEffects:false enables tree-shaking (BA-flagged risk) ─────────────────
SIDE_EFFECTS=$(node -e "const p=require('$PACKAGE_JSON'); console.log(p.sideEffects)" 2>/dev/null || echo "")
if [ "$SIDE_EFFECTS" = "false" ]; then
  pass "AC1/AC2 – package.json declares \"sideEffects\": false (enables tree-shaking)"
else
  fail "AC1/AC2 – package.json is missing \"sideEffects\": false"
fi

# ── Build a throwaway project that imports a fixture simulator ───────────────
if [ ! -x "$VITE_BIN" ]; then
  fail "Cannot run build verification: vite binary not found at $VITE_BIN"
  echo ""
  echo "Results: $PASS passed, $FAIL failed"
  [ "$FAIL" -gt 0 ] && exit 1 || exit 0
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/src"

# The marker string lives only inside the simulator module body (the returned
# value), NOT as an exported identifier name, so it cannot leak via an import
# binding that the entry module keeps.
cat > "$TMP/src/simulator.ts" <<EOF
// Fixture simulator module for Issue #158 verification.
export function createSimulator(): { name: string } {
  return { name: '${MARKER}' };
}
EOF

# The entry imports + calls the simulator unconditionally to prove the build
# excludes the simulator body regardless. The entry contains no marker string.
cat > "$TMP/src/main.ts" <<EOF
import { createSimulator } from './simulator';
const el = document.createElement('div');
el.textContent = String(createSimulator().name);
document.body.appendChild(el);
EOF

cat > "$TMP/index.html" <<EOF
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>t</title></head>
<body><script type="module" src="/src/main.ts"></script></body></html>
EOF

# Use the repo's real vite.config.ts so we test the actual build behaviour.
# Vite's CLI takes the project root as a positional argument; --outDir is
# resolved relative to that root, so we pass absolute output paths.
PROD_OUT="$TMP/dist-prod"
DEV_OUT="$TMP/dist-dev"

PROD_LOG=$("$VITE_BIN" build "$TMP" \
  --config "$VITE_CONFIG" \
  --outDir "$PROD_OUT" \
  --mode production 2>&1)
PROD_EXIT=$?

if [ "$PROD_EXIT" -eq 0 ]; then
  pass "AC1/AC5 – production build of fixture project succeeds with the plugin"
else
  fail "AC1/AC5 – production build of fixture project failed (exit $PROD_EXIT)"
  echo "$PROD_LOG"
fi

if [ -d "$PROD_OUT" ]; then
  if grep -rq "$MARKER" "$PROD_OUT" 2>/dev/null; then
    fail "AC1 – production bundle CONTAINS simulator body (should be excluded)"
  else
    pass "AC1 – production bundle does NOT contain simulator code"
  fi
else
  fail "AC1 – production output directory was not created"
fi

# ── AC3: development build retains the simulator ─────────────────────────────
DEV_LOG=$("$VITE_BIN" build "$TMP" \
  --config "$VITE_CONFIG" \
  --outDir "$DEV_OUT" \
  --mode development \
  --minify false 2>&1)
DEV_EXIT=$?

if [ "$DEV_EXIT" -eq 0 ]; then
  pass "AC3 – development build of fixture project succeeds"
else
  fail "AC3 – development build of fixture project failed (exit $DEV_EXIT)"
  echo "$DEV_LOG"
fi

if [ -d "$DEV_OUT" ]; then
  if grep -rq "$MARKER" "$DEV_OUT" 2>/dev/null; then
    pass "AC3 – development build RETAINS the simulator code"
  else
    fail "AC3 – development build is missing the simulator code (should be retained)"
  fi
else
  fail "AC3 – development output directory was not created"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -gt 0 ] && exit 1 || exit 0
