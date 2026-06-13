#!/usr/bin/env bash
# Tests for Issue #6: Add style.css for basic landing page styling
# Covers all acceptance criteria.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STYLE_CSS="$REPO_ROOT/style.css"
INDEX_HTML="$REPO_ROOT/index.html"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: style.css exists at the repo root ───────────────────────────────────
if [ -f "$STYLE_CSS" ]; then
  pass "AC1 – style.css exists at the repo root"
else
  fail "AC1 – style.css does NOT exist at the repo root"
fi

# ── AC2: index.html contains a <link> element referencing style.css ──────────
if grep -q '<link[^>]*href=['"'"'"]style\.css['"'"'"]' "$INDEX_HTML"; then
  pass "AC2 – index.html contains a <link> element referencing style.css"
else
  fail "AC2 – index.html does NOT contain a <link> element referencing style.css"
fi

# ── AC3: The main heading on the landing page is visually centred ────────────
# Check that style.css contains text-align: center for h1
if grep -q 'h1' "$STYLE_CSS" && grep -A2 'h1' "$STYLE_CSS" | grep -q 'text-align.*center'; then
  pass "AC3 – h1 heading is centred in style.css"
else
  fail "AC3 – h1 heading is NOT centred in style.css"
fi

# ── AC4: A readable body font is declared in style.css ──────────────────────
# Check for font-family declaration in body or h1 styles
if grep -q 'font-family' "$STYLE_CSS"; then
  pass "AC4 – A readable font is declared in style.css"
else
  fail "AC4 – No font-family declaration found in style.css"
fi

# ── AC5: The page renders correctly without any build step ──────────────────
# Verify that index.html has the heading directly in HTML (not just in JS)
if grep -q '<h1>' "$INDEX_HTML"; then
  pass "AC5 – index.html contains the heading directly in HTML for static rendering"
else
  fail "AC5 – index.html does NOT contain the heading directly in HTML"
fi

# ── AC6: No CSS preprocessor output files are introduced ────────────────────
# Check for .scss, .less, .sass files
PREPROCESSOR_FILES=$(find "$REPO_ROOT" \
  -not -path "$REPO_ROOT/.git/*" \
  -not -path "$REPO_ROOT/node_modules/*" \
  \( -name "*.scss" -o -name "*.less" -o -name "*.sass" \) \
  2>/dev/null)

if [ -z "$PREPROCESSOR_FILES" ]; then
  pass "AC6 – No CSS preprocessor files found"
else
  fail "AC6 – Unexpected preprocessor file(s) found: $PREPROCESSOR_FILES"
fi

# ── AC7: No CSS framework files or CDN links are added ─────────────────────
# Check that style.css doesn't import from CDN and index.html doesn't link to frameworks
if ! grep -q '@import.*http' "$STYLE_CSS" && \
   ! grep -q 'bootstrap\|tailwind\|foundation\|bulma' "$INDEX_HTML" && \
   ! grep -q 'bootstrap\|tailwind\|foundation\|bulma' "$STYLE_CSS"; then
  pass "AC7 – No CSS framework files or CDN links found"
else
  fail "AC7 – CSS framework or CDN links detected"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
