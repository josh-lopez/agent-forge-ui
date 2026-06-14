#!/usr/bin/env bash
# Tests for Issue #25: README.md with purpose and structure overview
# Covers all acceptance criteria.

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

# ── AC2: README.md includes a purpose section ────────────────────────────────
if grep -qiE "^## .*(purpose|mission|about)" "$README"; then
  pass "AC2 – README.md has a purpose/mission section heading"
else
  fail "AC2 – README.md has no purpose/mission section heading"
fi

# Check that the purpose content aligns with the spec mission statement
if grep -q "agentic engineering\|agent-forge" "$README"; then
  pass "AC2 – README.md references agentic engineering / agent-forge (aligned with spec)"
else
  fail "AC2 – README.md does NOT reference agentic engineering or agent-forge"
fi

# ── AC3: README.md includes a project structure section ──────────────────────
if grep -qiE "^## .*(structure|layout|organisation|organization)" "$README"; then
  pass "AC3 – README.md has a project structure section heading"
else
  fail "AC3 – README.md has no project structure section heading"
fi

# Check that key files/directories are mentioned
for item in "src/" "tests/" "package.json" "index.html"; do
  if grep -q "$item" "$README"; then
    pass "AC3 – README.md mentions key item: $item"
  else
    fail "AC3 – README.md does NOT mention key item: $item"
  fi
done

# ── AC4: README.md includes local run instructions ───────────────────────────
if grep -q "npm install" "$README"; then
  pass "AC4 – README.md documents 'npm install' (install dependencies)"
else
  fail "AC4 – README.md does NOT document 'npm install'"
fi

if grep -q "npm run dev" "$README"; then
  pass "AC4 – README.md documents 'npm run dev' (start dev server)"
else
  fail "AC4 – README.md does NOT document 'npm run dev'"
fi

# ── AC5: README.md includes production build instructions ────────────────────
if grep -q "npm run build" "$README"; then
  pass "AC5 – README.md documents 'npm run build' (production build)"
else
  fail "AC5 – README.md does NOT document 'npm run build'"
fi

if grep -q "dist/" "$README"; then
  pass "AC5 – README.md references the 'dist/' build output directory"
else
  fail "AC5 – README.md does NOT reference the 'dist/' build output directory"
fi

# ── AC6: README.md is valid Markdown (basic structural checks) ───────────────
# Check that it has at least one top-level heading
if grep -q "^# " "$README"; then
  pass "AC6 – README.md has a top-level heading (# ...)"
else
  fail "AC6 – README.md has no top-level heading"
fi

# Check that it is non-empty
README_SIZE=$(wc -c < "$README")
if [ "$README_SIZE" -gt 500 ]; then
  pass "AC6 – README.md is non-trivially sized ($README_SIZE bytes)"
else
  fail "AC6 – README.md is too small ($README_SIZE bytes) — likely incomplete"
fi

# ── AC7: README.md does not reference backend services, production data, or secrets ──
# It may mention them in a "Non-Goals" context, but should not instruct users
# to configure or access them.
if grep -qiE "(connect to|configure|access|set up).*(backend|database|secret|credential|api key)" "$README"; then
  fail "AC7 – README.md appears to reference backend/secret configuration (violates non-goals)"
else
  pass "AC7 – README.md does not instruct users to configure backend services or secrets"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
