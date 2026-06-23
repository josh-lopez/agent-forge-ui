#!/usr/bin/env bash
# Tests for Issue #36: Vitest test harness, npm script, CI step, and README docs
# Covers all eight acceptance criteria.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$REPO_ROOT/package.json"
VITEST_CFG="$REPO_ROOT/vitest.config.ts"
VITE_CFG="$REPO_ROOT/vite.config.ts"
CI_FILE="$REPO_ROOT/.github/workflows/ci.yml"
DEPLOY_FILE="$REPO_ROOT/.github/workflows/deploy.yml"
README="$REPO_ROOT/README.md"
GITIGNORE="$REPO_ROOT/.gitignore"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: vitest (and jsdom) listed under devDependencies ─────────────────────

if [ -f "$PKG" ]; then
  # Check vitest is in devDependencies
  if node -e "
    const p = require('$PKG');
    const dev = p.devDependencies || {};
    if (!dev.vitest) { process.exit(1); }
  " 2>/dev/null; then
    VITEST_VER=$(node -e "const p=require('$PKG'); console.log(p.devDependencies.vitest)" 2>/dev/null)
    pass "AC1 – vitest is listed under devDependencies ($VITEST_VER)"
  else
    fail "AC1 – vitest is NOT listed under devDependencies in package.json"
  fi

  # jsdom must also be in devDependencies (required peer for jsdom environment)
  if node -e "
    const p = require('$PKG');
    const dev = p.devDependencies || {};
    if (!dev.jsdom) { process.exit(1); }
  " 2>/dev/null; then
    JSDOM_VER=$(node -e "const p=require('$PKG'); console.log(p.devDependencies.jsdom)" 2>/dev/null)
    pass "AC1 – jsdom is listed under devDependencies ($JSDOM_VER)"
  else
    fail "AC1 – jsdom is NOT listed under devDependencies in package.json"
  fi

  # Neither vitest nor jsdom should appear under (runtime) dependencies
  if node -e "
    const p = require('$PKG');
    const deps = p.dependencies || {};
    if (deps.vitest || deps.jsdom) { process.exit(1); }
  " 2>/dev/null; then
    pass "AC1 – vitest/jsdom are not in runtime dependencies (correctly dev-only)"
  else
    fail "AC1 – vitest or jsdom appears in runtime dependencies (should be devDependencies)"
  fi
else
  fail "AC1 – package.json not found"
fi

# ── AC2: 'test' script exists and runs vitest ─────────────────────────────────

if [ -f "$PKG" ]; then
  TEST_SCRIPT=$(node -e "const p=require('$PKG'); console.log((p.scripts||{}).test||'')" 2>/dev/null)
  if [ -n "$TEST_SCRIPT" ]; then
    pass "AC2 – 'test' script is defined in package.json: $TEST_SCRIPT"
  else
    fail "AC2 – 'test' script is NOT defined in package.json"
  fi

  # The test script must invoke vitest
  if echo "$TEST_SCRIPT" | grep -qiE 'vitest'; then
    pass "AC2 – 'test' script invokes vitest"
  else
    fail "AC2 – 'test' script does not invoke vitest (got: $TEST_SCRIPT)"
  fi

  # Verify vitest binary is present (npm ci has been run)
  if [ -x "$REPO_ROOT/node_modules/.bin/vitest" ]; then
    pass "AC2 – vitest binary is present in node_modules/.bin (npm ci has been run)"
  else
    fail "AC2 – vitest binary is NOT present in node_modules/.bin"
  fi
else
  fail "AC2 – package.json not found"
fi

# ── AC3: Vitest configured with jsdom environment, reusing vite.config ────────

if [ -f "$VITEST_CFG" ]; then
  pass "AC3 – vitest.config.ts exists"

  # Must declare jsdom as the test environment
  if grep -qE "environment\s*:\s*['\"]jsdom['\"]" "$VITEST_CFG"; then
    pass "AC3 – vitest.config.ts sets environment: 'jsdom'"
  else
    fail "AC3 – vitest.config.ts does NOT set environment: 'jsdom'"
  fi

  # Must import/extend the existing vite.config
  if grep -qE "from ['\"].*vite\.config|import.*viteConfig" "$VITEST_CFG"; then
    pass "AC3 – vitest.config.ts imports/extends vite.config"
  else
    fail "AC3 – vitest.config.ts does NOT import/extend vite.config"
  fi

  # Must use mergeConfig (or extends) so Vite plugins/aliases are inherited
  if grep -qE "mergeConfig|extends" "$VITEST_CFG"; then
    pass "AC3 – vitest.config.ts uses mergeConfig (or extends) to inherit Vite settings"
  else
    fail "AC3 – vitest.config.ts does not use mergeConfig/extends to inherit Vite settings"
  fi
else
  # Acceptable alternative: test block inlined in vite.config.ts
  if [ -f "$VITE_CFG" ] && grep -qE "environment\s*:\s*['\"]jsdom['\"]" "$VITE_CFG"; then
    pass "AC3 – jsdom environment configured inline in vite.config.ts"
  else
    fail "AC3 – Neither vitest.config.ts nor vite.config.ts configures jsdom environment"
  fi
fi

# ── AC4: At least one trivial smoke test exists and passes ────────────────────

# Find any *.test.ts / *.spec.ts files (exclude node_modules)
SMOKE_FILES=$(find "$REPO_ROOT/tests" \
  -not -path "$REPO_ROOT/node_modules/*" \
  \( -name "*.test.ts" -o -name "*.spec.ts" \) 2>/dev/null | head -5)

