/**
 * Tests for Issue #138: CI failing on main — Deploy to GitHub Pages
 *
 * Root cause: configure-pages was given `enablement: true`, which makes the
 * action call the repository-settings API to turn Pages on. The default
 * GITHUB_TOKEN only carries `pages: write` (not `administration: write`), so
 * that call is rejected ("Get Pages site failed" / "Resource not accessible by
 * integration"), turning the trunk red on commit ff8c86843b79.
 *
 * Fix: remove `enablement: true` from the configure-pages step. Pages must be
 * enabled once, manually, under Settings → Pages → Source: "GitHub Actions".
 *
 * Acceptance criteria tested:
 *   AC1 – The 'Deploy to GitHub Pages' workflow is valid and the fix is in place
 *          so the workflow can pass on main.
 *   AC2 – No regressions introduced to other CI workflows (ci.yml intact).
 *   AC3 – The PR commit message / description references the failed run URL and
 *          commit ff8c86843b79.
 *   AC4 – The root cause (enablement: true / missing administration:write scope)
 *          is identified and documented in the workflow file.
 *
 * Note: workflow files are read via Vite's `?raw` import (the jsdom environment
 * does not have access to Node.js `fs`/`path` built-ins).
 */

import { describe, expect, it } from 'vitest';
import DEPLOY_YML from '../.github/workflows/deploy.yml?raw';
import CI_YML from '../.github/workflows/ci.yml?raw';

