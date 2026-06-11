#!/usr/bin/env bash
# Extended tests for Issue #12: Document deployment process for the front-end
# Provides additional coverage depth for all six acceptance criteria.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
README="$REPO_ROOT/README.md"
VITE_CONFIG="$REPO_ROOT/vite.config.ts"
WORKFLOW="$REPO_ROOT/.github/workflows/deploy.yml"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1 (extended): Deployment target is GitHub Pages specifically ────────────
# The workflow name must reference GitHub Pages.
if grep -qi "GitHub Pages" "$WORKFLOW"; then
  pass "AC1-ext – Workflow name/content references 'GitHub Pages'"
else
  fail "AC1-ext – Workflow name/content does NOT reference 'GitHub Pages'"
fi

# The workflow must use the official GitHub Pages deploy action.
if grep -q "actions/deploy-pages" "$WORKFLOW"; then
  pass "AC1-ext – Workflow uses actions/deploy-pages (official GitHub Pages action)"
else
  fail "AC1-ext – Workflow does NOT use actions/deploy-pages"
fi

# The workflow must use the official Pages artifact upload action.
if grep -q "actions/upload-pages-artifact" "$WORKFLOW"; then
  pass "AC1-ext – Workflow uses actions/upload-pages-artifact"
else
  fail "AC1-ext – Workflow does NOT use actions/upload-pages-artifact"
fi

# ── AC2 (extended): README Deployment section covers both auto and manual ─────
# README must document automatic (CI/CD) deployment.
if grep -qi "automatic\|CI/CD\|GitHub Actions" "$README"; then
  pass "AC2-ext – README documents automatic/CI deployment"
else
  fail "AC2-ext – README does NOT document automatic/CI deployment"
fi

# README must document manual deployment steps.
if grep -qi "manual\|local machine\|gh-pages" "$README"; then
  pass "AC2-ext – README documents manual deployment"
else
  fail "AC2-ext – README does NOT document manual deployment"
fi

# README must mention enabling GitHub Pages in repository settings (one-time setup).
if grep -qi "Settings.*Pages\|Pages.*Settings\|enable.*Pages\|Pages.*enable" "$README"; then
  pass "AC2-ext – README covers one-time GitHub Pages repository setup"
else
  fail "AC2-ext – README does NOT cover one-time GitHub Pages repository setup"
fi

# ── AC3 (extended): Workflow structure is valid and complete ──────────────────
# Workflow must have a 'build' job.
if grep -q "^  build:" "$WORKFLOW"; then
  pass "AC3-ext – Workflow defines a 'build' job"
else
  fail "AC3-ext – Workflow does NOT define a 'build' job"
fi

# Workflow must have a 'deploy' job.
if grep -q "^  deploy:" "$WORKFLOW"; then
  pass "AC3-ext – Workflow defines a 'deploy' job"
else
  fail "AC3-ext – Workflow does NOT define a 'deploy' job"
fi

# Workflow must set required permissions for GitHub Pages deployment.
if grep -q "pages: write" "$WORKFLOW"; then
  pass "AC3-ext – Workflow grants 'pages: write' permission"
else
  fail "AC3-ext – Workflow does NOT grant 'pages: write' permission"
fi

if grep -q "id-token: write" "$WORKFLOW"; then
  pass "AC3-ext – Workflow grants 'id-token: write' permission (OIDC)"
else
  fail "AC3-ext – Workflow does NOT grant 'id-token: write' permission"
fi

# Workflow must check out the repository.
if grep -q "actions/checkout" "$WORKFLOW"; then
  pass "AC3-ext – Workflow checks out the repository (actions/checkout)"
else
  fail "AC3-ext – Workflow does NOT check out the repository"
fi

# Workflow must set up Node.js.
if grep -q "actions/setup-node" "$WORKFLOW"; then
  pass "AC3-ext – Workflow sets up Node.js (actions/setup-node)"
else
  fail "AC3-ext – Workflow does NOT set up Node.js"
fi

# Workflow must install dependencies with 'npm ci'.
if grep -q "npm ci" "$WORKFLOW"; then
  pass "AC3-ext – Workflow installs dependencies with 'npm ci'"
else
  fail "AC3-ext – Workflow does NOT install dependencies with 'npm ci'"
fi

# ── AC4 (extended): Build produces output in dist/ ───────────────────────────
# The workflow artifact path must be 'dist/'.
if grep -A 2 "upload-pages-artifact" "$WORKFLOW" | grep -q "dist/"; then
  pass "AC4-ext – Workflow artifact path is 'dist/'"
else
  fail "AC4-ext – Workflow artifact path is NOT 'dist/'"
fi

# ── AC5 (extended): vite.config.ts base path and override are correct ─────────
# The default base path must be '/agent-forge-ui/'.
if grep -q "'/agent-forge-ui/'" "$VITE_CONFIG" || grep -q '"/agent-forge-ui/"' "$VITE_CONFIG"; then
  pass "AC5-ext – vite.config.ts default base is '/agent-forge-ui/'"
else
  fail "AC5-ext – vite.config.ts default base is NOT '/agent-forge-ui/'"
fi

# The VITE_BASE env var must be used as an override.
if grep -q "VITE_BASE" "$VITE_CONFIG"; then
  pass "AC5-ext – vite.config.ts reads VITE_BASE environment variable"
else
  fail "AC5-ext – vite.config.ts does NOT read VITE_BASE environment variable"
fi

# README must document the build output table or list (dist/index.html, dist/assets/).
if grep -q "dist/index.html\|dist/assets" "$README"; then
  pass "AC5-ext – README documents specific build output paths (dist/index.html or dist/assets/)"
else
  fail "AC5-ext – README does NOT document specific build output paths"
fi

# ── AC6 (extended): Workflow branch and concurrency details ──────────────────
# Workflow must trigger on 'push' event (not just any event).
if grep -A 3 "^on:" "$WORKFLOW" | grep -q "push:"; then
  pass "AC6-ext – Workflow triggers on 'push' event"
else
  fail "AC6-ext – Workflow does NOT trigger on 'push' event"
fi

# Concurrency group must be defined (prevents duplicate deployments).
if grep -A 3 "concurrency:" "$WORKFLOW" | grep -q "group:"; then
  pass "AC6-ext – Workflow concurrency block defines a 'group'"
else
  fail "AC6-ext – Workflow concurrency block does NOT define a 'group'"
fi

# Workflow must cancel in-progress runs on new push.
if grep -q "cancel-in-progress: true" "$WORKFLOW"; then
  pass "AC6-ext – Workflow cancels in-progress deployments on new push"
else
  fail "AC6-ext – Workflow does NOT cancel in-progress deployments"
fi

# Deploy job must reference a github-pages environment (for deployment tracking).
if grep -q "github-pages" "$WORKFLOW"; then
  pass "AC6-ext – Deploy job uses 'github-pages' environment"
else
  fail "AC6-ext – Deploy job does NOT use 'github-pages' environment"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
