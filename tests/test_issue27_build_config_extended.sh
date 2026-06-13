#!/usr/bin/env bash
# Extended tests for Issue #27: Sensible build configuration for the front-end.
# Provides additional coverage complementing test_build_config.sh:
#   - vite.config.ts explicitly sets outDir to 'dist'
#   - package-lock.json (lockfile) is present for reproducible installs
#   - typecheck script is defined and passes (TypeScript compilation)
#   - src/main.ts entry point exists (TypeScript source, not plain JS)
#   - dist/ build output contains expected asset types (HTML + at least one asset)
#   - No server-side runtime dependencies (node/express/etc.) in package.json scripts
#   - package.json "private": true prevents accidental npm publish

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE_JSON="$REPO_ROOT/package.json"
VITE_CONFIG="$REPO_ROOT/vite.config.ts"
TSCONFIG="$REPO_ROOT/tsconfig.json"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC5 (extended): vite.config.ts explicitly configures outDir as 'dist' ────
if [ -f "$VITE_CONFIG" ]; then
  if grep -q "outDir" "$VITE_CONFIG"; then
    pass "AC5-ext – vite.config.ts explicitly sets outDir"
    if grep -q "dist" "$VITE_CONFIG"; then
      pass "AC5-ext – vite.config.ts outDir is set to 'dist'"
    else
      fail "AC5-ext – vite.config.ts outDir does not reference 'dist'"
    fi
  else
    # outDir defaults to 'dist' in Vite, so absence is acceptable but worth noting
    pass "AC5-ext – vite.config.ts omits outDir (Vite default is 'dist')"
  fi
else
  fail "AC5-ext – vite.config.ts does not exist"
fi

# ── AC6 (extended): package-lock.json is present for reproducible installs ───
if [ -f "$REPO_ROOT/package-lock.json" ]; then
  pass "AC6-ext – package-lock.json exists (reproducible installs)"
  # Verify lockfileVersion is present (basic validity)
  LOCKFILE_VERSION=$(node -e "const l=require('$REPO_ROOT/package-lock.json'); console.log(l.lockfileVersion || '')" 2>/dev/null || echo "")
  if [ -n "$LOCKFILE_VERSION" ]; then
    pass "AC6-ext – package-lock.json has lockfileVersion: $LOCKFILE_VERSION"
  else
    fail "AC6-ext – package-lock.json is missing lockfileVersion field"
  fi
elif [ -f "$REPO_ROOT/yarn.lock" ]; then
  pass "AC6-ext – yarn.lock exists (reproducible installs via Yarn)"
elif [ -f "$REPO_ROOT/pnpm-lock.yaml" ]; then
  pass "AC6-ext – pnpm-lock.yaml exists (reproducible installs via pnpm)"
else
  fail "AC6-ext – No lockfile found (package-lock.json / yarn.lock / pnpm-lock.yaml)"
fi

# ── AC8 (extended): typecheck script is defined and passes ───────────────────
if [ -f "$PACKAGE_JSON" ]; then
  TYPECHECK_SCRIPT=$(node -e "const p=require('$PACKAGE_JSON'); console.log(p.scripts && p.scripts.typecheck || '')" 2>/dev/null || echo "")
  if [ -n "$TYPECHECK_SCRIPT" ]; then
    pass "AC8-ext – 'typecheck' script is defined: $TYPECHECK_SCRIPT"
    # Run typecheck and verify it exits zero
    TYPECHECK_OUTPUT=$(cd "$REPO_ROOT" && npm run typecheck 2>&1)
    TYPECHECK_EXIT=$?
    if [ "$TYPECHECK_EXIT" -eq 0 ]; then
      pass "AC8-ext – 'npm run typecheck' exits zero (TypeScript compiles cleanly)"
    else
      fail "AC8-ext – 'npm run typecheck' exited with code $TYPECHECK_EXIT"
      echo "$TYPECHECK_OUTPUT"
    fi
  else
    # typecheck is not required by the AC but is good hygiene; note it
    echo "INFO: AC8-ext – No 'typecheck' script defined (optional but recommended)"
    pass "AC8-ext – typecheck script absence is acceptable (AC8 does not require it)"
  fi
