#!/usr/bin/env node
// Issue #158 — production-bundle verification step.
//
// Asserts that a production build (already emitted to dist/) contains NO
// webhook-delivery-simulator code. This is the documented verification step
// required by AC4: `npm run build:analyze` runs the build and then this check.
//
// The check scans every emitted JS asset for marker strings that the simulator
// module exports/uses. Because the simulator is a developer-only fixture, any
// occurrence of these markers in a production bundle is a regression.
//
// It is deliberately tolerant of the simulator not existing yet (the module is
// owned by the `ui` area and may be added later): the contract is "if a
// simulator exists, it must not appear in the production bundle".

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(repoRoot, 'dist');

if (!existsSync(distDir)) {
  console.error('assert-no-simulator: dist/ not found — run a build first.');
  process.exit(1);
}

// Marker substrings that would only appear if simulator source were bundled.
// Keep these generic so they catch the simulator regardless of its exact API.
const FORBIDDEN = [
  'WebhookSimulator',
  'createSimulator',
  'startSimulator',
  'simulateDelivery',
  // The production stub injected by vite.config.ts carries this comment; if it
  // shows up that is fine (it is the *replacement*), so it is NOT forbidden.
];

function walk(dir) {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(js|mjs|cjs)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

const jsFiles = walk(distDir);
const offenders = [];

for (const file of jsFiles) {
  const contents = readFileSync(file, 'utf8');
  for (const marker of FORBIDDEN) {
    if (contents.includes(marker)) {
      offenders.push(`${file}: contains "${marker}"`);
    }
  }
}

if (offenders.length > 0) {
  console.error('assert-no-simulator: simulator code leaked into production bundle:');
  for (const o of offenders) console.error('  - ' + o);
  process.exit(1);
}

console.log(
  `assert-no-simulator: OK — scanned ${jsFiles.length} production JS asset(s); no simulator code present.`,
);
