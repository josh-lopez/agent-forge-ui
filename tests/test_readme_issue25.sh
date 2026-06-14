#!/usr/bin/env bash
# Tests for Issue #25: README.md with purpose and structure overview
# Supplementary coverage — deeper checks for each acceptance criterion.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
README="$REPO_ROOT/README.md"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: README.md exists at the repository root ─────────────────────────────
if [ -f "$README" ]; then
  pass "AC1 – README.md exists at the repository root"
else
  fail "AC1 – README.md does NOT exist at the repository root"
fi

# README.md must be at the root, not only in a subdirectory
README_COUNT=$(find "$REPO_ROOT" -maxdepth 1 -name "README.md" -not -path "$REPO_ROOT/node_modules/*" | wc -l)
if [ "$README_COUNT" -ge 1 ]; then
  pass "AC1 – README.md is at the repo root (maxdepth 1 check)"
else
  fail "AC1 – README.md not found at repo root (maxdepth 1 check)"
fi

# ── AC2: Purpose section aligned with spec mission ───────────────────────────
# The spec says: "a live demonstration of agentic engineering: humans file
# issues describing features, and the agent-forge pipeline designs, builds,
# tests, and ships them as merge-ready PRs."

if grep -qiE "demonstration|demo" "$README"; then
  pass "AC2 – README.md describes the project as a demonstration"
else
  fail "AC2 – README.md does not describe the project as a demonstration"
fi

if grep -qiE "issue|pull request|PR" "$README"; then
  pass "AC2 – README.md references the issue->PR workflow (spec mission)"
else
  fail "AC2 – README.md does not reference the issue->PR workflow"
fi

# The spec mission mentions "agent-forge pipeline"
if grep -qiE "pipeline|agent.forge" "$README"; then
  pass "AC2 – README.md references the agent-forge pipeline"
else
  fail "AC2 – README.md does not reference the agent-forge pipeline"
fi

# ── AC3: Project structure section with key files/directories ────────────────
# Verify the structure section actually contains a code block or list
# Extract lines between the structure heading and the next H2
STRUCTURE_CONTENT=$(awk '/^## .*[Ss]tructure/{found=1; next} found && /^## /{exit} found{print}' "$README" | grep -cE "^\s*(├|└|─|[|]|\-|\*|[a-zA-Z.])" || true)
if [ "$STRUCTURE_CONTENT" -gt 0 ]; then
  pass "AC3 – README.md structure section contains a file/directory listing"
else
  fail "AC3 – README.md structure section appears empty or has no listing"
fi

# spec/ directory should be mentioned (it's a key directory)
if grep -q "spec/" "$README"; then
  pass "AC3 – README.md mentions the spec/ directory"
else
  fail "AC3 – README.md does NOT mention the spec/ directory"
fi

# vite.config.ts or build config should be mentioned
if grep -qE "vite\.config|tsconfig|build config" "$README"; then
  pass "AC3 – README.md mentions build configuration files"
else
  fail "AC3 – README.md does NOT mention build configuration files"
fi

# ── AC4: Local run instructions ──────────────────────────────────────────────
# Must mention installing dependencies
if grep -q "npm install\|npm ci" "$README"; then
  pass "AC4 – README.md documents dependency installation (npm install/ci)"
else
  fail "AC4 – README.md does NOT document dependency installation"
fi

# Must mention starting the dev server
if grep -q "npm run dev" "$README"; then
  pass "AC4 – README.md documents starting the dev server (npm run dev)"
else
  fail "AC4 – README.md does NOT document starting the dev server"
fi

# Should mention localhost or a local URL so users know where to look
if grep -qiE "localhost|127\.0\.0\.1|local.*server|dev.*server" "$README"; then
  pass "AC4 – README.md references a local server URL or dev server"
else
  fail "AC4 – README.md does NOT reference a local server or URL"
fi

# ── AC5: Production build instructions ───────────────────────────────────────
if grep -q "npm run build" "$README"; then
  pass "AC5 – README.md documents 'npm run build'"
