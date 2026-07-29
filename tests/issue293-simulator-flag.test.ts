/**
 * Unit tests for Issue #293: Document webhook simulator activation via
 * environment flag.
 *
 * Acceptance criteria covered:
 *   AC1 – README.md (or a dedicated dev-docs file) contains a named
 *         environment flag (VITE_SIMULATOR or equivalent).
 *   AC3 – The flag has no effect in production builds (simulator is excluded
 *         or inert when the flag is absent/falsy).
 *   AC4 – A usage example is included so a developer can activate the
 *         simulator without reading source code.
 *   AC5 – The documented flag name matches the actual flag name used in the
 *         simulator implementation (no discrepancy between docs and code).
 *   AC6 – The documentation is discoverable from the top-level README.md.
 *
 * AC2 (how to set the flag for local development) is covered by the
 * companion shell script tests/test_issue293_simulator_docs.sh which checks
 * the prose content of docs/simulator.md.
 *
 * Note: because this test runs in Vitest's jsdom environment, Node built-ins
 * (fs, path, url) are unavailable. Source files are imported via Vite's `?raw`
 * suffix so they are read at build/test time without any Node I/O.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Raw source imports — read at Vite transform time, not at runtime.
// This is the only safe way to do static-analysis checks in jsdom.
// ---------------------------------------------------------------------------
import MAIN_TS_SOURCE from '../src/main.ts?raw';
import README_SOURCE from '../README.md?raw';
import SIMULATOR_DOC_SOURCE from '../docs/simulator.md?raw';

// ---------------------------------------------------------------------------
// AC1 – The named environment flag appears in the source and documentation
// ---------------------------------------------------------------------------

describe('AC1 – VITE_SIMULATOR flag is named in source and documentation', () => {
  it('src/main.ts references the VITE_SIMULATOR flag', () => {
    expect(MAIN_TS_SOURCE).toContain('VITE_SIMULATOR');
  });

  it('README.md contains the VITE_SIMULATOR flag name', () => {
    expect(README_SOURCE).toContain('VITE_SIMULATOR');
  });

  it('docs/simulator.md contains the VITE_SIMULATOR flag name', () => {
    expect(SIMULATOR_DOC_SOURCE).toContain('VITE_SIMULATOR');
  });

  it('docs/simulator.md has a dedicated activation section', () => {
    // The doc must have a heading that covers activation.
    expect(SIMULATOR_DOC_SOURCE).toMatch(/##\s+Activation/i);
  });
});

// ---------------------------------------------------------------------------
// AC3 – Simulator is inert / excluded when the flag is absent or falsy
// ---------------------------------------------------------------------------

describe('AC3 – simulator is inert when VITE_SIMULATOR is absent or falsy', () => {
  it('docs/simulator.md states the simulator is excluded from production builds', () => {
    // Must mention production and exclusion/tree-shaking/inert.
    expect(SIMULATOR_DOC_SOURCE).toMatch(/production/i);
    expect(SIMULATOR_DOC_SOURCE).toMatch(/excluded|tree.shak|inert|not.*present|no.*impact/i);
  });

  it('src/main.ts guards simulator activation behind the VITE_SIMULATOR flag', () => {
    // The implementation must check VITE_SIMULATOR === 'true' (not just DEV).
    expect(MAIN_TS_SOURCE).toContain("VITE_SIMULATOR === 'true'");
  });

  it('src/main.ts does not unconditionally call generateSimulatedEvents', () => {
    // The call to generateSimulatedEvents must be inside a conditional block,
    // not at the top level of mountApp. Find the actual call (not the import).
    const lines = MAIN_TS_SOURCE.split('\n');
    // Skip the import line; find the invocation line (contains a function call).
    const callLine = lines.findIndex(
      (l) => l.includes('generateSimulatedEvents(') && !l.trimStart().startsWith('import'),
    );
    expect(callLine).toBeGreaterThan(-1);

    // The line must be indented (inside an if-block), not at column 0.
    const line = lines[callLine];
    expect(line).toMatch(/^\s+/);
  });

  it('mountApp() returns an empty store when VITE_SIMULATOR is not set', async () => {
    // In the jsdom test environment import.meta.env.VITE_SIMULATOR is
    // undefined (not 'true'), so mountApp() must NOT seed the store.
    const { mountApp } = await import('../src/main.ts');
    const store = mountApp();
    // The store should have no events because the simulator was not activated.
    expect(store.getEvents()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// AC4 – A usage example is present in the documentation
// ---------------------------------------------------------------------------

describe('AC4 – usage example is present in the documentation', () => {
  it('docs/simulator.md contains a CLI usage example with VITE_SIMULATOR=true npm run dev', () => {
    expect(SIMULATOR_DOC_SOURCE).toContain('VITE_SIMULATOR=true npm run dev');
  });

  it('README.md contains a CLI usage example with VITE_SIMULATOR=true npm run dev', () => {
    expect(README_SOURCE).toContain('VITE_SIMULATOR=true npm run dev');
  });

  it('docs/simulator.md wraps the usage example in a fenced code block', () => {
    // The CLI command must appear inside a markdown fenced code block (```).
    const lines = SIMULATOR_DOC_SOURCE.split('\n');
    const cmdIdx = lines.findIndex((l) => l.includes('VITE_SIMULATOR=true npm run dev'));
    expect(cmdIdx).toBeGreaterThan(-1);

    // Search backwards for an opening fence.
    const precedingLines = lines.slice(0, cmdIdx);
    const lastFenceIdx = precedingLines.map((l) => l.trimStart()).lastIndexOf('```bash') !== -1
      ? precedingLines.map((l) => l.trimStart()).lastIndexOf('```bash')
      : precedingLines.map((l) => l.trimStart()).lastIndexOf('```');
    expect(lastFenceIdx).toBeGreaterThan(-1);
  });

  it('docs/simulator.md explains the dotenv / .local file alternative', () => {
    // Must mention a local file option so developers know they can persist the flag.
    expect(SIMULATOR_DOC_SOURCE).toMatch(/\.local|dotenv|local.*file/i);
  });
});

// ---------------------------------------------------------------------------
// AC5 – Documented flag name matches the implementation (no discrepancy)
// ---------------------------------------------------------------------------

describe('AC5 – documented flag name matches the implementation', () => {
  it('src/main.ts uses exactly VITE_SIMULATOR (not VITE_USE_SIMULATOR or similar)', () => {
    expect(MAIN_TS_SOURCE).toContain('VITE_SIMULATOR');
    // Must NOT use a different variant that would contradict the docs.
    expect(MAIN_TS_SOURCE).not.toContain('VITE_USE_SIMULATOR');
    expect(MAIN_TS_SOURCE).not.toContain('VITE_USE_WEBHOOK_SIMULATOR');
    expect(MAIN_TS_SOURCE).not.toContain('VITE_ENABLE_SIMULATOR');
  });

  it('docs/simulator.md uses exactly VITE_SIMULATOR (not a variant)', () => {
    expect(SIMULATOR_DOC_SOURCE).toContain('VITE_SIMULATOR');
    expect(SIMULATOR_DOC_SOURCE).not.toContain('VITE_USE_SIMULATOR');
    expect(SIMULATOR_DOC_SOURCE).not.toContain('VITE_USE_WEBHOOK_SIMULATOR');
    expect(SIMULATOR_DOC_SOURCE).not.toContain('VITE_ENABLE_SIMULATOR');
  });

  it('README.md uses exactly VITE_SIMULATOR (not a variant)', () => {
    expect(README_SOURCE).toContain('VITE_SIMULATOR');
    expect(README_SOURCE).not.toContain('VITE_USE_SIMULATOR');
    expect(README_SOURCE).not.toContain('VITE_USE_WEBHOOK_SIMULATOR');
    expect(README_SOURCE).not.toContain('VITE_ENABLE_SIMULATOR');
  });

  it('the flag value checked in code is the string "true" (matches docs)', () => {
    // docs say VITE_SIMULATOR=true; code must check for the string 'true'.
    expect(MAIN_TS_SOURCE).toContain("'true'");
  });

  it('docs/simulator.md shows the flag value as "true" (matches code)', () => {
    expect(SIMULATOR_DOC_SOURCE).toContain('VITE_SIMULATOR=true');
  });
});

// ---------------------------------------------------------------------------
// AC6 – Documentation is discoverable from the top-level README.md
// ---------------------------------------------------------------------------

describe('AC6 – documentation is discoverable from README.md', () => {
  it('README.md links to docs/simulator.md', () => {
    expect(README_SOURCE).toContain('docs/simulator.md');
  });

  it('README.md has a section heading that references the simulator', () => {
    // Must have a heading (##, ###, etc.) mentioning "simulator".
    expect(README_SOURCE).toMatch(/#{2,}\s+.*[Ss]imulator/);
  });

  it('docs/simulator.md is a non-trivial document (at least 20 lines)', () => {
    const lines = SIMULATOR_DOC_SOURCE.split('\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(20);
  });

  it('docs/simulator.md has an H1 title', () => {
    expect(SIMULATOR_DOC_SOURCE).toMatch(/^#\s+\S/m);
  });
});

// ---------------------------------------------------------------------------
// Integration: mountApp() behaviour with simulator flag toggled
// ---------------------------------------------------------------------------

describe('Integration – mountApp() respects the VITE_SIMULATOR flag', () => {
  beforeEach(() => {
    // Reset module registry so each test gets a fresh import.meta.env state.
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('store is empty when VITE_SIMULATOR is not "true" (default test env)', async () => {
    const { mountApp } = await import('../src/main.ts');
    const store = mountApp();
    // In the test environment VITE_SIMULATOR is not set to 'true', so the
    // simulator must not seed the store.
    expect(store.getEvents()).toHaveLength(0);
  });

  it('src/main.ts activates the simulator only when VITE_SIMULATOR === "true" (source guard)', () => {
    // Static check: the source must contain the exact conditional guard so
    // tree-shaking can eliminate the branch in production builds.
    expect(MAIN_TS_SOURCE).toContain("VITE_SIMULATOR === 'true'");
    // The guard must be inside an `if` statement.
    expect(MAIN_TS_SOURCE).toMatch(/if\s*\(.*VITE_SIMULATOR/);
  });
});
