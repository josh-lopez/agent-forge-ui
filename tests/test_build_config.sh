#!/usr/bin/env bash
# Tests for Issue #27: Sensible build configuration for the front-end.
# Covers all nine acceptance criteria.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE_JSON="$REPO_ROOT/package.json"
VITE_CONFIG="$REPO_ROOT/vite.config.ts"
TSCONFIG="$REPO_ROOT/tsconfig.json"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: package.json exists with name, version, scripts, and dependencies ────
if [ ! -f "$PACKAGE_JSON" ]; then
  fail "AC1 – package.json does not exist at the repo root"
else
  pass "AC1 – package.json exists at the repo root"

  NAME=$(node -e "const p=require('$PACKAGE_JSON'); console.log(p.name || '')" 2>/dev/null || echo "")
  if [ -n "$NAME" ]; then
    pass "AC1 – package.json has a 'name' field: $NAME"
  else
    fail "AC1 – package.json is missing a 'name' field"
  fi

  VERSION=$(node -e "const p=require('$PACKAGE_JSON'); console.log(p.version || '')" 2>/dev/null || echo "")
  if [ -n "$VERSION" ]; then
    pass "AC1 – package.json has a 'version' field: $VERSION"
  else
    fail "AC1 – package.json is missing a 'version' field"
  fi

  SCRIPTS_COUNT=$(node -e "const p=require('$PACKAGE_JSON'); console.log(Object.keys(p.scripts || {}).length)" 2>/dev/null || echo "0")
  if [ "${SCRIPTS_COUNT:-0}" -gt 0 ]; then
    pass "AC1 – package.json has a 'scripts' block with $SCRIPTS_COUNT entries"
  else
    fail "AC1 – package.json is missing a 'scripts' block"
  fi

  DEPS_COUNT=$(node -e "
    const p=require('$PACKAGE_JSON');
    const d=Object.keys(p.dependencies||{}).length;
    const dd=Object.keys(p.devDependencies||{}).length;
    console.log(d+dd);
  " 2>/dev/null || echo "0")
  if [ "${DEPS_COUNT:-0}" -gt 0 ]; then
    pass "AC1 – package.json declares dependencies/devDependencies ($DEPS_COUNT total)"
  else
    fail "AC1 – package.json has no dependencies or devDependencies"
  fi
fi

# ── AC2: 'build' script is defined and runs a bundler ─────────────────────────
BUILD_SCRIPT=$(node -e "const p=require('$PACKAGE_JSON'); console.log(p.scripts && p.scripts.build || '')" 2>/dev/null || echo "")
if [ -n "$BUILD_SCRIPT" ]; then
  pass "AC2 – 'build' script is defined: $BUILD_SCRIPT"
else
  fail "AC2 – 'build' script is NOT defined in package.json"
fi

if echo "$BUILD_SCRIPT" | grep -qE "vite|webpack|parcel|rollup|esbuild"; then
  pass "AC2 – 'build' script invokes a recognised bundler"
else
  fail "AC2 – 'build' script does not appear to invoke a bundler"
fi

# ── AC3: 'dev' (or equivalent) script is defined ─────────────────────────────
DEV_SCRIPT=$(node -e "const p=require('$PACKAGE_JSON'); console.log(p.scripts && (p.scripts.dev || p.scripts.start || p.scripts.serve) || '')" 2>/dev/null || echo "")
if [ -n "$DEV_SCRIPT" ]; then
  pass "AC3 – dev/start/serve script is defined: $DEV_SCRIPT"
else
  fail "AC3 – No dev/start/serve script found in package.json"
fi

# ── AC4: 'test' script is defined and non-trivial ────────────────────────────
TEST_SCRIPT=$(node -e "const p=require('$PACKAGE_JSON'); console.log(p.scripts && p.scripts.test || '')" 2>/dev/null || echo "")
if [ -n "$TEST_SCRIPT" ] && \
   [ "$TEST_SCRIPT" != "echo" ] && \
   [ "$TEST_SCRIPT" != "true" ] && \
   [ "$TEST_SCRIPT" != "exit 0" ]; then
  pass "AC4 – 'test' script is defined and non-trivial: $TEST_SCRIPT"
else
  fail "AC4 – 'test' script is missing or trivial: '$TEST_SCRIPT'"
fi

# ── AC5: Bundler config file is present and valid ────────────────────────────
if [ -f "$VITE_CONFIG" ]; then
  pass "AC5 – vite.config.ts exists"
  # Verify it contains a defineConfig call (basic validity check)
  if grep -q "defineConfig" "$VITE_CONFIG"; then
    pass "AC5 – vite.config.ts contains a defineConfig call"
  else
    fail "AC5 – vite.config.ts does not contain a defineConfig call"
  fi
elif [ -f "$REPO_ROOT/vite.config.js" ]; then
  pass "AC5 – vite.config.js exists"
else
  fail "AC5 – No bundler config file found (expected vite.config.ts or vite.config.js)"
fi

# ── AC6: npm install completes without errors ─────────────────────────────────
# We verify node_modules is populated (npm install was already run) rather than
# re-running it (which would be slow and redundant in CI).
if [ -d "$REPO_ROOT/node_modules" ]; then
  pass "AC6 – node_modules directory exists (npm install has been run)"
  # Spot-check that vite is installed
  if [ -x "$REPO_ROOT/node_modules/.bin/vite" ]; then
    pass "AC6 – vite binary is present in node_modules/.bin"
  else
    fail "AC6 – vite binary is NOT present in node_modules/.bin"
  fi
else
  fail "AC6 – node_modules directory does not exist; run 'npm install'"
fi

# ── AC7: Build script produces output in dist/ ───────────────────────────────
# Run the build and verify dist/ is populated.
BUILD_OUTPUT=$(cd "$REPO_ROOT" && npm run build 2>&1)
BUILD_EXIT=$?

if [ "$BUILD_EXIT" -eq 0 ]; then
  pass "AC7 – 'npm run build' exits zero"
else
  fail "AC7 – 'npm run build' exited with code $BUILD_EXIT"
  echo "$BUILD_OUTPUT"
fi

if [ -d "$REPO_ROOT/dist" ] && [ "$(ls -A "$REPO_ROOT/dist" 2>/dev/null)" ]; then
  pass "AC7 – dist/ directory exists and is non-empty after build"
else
  fail "AC7 – dist/ directory is missing or empty after build"
fi

if [ -f "$REPO_ROOT/dist/index.html" ]; then
  pass "AC7 – dist/index.html exists in build output"
else
  fail "AC7 – dist/index.html is missing from build output"
fi

# ── AC8: tsconfig.json is present with browser-appropriate settings ───────────
if [ ! -f "$TSCONFIG" ]; then
  fail "AC8 – tsconfig.json does not exist"
else
  pass "AC8 – tsconfig.json exists"

  # Target should be ES2015 or higher (browser-appropriate)
  TARGET=$(node -e "const t=require('$TSCONFIG'); console.log(t.compilerOptions && t.compilerOptions.target || '')" 2>/dev/null || echo "")
  if echo "$TARGET" | grep -qiE "ES20[0-9]{2}|ESNext|ES6|ES2015"; then
    pass "AC8 – tsconfig.json target is browser-appropriate: $TARGET"
  else
    fail "AC8 – tsconfig.json target '$TARGET' may not be browser-appropriate"
  fi

  # lib should include DOM
  LIB=$(node -e "const t=require('$TSCONFIG'); console.log(JSON.stringify(t.compilerOptions && t.compilerOptions.lib || []))" 2>/dev/null || echo "[]")
  if echo "$LIB" | grep -qi "DOM"; then
    pass "AC8 – tsconfig.json lib includes DOM"
  else
    fail "AC8 – tsconfig.json lib does not include DOM"
  fi

  # strict mode should be enabled
  STRICT=$(node -e "const t=require('$TSCONFIG'); console.log(t.compilerOptions && t.compilerOptions.strict || false)" 2>/dev/null || echo "false")
  if [ "$STRICT" = "true" ]; then
    pass "AC8 – tsconfig.json has strict mode enabled"
  else
    fail "AC8 – tsconfig.json does not have strict mode enabled"
  fi
fi

# ── AC9: No backend/server-side/secrets configuration ────────────────────────
BACKEND_PATTERNS="express|fastify|koa|hapi|nestjs|django|flask|rails|laravel|spring|SECRET|API_KEY|PASSWORD|DATABASE_URL|PRIVATE_KEY"

for config_file in "$PACKAGE_JSON" "$VITE_CONFIG" "$TSCONFIG"; do
  [ -f "$config_file" ] || continue
  if grep -qiE "$BACKEND_PATTERNS" "$config_file" 2>/dev/null; then
    fail "AC9 – $(basename "$config_file") contains backend/secret references"
  else
    pass "AC9 – $(basename "$config_file") contains no backend/secret references"
  fi
done

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
