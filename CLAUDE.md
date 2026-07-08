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

### Issue #227 — Spec drift since #1 (audited 2026-07-07)

**Audited:** `spec/README.md` against the implementation on `main` as of the
`agent-forge/dev/issue-227` branch.

#### Summary

Issue #1 shipped a skeleton front-end. The spec has grown substantially since
then. Multiple follow-up issues have shipped features. The table below records
the **current** coverage status of every spec section.

| Spec section | Status | Notes |
|---|---|---|
| Mission / What success looks like | ✅ Covered | Skeleton (#1), README, LICENSE, build config all present. |
| Webhook delivery & retries — Retry schedule | ✅ Covered | `src/retryScheduler.ts` implements exponential back-off (immediate → 1 min → 5 min → 30 min → 2 h → 8 h) with configurable `maxAttempts`. Tests in `tests/retryScheduler*.test.ts`. |
| Webhook delivery & retries — Delivery status visibility | ✅ Covered | `src/delivery-events.ts` defines `pending / delivered / failed / exhausted`; `src/delivery-event-store.ts` stores events reactively; metrics dashboard surfaces per-event-type status. |
| Webhook delivery & retries — Manual re-trigger | ❌ **Gap — follow-up required** | No UI control exists to manually re-trigger a failed or exhausted webhook. |
| Webhook delivery & retries — Event log | ⚠️ Partially covered | `src/delivery-event-store.ts` stores events with timestamp, HTTP status, and response body excerpt. However, no rendered event-log table UI exists in `src/` or `index.html`. |
| Webhook delivery & retries — Exhausted-state alert | ❌ **Gap — follow-up required** | No prominent alert is surfaced in the UI when a webhook reaches `exhausted`. |
| Webhook delivery metrics dashboard | ✅ Covered | `src/metrics.ts` (pure calculation) + `src/metrics-dashboard.ts` (reactive DOM component) implement all required metrics: success rate, average retry count by event type, median + p95 time-to-delivery, event-type breakdown, reactive updates. Tests in `tests/metrics*.test.ts` and `tests/metrics-dashboard*.test.ts`. |
| Event log filtering — Date-range filter | ❌ **Gap — follow-up required** | No date-range filter exists in `src/`. No start/end date-time inputs, boundary logic, active-filter indicator, or filter composition with event-type/status. |
| Event log filtering — Event-type filter | ✅ Covered | `src/eventTypeFilter.ts` (pure filter logic) + `src/eventTypeFilterIndicator.ts` (active-filter indicator + clear-all DOM helper) implement all spec requirements. Tests in `tests/test_issue92_event_type_filter*.sh`, `tests/issue171*.test.ts`, and `tests/test_issue171*.sh`. |
| Webhook delivery simulator | ✅ Covered | `src/webhook-simulator.ts` (functional API: `simulateWebhook` / `generateSimulatedEvents`) and `src/webhookSimulator.ts` (class API: `WebhookSimulator`) both implement configurable `successRate`, full retry-schedule progression, and the canonical `DeliveryEvent` shape. Gated behind dev-mode flag; documented in `docs/simulator.md`. Tests in `tests/webhookSimulator*.test.ts`. |

#### Remaining gaps requiring follow-up issues

The following gaps were identified and **must each be tracked in a dedicated
issue** before this drift can be considered resolved:

1. **Manual re-trigger UI** — Add a UI control (button) on failed/exhausted
   webhook entries that allows merchants to manually re-trigger delivery. The
   retry scheduler (`src/retryScheduler.ts`) already exists; the gap is the
   UI surface.

2. **Exhausted-state alert** — When a webhook transitions to `exhausted`, the
   UI must surface a prominent alert (e.g. a banner or badge) so the merchant
   is aware without polling. The `exhausted` status is already tracked in the
   store; the gap is the alert rendering.

3. **Event log rendered UI** — A visible event-log table (or list) must be
   rendered in the page, showing each delivery attempt with its timestamp, HTTP
   status code, and response body excerpt. The store holds the data; the gap is
   the DOM component and its mount point in `index.html`.

4. **Date-range filter for the event log** — Implement start/end date-time
   inputs that filter log entries by attempt timestamp, with boundary inclusion,
   clear/reset control, active-filter indicator, and composition with the
   existing event-type filter. Unit tests must cover range applied, range
   cleared, and boundary entries.

#### Intentional non-gaps

- The **metrics dashboard** is fully implemented and tested. No follow-up needed.
- The **event-type filter** logic and indicator are fully implemented and tested.
  The gap is the rendered event-log table (gap #3 above), not the filter itself.
- The **webhook delivery simulator** is fully implemented in two complementary
  modules (`src/webhook-simulator.ts` and `src/webhookSimulator.ts`) with
  documentation in `docs/simulator.md`. No follow-up needed.
- The **retry scheduler** is fully implemented in `src/retryScheduler.ts`. No
  follow-up needed.
- No backend services, production data, or secrets are in scope (spec
  Non-goals). This is intentional and does not constitute drift.

#### Previously-recorded gaps now closed

The following gaps from the Issue #174 audit have been resolved by subsequent
issues:

| Gap (from #174) | Resolved by | Notes |
|---|---|---|
| Webhook delivery metrics dashboard | Issues #95, #97 | `src/metrics.ts` + `src/metrics-dashboard.ts` fully implemented. |
| Webhook delivery simulator module | Issues #147, #156 | `src/webhook-simulator.ts` + `src/webhookSimulator.ts` both present. |
| Retry schedule | Issue #80 (and related) | `src/retryScheduler.ts` implements the full exponential back-off schedule. |

---

### Issue #240 — Spec drift audit since PR #230 (audited 2026-07-14)

**Audited:** `spec/README.md` against the implementation on `main` as of the
`agent-forge/dev/issue-240` branch.

**Baseline:** PR #230 merged the Issue #227 drift audit (2026-07-07). That
audit recorded four open gaps. This audit checks whether those gaps have been
closed and whether the spec has changed since then.

#### Spec changes since PR #230

A line-by-line review of `spec/README.md` confirms **no wording changes** since
the Issue #227 baseline. All five spec sections (Mission, Webhook delivery &
retries, Webhook delivery metrics dashboard, Event log filtering, Webhook
delivery simulator) are identical to the text reviewed in #227.

#### Implementation changes since PR #230

The following source files were added after the #227 audit:

| File | What it implements |
|---|---|
| `src/dateRangeFilter.ts` | Date-range filter logic + DOM helpers (start/end inputs, active-filter indicator, clear-all control) |
| `tests/dateRangeFilter.test.ts` | Unit tests: range applied, range cleared, boundary entries, filter composition with event-type and status filters |
| `tests/issue143-ac-verification.test.ts` | Additional AC verification tests for the date-range filter |

#### Updated coverage table

| Spec section | Status | Notes |
|---|---|---|
| Mission / What success looks like | ✅ Covered | Skeleton (#1), README, LICENSE, build config all present. |
| Webhook delivery & retries — Retry schedule | ✅ Covered | `src/retryScheduler.ts` implements exponential back-off (immediate → 1 min → 5 min → 30 min → 2 h → 8 h) with configurable `maxAttempts`. |
| Webhook delivery & retries — Delivery status visibility | ✅ Covered | `src/delivery-events.ts` defines `pending / delivered / failed / exhausted`; `src/delivery-event-store.ts` stores events reactively; metrics dashboard surfaces per-event-type status. |
| Webhook delivery & retries — Manual re-trigger | ❌ **Gap — follow-up required** | No UI control exists to manually re-trigger a failed or exhausted webhook. The retry scheduler exists; the gap is the UI surface. |
| Webhook delivery & retries — Event log | ❌ **Gap — follow-up required** | `src/delivery-event-store.ts` stores events with timestamp, HTTP status, and response body excerpt. However, no rendered event-log table UI exists in `src/` or `index.html`. |
| Webhook delivery & retries — Exhausted-state alert | ❌ **Gap — follow-up required** | No prominent alert is surfaced in the UI when a webhook reaches `exhausted`. The `exhausted` status is tracked in the store; the gap is the alert rendering. |
| Webhook delivery metrics dashboard | ✅ Covered | `src/metrics.ts` + `src/metrics-dashboard.ts` implement all required metrics: success rate, average retry count by event type, median + p95 time-to-delivery, event-type breakdown, reactive updates. Tests in `tests/metrics*.test.ts` and `tests/metrics-dashboard*.test.ts`. |
| Event log filtering — Date-range filter | ✅ Covered | `src/dateRangeFilter.ts` implements `filterByDateRange`, `isDateRangeFilterActive`, `clearDateRangeFilter`, `renderDateRangeFilterIndicator`, and `renderDateRangeFilterInputs`. Tests in `tests/dateRangeFilter.test.ts` and `tests/issue143-ac-verification.test.ts` cover range applied, range cleared, boundary entries, and filter composition. **Gap closed since #227.** |
| Event log filtering — Event-type filter | ✅ Covered | `src/eventTypeFilter.ts` (pure filter logic) + `src/eventTypeFilterIndicator.ts` (active-filter indicator + clear-all DOM helper) implement all spec requirements. Tests in `tests/test_issue92_event_type_filter*.sh`, `tests/issue171*.test.ts`, and `tests/test_issue171*.sh`. |
| Webhook delivery simulator | ✅ Covered | `src/webhook-simulator.ts` (functional API) and `src/webhookSimulator.ts` (class API) both implement configurable `successRate`, full retry-schedule progression, and the canonical `DeliveryEvent` shape. Gated behind dev-mode flag; documented in `docs/simulator.md`. Tests in `tests/webhookSimulator*.test.ts`. |

#### Remaining gaps requiring follow-up issues

Three gaps from the Issue #227 audit remain open and **must each be tracked in
a dedicated issue** before this drift can be considered fully resolved:

1. **Manual re-trigger UI** — Add a UI control (button) on failed/exhausted
   webhook entries that allows merchants to manually re-trigger delivery. The
   retry scheduler (`src/retryScheduler.ts`) already exists; the gap is the
   UI surface. Linked to release tracker #239.

2. **Exhausted-state alert** — When a webhook transitions to `exhausted`, the
   UI must surface a prominent alert (e.g. a banner or badge) so the merchant
   is aware without polling. The `exhausted` status is already tracked in the
   store; the gap is the alert rendering. Linked to release tracker #239.

3. **Event log rendered UI** — A visible event-log table (or list) must be
   rendered in the page, showing each delivery attempt with its timestamp, HTTP
   status code, and response body excerpt. The store holds the data; the gap is
   the DOM component and its mount point in `index.html`. Linked to release
   tracker #239.

#### Gap closed since #227

| Gap (from #227) | Resolved by | Notes |
|---|---|---|
| Date-range filter for the event log | Issue #143 | `src/dateRangeFilter.ts` fully implemented with unit tests covering all spec-mandated cases. |

#### Intentional non-gaps

- The **metrics dashboard** is fully implemented and tested. No follow-up needed.
- The **event-type filter** logic and indicator are fully implemented and tested.
- The **webhook delivery simulator** is fully implemented in two complementary
  modules with documentation in `docs/simulator.md`. No follow-up needed.
- The **retry scheduler** is fully implemented in `src/retryScheduler.ts`. No
  follow-up needed.
- No backend services, production data, or secrets are in scope (spec
  Non-goals). This is intentional and does not constitute drift.

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