else
  fail "AC5 – README.md does NOT document 'npm run build'"
fi

# dist/ output directory must be mentioned
if grep -q "dist/" "$README"; then
  pass "AC5 – README.md references the dist/ output directory"
else
  fail "AC5 – README.md does NOT reference the dist/ output directory"
fi

# Should mention static hosting or deployment context
if grep -qiE "deploy|static|hosting|GitHub Pages|Vercel|Netlify|S3" "$README"; then
  pass "AC5 – README.md mentions deployment/static hosting context"
else
  fail "AC5 – README.md does NOT mention deployment or static hosting"
fi

# ── AC6: Valid Markdown structural checks ────────────────────────────────────
# Must have exactly one H1 (top-level title)
H1_COUNT=$(grep -c "^# " "$README" || true)
if [ "$H1_COUNT" -eq 1 ]; then
  pass "AC6 – README.md has exactly one H1 heading"
else
  fail "AC6 – README.md has $H1_COUNT H1 headings (expected exactly 1)"
fi

# Must have multiple H2 sections (purpose, structure, getting started, etc.)
H2_COUNT=$(grep -c "^## " "$README" || true)
if [ "$H2_COUNT" -ge 3 ]; then
  pass "AC6 – README.md has $H2_COUNT H2 sections (well-structured)"
else
  fail "AC6 – README.md has only $H2_COUNT H2 sections (expected >= 3)"
fi

# Must have at least one fenced code block (for commands)
CODE_BLOCK_COUNT=$(grep -c "^\`\`\`" "$README" || true)
if [ "$CODE_BLOCK_COUNT" -ge 2 ]; then
  pass "AC6 – README.md has fenced code blocks (for commands)"
else
  fail "AC6 – README.md has no fenced code blocks (commands should be in code blocks)"
fi

# Code blocks must be balanced (even number of fence markers)
if [ $((CODE_BLOCK_COUNT % 2)) -eq 0 ]; then
  pass "AC6 – README.md code blocks are balanced (even number of fence markers)"
else
  fail "AC6 – README.md code blocks are unbalanced (odd number of fence markers)"
fi

# File must not be trivially short
README_LINES=$(wc -l < "$README")
if [ "$README_LINES" -gt 20 ]; then
  pass "AC6 – README.md has $README_LINES lines (substantive content)"
else
  fail "AC6 – README.md has only $README_LINES lines (too short)"
fi

# ── AC7: No backend services, production data, or secrets ────────────────────
# Must NOT instruct users to set up a backend (exclude "development server" which is fine)
# We look for instructions to connect/configure a backend, not just mention one
if grep -qiE "(connect|configure|set up|start|run).*(backend service|database|db server|api server)" "$README"; then
  fail "AC7 – README.md appears to instruct users to set up a backend service"
else
  pass "AC7 – README.md does not instruct users to set up a backend service"
fi

# Must NOT instruct users to configure secrets or credentials
# (Mentioning them in a non-goals/exclusion context is fine)
if grep -qiE "(set|configure|add|provide|enter|export).*(secret|credential|api.?key|token|password)" "$README"; then
  fail "AC7 – README.md instructs users to configure secrets or credentials"
else
  pass "AC7 – README.md does not instruct users to configure secrets or credentials"
fi

# The spec non-goals say "No backend services in this repo (agent-forge's
# control plane is separate)". README should acknowledge this separation.
if grep -qiE "non.?goal|out of scope|not.*include|separate|control.?plane|backend.*separate|separately" "$README"; then
  pass "AC7 – README.md acknowledges non-goals / scope boundaries"
else
  fail "AC7 – README.md does not acknowledge non-goals or scope boundaries"
fi

# README must not contain any .env file references (common secret leak vector)
if grep -qE "\.env\b" "$README"; then
  fail "AC7 – README.md references a .env file (potential secrets concern)"
else
  pass "AC7 – README.md does not reference .env files"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
