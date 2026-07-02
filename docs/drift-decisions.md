# Spec drift decisions

This file records explicit triage decisions made when the weekly drift audit
detects that `spec/README.md` has changed since a previously-shipped issue.
Each entry explains what was audited, what the reviewer found, and the outcome.

---

## Issue #177 — Spec drift since issue #12 (audited 2026-06-29)

### What issue #12 shipped

Issue #12 ("Document deployment process for the front-end") delivered:

- A `## Deployment` section in `README.md` documenting GitHub Pages as the
  deployment target, including one-time setup steps, the public URL pattern,
  and instructions for manual one-off builds using `VITE_BASE`.
- `.github/workflows/deploy.yml` — a GitHub Actions workflow that installs
  dependencies, runs `npm test`, builds with `VITE_BASE` set from
  `GITHUB_REPOSITORY`, uploads the `dist/` artifact, and deploys to Pages.
  The workflow uses `concurrency: { cancel-in-progress: false }` (the
  recommended Pages setting) and `actions/configure-pages@v5` with
  `enablement: true` for first-run auto-provisioning.
- `vite.config.ts` updated to read `VITE_BASE` from `process.env` and fall
  back to `'/'` so local development is unaffected.

### What the spec says now

`spec/README.md` has grown substantially since issue #12 shipped. The sections
that are **new** relative to the deployment-documentation scope of #12 are:

| Spec section | Status |
|---|---|
| Webhook delivery & retries | New feature area — not part of #12 |
| Webhook delivery metrics dashboard | New feature area — not part of #12 |
| Event log filtering — Date-range filter | New feature area — not part of #12 |
| Event log filtering — Event-type filter | Partially implemented (issue #92 shipped `src/eventTypeFilter.ts` and unit tests) |
| Webhook delivery simulator | Documented in `docs/simulator.md`; simulator module itself tracked separately |

### Decision: **won't-do** (no follow-up needed for #12 specifically)

The spec additions since #12 are **new feature requirements** that were added
to the spec after the deployment work shipped. They do not invalidate or
contradict anything that #12 implemented:

- The deployment workflow, README documentation, and `vite.config.ts` base-path
  configuration are all still correct and complete relative to the deployment
  requirements.
- The new spec sections (webhooks, metrics, filtering, simulator) are tracked
  as separate issues in the normal backlog flow. Issue #92 already shipped the
  event-type filter logic; the remaining sections are candidates for future
  issues.

**No changes to the #12 implementation are required.** The drift is
intentional: the spec grew to describe new product capabilities that are
independent of the deployment infrastructure #12 put in place.

### Remaining open spec gaps (for reference)

The following spec sections are not yet fully implemented as of this audit.
They are noted here for visibility but are **out of scope for issue #177**
(which is a triage-only task):

- Webhook delivery & retries (retry schedule, delivery status UI, manual
  re-trigger, event log with HTTP status/response body, exhausted-state alert)
- Webhook delivery metrics dashboard (success rate, average retry count,
  time-to-delivery stats, reactive updates)
- Event log filtering — Date-range filter (start/end inputs, boundary
  inclusion, active-filter indicator, filter composition)
- Event log filtering — Event-type filter UI (the filter *logic* is in
  `src/eventTypeFilter.ts` but the UI control, active-filter indicator, and
  filter composition with date-range are not yet wired up)
- Webhook delivery simulator module — **partially resolved**: `src/webhookSimulator.ts` now exists and implements the `WebhookSimulator` class with the `successRate` parameter (shipped via issue #156 / PR #202). The activation docs in `docs/simulator.md` have been updated to cover the `SimulatorConfig` API. Remaining gaps: UI wiring and integration with the delivery status display.

Each of these should be filed as a separate issue when prioritised.