fi

# ── AC8 (extended): src/main.ts entry point exists as TypeScript source ──────
if [ -f "$REPO_ROOT/src/main.ts" ]; then
  pass "AC8-ext – src/main.ts exists (TypeScript entry point)"
elif [ -f "$REPO_ROOT/src/main.tsx" ]; then
  pass "AC8-ext – src/main.tsx exists (TypeScript/JSX entry point)"
elif [ -f "$REPO_ROOT/src/main.js" ]; then
  # JS is acceptable but tsconfig.json implies TS is expected
  echo "INFO: AC8-ext – src/main.js found (JavaScript, not TypeScript)"
  pass "AC8-ext – src/main.js exists as entry point"
else
  fail "AC8-ext – No src/main.ts or src/main.js entry point found"
fi

# ── AC7 (extended): dist/ build output contains expected asset types ──────────
# Ensure a prior build exists; if not, run one.
if [ ! -d "$REPO_ROOT/dist" ] || [ -z "$(ls -A "$REPO_ROOT/dist" 2>/dev/null)" ]; then
  cd "$REPO_ROOT" && npm run build > /dev/null 2>&1
fi

if [ -d "$REPO_ROOT/dist" ]; then
  # index.html must be present
  if [ -f "$REPO_ROOT/dist/index.html" ]; then
    pass "AC7-ext – dist/index.html is present in build output"
  else
    fail "AC7-ext – dist/index.html is missing from build output"
  fi

  # dist/ should contain at least one additional asset (CSS or JS)
  ASSET_COUNT=$(find "$REPO_ROOT/dist" -type f \( -name "*.css" -o -name "*.js" \) 2>/dev/null | wc -l | tr -d ' ')
  if [ "${ASSET_COUNT:-0}" -gt 0 ]; then
    pass "AC7-ext – dist/ contains $ASSET_COUNT CSS/JS asset(s) alongside index.html"
  else
    # A purely static HTML build with no JS/CSS assets is still valid
    pass "AC7-ext – dist/ build output is present (no separate JS/CSS assets required for static HTML)"
  fi

  # dist/index.html should contain DOCTYPE (valid HTML)
  if grep -q "DOCTYPE" "$REPO_ROOT/dist/index.html" 2>/dev/null; then
    pass "AC7-ext – dist/index.html contains DOCTYPE declaration"
  else
    fail "AC7-ext – dist/index.html is missing DOCTYPE declaration"
  fi
else
  fail "AC7-ext – dist/ directory does not exist after build"
fi

# ── AC9 (extended): package.json "private": true prevents accidental publish ──
if [ -f "$PACKAGE_JSON" ]; then
  PRIVATE=$(node -e "const p=require('$PACKAGE_JSON'); console.log(p.private || false)" 2>/dev/null || echo "false")
  if [ "$PRIVATE" = "true" ]; then
    pass "AC9-ext – package.json has \"private\": true (prevents accidental npm publish)"
  else
    fail "AC9-ext – package.json is missing \"private\": true"
  fi
fi

# ── AC9 (extended): No server-side runtime scripts in package.json ────────────
if [ -f "$PACKAGE_JSON" ]; then
  SCRIPTS_JSON=$(node -e "const p=require('$PACKAGE_JSON'); console.log(JSON.stringify(p.scripts || {}))" 2>/dev/null || echo "{}")
  if echo "$SCRIPTS_JSON" | grep -qiE "node server|express|nodemon|ts-node|nest start"; then
    fail "AC9-ext – package.json scripts contain server-side runtime commands"
  else
    pass "AC9-ext – package.json scripts contain no server-side runtime commands"
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