if [ -n "$SMOKE_FILES" ]; then
  pass "AC4 – At least one .test.ts/.spec.ts file exists under tests/"
else
  fail "AC4 – No .test.ts/.spec.ts files found under tests/"
fi

# The vitest run itself must exit 0 (smoke tests pass)
if (cd "$REPO_ROOT" && node_modules/.bin/vitest run > /dev/null 2>&1); then
  pass "AC4 – Vitest suite exits 0 (all unit tests pass)"
else
  fail "AC4 – Vitest suite exits non-zero (unit tests failing)"
fi

# Verify the smoke test contains a trivial arithmetic assertion
SMOKE_FILE="$REPO_ROOT/tests/smoke.test.ts"
if [ -f "$SMOKE_FILE" ]; then
  if grep -qE "1 \+ 1|toBe\(2\)" "$SMOKE_FILE"; then
    pass "AC4 – smoke.test.ts contains a trivial arithmetic assertion (1+1===2)"
  else
    fail "AC4 – smoke.test.ts does not contain the expected trivial assertion"
  fi
else
  fail "AC4 – tests/smoke.test.ts does not exist"
fi

# ── AC5: CI pipeline includes npm test step that fails on non-zero exit ────────

for CI in "$CI_FILE" "$DEPLOY_FILE"; do
  CI_NAME=$(basename "$CI")
  if [ -f "$CI" ]; then
    if grep -qE 'npm test|npm run test' "$CI"; then
      pass "AC5 – $CI_NAME contains an 'npm test' step"
    else
      fail "AC5 – $CI_NAME does NOT contain an 'npm test' step"
    fi

    # Ensure the test step does not suppress failures
    if ! grep -q 'continue-on-error: true' "$CI"; then
      pass "AC5 – $CI_NAME does not suppress test failures (no continue-on-error: true)"
    else
      fail "AC5 – $CI_NAME has 'continue-on-error: true' which may hide test failures"
    fi
  else
    fail "AC5 – CI workflow file not found: $CI_NAME"
  fi
done

# ── AC6: npm test produces a clear pass/fail summary with no config errors ─────

# Capture vitest output and check for the summary line
VITEST_OUTPUT=$(cd "$REPO_ROOT" && node_modules/.bin/vitest run 2>&1)
VITEST_EXIT=$?

if [ $VITEST_EXIT -eq 0 ]; then
  pass "AC6 – 'vitest run' exits 0 (no unhandled configuration errors)"
else
  fail "AC6 – 'vitest run' exits non-zero (configuration or test errors present)"
fi

# Vitest should print a summary line like "Test Files  N passed"
if echo "$VITEST_OUTPUT" | grep -qE "Test Files.*passed|Tests.*passed"; then
  pass "AC6 – Vitest output contains a clear pass/fail summary"
else
  fail "AC6 – Vitest output does not contain a recognisable pass/fail summary"
fi

# No 'failed to load' or 'SyntaxError' lines in the output (config errors)
if echo "$VITEST_OUTPUT" | grep -qiE "failed to load|Cannot find|SyntaxError"; then
  fail "AC6 – Vitest output contains configuration/load errors"
else
  pass "AC6 – Vitest output contains no configuration/load errors"
fi

# ── AC7: README documents how to run tests locally ────────────────────────────

if [ -f "$README" ]; then
  # Must have a section heading about running tests
  if grep -qiE "^#{1,3}.*[Rr]unning [Tt]ests|^#{1,3}.*[Tt]esting" "$README"; then
    pass "AC7 – README has a section heading about running tests"
  else
    fail "AC7 – README does NOT have a section heading about running tests"
  fi

  # Must document 'npm test'
  if grep -q 'npm test' "$README"; then
    pass "AC7 – README documents 'npm test'"
  else
    fail "AC7 – README does NOT document 'npm test'"
  fi

  # Must mention vitest (so readers know what's running)
  if grep -qiE 'vitest|Vitest' "$README"; then
    pass "AC7 – README mentions Vitest"
  else
    fail "AC7 – README does NOT mention Vitest"
  fi

  # Must mention jsdom or browser-like environment
  if grep -qiE 'jsdom|browser.like|browser environment' "$README"; then
    pass "AC7 – README mentions jsdom / browser-like environment"
  else
    fail "AC7 – README does NOT mention jsdom or browser-like environment"
  fi
else
  fail "AC7 – README.md not found"
fi

# ── AC8: Test artefacts are covered by .gitignore ─────────────────────────────

if [ -f "$GITIGNORE" ]; then
  # coverage/ directory must be ignored
  if grep -qE '^coverage/' "$GITIGNORE"; then
    pass "AC8 – .gitignore covers coverage/ (coverage reports)"
  else
    fail "AC8 – .gitignore does NOT cover coverage/ directory"
  fi

  # Vitest cache must be ignored
  if grep -qE '\.vitest/|vitest.cache|vitest-cache' "$GITIGNORE"; then
    pass "AC8 – .gitignore covers Vitest cache dirs/files"
  else
    fail "AC8 – .gitignore does NOT cover Vitest cache dirs/files"
  fi

  # Verify no coverage or vitest cache artefacts are committed
  if git -C "$REPO_ROOT" ls-files | grep -qE '^coverage/|^\.vitest/'; then
    fail "AC8 – coverage/ or .vitest/ artefacts are committed to the repository"
  else
    pass "AC8 – No coverage/ or .vitest/ artefacts are committed to the repository"
  fi
else
  fail "AC8 – .gitignore not found"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
