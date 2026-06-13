#!/usr/bin/env bash
# Extended tests for Issue #12: Document deployment process for the front-end.
# Supplements test_deployment.sh with additional checks for workflow structure,
# README completeness, vite.config.ts correctness, and build artefact integrity.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
README="$REPO_ROOT/README.md"
DEPLOY_WF="$REPO_ROOT/.github/workflows/deploy.yml"
VITE_CONFIG="$REPO_ROOT/vite.config.ts"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: Deployment section exists and names GitHub Pages ────────────────────
# Verify the Deployment heading is a level-2 heading (##), not buried deeper.
if grep -qE '^## Deployment' "$README"; then
  pass "AC1 – '## Deployment' is a top-level (##) section in README"
else
  fail "AC1 – '## Deployment' is not a top-level (##) section in README"
fi

# The README must mention the concrete public URL pattern for GitHub Pages.
if grep -qE 'github\.io' "$README"; then
  pass "AC1 – README references the github.io URL pattern for the deployed site"
else
  fail "AC1 – README does not reference the github.io URL pattern"
fi

# ── AC2: Step-by-step instructions are sufficient for a new contributor ───────
# Extract the Deployment section body (up to the next ## heading).
DEPLOY_BODY=$(awk '/^## Deployment/{f=1; next} /^## /{f=0} f' "$README")

# Must mention enabling GitHub Pages in repository Settings.
if echo "$DEPLOY_BODY" | grep -qi 'Settings.*Pages\|Pages.*Settings'; then
  pass "AC2 – Instructions mention enabling GitHub Pages in repository Settings"
else
  fail "AC2 – Instructions do not mention enabling GitHub Pages in Settings"
fi

# Must mention the Actions tab (for manual trigger / verification).
if echo "$DEPLOY_BODY" | grep -qi 'Actions'; then
  pass "AC2 – Instructions reference the GitHub Actions tab"
else
  fail "AC2 – Instructions do not reference the GitHub Actions tab"
fi

# Must describe what happens after the deploy job finishes (public URL).
if echo "$DEPLOY_BODY" | grep -qiE 'url|public'; then
  pass "AC2 – Instructions describe where to find the public URL after deploy"
else
  fail "AC2 – Instructions do not describe where to find the public URL"
fi

# ── AC3: vite.config.ts base path configuration ───────────────────────────────
# The fallback must be '/' so local dev is unaffected.
if grep -qE "VITE_BASE.*\?\?.*'/'" "$VITE_CONFIG" \
   || grep -qE 'VITE_BASE.*\|\|.*"/"' "$VITE_CONFIG" \
   || grep -qE "process\.env\.VITE_BASE" "$VITE_CONFIG"; then
  pass "AC3 – vite.config.ts reads VITE_BASE from process.env"
else
  fail "AC3 – vite.config.ts does not read VITE_BASE from process.env"
fi

# The outDir must be 'dist' (matching the workflow's upload path).
if grep -qE "outDir.*['\"]dist['\"]" "$VITE_CONFIG"; then
  pass "AC3 – vite.config.ts sets outDir to 'dist'"
else
  fail "AC3 – vite.config.ts does not set outDir to 'dist'"
fi

# ── AC3: Workflow structure — required Actions are present ────────────────────
# Must use actions/checkout.
if grep -q 'actions/checkout' "$DEPLOY_WF"; then
  pass "AC3 – Workflow uses actions/checkout"
else
  fail "AC3 – Workflow does not use actions/checkout"
fi

# Must use actions/setup-node.
if grep -q 'actions/setup-node' "$DEPLOY_WF"; then
  pass "AC3 – Workflow uses actions/setup-node"
else
  fail "AC3 – Workflow does not use actions/setup-node"
fi

# Must upload the Pages artifact.
if grep -q 'actions/upload-pages-artifact' "$DEPLOY_WF"; then
  pass "AC3 – Workflow uploads a Pages artifact (actions/upload-pages-artifact)"
