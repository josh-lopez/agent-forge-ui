#!/usr/bin/env bash
# Tests for Issue #9: Sensible build/project config (package.json)
# Covers all 8 acceptance criteria.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$REPO_ROOT/package.json"

PASS=0
FAIL=0

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── AC1: A build config file exists at the project root and is valid/parseable ─
if [ -f "$PKG" ]; then
  pass "AC1 – package.json exists at repo root"
else
  fail "AC1 – package.json does NOT exist at repo root"
fi

# Validate JSON is parseable (requires node, which is available since we use npm)
if node -e "JSON.parse(require('fs').readFileSync('$PKG','utf8'))" 2>/dev/null; then
  pass "AC1 – package.json is valid JSON"
else
  fail "AC1 – package.json is NOT valid JSON"
fi

# ── AC2: The config defines a `build` script ──────────────────────────────────
BUILD_SCRIPT=$(node -e "const p=JSON.parse(require('fs').readFileSync('$PKG','utf8')); console.log(p.scripts && p.scripts.build || '')" 2>/dev/null)
if [ -n "$BUILD_SCRIPT" ]; then
  pass "AC2 – 'build' script is defined: $BUILD_SCRIPT"
else
  fail "AC2 – 'build' script is NOT defined in package.json"
fi

# ── AC3: The config defines a `test` script ───────────────────────────────────
TEST_SCRIPT=$(node -e "const p=JSON.parse(require('fs').readFileSync('$PKG','utf8')); console.log(p.scripts && p.scripts.test || '')" 2>/dev/null)
if [ -n "$TEST_SCRIPT" ]; then
  pass "AC3 – 'test' script is defined: $TEST_SCRIPT"
else
  fail "AC3 – 'test' script is NOT defined in package.json"
fi

# ── AC4: The config defines a `lint` script or equivalent ─────────────────────
LINT_SCRIPT=$(node -e "const p=JSON.parse(require('fs').readFileSync('$PKG','utf8')); console.log(p.scripts && p.scripts.lint || '')" 2>/dev/null)
if [ -n "$LINT_SCRIPT" ]; then
  pass "AC4 – 'lint' script is defined: $LINT_SCRIPT"
else
  fail "AC4 – 'lint' script is NOT defined in package.json"
fi

# ── AC5: Running the `build` script succeeds without manual intervention ───────
# Run from the repo root; node_modules must already be present (npm ci was run).
echo "  [AC5] Running 'npm run build' ..."
if (cd "$REPO_ROOT" && npm run build >/dev/null 2>&1); then
  pass "AC5 – 'npm run build' exits 0"
else
  fail "AC5 – 'npm run build' did NOT exit 0"
fi

# Verify a deployable artifact was produced (dist/index.html)
if [ -f "$REPO_ROOT/dist/index.html" ]; then
  pass "AC5 – dist/index.html artifact exists after build"
else
  fail "AC5 – dist/index.html artifact NOT found after build"
fi

# ── AC6: name, version, and licence fields are populated ──────────────────────
PKG_NAME=$(node -e "const p=JSON.parse(require('fs').readFileSync('$PKG','utf8')); console.log(p.name || '')" 2>/dev/null)
if [ -n "$PKG_NAME" ]; then
  pass "AC6 – 'name' field is populated: $PKG_NAME"
else
  fail "AC6 – 'name' field is missing or empty"
fi

PKG_VERSION=$(node -e "const p=JSON.parse(require('fs').readFileSync('$PKG','utf8')); console.log(p.version || '')" 2>/dev/null)
if [ -n "$PKG_VERSION" ]; then
  pass "AC6 – 'version' field is populated: $PKG_VERSION"
else
  fail "AC6 – 'version' field is missing or empty"
fi

PKG_LICENSE=$(node -e "const p=JSON.parse(require('fs').readFileSync('$PKG','utf8')); console.log(p.license || '')" 2>/dev/null)
if [ -n "$PKG_LICENSE" ]; then
  pass "AC6 – 'license' field is populated: $PKG_LICENSE"
