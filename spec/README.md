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

## Webhook delivery metrics dashboard

The UI must include a metrics dashboard component that gives merchants an
at-a-glance view of aggregate delivery reliability, without requiring them to
scan the full event log.

### Requirements

- **Aggregate success rate**: the dashboard displays the overall delivery
  success rate (percentage of attempts that reached `delivered`) across all
  event types, updated reactively as new delivery events arrive.
- **Average retry count**: the dashboard shows the mean number of retry
  attempts per webhook, broken down by event type, so merchants can identify
  event types that are disproportionately unreliable.
- **Time-to-delivery stats**: the dashboard surfaces time-to-delivery
  statistics (e.g. median and 95th-percentile) per event type, measured from
  the initial delivery attempt to the first successful delivery.
- **Event-type breakdown**: all metrics are presented both as an overall
  aggregate and segmented by event type in a single, scannable view.
- **Reactive updates**: metrics recalculate automatically whenever the
  underlying delivery-event data changes (e.g. a new attempt is logged or a
  webhook transitions state); no manual refresh is required.
- **Simulator compatibility**: the dashboard works correctly with data produced
  by the webhook delivery simulator so developers can exercise all metric states
  without a live backend.
- **Test coverage**: unit tests cover correct calculation of success rate,
  average retry count, and time-to-delivery for a representative fixture
  dataset, including edge cases (zero deliveries, 100 % failure, single
  attempt).

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

### Event-type filter

- **Control**: a multi-select (or equivalent) control lists all event types
  present in the log (e.g. `payment.created`, `refund.issued`).
- **Filtering behaviour**: selecting one or more event types limits the visible
  log entries to those whose event type matches the selection.
- **Clear / reset**: deselecting all types, or choosing "All", restores the full
  unfiltered view for this dimension.
- **Active-filter indicator**: while a non-default selection is active, a
  visible indicator confirms the filter is active; a clear-all control removes
  it in one action.
- **Filter composition**: the event-type filter works correctly in combination
  with date-range and status filters.
- **Test coverage**: unit tests cover single type selected, multiple types
  selected, and all types cleared.

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
