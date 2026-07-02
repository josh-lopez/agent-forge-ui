# CLAUDE.md — agent-forge-ui notes for the pipeline

This file records intentional spec-drift decisions and other notes for the
agent-forge pipeline (BA, Dev, and QA roles). It is maintained by the BA/Dev
agents and reviewed by the Product Owner.

---

## Spec drift decisions

### Issue #175 — drift audit for issue #10 (automated test suite)

**Decision: won't-do / no gap.**

Issue #10 implemented the automated test-suite infrastructure:
- `npm test` script wired in `package.json`
- `tests/run_all.sh` shell-test runner
- HTML linting via `htmlhint` / `.htmlhintrc`
- CI workflow invoking `npm test`
- README section documenting how to run tests

Since #10 shipped, `spec/README.md` grew to include four new feature sections
(Webhook delivery & retries, Webhook delivery metrics dashboard, Event log
filtering, Webhook delivery simulator). These additions are **entirely separate
feature requirements** that were addressed by dedicated follow-up issues (#92,
#95, #97, #145, and others). They do not change or invalidate what #10
delivered — the test infrastructure is still correct and all tests pass.

The drift is therefore **intentional**: the spec expanded with new features, not
with new requirements for the test suite itself. No follow-up implementation
work is needed under issue #175.

---

### Issue #176 — spec drift since #11 (CI workflow)

**Filed:** 2026-06-20  
**Resolution:** Won't-do — drift is intentional and no implementation gap exists.

**What #11 shipped:** A GitHub Actions CI workflow (`.github/workflows/ci.yml`)
that triggers on push/PR to `main`, installs dependencies (`npm ci`), type-checks
(`npm run typecheck`), builds (`npm run build`), and runs the full test suite
(`npm test`).

**What changed in the spec since #11:** `spec/README.md` grew substantially to
add the Webhook delivery & retries, Webhook delivery metrics dashboard, Event log
filtering, and Webhook delivery simulator sections.

**Why there is no gap:** Issue #11 delivered generic build-and-test CI
infrastructure, not a feature-specific workflow. The CI workflow runs `npm test`,
which automatically covers all new features as they are added and tested. The
spec's new feature sections do not impose any new requirements on the CI workflow
itself — they are implemented and tested by other issues (#92, #95, #97, etc.).
The CI workflow continues to correctly gate PRs on a green build and test suite.

**Conclusion:** No follow-up issue is needed. The CI workflow is spec-compliant
and will remain so as the product grows, provided new features continue to be
covered by `npm test`.
