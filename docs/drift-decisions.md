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
- Webhook delivery simulator module (the activation docs exist in
  `docs/simulator.md` but the `src/` simulator module itself is not yet
  present)

Each of these should be filed as a separate issue when prioritised.

---

## Issue #262 — Spec drift since issue #12 (audited 2026-06-13 baseline)

### Context

This drift alert was filed automatically by the weekly audit with a baseline of
`2026-06-13T12:17:15.331Z`. Issues #177 and #229 already performed full triages
of spec drift since #12 (see entries below). This entry records the re-audit to
confirm the decision still holds at the current state of the codebase.

### What issue #12 shipped

Same as documented in the Issue #177 entry below: deployment documentation
(`README.md` `## Deployment` section), `.github/workflows/deploy.yml`, and
`vite.config.ts` base-path configuration. None of that has changed.

### What changed in the spec since #12

`spec/README.md` grew substantially after #12 shipped to add the following
sections (none of which existed at the #12 baseline):

- Webhook delivery & retries (retry schedule, delivery status visibility,
  manual re-trigger, event log, exhausted-state alerting)
- Webhook delivery metrics dashboard (success rate, avg retry count,
  time-to-delivery stats, reactive updates, simulator compatibility, test
  coverage)
- Event log filtering — date-range filter
- Event log filtering — event-type filter
- Webhook delivery simulator (developer fixture)

### Implementation progress since issue #229

Since the #229 audit, the date-range filter gap has been closed:

| Spec section | Status at #229 | Status now |
|---|---|---|
| Event log filtering — Date-range filter | ❌ Gap | ✅ Covered — `src/dateRangeFilter.ts` implements all spec-required functions with full test coverage. |

The remaining open gaps from #229 (manual re-trigger UI, exhausted-state alert,
rendered event-log table UI) are still open and tracked by their own dedicated
issues.

### Decision: **won't-do** (no follow-up needed for #12 specifically)

The conclusion from issues #177 and #229 still holds:

- The deployment workflow, README documentation, and `vite.config.ts`
  base-path configuration shipped by #12 are all still correct and complete.
  Nothing in the current spec contradicts or invalidates what #12 delivered.
- None of the new spec sections impose any requirements on the deployment
  documentation or the deploy workflow. They are orthogonal to the deployment
  infrastructure #12 put in place.
- All remaining open spec gaps are new feature requirements tracked by their
  own dedicated issues, not regressions in #12's work.

**No changes to the #12 implementation are required.** The drift is additive
and the weekly audit should not re-file this issue for the same baseline.

---

## Issue #229 — Spec drift since issue #12 (audited 2026-06-13 baseline)

### Context

This drift alert was filed automatically by the weekly audit with a baseline of
`2026-06-13T12:17:15.331Z`. Issue #177 already performed a full triage of spec
drift since #12 (see entry above). This entry records the re-audit to confirm
the decision still holds and to update the implementation coverage table.

### What issue #12 shipped

Same as documented in the Issue #177 entry above: deployment documentation
(`README.md` `## Deployment` section), `.github/workflows/deploy.yml`, and
`vite.config.ts` base-path configuration. None of that has changed.

### Implementation progress since issue #177

Since the #177 audit, several previously-open spec gaps have been closed by
subsequent issues:

| Spec section | Status at #177 | Status now |
|---|---|---|
| Webhook delivery & retries | ❌ Gap | ✅ Covered — `src/retryScheduler.ts` implements the exponential back-off schedule; `src/delivery-event-store.ts` provides the reactive store; `src/delivery-events.ts` defines the canonical event shape. |
| Webhook delivery metrics dashboard | ❌ Gap | ✅ Covered — `src/metrics.ts` (pure calculation) + `src/metrics-dashboard.ts` (reactive DOM component) + unit tests in `tests/metrics.test.ts` and `tests/metrics-dashboard.test.ts`. |
| Event log filtering — Event-type filter | ⚠️ Partial | ✅ Covered — `src/eventTypeFilter.ts` (logic) + `src/eventTypeFilterIndicator.ts` (active-filter indicator) + unit tests. |
| Webhook delivery simulator | ⚠️ Partial (docs only) | ✅ Covered — `src/webhook-simulator.ts` implements `simulateWebhook` / `generateSimulatedEvents` with configurable `successRate`, full retry-schedule progression, and the canonical `DeliveryEvent` shape. Gated via dev-mode flag in `src/main.ts`. |
| Event log filtering — Date-range filter | ❌ Gap | ❌ Still open — no date-range filter UI or logic exists yet. |

### Decision: **won't-do** (no follow-up needed for #12 specifically)

The conclusion from issue #177 still holds:

- The deployment workflow, README documentation, and `vite.config.ts`
  base-path configuration shipped by #12 are all still correct and complete.
  Nothing in the current spec contradicts or invalidates what #12 delivered.
- The spec additions (webhooks, metrics, filtering, simulator) are new feature
  requirements independent of the deployment infrastructure #12 put in place.
- The one remaining open gap (date-range filter) is a new feature, not a
  regression in #12's work, and should be tracked as a separate issue.

**No changes to the #12 implementation are required.** The drift is
intentional and the weekly audit should not re-file this issue for the same
baseline.
