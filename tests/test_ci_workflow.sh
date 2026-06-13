#!/usr/bin/env bash
# Tests for Issue #11: GitHub Actions CI workflow configuration
# Covers all nine acceptance criteria.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CI_FILE="$REPO_ROOT/.github/workflows/ci.yml"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: A CI workflow file exists and is committed ───────────────────────────
if [ -f "$CI_FILE" ]; then
  pass "AC1 – CI workflow file exists at .github/workflows/ci.yml"
else
  fail "AC1 – CI workflow file does NOT exist at .github/workflows/ci.yml"
fi

# Verify the file is tracked by git (committed, not just present on disk)
if git -C "$REPO_ROOT" ls-files --error-unmatch ".github/workflows/ci.yml" \
    > /dev/null 2>&1; then
  pass "AC1 – CI workflow file is committed to the repository"
else
  fail "AC1 – CI workflow file is NOT committed to the repository"
fi

# ── AC2: Workflow triggers on pull_request events targeting main ──────────────
# The on.pull_request.branches list must include 'main'
if grep -A5 'pull_request:' "$CI_FILE" | grep -q 'main'; then
  pass "AC2 – Workflow triggers on pull_request events targeting main"
else
  fail "AC2 – Workflow does NOT trigger on pull_request events targeting main"
fi

# ── AC3: Workflow triggers on push events to main ────────────────────────────
if grep -A5 'push:' "$CI_FILE" | grep -q 'main'; then
  pass "AC3 – Workflow triggers on push events to main"
else
  fail "AC3 – Workflow does NOT trigger on push events to main"
fi

# ── AC4: Workflow has a discrete dependency-install step (npm ci) ─────────────
if grep -q 'npm ci' "$CI_FILE"; then
  pass "AC4 – Workflow contains an 'npm ci' dependency-install step"
else
  fail "AC4 – Workflow does NOT contain an 'npm ci' dependency-install step"
fi

# ── AC5: Workflow runs the build step ────────────────────────────────────────
# Must reference the build script (npm run build or equivalent)
if grep -qE 'npm run build|vite build' "$CI_FILE"; then
  pass "AC5 – Workflow contains a build step (npm run build)"
else
  fail "AC5 – Workflow does NOT contain a build step"
fi

# ── AC6: Workflow runs the test suite ────────────────────────────────────────
if grep -qE 'npm test|npm run test' "$CI_FILE"; then
  pass "AC6 – Workflow contains a test step (npm test)"
else
  fail "AC6 – Workflow does NOT contain a test step"
fi

# ── AC7 & AC8: Failure/success propagation via GitHub Actions job semantics ───
# GitHub Actions automatically fails the job (and reports failure on the PR)
# when any step exits non-zero, provided there is no 'continue-on-error: true'
# on the build or test steps.
#
# Check that neither the build step nor the test step suppresses failures.
BUILD_STEP_BLOCK=$(awk '/run: npm run build/{found=1} found{print; if(/^      - / && !/run: npm run build/) exit}' "$CI_FILE")
TEST_STEP_BLOCK=$(awk '/run: npm test/{found=1} found{print; if(/^      - / && !/run: npm test/) exit}' "$CI_FILE")

if ! echo "$BUILD_STEP_BLOCK" | grep -q 'continue-on-error: true'; then
  pass "AC7/AC8 – Build step does not suppress failures (continue-on-error not set)"
else
  fail "AC7/AC8 – Build step has 'continue-on-error: true', failures would be hidden"
fi

if ! echo "$TEST_STEP_BLOCK" | grep -q 'continue-on-error: true'; then
  pass "AC7/AC8 – Test step does not suppress failures (continue-on-error not set)"
else
  fail "AC7/AC8 – Test step has 'continue-on-error: true', failures would be hidden"
fi

# Also verify the job itself doesn't globally suppress errors
if ! grep -q 'continue-on-error: true' "$CI_FILE"; then
  pass "AC7/AC8 – No global 'continue-on-error: true' in workflow"
else
  fail "AC7/AC8 – Workflow has 'continue-on-error: true' which may hide failures"
fi

# ── AC9: Node.js version is consistent with package.json engines field ────────
# package.json specifies engines.node >= 20; the workflow must use Node 20+.
ENGINES_FIELD=$(node -e "const p=require('$REPO_ROOT/package.json'); console.log(p.engines && p.engines.node || '')" 2>/dev/null || echo "")

if [ -n "$ENGINES_FIELD" ]; then
  # Extract the minimum version number from the engines field (e.g. ">=20" -> 20)
  MIN_NODE=$(echo "$ENGINES_FIELD" | grep -oE '[0-9]+' | head -1)
  pass "AC9 – package.json engines.node field found: $ENGINES_FIELD (minimum: $MIN_NODE)"

  # Extract the node-version value from the workflow
  WORKFLOW_NODE=$(grep -A2 'node-version' "$CI_FILE" | grep -oE "'[0-9]+[^']*'" | tr -d "'" | head -1)
  if [ -z "$WORKFLOW_NODE" ]; then
    WORKFLOW_NODE=$(grep -A2 'node-version' "$CI_FILE" | grep -oE '"[0-9]+[^"]*"' | tr -d '"' | head -1)
  fi

  if [ -n "$WORKFLOW_NODE" ]; then
    WORKFLOW_NODE_MAJOR=$(echo "$WORKFLOW_NODE" | grep -oE '^[0-9]+')
    if [ "$WORKFLOW_NODE_MAJOR" -ge "$MIN_NODE" ] 2>/dev/null; then
      pass "AC9 – Workflow Node.js version ($WORKFLOW_NODE) satisfies engines.node ($ENGINES_FIELD)"
    else
      fail "AC9 – Workflow Node.js version ($WORKFLOW_NODE) is below engines.node minimum ($MIN_NODE)"
    fi
  else
    fail "AC9 – Could not determine Node.js version from workflow file"
  fi
else
  # No engines field; fall back to checking tsconfig target (ES2020 -> Node 14+)
  # and that some node-version is specified
  if grep -q 'node-version' "$CI_FILE"; then
    pass "AC9 – Workflow specifies a Node.js version (no engines field in package.json to compare)"
  else
    fail "AC9 – Workflow does not specify a Node.js version"
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
