#!/usr/bin/env bash
# Tests for Issue #12: Document deployment process for the front-end.
# Covers the acceptance criteria: a chosen + documented deploy target
# (GitHub Pages), functional build configuration, and a CI/CD workflow that
# deploys only on a successful build.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
README="$REPO_ROOT/README.md"
DEPLOY_WF="$REPO_ROOT/.github/workflows/deploy.yml"
VITE_CONFIG="$REPO_ROOT/vite.config.ts"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: A deployment target is explicitly chosen and documented ──────────────
if grep -q '## Deployment' "$README"; then
  pass "AC1 – README has a '## Deployment' section"
else
  fail "AC1 – README is missing a '## Deployment' section"
fi

if grep -qi 'GitHub Pages' "$README"; then
  pass "AC1 – Deployment target (GitHub Pages) is named in the README"
else
  fail "AC1 – README does not name a concrete deployment target"
fi

# ── AC2/AC5: Step-by-step instructions referencing the build output dir ───────
DEPLOY_BODY=$(awk '/^## Deployment/{f=1} /^## Non-Goals/{f=0} f' "$README")

if echo "$DEPLOY_BODY" | grep -q 'npm run build'; then
  pass "AC2 – Deployment instructions reference 'npm run build'"
else
  fail "AC2 – Deployment instructions do not reference 'npm run build'"
fi

if echo "$DEPLOY_BODY" | grep -q 'dist'; then
  pass "AC5 – Deployment instructions reference the build output dir (dist/)"
else
  fail "AC5 – Deployment instructions do not reference the build output dir"
fi

if echo "$DEPLOY_BODY" | grep -qi 'Settings'; then
  pass "AC2 – Deployment instructions include repository setup steps"
else
  fail "AC2 – Deployment instructions are missing setup steps"
fi

# ── AC3: Required build configuration is present ──────────────────────────────
# vite.config.ts must set a base so GitHub Pages sub-path assets resolve.
if grep -q 'base' "$VITE_CONFIG"; then
  pass "AC3 – vite.config.ts configures 'base' for the deploy sub-path"
else
  fail "AC3 – vite.config.ts does not configure 'base'"
fi

# The base must be derived from VITE_BASE so local dev keeps working at '/'.
if grep -q 'VITE_BASE' "$VITE_CONFIG"; then
  pass "AC3 – vite.config.ts derives base from VITE_BASE (local dev unaffected)"
else
  fail "AC3 – vite.config.ts does not derive base from VITE_BASE"
fi

# ── AC3/AC6: A deploy workflow exists, is committed, and triggers on main ─────
if [ -f "$DEPLOY_WF" ]; then
  pass "AC3 – Deploy workflow exists at .github/workflows/deploy.yml"
else
  fail "AC3 – Deploy workflow does NOT exist at .github/workflows/deploy.yml"
fi

if git -C "$REPO_ROOT" ls-files --error-unmatch ".github/workflows/deploy.yml" \
    > /dev/null 2>&1; then
  pass "AC3 – Deploy workflow is committed to the repository"
else
  fail "AC3 – Deploy workflow is NOT committed to the repository"
fi

if grep -A5 'push:' "$DEPLOY_WF" | grep -q 'main'; then
  pass "AC6 – Deploy workflow triggers on push to main"
else
  fail "AC6 – Deploy workflow does NOT trigger on push to main"
fi

# ── AC6: Deploy only runs on a successful build (deploy needs build) ──────────
if grep -q 'needs: build' "$DEPLOY_WF"; then
  pass "AC6 – Deploy job depends on a successful build (needs: build)"
else
  fail "AC6 – Deploy job does NOT depend on the build job"
fi

if grep -q 'npm run build' "$DEPLOY_WF"; then
  pass "AC6 – Deploy workflow runs the build (npm run build)"
else
  fail "AC6 – Deploy workflow does NOT run the build"
fi

# ── No deploy secrets/tokens committed (uses built-in GITHUB_TOKEN) ───────────
if grep -qiE 'NETLIFY_AUTH_TOKEN|VERCEL_TOKEN|secrets\.[A-Z_]*DEPLOY|secrets\.[A-Z_]*PAT' "$DEPLOY_WF"; then
  fail "AC – Deploy workflow references a committed deploy token/secret"
else
  pass "AC – Deploy workflow uses built-in permissions, no extra secrets"
fi

# ── AC4: Running the documented build produces a working dist/ output ─────────
# Build with the Pages sub-path exactly as the workflow does and verify dist/.
if [ -d "$REPO_ROOT/node_modules" ]; then
  if ( cd "$REPO_ROOT" && VITE_BASE="/agent-forge-ui/" npm run build > /tmp/deploy_build.log 2>&1 ); then
    pass "AC4 – Documented build (VITE_BASE=/agent-forge-ui/ npm run build) succeeds"
    if [ -f "$REPO_ROOT/dist/index.html" ]; then
      pass "AC4 – Build output dist/index.html is produced"
    else
      fail "AC4 – Build did not produce dist/index.html"
    fi
    # Asset URLs in the built index.html must respect the sub-path base.
    if grep -qE '(href|src)="/agent-forge-ui/' "$REPO_ROOT/dist/index.html" \
       || ! grep -qE '(href|src)="/assets/' "$REPO_ROOT/dist/index.html"; then
      pass "AC4 – Built asset URLs respect the GitHub Pages base path"
    else
      fail "AC4 – Built asset URLs do not use the configured base path"
    fi
  else
    fail "AC4 – Documented build failed (see /tmp/deploy_build.log)"
    cat /tmp/deploy_build.log
  fi
else
  echo "SKIP: node_modules not installed; skipping live build check"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
