/**
 * Supplementary tests for Issue #156 — WebhookSimulator
 *
 * Acceptance criteria covered here:
 *   AC6 – The `successRate` parameter is documented (inline JSDoc or equivalent)
 *          on the simulator's public interface.
 *   AC9 – The `successRate` parameter has no effect on production builds;
 *          the simulator is dev-only, gated by an environment flag or dev-mode
 *          toggle, and is not imported by the production entry point.
 *
 * Static-analysis tests use Vite's `?raw` import so the source text is
 * available in the jsdom environment without Node.js built-ins (fs/path/url).
 */

import { describe, expect, it } from 'vitest';
import SIM_SOURCE from '../src/webhookSimulator.ts?raw';
import MAIN_SOURCE from '../src/main.ts?raw';

// ---------------------------------------------------------------------------
// AC6 – JSDoc documentation on the public interface
// ---------------------------------------------------------------------------

describe('AC6 – successRate is documented with JSDoc on the public interface', () => {
  it('SimulatorConfig interface has a JSDoc block containing successRate', () => {
    // The source must contain a JSDoc comment (/** ... */) that mentions
    // successRate, proving the property is documented.
    const jsdocPattern = /\/\*\*[\s\S]*?successRate[\s\S]*?\*\//;
    expect(jsdocPattern.test(SIM_SOURCE)).toBe(true);
  });

  it('successRate JSDoc describes the 0.0–1.0 range', () => {
    // The documentation must mention the valid range boundaries.
    expect(SIM_SOURCE).toContain('0.0');
    expect(SIM_SOURCE).toContain('1.0');
  });

  it('successRate JSDoc describes the delivered outcome for 1.0', () => {
    // The documentation must explain what successRate=1.0 means.
    expect(SIM_SOURCE).toMatch(/1\.0.*delivered|delivered.*1\.0/);
  });

  it('successRate JSDoc describes the exhausted outcome for 0.0', () => {
    // The documentation must explain what successRate=0.0 means.
    expect(SIM_SOURCE).toMatch(/0\.0.*exhausted|exhausted.*0\.0/);
  });

  it('SimulatorConfig interface is exported', () => {
    // The interface must be part of the public API.
    expect(SIM_SOURCE).toMatch(/export\s+interface\s+SimulatorConfig/);
  });

  it('successRate property is declared on SimulatorConfig', () => {
    // The property must exist on the exported interface.
    expect(SIM_SOURCE).toMatch(/successRate\s*:\s*number/);
  });

  it('WebhookSimulator class is exported', () => {
    // The class must be part of the public API.
    expect(SIM_SOURCE).toMatch(/export\s+class\s+WebhookSimulator/);
  });

  it('constructor JSDoc mentions successRate', () => {
    // The constructor comment should reference successRate.
    expect(SIM_SOURCE).toMatch(/@param\s+config[\s\S]*?successRate|successRate.*required/);
  });
});

// ---------------------------------------------------------------------------
// AC9 – Simulator has no effect on production builds
// ---------------------------------------------------------------------------

describe('AC9 – simulator is dev-only and not imported by the production entry point', () => {
  it('src/main.ts does not import webhookSimulator', () => {
    // The production entry point must not statically import the simulator,
    // ensuring it is excluded from production bundles by tree-shaking.
    expect(MAIN_SOURCE).not.toMatch(/import.*webhookSimulator/);
    expect(MAIN_SOURCE).not.toMatch(/from.*webhookSimulator/);
  });

  it('simulator source does not call real network endpoints', () => {
    // The simulator must be entirely client-side with no fetch/XHR calls.
    expect(SIM_SOURCE).not.toMatch(/\bfetch\s*\(/);
    expect(SIM_SOURCE).not.toMatch(/XMLHttpRequest/);
    expect(SIM_SOURCE).not.toMatch(/axios/);
  });

  it('simulator source does not import any external HTTP libraries', () => {
    // No backend/network dependencies should appear in the simulator.
    const httpLibs = /from\s+['"](?:axios|node-fetch|got|superagent|request)['"]/;
    expect(httpLibs.test(SIM_SOURCE)).toBe(false);
  });

  it('simulator module is self-contained (no non-relative external imports)', () => {
    // All import statements in the simulator should be relative (./…) or
    // type-only. This confirms it has no runtime external dependencies.
    const importLines = SIM_SOURCE
      .split('\n')
      .filter((line) => /^\s*import\s/.test(line));

    for (const line of importLines) {
      const isRelative = /from\s+['"]\./.test(line);
      const isTypeOnly = /import\s+type\s/.test(line);
      // If there are import statements they must be relative or type-only.
      expect(isRelative || isTypeOnly).toBe(true);
    }
  });

  it('simulator module has no top-level side-effecting function calls', () => {
    // A passive module should not execute side effects at import time.
    // We check that no non-indented (top-level) bare function calls exist
    // outside of declarations. Top-level lines start at column 0 with a word
    // character followed by an open-paren (e.g. "someCall(...)").
    const topLevelCallLines = SIM_SOURCE
      .split('\n')
      .filter((line) => {
        // Must start at column 0 (no leading whitespace) to be truly top-level.
        if (/^\s/.test(line)) return false;
        const trimmed = line.trim();
        if (!trimmed) return false;
        // Skip comments
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return false;
        // Skip declarations (import, export, const, let, var, function, class, type, interface)
        if (/^(import|export|const|let|var|function|class|type|interface|async)\b/.test(trimmed)) return false;
        // Flag bare top-level calls: word chars immediately followed by '('
        return /^\w+\s*\(/.test(trimmed);
      });

    expect(topLevelCallLines).toHaveLength(0);
  });
});
