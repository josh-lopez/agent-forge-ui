#!/usr/bin/env bash
# Tests for Issue #26: Add a licence file to the repository
# Covers all five acceptance criteria from the issue.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LICENSE_FILE="$REPO_ROOT/LICENSE"
LICENCE_FILE="$REPO_ROOT/LICENCE"
PACKAGE_JSON="$REPO_ROOT/package.json"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: A LICENSE (or LICENCE) file exists at the repository root ────────────
FOUND_LICENSE=""
if [ -f "$LICENSE_FILE" ]; then
  FOUND_LICENSE="$LICENSE_FILE"
  pass "AC1 – LICENSE file exists at repo root"
elif [ -f "$LICENCE_FILE" ]; then
  FOUND_LICENSE="$LICENCE_FILE"
  pass "AC1 – LICENCE file exists at repo root"
else
  fail "AC1 – Neither LICENSE nor LICENCE file exists at repo root"
fi

# ── AC2: File contains a recognised open-source licence text (not a placeholder) ──
if [ -n "$FOUND_LICENSE" ]; then
  # Check for MIT licence canonical text
  MIT_MATCH=0
  if grep -q "Permission is hereby granted, free of charge" "$FOUND_LICENSE" && \
     grep -q "THE SOFTWARE IS PROVIDED" "$FOUND_LICENSE" && \
     grep -q "MIT License" "$FOUND_LICENSE"; then
    MIT_MATCH=1
  fi

  # Check for Apache-2.0 canonical text
  APACHE_MATCH=0
  if grep -q "Apache License" "$FOUND_LICENSE" && \
     grep -q "Version 2.0" "$FOUND_LICENSE"; then
    APACHE_MATCH=1
  fi

  if [ "$MIT_MATCH" -eq 1 ] || [ "$APACHE_MATCH" -eq 1 ]; then
    pass "AC2 – LICENSE contains recognised open-source licence text (MIT or Apache-2.0)"
  else
    fail "AC2 – LICENSE does not contain recognised open-source licence text"
  fi

  # Verify the file is not just a placeholder (must be non-trivially long)
  LINE_COUNT=$(wc -l < "$FOUND_LICENSE")
  if [ "$LINE_COUNT" -ge 10 ]; then
    pass "AC2 – LICENSE file has substantial content ($LINE_COUNT lines, not a stub)"
  else
    fail "AC2 – LICENSE file is suspiciously short ($LINE_COUNT lines) — may be a placeholder"
  fi
else
  fail "AC2 – Cannot check licence text: no licence file found"
  fail "AC2 – Cannot check licence file length: no licence file found"
fi

# ── AC3: Year and copyright holder are filled in (no template tokens) ─────────
if [ -n "$FOUND_LICENSE" ]; then
  # Check that template tokens like [year], [yyyy], [author], [name] are absent
  if grep -qiE "\[year\]|\[yyyy\]|\[author\]|\[name\]|\[fullname\]|\[owner\]" "$FOUND_LICENSE"; then
    fail "AC3 – LICENSE still contains unfilled template tokens (e.g. [year], [author])"
  else
    pass "AC3 – LICENSE contains no unfilled template tokens"
  fi

  # Check that a 4-digit year is present in the copyright line
  if grep -qE "Copyright.*[0-9]{4}" "$FOUND_LICENSE"; then
    pass "AC3 – LICENSE copyright line contains a 4-digit year"
  else
    fail "AC3 – LICENSE copyright line does not contain a 4-digit year"
  fi

  # Check that a non-empty copyright holder name is present
  # The copyright line should have text after the year
  if grep -qE "Copyright \(c\) [0-9]{4} .+" "$FOUND_LICENSE"; then
    pass "AC3 – LICENSE copyright line contains a copyright holder name"
  else
    fail "AC3 – LICENSE copyright line does not contain a copyright holder name after the year"
  fi
else
  fail "AC3 – Cannot check template tokens: no licence file found"
  fail "AC3 – Cannot check copyright year: no licence file found"
  fail "AC3 – Cannot check copyright holder: no licence file found"
fi