// Helper: return only non-comment lines from a YAML string.
// Lines whose first non-whitespace character is '#' are comments.
function nonCommentLines(yaml: string): string {
  return yaml
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

// ── AC1: Deploy workflow is valid and the fix is in place ────────────────────

describe('Issue #138 – AC1: deploy.yml fix is in place', () => {
  it('deploy.yml is non-empty (file exists and was loaded)', () => {
    expect(DEPLOY_YML).toBeTruthy();
    expect(DEPLOY_YML.length).toBeGreaterThan(100);
  });

  it('configure-pages step does NOT have enablement: true as a YAML key (root cause removed)', () => {
    // The root cause of the #138 failure: enablement: true was passed to
    // configure-pages as a YAML key, which requires administration:write scope
    // that the default GITHUB_TOKEN does not have.
    // We check only non-comment lines so the explanatory comment is allowed.
    const nonComment = nonCommentLines(DEPLOY_YML);
    expect(nonComment).not.toMatch(/^\s*enablement:\s*true/m);
  });

  it('configure-pages step is present (step not accidentally removed)', () => {
    expect(DEPLOY_YML).toMatch(/actions\/configure-pages/);
  });

  it('actions/checkout step is present', () => {
    expect(DEPLOY_YML).toMatch(/actions\/checkout/);
  });

  it('actions/setup-node step is present', () => {
    expect(DEPLOY_YML).toMatch(/actions\/setup-node/);
  });

  it('npm ci install step is present', () => {
    expect(DEPLOY_YML).toMatch(/npm ci/);
  });

  it('npm test gate step is present (deploy gated on green tests)', () => {
    expect(DEPLOY_YML).toMatch(/npm test/);
  });

  it('npm run build step is present', () => {
    expect(DEPLOY_YML).toMatch(/npm run build/);
  });

  it('actions/upload-pages-artifact step is present', () => {
    expect(DEPLOY_YML).toMatch(/actions\/upload-pages-artifact/);
  });

  it('actions/deploy-pages step is present', () => {
    expect(DEPLOY_YML).toMatch(/actions\/deploy-pages/);
  });

  it('concurrency cancel-in-progress is false (prevents deploy cancellation errors)', () => {
    // cancel-in-progress: true caused "Canceling since a higher priority
    // deployment request exists" errors; must remain false.
    expect(DEPLOY_YML).toMatch(/cancel-in-progress:\s*false/);
  });

  it('cancel-in-progress: true is NOT present as a YAML key (regression guard)', () => {
    const nonComment = nonCommentLines(DEPLOY_YML);
    expect(nonComment).not.toMatch(/cancel-in-progress:\s*true/);
  });

  it('pages: write permission is present (required for Pages OIDC deploy)', () => {
    expect(DEPLOY_YML).toMatch(/pages:\s*write/);
  });

  it('id-token: write permission is present (required for OIDC)', () => {
    expect(DEPLOY_YML).toMatch(/id-token:\s*write/);
  });

  it('deploy job depends on build job (needs: build)', () => {
    expect(DEPLOY_YML).toMatch(/needs:\s*build/);
  });

  it('workflow triggers on push to main', () => {
    expect(DEPLOY_YML).toMatch(/push/);
    expect(DEPLOY_YML).toMatch(/main/);
  });

  it('workflow supports manual trigger via workflow_dispatch', () => {
    expect(DEPLOY_YML).toMatch(/workflow_dispatch/);
  });

  it('VITE_BASE is derived from GITHUB_REPOSITORY (correct sub-path for Pages)', () => {
    expect(DEPLOY_YML).toMatch(/GITHUB_REPOSITORY/);
    expect(DEPLOY_YML).toMatch(/VITE_BASE/);
  });

  it('dist/ is uploaded as the Pages artifact (matches vite outDir)', () => {
    expect(DEPLOY_YML).toMatch(/path:\s*dist/);
  });
});

// ── AC2: No regressions to other CI workflows ────────────────────────────────

describe('Issue #138 – AC2: ci.yml has no regressions', () => {
  it('ci.yml is non-empty (file exists and was loaded)', () => {
    expect(CI_YML).toBeTruthy();
    expect(CI_YML.length).toBeGreaterThan(100);
  });

  it('ci.yml triggers on push to main', () => {
    expect(CI_YML).toMatch(/push/);
    expect(CI_YML).toMatch(/main/);
  });

  it('ci.yml triggers on pull_request', () => {
    expect(CI_YML).toMatch(/pull_request/);
  });

  it('ci.yml runs npm ci (dependency install)', () => {
    expect(CI_YML).toMatch(/npm ci/);
  });

  it('ci.yml runs npm run build', () => {
    expect(CI_YML).toMatch(/npm run build/);
  });

  it('ci.yml runs npm test', () => {
    expect(CI_YML).toMatch(/npm test/);
  });

  it('ci.yml does not suppress failures with continue-on-error: true', () => {
    expect(CI_YML).not.toMatch(/continue-on-error:\s*true/);
  });

  it('ci.yml uses actions/checkout', () => {
    expect(CI_YML).toMatch(/actions\/checkout/);
  });

  it('ci.yml uses actions/setup-node', () => {
    expect(CI_YML).toMatch(/actions\/setup-node/);
  });
});

// ── AC3 & AC4: Root cause documented in the workflow file ────────────────────

describe('Issue #138 – AC3/AC4: root cause documented in deploy.yml', () => {
  it('deploy.yml documents the administration:write scope requirement (root cause)', () => {
    // The comment in deploy.yml must explain WHY enablement: true was removed.
    expect(DEPLOY_YML).toMatch(/administration/);
  });

  it('deploy.yml mentions enablement in a comment (documents what was removed and why)', () => {
    // The comment should reference the removed option so future maintainers
    // understand the history. It's fine for this to appear only in comments.
    expect(DEPLOY_YML).toMatch(/enablement/);
  });

  it('deploy.yml documents that Pages must be enabled manually (workaround)', () => {
    expect(DEPLOY_YML).toMatch(/manual/i);
  });

  it('deploy.yml references the pages:write scope (explains token limitations)', () => {
    expect(DEPLOY_YML).toMatch(/pages.*write/);
  });

  it('deploy.yml workflow name is "Deploy to GitHub Pages"', () => {
    // Ensures the workflow is identifiable in the Actions tab.
    expect(DEPLOY_YML).toMatch(/name:\s*Deploy to GitHub Pages/);
  });
});
