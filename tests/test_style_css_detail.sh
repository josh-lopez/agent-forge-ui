#!/usr/bin/env bash
# Additional tests for Issue #6: style.css detail checks
# Provides deeper coverage of acceptance criteria beyond the basic checks.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STYLE_CSS="$REPO_ROOT/style.css"
INDEX_HTML="$REPO_ROOT/index.html"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1 (detail): style.css is non-empty ─────────────────────────────────────
if [ -s "$STYLE_CSS" ]; then
  pass "AC1-detail – style.css is non-empty"
else
  fail "AC1-detail – style.css is empty"
fi

# ── AC2 (detail): <link> element has rel=\"stylesheet\" ──────────────────────
# The link element must declare rel="stylesheet" (or rel='stylesheet')
if grep -q '<link[^>]*rel=['"'"'"]\?stylesheet['"'"'"][^>]*href=['"'"'"]style\.css['"'"'"]' "$INDEX_HTML" || \
   grep -q '<link[^>]*href=['"'"'"]style\.css['"'"'"][^>]*rel=['"'"'"]\?stylesheet['"'"'"]' "$INDEX_HTML"; then
  pass "AC2-detail – <link> element has rel=\"stylesheet\" and href=\"style.css\""
else
  fail "AC2-detail – <link> element missing rel=\"stylesheet\" or href=\"style.css\""
fi

# ── AC3 (detail): text-align: center is scoped to h1 (not just anywhere) ─────
# Confirm the rule is inside an h1 selector block
if awk '/h1[[:space:]]*\{/,/\}/' "$STYLE_CSS" | grep -q 'text-align[[:space:]]*:[[:space:]]*center'; then
  pass "AC3-detail – text-align: center is declared inside an h1 rule block"
else
  fail "AC3-detail – text-align: center is NOT inside an h1 rule block"
fi

# ── AC4 (detail): font-family is declared on body (not just anywhere) ─────────
if awk '/body[[:space:]]*\{/,/\}/' "$STYLE_CSS" | grep -q 'font-family'; then
  pass "AC4-detail – font-family is declared inside a body rule block"
else
  fail "AC4-detail – font-family is NOT inside a body rule block"
fi

# ── AC4 (detail): font-family value looks like a system-font stack or named font
# A system-font stack typically contains multiple comma-separated values or
# uses -apple-system / BlinkMacSystemFont / sans-serif / serif / monospace etc.
FONT_LINE=$(grep 'font-family' "$STYLE_CSS" | head -1)
if echo "$FONT_LINE" | grep -qiE '(-apple-system|BlinkMacSystemFont|Segoe UI|Roboto|Helvetica|Arial|Georgia|Times|Courier|sans-serif|serif|monospace)'; then
  pass "AC4-detail – font-family value contains a recognised system/web-safe font name"
else
  fail "AC4-detail – font-family value does not contain a recognised system/web-safe font: $FONT_LINE"
fi

# ── AC5 (detail): style.css is linked from <head>, not <body> ────────────────
# Extract the <head> section and verify the link is there
HEAD_SECTION=$(awk '/<head/,/<\/head>/' "$INDEX_HTML")
if echo "$HEAD_SECTION" | grep -q 'style\.css'; then
  pass "AC5-detail – style.css is linked from the <head> section of index.html"
else
  fail "AC5-detail – style.css link is NOT in the <head> section of index.html"
fi

# ── AC5 (detail): index.html is a valid static file (no server-side template syntax)
# Check for common server-side template markers that would prevent static rendering
if ! grep -qE '<%|%>|\{\{|\}\}|<\?php' "$INDEX_HTML"; then
  pass "AC5-detail – index.html contains no server-side template syntax (static file)"
else
  fail "AC5-detail – index.html appears to contain server-side template syntax"
fi

# ── AC6 (detail): No @import of preprocessor syntax in style.css ─────────────
if ! grep -qE '@mixin|@include|@extend|@function|@each|@for|@while|@if|@else|@use|@forward' "$STYLE_CSS"; then
  pass "AC6-detail – style.css contains no CSS preprocessor directives"
else
  fail "AC6-detail – style.css contains CSS preprocessor directives"
fi

# ── AC7 (detail): No external stylesheet CDN links in index.html ─────────────
# Check for any <link> pointing to an external URL (http/https)
if ! grep -E '<link[^>]*href=['"'"'"]https?://' "$INDEX_HTML" | grep -qi 'stylesheet'; then
  pass "AC7-detail – No external CDN stylesheet links in index.html"
else
  fail "AC7-detail – External CDN stylesheet link found in index.html"
fi

# ── AC7 (detail): style.css has no @import from external URLs ────────────────
if ! grep -qE "@import[[:space:]]+(url\()?['\"]?https?://" "$STYLE_CSS"; then
  pass "AC7-detail – style.css has no @import from external URLs"
else
  fail "AC7-detail – style.css imports from an external URL"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
