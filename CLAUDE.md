# CLAUDE.md — Agent notes for agent-forge-ui

This file records intentional spec-drift decisions and other notes for the
agent-forge pipeline. It is maintained by the BA/Dev agents and reviewed by
the Product Owner.

---

## Drift audit notes

### Issue #176 — spec drift since #11 (won't-do)

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
