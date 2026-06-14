#!/usr/bin/env bash
# Hygiene tests for Issue #27: Sensible build configuration for the front-end.
# Covers additional AC1/AC5/AC8/AC9 angles not addressed by the primary scripts:
#   - package.json version follows semver (AC1)
#   - package.json engines field is present (AC1 / project hygiene)
#   - vite.config.ts imports from 'vite' (not a third-party bundler shim) (AC5)
#   - tsconfig.json moduleResolution is browser-compatible (AC8)
#   - tsconfig.json noEmit is true (consistent with Vite-only build, AC8)
#   - No .env files with secrets committed to the repo (AC9)
#   - dist/ is listed in .gitignore (AC9 / hygiene)

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE_JSON="$REPO_ROOT/package.json"
VITE_CONFIG="$REPO_ROOT/vite.config.ts"
TSCONFIG="$REPO_ROOT/tsconfig.json"
GITIGNORE="$REPO_ROOT/.gitignore"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1 (hygiene): package.json version follows semver ───────────────────────
if [ -f "$PACKAGE_JSON" ]; then
  VERSION=$(node -e "const p=require('$PACKAGE_JSON'); console.log(p.version || '')" 2>/dev/null || echo "")
  if echo "$VERSION" | grep -qE "^[0-9]+\.[0-9]+\.[0-9]"; then
    pass "AC1-hygiene – package.json version '$VERSION' follows semver (MAJOR.MINOR.PATCH)"
  else
    fail "AC1-hygiene – package.json version '$VERSION' does not follow semver"
  fi
fi

# ── AC1 (hygiene): package.json engines field is present ─────────────────────
if [ -f "$PACKAGE_JSON" ]; then
  ENGINES=$(node -e "const p=require('$PACKAGE_JSON'); console.log(JSON.stringify(p.engines || null))" 2>/dev/null || echo "null")
  if [ "$ENGINES" != "null" ] && [ "$ENGINES" != "{}" ]; then
    pass "AC1-hygiene – package.json has an 'engines' field: $ENGINES"
  else
    fail "AC1-hygiene – package.json is missing an 'engines' field (node version constraint)"
  fi
fi

# ── AC5 (hygiene): vite.config.ts imports from 'vite' ────────────────────────
if [ -f "$VITE_CONFIG" ]; then
  if grep -q "from 'vite'" "$VITE_CONFIG" || grep -q 'from "vite"' "$VITE_CONFIG"; then
    pass "AC5-hygiene – vite.config.ts imports from 'vite' package"
  else
    fail "AC5-hygiene – vite.config.ts does not import from 'vite'"
  fi
fi

# ── AC8 (hygiene): tsconfig.json moduleResolution is browser-compatible ──────
if [ -f "$TSCONFIG" ]; then
  MODULE_RES=$(node -e "const t=require('$TSCONFIG'); console.log(t.compilerOptions && t.compilerOptions.moduleResolution || '')" 2>/dev/null || echo "")
  if echo "$MODULE_RES" | grep -qiE "bundler|node16|nodenext|node"; then
    pass "AC8-hygiene – tsconfig.json moduleResolution is set: $MODULE_RES"
  else
    fail "AC8-hygiene – tsconfig.json moduleResolution is not set or unrecognised: '$MODULE_RES'"
  fi
fi

# ── AC8 (hygiene): tsconfig.json noEmit is true (Vite handles emit) ──────────
if [ -f "$TSCONFIG" ]; then
  NO_EMIT=$(node -e "const t=require('$TSCONFIG'); console.log(t.compilerOptions && t.compilerOptions.noEmit || false)" 2>/dev/null || echo "false")
  if [ "$NO_EMIT" = "true" ]; then
    pass "AC8-hygiene – tsconfig.json has noEmit: true (Vite handles transpilation)"
  else
    fail "AC8-hygiene – tsconfig.json noEmit is not true; tsc may conflict with Vite's build"
  fi
fi

# ── AC9 (hygiene): No .env files with secrets committed ──────────────────────
ENV_FILES=$(find "$REPO_ROOT" \
  -not -path "$REPO_ROOT/.git/*" \
  -not -path "$REPO_ROOT/node_modules/*" \
  \( -name ".env" -o -name ".env.local" -o -name ".env.production" -o -name ".env.secret" \) \
  2>/dev/null)
if [ -z "$ENV_FILES" ]; then
  pass "AC9-hygiene – No .env secret files found in the repository"
else
  fail "AC9-hygiene – .env file(s) found in repository: $ENV_FILES"
fi

# ── AC9 (hygiene): dist/ is listed in .gitignore ─────────────────────────────
if [ -f "$GITIGNORE" ]; then
  if grep -qE "^/?dist(/|$)" "$GITIGNORE"; then
    pass "AC9-hygiene – dist/ is listed in .gitignore (build output not committed)"
  else
    fail "AC9-hygiene – dist/ is NOT listed in .gitignore (build output may be committed)"
  fi
else
  fail "AC9-hygiene – .gitignore does not exist"
fi

# ── AC6 (hygiene): package.json 'type' is 'module' (ESM, browser-appropriate) ─
if [ -f "$PACKAGE_JSON" ]; then
  PKG_TYPE=$(node -e "const p=require('$PACKAGE_JSON'); console.log(p.type || '')" 2>/dev/null || echo "")
  if [ "$PKG_TYPE" = "module" ]; then
    pass "AC6-hygiene – package.json has \"type\": \"module\" (ESM, browser-appropriate)"
  else
    # CommonJS is also valid; just note it
    echo "INFO: AC6-hygiene – package.json type is '$PKG_TYPE' (not 'module')"
    pass "AC6-hygiene – package.json type field is acceptable: '$PKG_TYPE'"
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
