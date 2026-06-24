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
- Payment state is derived from an immutable event log, enabling complete audit
  trails, precise reconciliation, and replay capability for investigating
  discrepancies.

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

## Event sourcing for payment state

Payment state must be managed using an event-sourcing pattern: the current state
of any payment is derived by replaying an ordered, append-only sequence of
immutable domain events rather than by mutating a single record in place.

### Requirements

- **Immutable event store**: all payment state changes are recorded as discrete,
  timestamped, immutable events (e.g. `PaymentInitiated`, `PaymentAuthorised`,
  `PaymentCaptured`, `PaymentFailed`, `PaymentRefunded`). No event may be
  deleted or mutated after it is written.
- **State derivation**: current payment state is computed by reducing (replaying)
  the ordered event sequence for a given payment; no separate mutable state
  record is the source of truth.
- **Replay capability**: the event store exposes a replay function that accepts
  an optional end-timestamp or sequence number, allowing developers and support
  staff to reconstruct payment state at any point in time for discrepancy
  investigation.
- **Audit trail**: the full event history for a payment is accessible in the UI,
  showing event type, timestamp, and relevant payload fields, so merchants and
  support staff have a complete audit trail without raising tickets.
- **Reconciliation support**: because state is derived from events, the UI can
  surface a reconciliation view that lists all events for a date range, enabling
  precise matching against external records.
- **Event schema**: each event carries at minimum: `eventId` (UUID), `paymentId`,
  `eventType`, `occurredAt` (ISO-8601), and a `payload` object containing
  event-specific fields. The schema must be documented in the repo.
- **Test coverage**: unit tests cover state derivation from a sequence of events,
  replay to a past point in time, and correct rejection of any attempt to mutate
  or delete an existing event.

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
