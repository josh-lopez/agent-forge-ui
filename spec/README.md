# agent-forge-ui — product spec

The demonstration web UI built by agent-forge. Read by the BA agent to ground
backlog work in the product's purpose.

## Mission

A small, self-contained web application that serves as a live demonstration of
agentic engineering: humans file issues describing features, and the agent-forge
pipeline designs, builds, tests, and ships them as merge-ready PRs.

## What success looks like

- A working, deployable front-end with a clear, simple structure.
- Each shipped change is small, tested, and reviewable.
- Standard project hygiene (README, licence, sensible build config).
- Merchants receive critical payment events reliably via webhook delivery with
  automatic retries, reducing reconciliation errors and support tickets.
- Payment flow failures are diagnosable in minutes, not hours, via complete
  request visibility through distributed tracing.

## Webhook delivery & retries

The UI must surface — and the underlying delivery mechanism must implement —
real-time transaction webhook delivery with automatic retries.

### Requirements

- **Retry schedule**: failed webhook deliveries are retried on an exponential
  back-off schedule (e.g. immediately, then 1 min, 5 min, 30 min, 2 h, 8 h)
  up to a configurable maximum attempt count.
- **Delivery status visibility**: the UI shows per-webhook delivery status
  (pending / delivered / failed / exhausted) so merchants can monitor events
  without raising support tickets.
- **Manual re-trigger**: merchants can manually re-trigger a failed or exhausted
  webhook from the UI.
- **Event log**: each delivery attempt is logged with timestamp, HTTP status
  code, and response body excerpt, visible in the UI.
- **Alerting**: when a webhook reaches the exhausted state the UI surfaces a
  prominent alert so the merchant is aware without polling.

## Event log filtering

The event log must be filterable so merchants can quickly locate relevant
delivery attempts without scrolling through the full history.

### Date-range filter

- **Inputs**: a start date-time input and an end date-time input are rendered
  above (or alongside) the event log.
- **Immediate filtering**: selecting a range immediately (or on "Apply") hides
  log entries whose attempt timestamp falls outside the selected start and end
  date-times; boundary entries (exactly equal to start or end) are included.
- **Clear / reset**: clearing both inputs restores the full unfiltered log.
- **Active-filter indicator**: while a date range is set, a visible indicator
  confirms the filter is active; a clear-all control removes the range in one
  action.
- **Filter composition**: the date-range filter works correctly in combination
  with event-type and status filters.
- **Test coverage**: unit tests cover range applied, range cleared, and boundary
  entries included/excluded.

## Distributed tracing for payment flows

To reduce mean-time-to-resolution for payment failures, every payment flow must
be instrumented with distributed tracing that gives complete request visibility
across the UI and its simulated delivery mechanism.

### Requirements

- **Trace propagation**: each payment flow (webhook dispatch, retry attempt,
  manual re-trigger) is assigned a unique trace ID that is propagated through
  every step of that flow and included in all related event log entries.
- **Span instrumentation**: key operations within a payment flow — initial
  dispatch, each retry attempt, status transitions, and final resolution — are
  recorded as individual spans with start time, duration, and outcome.
- **Trace viewer**: the UI includes a trace viewer panel where a merchant or
  developer can select a trace ID (from the event log or by direct entry) and
  see the full ordered span timeline for that payment flow.
- **Error highlighting**: spans that represent a failure (non-2xx HTTP status or
  exhausted state) are visually distinguished in the trace viewer to allow rapid
  identification of the failure point.
- **Correlation with event log**: clicking a span in the trace viewer filters
  the event log to show only entries belonging to that trace, and clicking an
  event log entry highlights its corresponding span in the trace viewer.
- **Simulator compatibility**: the webhook delivery simulator emits trace IDs
  and span data using the same shape as the real delivery mechanism, so the
  trace viewer works identically in dev and production modes.
- **No external dependencies**: tracing is implemented client-side; it must not
  call any external tracing back-end or require a running backend service.
- **Test coverage**: unit tests cover trace ID propagation, span recording, and
  the correlation between the event log and the trace viewer.

## Webhook delivery simulator (developer fixture)

To enable UI development and testing without external services, the repo must
include a client-side webhook delivery simulator.

### Requirements

- **Configurable success/failure rate**: the simulator accepts a `successRate`
  parameter (0.0–1.0) that controls the probability each simulated delivery
  attempt succeeds.
- **Event emission**: the simulator emits the same delivery-event shape used by
  the real delivery mechanism (status, timestamp, HTTP status code, response
  body excerpt) so UI components need no special-case code.
- **Retry flow coverage**: the simulator progresses through the full retry
  schedule (see Retry schedule above), emitting intermediate `failed` events
  before eventually resolving to `delivered` or `exhausted`, allowing developers
  to exercise every UI state.
- **Developer ergonomics**: the simulator is importable as a standalone module
  and can be activated via a documented environment flag or dev-mode toggle,
  with no impact on production builds.
- **No external dependencies**: the simulator is entirely client-side; it must
  not call any real endpoints or require a running backend.

## Non-goals

- No backend services in this repo (agent-forge's control plane is separate).
- No production data or secrets.
- No external tracing back-ends (e.g. Jaeger, Zipkin, Datadog); all tracing
  instrumentation is client-side and self-contained.
