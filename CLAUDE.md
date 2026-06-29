# CLAUDE.md — Spec drift notes and milestone tracking

This file records decisions made during spec-drift audits so the same drift
does not re-trigger the weekly audit unnecessarily.

---

## Issue #174 — Spec drift audit (2026-06-04 baseline)

**Audited:** `spec/README.md` against the implementation on `main` as of the
`agent-forge/dev/issue-174` branch.

### Summary

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

### Gaps requiring follow-up issues

The following gaps were identified and **must each be tracked in a dedicated
issue** before this drift can be considered resolved:

1. **Webhook delivery & retries** — Implement a delivery event store with
   retry schedule (exponential back-off: immediate → 1 min → 5 min → 30 min →
   2 h → 8 h), per-webhook status visibility (pending / delivered / failed /
   exhausted), manual re-trigger UI, event log with timestamp/HTTP status/body
   excerpt, and exhausted-state alert.

2. **Webhook delivery metrics dashboard** — Implement a metrics calculation
   module and dashboard component showing aggregate success rate, average retry
   count (by event type), and time-to-delivery statistics (median + p95 per
   event type), with reactive updates and unit-test coverage.

3. **Date-range filter for the event log** — Implement start/end date-time
   inputs that filter log entries by attempt timestamp, with boundary inclusion,
   clear/reset control, active-filter indicator, and composition with the
   existing event-type filter. Unit tests must cover range applied, range
   cleared, and boundary entries.

4. **Webhook delivery simulator module** — Implement `src/simulator.ts` (or
   equivalent) with a `successRate` parameter, the same delivery-event shape as
   the real mechanism, full retry-schedule progression, and a
   `VITE_SIMULATOR`-gated activation path. The `docs/simulator.md` activation
   guide already exists; the module itself is missing.

### Intentional non-gaps

- The **event-type filter** (`src/eventTypeFilter.ts`) is fully implemented and
  tested. No follow-up is needed for that sub-section.
- The **simulator documentation** (`docs/simulator.md`) is complete. The
  follow-up issue (#4 above) covers only the missing implementation module.
- No backend services, production data, or secrets are in scope (spec
  Non-goals). This is intentional and does not constitute drift.

### Why this file exists

The weekly drift audit compares `spec/README.md` against the implementation.
Without this file the audit would re-fire every week for the gaps listed above
(which are legitimately open, not accidental). Once each follow-up issue ships,
update the table above to ✅ so the audit can confirm coverage without opening
duplicate issues.