else
  fail "AC6 – 'license' field is missing or empty"
fi

# ── AC7: No backend service dependencies or secrets introduced ─────────────────
# Check that no server-side runtime packages (express, fastify, koa, hapi,
# nestjs, etc.) appear in dependencies or devDependencies.
BACKEND_DEPS=$(node -e "
  const p = JSON.parse(require('fs').readFileSync('$PKG', 'utf8'));
  const all = Object.keys(Object.assign({}, p.dependencies, p.devDependencies));
  const serverPkgs = ['express','fastify','koa','hapi','nestjs','@nestjs','restify','feathers','sails','loopback','sequelize','typeorm','mongoose','prisma','pg','mysql','sqlite3','redis','dotenv'];
  const found = all.filter(d => serverPkgs.some(s => d === s || d.startsWith(s + '/')));
  console.log(found.join(','));
" 2>/dev/null)
if [ -z "$BACKEND_DEPS" ]; then
  pass "AC7 – No backend service dependencies found"
else
  fail "AC7 – Backend service dependencies found: $BACKEND_DEPS"
fi

# Check that no .env files with secrets exist at the root
if [ ! -f "$REPO_ROOT/.env" ] && [ ! -f "$REPO_ROOT/.env.local" ] && [ ! -f "$REPO_ROOT/.env.production" ]; then
  pass "AC7 – No .env secret files present at repo root"
else
  fail "AC7 – .env secret file(s) found at repo root"
fi

# ── AC8: Config is consistent with tsconfig.json and vite.config.* ────────────
# tsconfig.json must exist
if [ -f "$REPO_ROOT/tsconfig.json" ]; then
  pass "AC8 – tsconfig.json exists"
else
  fail "AC8 – tsconfig.json does NOT exist"
fi

# tsconfig.json must be valid JSON
if node -e "JSON.parse(require('fs').readFileSync('$REPO_ROOT/tsconfig.json','utf8'))" 2>/dev/null; then
  pass "AC8 – tsconfig.json is valid JSON"
else
  fail "AC8 – tsconfig.json is NOT valid JSON"
fi

# vite.config.ts or vite.config.js must exist
if ls "$REPO_ROOT"/vite.config.* 2>/dev/null | grep -q .; then
  VITE_CFG=$(ls "$REPO_ROOT"/vite.config.* 2>/dev/null | head -1 | xargs basename)
  pass "AC8 – Vite config file exists: $VITE_CFG"
else
  fail "AC8 – No vite.config.* file found"
fi

# The build script in package.json must reference vite (consistent with vite.config.*)
if echo "$BUILD_SCRIPT" | grep -q "vite"; then
  pass "AC8 – build script references 'vite', consistent with vite.config.*"
else
  fail "AC8 – build script does NOT reference 'vite' despite vite.config.* being present"
fi

# The lint script must reference tsc (consistent with tsconfig.json)
if echo "$LINT_SCRIPT" | grep -q "tsc"; then
  pass "AC8 – lint script references 'tsc', consistent with tsconfig.json"
else
  fail "AC8 – lint script does NOT reference 'tsc' despite tsconfig.json being present"
fi

# tsconfig.json outDir / noEmit should be consistent with vite build outDir
# tsconfig uses noEmit:true (TypeScript only type-checks; vite handles emit)
TSCONFIG_NO_EMIT=$(node -e "const t=JSON.parse(require('fs').readFileSync('$REPO_ROOT/tsconfig.json','utf8')); console.log(t.compilerOptions && t.compilerOptions.noEmit ? 'true' : 'false')" 2>/dev/null)
if [ "$TSCONFIG_NO_EMIT" = "true" ]; then
  pass "AC8 – tsconfig.json has noEmit:true, consistent with Vite handling the build output"
else
  fail "AC8 – tsconfig.json does NOT have noEmit:true (may conflict with Vite build)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
