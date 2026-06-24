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
- Duplicate charges from retried payment requests are prevented, reducing
  revenue leakage and customer disputes.

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

## Idempotency keys for payment requests

To prevent duplicate charges caused by retried or replayed payment requests,
every payment request must carry an idempotency key.

### Requirements

- **Key generation**: a unique idempotency key (e.g. a UUID v4) is generated
  client-side for each new payment request before it is submitted.
- **Key attachment**: the key is attached to the payment request payload (e.g.
  as an `idempotencyKey` field) so that the receiving service can detect and
  deduplicate repeated submissions of the same request.
- **Retry reuse**: when a payment request is retried (e.g. after a network
  error or timeout), the same idempotency key from the original attempt is
  reused — a new key must not be generated for a retry of the same logical
  request.
- **UI visibility**: the idempotency key for each payment request is shown in
  the payment detail / event log view so merchants and support staff can
  cross-reference it with backend records.
- **Duplicate detection feedback**: if the UI receives a duplicate-detected
  response (e.g. HTTP 409 or an equivalent signal from the simulator), it
  surfaces a clear, non-error informational message explaining that the request
  was already processed and no charge was made.
- **Simulator support**: the webhook delivery simulator generates and attaches
  idempotency keys for all simulated payment requests, and can simulate a
  duplicate-detected response to exercise the feedback UI state.
- **Test coverage**: unit tests cover key generation, retry reuse of the same
  key, and the duplicate-detected feedback path.

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
