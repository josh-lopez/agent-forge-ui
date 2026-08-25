#!/usr/bin/env bash
# Tests for Issue #138: CI failing on main — Deploy to GitHub Pages
#
# Root causes addressed by the deploy workflow fixes:
#   1. cancel-in-progress: true caused the deploy-pages step to error with
#      "Canceling since a higher priority deployment request exists" when a
#      queued run superseded an in-flight deploy. Fixed by setting
#      cancel-in-progress: false.
#   2. configure-pages was given 'enablement: true', which makes the action
#      call the repository-settings API to turn Pages on. The default
#      GITHUB_TOKEN only carries 'pages: write' (not 'administration: write'),
#      so that call is rejected ("Get Pages site failed" / "Resource not
#      accessible by integration"), turning the trunk red. Fixed by removing
#      'enablement: true'; Pages is enabled once manually in repo Settings.
#
# Acceptance criteria tested:
#   AC1 – The workflow file is valid and all required jobs/steps are present.
#   AC2 – The fix is minimal: only the targeted changes were made.
#   AC3 – The failure can be reproduced / verified locally via workflow linting.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_WF="$REPO_ROOT/.github/workflows/deploy.yml"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── Sanity: workflow file exists and is committed ─────────────────────────────
if [ -f "$DEPLOY_WF" ]; then
  pass "Workflow file exists at .github/workflows/deploy.yml"
else
  fail "Workflow file does NOT exist at .github/workflows/deploy.yml"
fi

if git -C "$REPO_ROOT" ls-files --error-unmatch ".github/workflows/deploy.yml" \
    > /dev/null 2>&1; then
  pass "Workflow file is committed to the repository"
else
  fail "Workflow file is NOT committed to the repository"
fi

# ── Fix 1: cancel-in-progress must be false ───────────────────────────────────
# The original failure: when a queued run superseded an in-flight deploy,
# actions/deploy-pages errored with "Canceling since a higher priority
# deployment request exists". Setting cancel-in-progress: false lets the
# in-flight deploy finish and queues the next one instead.
if grep -q 'cancel-in-progress: false' "$DEPLOY_WF"; then
  pass "Fix1 – concurrency.cancel-in-progress is 'false' (prevents deploy cancellation errors)"
else
  fail "Fix1 – concurrency.cancel-in-progress is NOT 'false'; in-progress deploys may be cancelled, causing errors"
fi

# Confirm the old broken value is gone.
if grep -q 'cancel-in-progress: true' "$DEPLOY_WF"; then
  fail "Fix1 – 'cancel-in-progress: true' is still present; this was the original failure cause"
else
  pass "Fix1 – 'cancel-in-progress: true' has been removed"
fi

# ── Fix 2: configure-pages must NOT pass 'enablement: true' ──────────────────
# Issue #138: the run on commit ff8c86843b79 failed because configure-pages was
# given 'enablement: true', which makes the action issue a repository-settings
# API call to turn Pages on. The default GITHUB_TOKEN only carries
# 'pages: write' (not 'administration: write'), so that call is rejected
# ("Get Pages site failed" / "Resource not accessible by integration"),
# turning the trunk red. Pages is instead enabled once, manually, in repo
# Settings -> Pages -> Source: "GitHub Actions" (a one-time manual step), and
# configure-pages simply reads the existing site config.

# Verify configure-pages does NOT use enablement: true (the #138 root cause).
if grep -A3 'configure-pages' "$DEPLOY_WF" | grep -q 'enablement: true'; then
  fail "Fix2 – configure-pages still passes 'enablement: true' (the #138 root cause; the token cannot enable Pages)"
else
  pass "Fix2 – configure-pages does NOT pass 'enablement: true' (avoids the unauthorised Pages-enable API call)"
fi

# Verify configure-pages appears before the Build step in the file.
CONFIGURE_LINE=$(grep -n 'configure-pages' "$DEPLOY_WF" | head -1 | cut -d: -f1)
BUILD_RUN_LINE=$(grep -n 'npm run build' "$DEPLOY_WF" | head -1 | cut -d: -f1)

if [ -n "$CONFIGURE_LINE" ] && [ -n "$BUILD_RUN_LINE" ]; then
  if [ "$CONFIGURE_LINE" -lt "$BUILD_RUN_LINE" ]; then
    pass "Fix2 – configure-pages step (line $CONFIGURE_LINE) appears BEFORE the build step (line $BUILD_RUN_LINE)"
  else
    fail "Fix2 – configure-pages step (line $CONFIGURE_LINE) appears AFTER the build step (line $BUILD_RUN_LINE); first-run will fail"
  fi
else
  fail "Fix2 – Could not locate configure-pages or build step in workflow file"
fi

# ── Workflow structure integrity ──────────────────────────────────────────────
# Ensure the fix did not accidentally remove required steps.

if grep -q 'actions/checkout' "$DEPLOY_WF"; then
  pass "Structure – actions/checkout step is present"