# ── AC4: Licence is consistent with package.json license field (if present) ───
if [ -f "$PACKAGE_JSON" ]; then
  # Extract the license field value from package.json
  PKG_LICENSE=$(grep '"license"' "$PACKAGE_JSON" | sed 's/.*"license"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

  if [ -z "$PKG_LICENSE" ]; then
    # AC4 wording: "consistent with any licence field if one exists". No field
    # present means there is nothing to contradict, so this is vacuously consistent.
    pass "AC4 – package.json has no \"license\" field; consistency vacuously satisfied"
  else
    pass "AC4 – package.json has a \"license\" field: $PKG_LICENSE"

    # Verify the LICENSE file matches the declared licence
    if [ -n "$FOUND_LICENSE" ]; then
      case "$PKG_LICENSE" in
        MIT)
          if grep -q "MIT License" "$FOUND_LICENSE" && \
             grep -q "Permission is hereby granted, free of charge" "$FOUND_LICENSE"; then
            pass "AC4 – LICENSE file content is consistent with package.json \"license\": \"$PKG_LICENSE\""
          else
            fail "AC4 – LICENSE file content does NOT match package.json \"license\": \"$PKG_LICENSE\""
          fi
          ;;
        Apache-2.0)
          if grep -q "Apache License" "$FOUND_LICENSE" && \
             grep -q "Version 2.0" "$FOUND_LICENSE"; then
            pass "AC4 – LICENSE file content is consistent with package.json \"license\": \"$PKG_LICENSE\""
          else
            fail "AC4 – LICENSE file content does NOT match package.json \"license\": \"$PKG_LICENSE\""
          fi
          ;;
        *)
          # For other licences, just check the identifier appears somewhere in the file
          if grep -qi "$PKG_LICENSE" "$FOUND_LICENSE"; then
            pass "AC4 – LICENSE file mentions the identifier from package.json \"license\": \"$PKG_LICENSE\""
          else
            fail "AC4 – LICENSE file does not mention the identifier from package.json \"license\": \"$PKG_LICENSE\""
          fi
          ;;
      esac
    else
      fail "AC4 – Cannot verify consistency: no licence file found"
    fi
  fi
else
  pass "AC4 – No package.json present; consistency check not applicable"
fi

# ── AC5: No other files in the repo contradict the chosen licence ─────────────
if [ -n "$FOUND_LICENSE" ] && [ -f "$PACKAGE_JSON" ]; then
  PKG_LICENSE=$(grep '"license"' "$PACKAGE_JSON" | sed 's/.*"license"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

  if [ -n "$PKG_LICENSE" ]; then
    # Check for conflicting SPDX identifiers in source files
    # Look for SPDX-License-Identifier lines that differ from the declared licence
    CONFLICTING_SPDX=$(find "$REPO_ROOT" \
      -not -path "$REPO_ROOT/.git/*" \
      -not -path "$REPO_ROOT/node_modules/*" \
      -type f \
      \( -name "*.ts" -o -name "*.js" -o -name "*.html" -o -name "*.css" -o -name "*.md" -o -name "*.json" \) \
      -exec grep -lE "SPDX-License-Identifier:[[:space:]]*[A-Za-z0-9.+-]+" {} \; 2>/dev/null | \
      while read -r f; do
        SPDX_ID=$(grep -oE "SPDX-License-Identifier:[[:space:]]*[A-Za-z0-9.+-]+" "$f" | \
                  sed 's/SPDX-License-Identifier:[[:space:]]*//')
        if [ "$SPDX_ID" != "$PKG_LICENSE" ]; then
          echo "$f: $SPDX_ID"
        fi
      done)

    if [ -z "$CONFLICTING_SPDX" ]; then
      pass "AC5 – No files contain a conflicting SPDX-License-Identifier"
    else
      fail "AC5 – Files with conflicting SPDX-License-Identifier found: $CONFLICTING_SPDX"
    fi

    # Check README.md for licence mentions that contradict the declared licence
    README="$REPO_ROOT/README.md"
    if [ -f "$README" ]; then
      # Look for explicit licence name mentions that differ from declared
      # We check that if a licence name is mentioned, it matches the declared one
      case "$PKG_LICENSE" in
        MIT)
          # If README mentions Apache, GPL, BSD etc. as the project licence, that's a conflict
          if grep -qiE "(Apache|GPL|BSD|LGPL|MPL|CDDL|EPL)[[:space:]]+(License|Licence)" "$README"; then
            fail "AC5 – README.md mentions a different licence name than the declared $PKG_LICENSE"
          else
            pass "AC5 – README.md does not contradict the declared $PKG_LICENSE licence"
          fi
          ;;
        Apache-2.0)
          if grep -qiE "(MIT|GPL|BSD|LGPL|MPL|CDDL|EPL)[[:space:]]+(License|Licence)" "$README"; then
            fail "AC5 – README.md mentions a different licence name than the declared $PKG_LICENSE"
          else
            pass "AC5 – README.md does not contradict the declared $PKG_LICENSE licence"
          fi
          ;;
        *)
          pass "AC5 – README.md licence consistency check skipped for licence: $PKG_LICENSE"
          ;;
      esac
    else
      pass "AC5 – No README.md to check for conflicting licence mentions"
    fi
  else
    pass "AC5 – No license field in package.json; SPDX conflict check not applicable"
  fi
else
  pass "AC5 – Skipping SPDX conflict check (no licence file or no package.json)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
