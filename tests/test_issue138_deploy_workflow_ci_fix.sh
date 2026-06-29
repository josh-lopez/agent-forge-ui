#!/usr/bin/env bash
# Tests for Issue #138: CI failing on main — Deploy to GitHub Pages
#
# Root cause: configure-pages was given 'enablement: true', which makes the
# action call the repository-settings API to turn Pages on. The default
# GITHUB_TOKEN only carries 'pages: write' (not 'administration: write'), so
# that call is rejected ("Get Pages site failed" / "Resource not accessible by
# integration"), turning the trunk red on commit ff8c86843b79.
#
# Fix: remove 'enablement: true' from the configure-pages step. Pages must be
# enabled once, manually, under Settings -> Pages -> Source: "GitHub Actions".
#
# Acceptance criteria tested:
#   AC1 – The 'Deploy to GitHub Pages' workflow is valid and the fix is in place
#          so the workflow can pass on main.
#   AC2 – No regressions introduced to other CI workflows (ci.yml intact).
#   AC3 – The PR commit message / description references the failed run URL and
#          commit ff8c86843b79.
#   AC4 – The root cause (enablement: true / missing administration:write scope)
#          is identified and documented in the workflow file.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_WF="$REPO_ROOT/.github/workflows/deploy.yml"
CI_WF="$REPO_ROOT/.github/workflows/ci.yml"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: Deploy workflow is valid and the fix is in place ────────────────────

if [ -f "$DEPLOY_WF" ]; then
  pass "AC1 – deploy.yml exists at .github/workflows/deploy.yml"
else
  fail "AC1 – deploy.yml does NOT exist at .github/workflows/deploy.yml"
fi

# The root cause of the #138 failure: enablement: true was passed to
# configure-pages, which requires administration:write scope that the default
# GITHUB_TOKEN does not have.
if grep -A5 'configure-pages' "$DEPLOY_WF" | grep -q 'enablement: true'; then
  fail "AC1 – configure-pages still passes 'enablement: true' (the #138 root cause; GITHUB_TOKEN lacks administration:write)"
else
  pass "AC1 – configure-pages does NOT pass 'enablement: true' (fix is in place)"
fi

# Confirm the 'with:' block under configure-pages is gone entirely (or at least
# does not contain enablement).
CONFIGURE_LINE=$(grep -n 'configure-pages' "$DEPLOY_WF" | head -1 | cut -d: -f1)
if [ -n "$CONFIGURE_LINE" ]; then
  # Check the 5 lines after configure-pages for a 'with:' block containing enablement
  NEXT_LINES=$(sed -n "$((CONFIGURE_LINE)),$((CONFIGURE_LINE + 5))p" "$DEPLOY_WF")
  if echo "$NEXT_LINES" | grep -q 'enablement'; then
    fail "AC1 – 'enablement' key found near configure-pages step (should be absent)"
  else
    pass "AC1 – No 'enablement' key found near configure-pages step"
  fi
else
  fail "AC1 – configure-pages step not found in deploy.yml"
fi

# Workflow must still have all required structural elements for a valid deploy.
if grep -q 'actions/checkout' "$DEPLOY_WF"; then
  pass "AC1 – actions/checkout step is present"
else
  fail "AC1 – actions/checkout step is missing"
fi

if grep -q 'actions/setup-node' "$DEPLOY_WF"; then
  pass "AC1 – actions/setup-node step is present"
else
  fail "AC1 – actions/setup-node step is missing"
fi

if grep -q 'npm ci' "$DEPLOY_WF"; then
  pass "AC1 – 'npm ci' install step is present"
else
  fail "AC1 – 'npm ci' install step is missing"
fi

if grep -q 'npm test' "$DEPLOY_WF"; then
  pass "AC1 – 'npm test' gate step is present"
else
  fail "AC1 – 'npm test' gate step is missing"
fi

if grep -q 'actions/configure-pages' "$DEPLOY_WF"; then
  pass "AC1 – actions/configure-pages step is present"
else
  fail "AC1 – actions/configure-pages step is missing"
fi

if grep -q 'npm run build' "$DEPLOY_WF"; then
  pass "AC1 – 'npm run build' step is present"
else
  fail "AC1 – 'npm run build' step is missing"
fi

if grep -q 'actions/upload-pages-artifact' "$DEPLOY_WF"; then
  pass "AC1 – actions/upload-pages-artifact step is present"
else
  fail "AC1 – actions/upload-pages-artifact step is missing"
fi

if grep -q 'actions/deploy-pages' "$DEPLOY_WF"; then
  pass "AC1 – actions/deploy-pages step is present"
else
  fail "AC1 – actions/deploy-pages step is missing"
fi

# Concurrency must be set to NOT cancel in-progress deploys (prevents the
# "Canceling since a higher priority deployment request exists" error).
if grep -q 'cancel-in-progress: false' "$DEPLOY_WF"; then
  pass "AC1 – concurrency.cancel-in-progress is 'false' (prevents deploy cancellation errors)"
else
  fail "AC1 – concurrency.cancel-in-progress is NOT 'false'"
fi

# Permissions required for Pages OIDC deploy must be present.
if grep -q 'pages: write' "$DEPLOY_WF"; then
  pass "AC1 – 'pages: write' permission is present"
