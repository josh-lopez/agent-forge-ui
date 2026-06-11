#!/usr/bin/env bash
# Tests for Issue #12: Document deployment process for the front-end
# Covers all six acceptance criteria.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
README="$REPO_ROOT/README.md"
VITE_CONFIG="$REPO_ROOT/vite.config.ts"
WORKFLOW="$REPO_ROOT/.github/workflows/deploy.yml"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: A deployment target is explicitly chosen and documented ──────────────
# README must name a specific deployment target (GitHub Pages, Netlify, Vercel,
# or equivalent).
if grep -qiE "(GitHub Pages|Netlify|Vercel|static host)" "$README"; then
  pass "AC1 – README names a deployment target"
else
  fail "AC1 – README does NOT name a deployment target (GitHub Pages / Netlify / Vercel)"
fi

# The workflow file must exist and reference the chosen target.
if [ -f "$WORKFLOW" ]; then
  pass "AC1 – Deployment workflow file exists (.github/workflows/deploy.yml)"
else
  fail "AC1 – Deployment workflow file NOT found at .github/workflows/deploy.yml"
fi

# ── AC2: README.md contains a 'Deployment' section ───────────────────────────
if grep -q "## Deployment" "$README"; then
  pass "AC2 – README contains a '## Deployment' section"
else
  fail "AC2 – README does NOT contain a '## Deployment' section"
fi

# The section must include step-by-step instructions (numbered list or code blocks).
if grep -A 60 "## Deployment" "$README" | grep -qE "^[0-9]+\.|^\`\`\`"; then
  pass "AC2 – Deployment section contains step-by-step instructions or code blocks"
else
  fail "AC2 – Deployment section lacks step-by-step instructions or code blocks"
fi

# ── AC3: Required build configuration is present and functional ───────────────
# vite.config.ts must exist.
if [ -f "$VITE_CONFIG" ]; then
  pass "AC3 – vite.config.ts exists"
else
  fail "AC3 – vite.config.ts NOT found"
fi

# vite.config.ts must set a base path (required for GitHub Pages sub-path).
if grep -q "base" "$VITE_CONFIG"; then
  pass "AC3 – vite.config.ts sets a 'base' option"
else
  fail "AC3 – vite.config.ts does NOT set a 'base' option"
fi

# The base path must reference the repo name 'agent-forge-ui'.
if grep -q "agent-forge-ui" "$VITE_CONFIG"; then
  pass "AC3 – vite.config.ts base path references 'agent-forge-ui'"
else
  fail "AC3 – vite.config.ts base path does NOT reference 'agent-forge-ui'"
fi

# The workflow must exist (already checked in AC1) and contain a build step.
if grep -q "npm run build" "$WORKFLOW"; then
  pass "AC3 – Workflow runs 'npm run build'"
else
  fail "AC3 – Workflow does NOT run 'npm run build'"
fi

# ── AC4: Documented deployment steps reference a working build ────────────────
# The README must mention 'npm run build' as part of the deployment process.
if grep -q "npm run build" "$README"; then
  pass "AC4 – README references 'npm run build' in deployment instructions"
else
  fail "AC4 – README does NOT reference 'npm run build'"
fi

# The workflow must upload the build artifact (dist/) for deployment.
if grep -q "upload-pages-artifact\|upload.*artifact\|deploy-pages\|gh-pages" "$WORKFLOW"; then
  pass "AC4 – Workflow uploads/deploys the build artifact"
else
  fail "AC4 – Workflow does NOT upload or deploy a build artifact"
fi

# ── AC5: Deployment instructions reference the correct build output directory ─
# README must mention 'dist/' as the build output directory.
if grep -q "dist/" "$README"; then
  pass "AC5 – README references 'dist/' as the build output directory"
else
  fail "AC5 – README does NOT reference 'dist/'"
fi

# Workflow must reference 'dist/' as the artifact path.
if grep -q "dist/" "$WORKFLOW"; then
  pass "AC5 – Workflow references 'dist/' as the artifact path"
else
  fail "AC5 – Workflow does NOT reference 'dist/'"
fi

# vite.config.ts must allow environment-specific base URL override (VITE_BASE).
if grep -q "VITE_BASE\|process.env" "$VITE_CONFIG"; then
  pass "AC5 – vite.config.ts supports environment-specific base URL override"
else
  fail "AC5 – vite.config.ts does NOT support environment-specific base URL override"
fi

# README must document the VITE_BASE override mechanism.
if grep -q "VITE_BASE" "$README"; then
  pass "AC5 – README documents the VITE_BASE environment variable override"
else
  fail "AC5 – README does NOT document the VITE_BASE override"
fi

# ── AC6: CI/CD workflow triggers on the correct branch and only deploys on ────
#         a successful build.
# Workflow must trigger on push to 'main'.
if grep -A 5 "^on:" "$WORKFLOW" | grep -q "main"; then
  pass "AC6 – Workflow triggers on push to 'main'"
else
  fail "AC6 – Workflow does NOT trigger on push to 'main'"
fi

# Deploy job must depend on the build job ('needs: build').
if grep -q "needs:" "$WORKFLOW" && grep -A 2 "needs:" "$WORKFLOW" | grep -q "build"; then
  pass "AC6 – Deploy job depends on the build job (needs: build)"
else
  fail "AC6 – Deploy job does NOT declare a dependency on the build job"
fi

# Workflow must use concurrency to prevent overlapping deployments.
if grep -q "concurrency:" "$WORKFLOW"; then
  pass "AC6 – Workflow uses concurrency control to prevent overlapping deployments"
else
  fail "AC6 – Workflow does NOT use concurrency control"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
