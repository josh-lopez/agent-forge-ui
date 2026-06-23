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
- **Event log filtering**: the event log must be filterable and searchable so
  merchants can quickly isolate and diagnose specific delivery issues. Supported
  filter dimensions are:
  - **Date range** — a start and end date/time picker constraining the visible
    log entries.
  - **Event type** — a selector (single or multi-select) limiting entries to one
    or more webhook event types (e.g. `payment.created`, `refund.issued`).
  - **Delivery status** — a selector limiting entries to one or more statuses
    (pending / delivered / failed / exhausted).
  Filters may be combined; the log updates in real time (or on apply) as filter
  values change. An active-filter indicator and a clear-all control must be
  present when any filter is non-default.
- **Alerting**: when a webhook reaches the exhausted state the UI surfaces a
  prominent alert so the merchant is aware without polling.

## Non-goals

- No backend services in this repo (agent-forge's control plane is separate).
- No production data or secrets.