else
  fail "AC3 – Workflow does not upload a Pages artifact"
fi

# Must deploy the Pages artifact.
if grep -q 'actions/deploy-pages' "$DEPLOY_WF"; then
  pass "AC3 – Workflow deploys the Pages artifact (actions/deploy-pages)"
else
  fail "AC3 – Workflow does not deploy the Pages artifact"
fi

# The artifact upload path must be 'dist' (matching vite.config.ts outDir).
if grep -A3 'upload-pages-artifact' "$DEPLOY_WF" | grep -q 'dist'; then
  pass "AC3/AC5 – Workflow uploads 'dist/' as the Pages artifact (matches outDir)"
else
  fail "AC3/AC5 – Workflow does not upload 'dist/' as the Pages artifact"
fi

# ── AC3: Workflow permissions are minimal and correct ─────────────────────────
if grep -q 'pages: write' "$DEPLOY_WF"; then
  pass "AC3 – Workflow grants 'pages: write' permission"
else
  fail "AC3 – Workflow does not grant 'pages: write' permission"
fi

if grep -q 'id-token: write' "$DEPLOY_WF"; then
  pass "AC3 – Workflow grants 'id-token: write' (required for OIDC deploy)"
else
  fail "AC3 – Workflow does not grant 'id-token: write'"
fi

# ── AC3: Workflow gates deploy on tests passing ───────────────────────────────
if grep -q 'npm test' "$DEPLOY_WF"; then
  pass "AC3/AC6 – Workflow runs 'npm test' before building (gates deploy on tests)"
else
  fail "AC3/AC6 – Workflow does not run 'npm test'"
fi

# ── AC5: VITE_BASE is set in the workflow using the repo name ─────────────────
if grep -qE 'VITE_BASE.*GITHUB_REPOSITORY' "$DEPLOY_WF"; then
  pass "AC5 – Workflow derives VITE_BASE from GITHUB_REPOSITORY (correct sub-path)"
else
  fail "AC5 – Workflow does not derive VITE_BASE from GITHUB_REPOSITORY"
fi

# ── AC5: README documents the VITE_BASE env var for manual builds ─────────────
if echo "$DEPLOY_BODY" | grep -q 'VITE_BASE'; then
  pass "AC5 – README documents VITE_BASE for manual/one-off builds"
else
  fail "AC5 – README does not document VITE_BASE for manual builds"
fi

# ── AC6: workflow_dispatch allows manual re-deploys ───────────────────────────
if grep -q 'workflow_dispatch' "$DEPLOY_WF"; then
  pass "AC6 – Workflow supports manual trigger via workflow_dispatch"
else
  fail "AC6 – Workflow does not support manual trigger (workflow_dispatch missing)"
fi

# ── AC6: Concurrency control prevents overlapping deploys ─────────────────────
if grep -q 'concurrency' "$DEPLOY_WF"; then
  pass "AC6 – Workflow has concurrency control (prevents overlapping deploys)"
else
  fail "AC6 – Workflow lacks concurrency control"
fi

# ── AC4: Local build without VITE_BASE defaults to '/' base ──────────────────
if [ -d "$REPO_ROOT/node_modules" ]; then
  # Build without VITE_BASE — should succeed and use '/' as base.
  if ( cd "$REPO_ROOT" && npm run build > /tmp/deploy_ext_build.log 2>&1 ); then
    pass "AC4 – Default build (no VITE_BASE) succeeds for local/non-Pages hosts"
    if [ -f "$REPO_ROOT/dist/index.html" ]; then
      pass "AC4 – Default build produces dist/index.html"
    else
      fail "AC4 – Default build did not produce dist/index.html"
    fi
  else
    fail "AC4 – Default build (no VITE_BASE) failed"
    cat /tmp/deploy_ext_build.log
  fi
else
  echo "SKIP: node_modules not installed; skipping default build check"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
