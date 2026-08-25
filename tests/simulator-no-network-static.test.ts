/**
 * Issue #248 — Simulator no-external-dependencies: static source analysis
 *
 * AC4: A lint/static check that fails CI if any network-calling import or
 * direct network-primitive usage is detected in the simulator source files.
 *
 * This complements the runtime spy tests in simulator-no-network.test.ts by
 * catching obvious textual violations at the source level (e.g. a developer
 * accidentally adding a `fetch(...)` call or importing a network library).
 *
 * Uses Vite's `?raw` import to read source text without Node.js built-ins
 * (required in the jsdom environment — see team memory).
 */

import { describe, expect, it } from 'vitest';

// Import simulator source as raw text (works in jsdom; tree-shaken in prod).
import WEBHOOK_SIMULATOR_SRC from '../src/webhook-simulator.ts?raw';
import WEBHOOK_SIMULATOR_CLASS_SRC from '../src/webhookSimulator.ts?raw';

// ---------------------------------------------------------------------------
// Patterns that would indicate a network call in the simulator source
// ---------------------------------------------------------------------------

/**
 * Patterns whose presence in the simulator source would indicate a network
 * call or external-dependency import.
 */
const FORBIDDEN_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  // Direct fetch() calls (but not comments or string literals describing fetch)
  { label: 'fetch() call', pattern: /\bfetch\s*\(/ },
  // XMLHttpRequest instantiation
  { label: 'new XMLHttpRequest()', pattern: /new\s+XMLHttpRequest\s*\(/ },
  // navigator.sendBeacon
  { label: 'navigator.sendBeacon()', pattern: /navigator\s*\.\s*sendBeacon\s*\(/ },
  // WebSocket constructor
  { label: 'new WebSocket()', pattern: /new\s+WebSocket\s*\(/ },
  // EventSource (server-sent events)
  { label: 'new EventSource()', pattern: /new\s+EventSource\s*\(/ },
  // axios / got / node-fetch imports
  { label: 'axios import', pattern: /import\s+.*\baxios\b/ },
  { label: 'got import', pattern: /import\s+.*\bgot\b/ },
  { label: 'node-fetch import', pattern: /import\s+.*\bnode-fetch\b/ },
  // Dynamic import of a network library
  { label: 'dynamic import of network lib', pattern: /import\s*\(\s*['"](?:axios|got|node-fetch|cross-fetch)['"]/ },
];

// ---------------------------------------------------------------------------
// Helper: strip single-line and block comments from TypeScript source so that
// commented-out code does not trigger false positives.
// ---------------------------------------------------------------------------

function stripComments(src: string): string {
  // Remove block comments (/* ... */)
  let stripped = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove single-line comments (// ...)
  stripped = stripped.replace(/\/\/[^\n]*/g, '');
  return stripped;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('src/webhook-simulator.ts — static: no network-calling code', () => {
  const src = stripComments(WEBHOOK_SIMULATOR_SRC);

  for (const { label, pattern } of FORBIDDEN_PATTERNS) {
    it(`must not contain ${label}`, () => {
      expect(
        pattern.test(src),
        `Found forbidden pattern "${label}" in src/webhook-simulator.ts`,
      ).toBe(false);
    });
  }
});

describe('src/webhookSimulator.ts — static: no network-calling code', () => {
  const src = stripComments(WEBHOOK_SIMULATOR_CLASS_SRC);

  for (const { label, pattern } of FORBIDDEN_PATTERNS) {
    it(`must not contain ${label}`, () => {
      expect(
        pattern.test(src),
        `Found forbidden pattern "${label}" in src/webhookSimulator.ts`,
      ).toBe(false);
    });
  }
});