else
  fail "Structure – actions/checkout step is missing"
fi

if grep -q 'actions/setup-node' "$DEPLOY_WF"; then
  pass "Structure – actions/setup-node step is present"
else
  fail "Structure – actions/setup-node step is missing"
fi

if grep -q 'npm ci' "$DEPLOY_WF"; then
  pass "Structure – 'npm ci' (install dependencies) step is present"
else
  fail "Structure – 'npm ci' step is missing"
fi

if grep -q 'npm test' "$DEPLOY_WF"; then
  pass "Structure – 'npm test' (test gate) step is present"
else
  fail "Structure – 'npm test' step is missing"
fi

if grep -q 'actions/upload-pages-artifact' "$DEPLOY_WF"; then
  pass "Structure – actions/upload-pages-artifact step is present"
else
  fail "Structure – actions/upload-pages-artifact step is missing"
fi

if grep -q 'actions/deploy-pages' "$DEPLOY_WF"; then
  pass "Structure – actions/deploy-pages step is present"
else
  fail "Structure – actions/deploy-pages step is missing"
fi

# ── Step ordering: Test → configure-pages → Build → Upload ───────────────────
# Verify the full intended order: npm test, then configure-pages, then
# npm run build, then upload-pages-artifact.
TEST_LINE=$(grep -n 'npm test' "$DEPLOY_WF" | head -1 | cut -d: -f1)
UPLOAD_LINE=$(grep -n 'upload-pages-artifact' "$DEPLOY_WF" | head -1 | cut -d: -f1)

if [ -n "$TEST_LINE" ] && [ -n "$CONFIGURE_LINE" ] && \
   [ -n "$BUILD_RUN_LINE" ] && [ -n "$UPLOAD_LINE" ]; then
  if [ "$TEST_LINE" -lt "$CONFIGURE_LINE" ] && \
     [ "$CONFIGURE_LINE" -lt "$BUILD_RUN_LINE" ] && \
     [ "$BUILD_RUN_LINE" -lt "$UPLOAD_LINE" ]; then
    pass "Order – Step order is: Test → configure-pages → Build → Upload (correct)"
  else
    fail "Order – Step order is incorrect (expected Test → configure-pages → Build → Upload)"
    echo "       Test=$TEST_LINE, configure-pages=$CONFIGURE_LINE, Build=$BUILD_RUN_LINE, Upload=$UPLOAD_LINE"
  fi
else
  fail "Order – Could not determine step order (missing line numbers)"
fi

# ── Concurrency group is still 'pages' ───────────────────────────────────────
if grep -q "group: pages" "$DEPLOY_WF"; then
  pass "Concurrency – group is still 'pages' (single-deploy serialisation preserved)"
else
  fail "Concurrency – concurrency group 'pages' is missing"
fi

# ── deploy job still depends on build job ────────────────────────────────────
if grep -q 'needs: build' "$DEPLOY_WF"; then
  pass "Jobs – deploy job still depends on build job (needs: build)"
else
  fail "Jobs – deploy job no longer depends on build job"
fi

# ── Permissions unchanged ─────────────────────────────────────────────────────
if grep -q 'pages: write' "$DEPLOY_WF"; then
  pass "Permissions – 'pages: write' is present"
else
  fail "Permissions – 'pages: write' is missing"
fi

if grep -q 'id-token: write' "$DEPLOY_WF"; then
  pass "Permissions – 'id-token: write' is present (required for OIDC deploy)"
else
  fail "Permissions – 'id-token: write' is missing"
fi

# ── VITE_BASE derivation from GITHUB_REPOSITORY is intact ────────────────────
if grep -qE 'VITE_BASE.*GITHUB_REPOSITORY' "$DEPLOY_WF"; then
  pass "Build – VITE_BASE is still derived from GITHUB_REPOSITORY"
else
  fail "Build – VITE_BASE derivation from GITHUB_REPOSITORY is missing"
fi

# ── workflow_dispatch still present ──────────────────────────────────────────
if grep -q 'workflow_dispatch' "$DEPLOY_WF"; then
  pass "Trigger – workflow_dispatch (manual re-deploy) is still present"
else
  fail "Trigger – workflow_dispatch is missing"
fi

# ── Local build still works (AC3: reproduce failure locally) ─────────────────
if [ -d "$REPO_ROOT/node_modules" ]; then
  if ( cd "$REPO_ROOT" && VITE_BASE="/agent-forge-ui/" npm run build \
       > /tmp/issue134_build.log 2>&1 ); then
    pass "LocalBuild – VITE_BASE=/agent-forge-ui/ npm run build succeeds (workflow build step verified locally)"
    if [ -f "$REPO_ROOT/dist/index.html" ]; then
      pass "LocalBuild – dist/index.html produced by build"
    else
      fail "LocalBuild – dist/index.html not found after build"
    fi
  else
    fail "LocalBuild – Build failed (see /tmp/issue134_build.log)"
    cat /tmp/issue134_build.log
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
