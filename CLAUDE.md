# CLAUDE.md — Agent notes for agent-forge-ui

This file records intentional spec-drift decisions and other notes for the
agent-forge pipeline. It is maintained by the BA/Dev agents and reviewed by
the Product Owner.

---

## Drift audit notes

### Issue #174 — Spec drift audit (2026-06-04 baseline)

**Audited:** `spec/README.md` against the implementation on `main` as of the
`agent-forge/dev/issue-174` branch.

#### Summary

Issue #1 shipped a skeleton front-end (HTML, CSS, TypeScript build config,
README, LICENSE). The spec has since grown substantially. The table below
records the coverage status of every spec section.

| Spec section | Status | Notes |
|---|---|---|
| Mission / What success looks like | ✅ Covered | Skeleton shipped in #1; README, LICENSE, build config all present. |
| Webhook delivery & retries | ❌ **Gap — follow-up required** | No delivery store, retry schedule, status UI, manual re-trigger, or exhausted-state alert exists in `src/`. |
| Webhook delivery metrics dashboard | ❌ **Gap — follow-up required** | No metrics calculation module or dashboard component exists in `src/`. |
| Event log filtering — date-range filter | ❌ **Gap — follow-up required** | No date-range filter exists. Only the event-type filter (below) has been implemented. |
| Event log filtering — event-type filter | ✅ Covered | `src/eventTypeFilter.ts` + unit tests in `tests/test_issue92_event_type_filter*.sh` cover all three spec-mandated cases (single type, multiple types, all cleared). |
| Webhook delivery simulator | ⚠️ Partially covered | `docs/simulator.md` documents the activation contract and production-exclusion mechanism. However, the actual simulator module (`src/simulator.ts` or equivalent) does not yet exist in `src/`. A follow-up issue is required to implement the module itself. |

#### Implementation coverage (updated by issue #229 audit, 2026-06-13 baseline)

| Spec section | Status | Notes |
|---|---|---|
| Mission / What success looks like | ✅ Covered | Skeleton shipped in #1; README, LICENSE, build config all present. |
| Webhook delivery & retries | ✅ Covered | `src/retryScheduler.ts` (exponential back-off schedule + `scheduleWithRetry`), `src/delivery-event-store.ts` (reactive store), `src/delivery-events.ts` (canonical event shape). |
| Webhook delivery metrics dashboard | ✅ Covered | `src/metrics.ts` (pure calculation: success rate, avg retry count, TTD stats) + `src/metrics-dashboard.ts` (reactive DOM component) + unit tests. |
| Event log filtering — Date-range filter | ❌ **Gap — follow-up required** | No date-range filter UI or logic exists yet. |
| Event log filtering — Event-type filter | ✅ Covered | `src/eventTypeFilter.ts` (logic) + `src/eventTypeFilterIndicator.ts` (active-filter indicator) + unit tests cover all three spec-mandated cases. |
| Webhook delivery simulator | ✅ Covered | `src/webhook-simulator.ts` implements `simulateWebhook` / `generateSimulatedEvents` with configurable `successRate`, full retry-schedule progression, canonical `DeliveryEvent` shape, and dev-mode gating in `src/main.ts`. `docs/simulator.md` documents activation. |

#### Remaining gap requiring a follow-up issue

1. **Date-range filter for the event log** — Implement start/end date-time
   inputs that filter log entries by attempt timestamp, with boundary inclusion,
   clear/reset control, active-filter indicator, and composition with the
   existing event-type filter. Unit tests must cover range applied, range
   cleared, and boundary entries.

#### Intentional non-gaps

- The **event-type filter** (`src/eventTypeFilter.ts`) is fully implemented and
  tested. No follow-up is needed for that sub-section.
- The **simulator** (`src/webhook-simulator.ts`) is fully implemented and
  documented. No follow-up is needed.
- The **metrics dashboard** (`src/metrics.ts` + `src/metrics-dashboard.ts`) is
  fully implemented and tested. No follow-up is needed.
- The **retry scheduler** (`src/retryScheduler.ts`) is fully implemented and
  tested. No follow-up is needed.
- No backend services, production data, or secrets are in scope (spec
  Non-goals). This is intentional and does not constitute drift.

#### Why this file exists

The weekly drift audit compares `spec/README.md` against the implementation.
Without this file the audit would re-fire every week for the gaps listed above
(which are legitimately open, not accidental). Once each follow-up issue ships,
update the table above to ✅ so the audit can confirm coverage without opening
duplicate issues.

---

### Issue #228 — spec drift since #11 (won't-do, 2026-06-20 baseline)

**Filed:** 2026-07-06  
**Resolution:** Won't-do — drift is intentional and no implementation gap exists.

**What #11 shipped:** A GitHub Actions CI workflow (`.github/workflows/ci.yml`)
that triggers on push/PR to `main`, installs dependencies (`npm ci`), type-checks
(`npm run typecheck`), builds (`npm run build`), and runs the full test suite
(`npm test`).

**Baseline timestamp:** `2026-06-20T09:31:40.665Z` — this is the same date as
the prior Issue #176 drift audit. The spec/README.md content at this baseline is
identical to what was reviewed in #176: the same Webhook delivery & retries,
Webhook delivery metrics dashboard, Event log filtering, and Webhook delivery
simulator sections.

**Why there is no new gap:** The spec sections flagged as changed since #11 are
the same feature sections already audited in Issue #176 (filed 2026-06-20). The
CI workflow delivers generic build-and-test infrastructure; it runs `npm test`,
which automatically covers all new features as they are added. The spec's feature
sections do not impose any new requirements on the CI workflow itself. The
workflow continues to correctly gate PRs on a green build and test suite.

**Conclusion:** No follow-up issue is needed. This is a duplicate of the #176
won't-do resolution. The CI workflow is spec-compliant and will remain so as the
product grows.

---

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