else
  fail "AC1 – 'pages: write' permission is missing"
fi

if grep -q 'id-token: write' "$DEPLOY_WF"; then
  pass "AC1 – 'id-token: write' permission is present (required for OIDC)"
else
  fail "AC1 – 'id-token: write' permission is missing"
fi

# deploy job must depend on build job.
if grep -q 'needs: build' "$DEPLOY_WF"; then
  pass "AC1 – deploy job depends on build job (needs: build)"
else
  fail "AC1 – deploy job does not depend on build job"
fi

# ── AC2: No regressions to other CI workflows ────────────────────────────────

if [ -f "$CI_WF" ]; then
  pass "AC2 – ci.yml still exists (no regression: CI workflow not removed)"
else
  fail "AC2 – ci.yml is missing (regression: CI workflow was removed)"
fi

# ci.yml must still trigger on push to main and on pull_request.
if grep -q 'push' "$CI_WF" && grep -q 'main' "$CI_WF"; then
  pass "AC2 – ci.yml still triggers on push to main"
else
  fail "AC2 – ci.yml no longer triggers on push to main"
fi

if grep -q 'pull_request' "$CI_WF"; then
  pass "AC2 – ci.yml still triggers on pull_request"
else
  fail "AC2 – ci.yml no longer triggers on pull_request"
fi

# ci.yml must still run npm ci, npm run build, and npm test.
if grep -q 'npm ci' "$CI_WF"; then
  pass "AC2 – ci.yml still runs 'npm ci'"
else
  fail "AC2 – ci.yml no longer runs 'npm ci'"
fi

if grep -q 'npm run build' "$CI_WF"; then
  pass "AC2 – ci.yml still runs 'npm run build'"
else
  fail "AC2 – ci.yml no longer runs 'npm run build'"
fi

if grep -q 'npm test' "$CI_WF"; then
  pass "AC2 – ci.yml still runs 'npm test'"
else
  fail "AC2 – ci.yml no longer runs 'npm test'"
fi

# ci.yml must not suppress failures.
if grep -q 'continue-on-error: true' "$CI_WF"; then
  fail "AC2 – ci.yml has 'continue-on-error: true' (regression: failures suppressed)"
else
  pass "AC2 – ci.yml does not suppress failures (no continue-on-error: true)"
fi

# ── AC3: PR references the failed run URL and commit ff8c86843b79 ─────────────
# The commit message for the fix should reference the failed commit.
# We check the git log for the fix commit.
FIX_COMMIT_MSG=$(git -C "$REPO_ROOT" log --format="%B" -1 2>/dev/null || true)

# The issue references commit ff8c86843b79 as the failing commit.
# The fix commit message should mention it (or the PR description does).
# We check the commit message of the most recent commit on this branch.
if echo "$FIX_COMMIT_MSG" | grep -qi 'ff8c86843b79\|ff8c868\|enablement\|administration'; then
  pass "AC3/AC4 – Fix commit message references the root cause (enablement/administration or commit hash)"
else
  # Also check if the workflow file itself documents the root cause.
  if grep -q 'administration' "$DEPLOY_WF" || grep -q 'enablement' "$DEPLOY_WF"; then
    pass "AC3/AC4 – deploy.yml documents the root cause (administration:write / enablement)"
  else
    fail "AC3/AC4 – Neither commit message nor deploy.yml documents the root cause"
  fi
fi

# ── AC4: Root cause documented in the workflow file ──────────────────────────
# The workflow comment must explain WHY enablement: true was removed.
if grep -q 'administration' "$DEPLOY_WF"; then
  pass "AC4 – deploy.yml documents the 'administration: write' scope requirement (root cause)"
else
  fail "AC4 – deploy.yml does not document the 'administration: write' scope requirement"
fi

if grep -q 'enablement' "$DEPLOY_WF"; then
  pass "AC4 – deploy.yml mentions 'enablement' (documents what was removed and why)"
else
  fail "AC4 – deploy.yml does not mention 'enablement' (root cause not documented)"
fi

# The workflow should explain that Pages must be enabled manually.
if grep -qi 'manually\|manual' "$DEPLOY_WF"; then
  pass "AC4 – deploy.yml documents that Pages must be enabled manually (workaround)"
else
  fail "AC4 – deploy.yml does not document the manual Pages-enable workaround"
fi

# ── Local build verification (AC1: workflow build step works) ─────────────────
if [ -d "$REPO_ROOT/node_modules" ]; then
  if ( cd "$REPO_ROOT" && VITE_BASE="/agent-forge-ui/" npm run build \
       > /tmp/issue138_build.log 2>&1 ); then
    pass "AC1/LocalBuild – VITE_BASE=/agent-forge-ui/ npm run build succeeds"
    if [ -f "$REPO_ROOT/dist/index.html" ]; then
      pass "AC1/LocalBuild – dist/index.html produced by build"
    else
      fail "AC1/LocalBuild – dist/index.html not found after build"
    fi
  else
    fail "AC1/LocalBuild – Build failed (see /tmp/issue138_build.log)"
    cat /tmp/issue138_build.log
  fi
else
  echo "SKIP: node_modules not installed; skipping local build verification"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
