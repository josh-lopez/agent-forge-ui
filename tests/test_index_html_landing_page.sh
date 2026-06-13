#!/usr/bin/env bash
# Tests for Issue #5: Add index.html landing page at repo root
# Covers all seven acceptance criteria.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INDEX_HTML="$REPO_ROOT/index.html"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: index.html exists at the repository root (not under src/ or public/) ─
if [ -f "$INDEX_HTML" ]; then
  pass "AC1 – index.html exists at the repository root"
else
  fail "AC1 – index.html does NOT exist at the repository root"
fi

# Confirm it is NOT only under src/ or public/ (it must be at root)
if [ -f "$REPO_ROOT/src/index.html" ] && [ ! -f "$INDEX_HTML" ]; then
  fail "AC1 – index.html only found under src/, not at repo root"
else
  pass "AC1 – index.html is at the repo root (not only under src/ or public/)"
fi

if [ -f "$REPO_ROOT/public/index.html" ] && [ ! -f "$INDEX_HTML" ]; then
  fail "AC1 – index.html only found under public/, not at repo root"
else
  pass "AC1 – index.html is at the repo root (not only under public/)"
fi

# ── AC2: index.html can be opened via file:// (no build step required) ────────
# Verify the file contains no references to bundled/compiled assets that would
# require a build step (e.g. /assets/*.js from Vite output, dist/ paths).
if grep -qE 'src=["'"'"']/assets/|src=["'"'"']dist/' "$INDEX_HTML"; then
  fail "AC2 – index.html references build-output assets (requires a build step)"
else
  pass "AC2 – index.html does not reference build-output assets (file:// safe)"
fi

# Verify there is no <script type="module" src="..."> pointing to a bundler
# entry point that would fail without a dev server
if grep -qE '<script[^>]+type=["'"'"']module["'"'"'][^>]+src=' "$INDEX_HTML"; then
  fail "AC2 – index.html has a module script src that may require a bundler/server"
else
  pass "AC2 – index.html has no module script src requiring a bundler"
fi

# ── AC3: The rendered page visibly displays the text 'Agent Forge' ────────────
if grep -q 'Agent Forge' "$INDEX_HTML"; then
  pass "AC3 – index.html contains the text 'Agent Forge'"
else
  fail "AC3 – index.html does NOT contain the text 'Agent Forge'"
fi

# It should appear in a prominent heading element (h1, h2, or h3)
if grep -qE '<h[1-3][^>]*>.*Agent Forge.*</h[1-3]>' "$INDEX_HTML"; then
  pass "AC3 – 'Agent Forge' appears inside a heading element (h1/h2/h3)"
else
  fail "AC3 – 'Agent Forge' does NOT appear inside a heading element (h1/h2/h3)"
fi

# ── AC4: Exactly one tagline line of text beneath/near the product name ───────
# Count <p> elements (tagline candidates) in the body
P_COUNT=$(grep -c '<p>' "$INDEX_HTML" || true)
if [ "$P_COUNT" -eq 1 ]; then
  pass "AC4 – Exactly one <p> element (tagline) found in index.html"
elif [ "$P_COUNT" -gt 1 ]; then
  fail "AC4 – More than one <p> element found ($P_COUNT); expected exactly one tagline"
else
  # No <p> — check for other inline tagline patterns (e.g. <span>, <small>)
  if grep -qE '<(span|small|em|strong)[^>]*>[^<]+</(span|small|em|strong)>' "$INDEX_HTML"; then
    pass "AC4 – A tagline element (span/small/em/strong) found in index.html"
  else
    fail "AC4 – No tagline element found in index.html"
  fi
fi

# Verify the tagline is non-empty (extract text between <p> and </p>)
TAGLINE_TEXT=$(grep -oE '<p>[^<]+</p>' "$INDEX_HTML" | sed 's/<p>//;s/<\/p>//' | head -1 || true)
if [ -n "$TAGLINE_TEXT" ]; then
  pass "AC4 – Tagline text is non-empty: '$TAGLINE_TEXT'"
else
  fail "AC4 – Tagline <p> element appears to be empty"
fi

# ── AC5: No references to frameworks, bundlers, or external build tooling ─────
# Check for React, Vue, Angular, Svelte, etc. in script src attributes
if grep -qiE '<script[^>]+src=["'"'"'][^"'"'"']*\b(react|vue|angular|svelte|ember|backbone|jquery)\b' "$INDEX_HTML"; then
  fail "AC5 – index.html imports a JS framework via <script src>"
else
  pass "AC5 – No JS framework <script src> imports found"
fi

# Check for CDN links to common frameworks
if grep -qiE 'cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com' "$INDEX_HTML"; then
  fail "AC5 – index.html references a CDN (possible framework dependency)"
else
  pass "AC5 – No CDN references found in index.html"
fi

# Check for bundler config references (webpack, rollup, parcel) in HTML
if grep -qiE '\b(webpack|rollup|parcel)\b' "$INDEX_HTML"; then
  fail "AC5 – index.html references a bundler tool (webpack/rollup/parcel)"
else
  pass "AC5 – No bundler tool references found in index.html"
fi

# ── AC6: <title> element reflects the product name 'Agent Forge' ──────────────
TITLE_TEXT=$(grep -oE '<title>[^<]+</title>' "$INDEX_HTML" | sed 's/<title>//;s/<\/title>//' | head -1 || true)
if [ -n "$TITLE_TEXT" ]; then
  pass "AC6 – <title> element is present with text: '$TITLE_TEXT'"
  if echo "$TITLE_TEXT" | grep -q 'Agent Forge'; then
    pass "AC6 – <title> contains 'Agent Forge'"
  else
    fail "AC6 – <title> does NOT contain 'Agent Forge' (found: '$TITLE_TEXT')"
  fi
else
  fail "AC6 – No <title> element with text found in index.html"
fi

# ── AC7: Valid HTML structure (doctype, html, head, body elements present) ─────
# Check for DOCTYPE declaration
if grep -qi '<!DOCTYPE html>' "$INDEX_HTML"; then
  pass "AC7 – <!DOCTYPE html> declaration present"
else
  fail "AC7 – <!DOCTYPE html> declaration missing"
fi

# Check for <html> element
if grep -qi '<html' "$INDEX_HTML"; then
  pass "AC7 – <html> element present"
else
  fail "AC7 – <html> element missing"
fi

# Check for <head> element
if grep -qi '<head' "$INDEX_HTML"; then
  pass "AC7 – <head> element present"
else
  fail "AC7 – <head> element missing"
fi

# Check for </head> closing tag
if grep -qi '</head>' "$INDEX_HTML"; then
  pass "AC7 – </head> closing tag present"
else
  fail "AC7 – </head> closing tag missing"
fi

# Check for <body> element
if grep -qi '<body' "$INDEX_HTML"; then
  pass "AC7 – <body> element present"
else
  fail "AC7 – <body> element missing"
fi

# Check for </body> closing tag
if grep -qi '</body>' "$INDEX_HTML"; then
  pass "AC7 – </body> closing tag present"
else
  fail "AC7 – </body> closing tag missing"
fi

# Check for </html> closing tag
if grep -qi '</html>' "$INDEX_HTML"; then
  pass "AC7 – </html> closing tag present"
else
  fail "AC7 – </html> closing tag missing"
fi

# Check for <meta charset> in <head> (good practice / valid HTML)
if grep -qi '<meta charset' "$INDEX_HTML"; then
  pass "AC7 – <meta charset> declaration present"
else
  fail "AC7 – <meta charset> declaration missing"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
