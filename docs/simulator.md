# Webhook delivery simulator

The webhook delivery simulator is a **client-side, developer-only** fixture that
lets you exercise every webhook delivery state (pending → failed → retrying →
delivered / exhausted) without a running backend or any real network calls. It
emits exactly the same delivery-event shape the real delivery mechanism uses, so
UI components need no special-case code.

This document explains **how to turn the simulator on in development**, **why
it never ships in a production build**, and **how to configure the simulator**
via its `SimulatorConfig` API.

## Configuration

The simulator is created with a `SimulatorConfig` object. The only required
field is `successRate`; all other fields are optional.

```ts
import { WebhookSimulator } from './src/webhookSimulator';

const sim = new WebhookSimulator({ successRate: 0.8 });

for await (const event of sim.deliver('wh_1', 'payment.created')) {
  console.log(event.status, event.attempt);
}
```

### `SimulatorConfig` fields

| Field | Type | Required | Description |
|---|---|---|---|
| `successRate` | `number` | **Yes** | Probability (0.0–1.0) that each individual delivery attempt succeeds. `1.0` → always delivered; `0.0` → always exhausted. Values outside [0.0, 1.0] are silently clamped. |
| `maxAttempts` | `number` | No | Maximum delivery attempts before the webhook is marked `exhausted`. Defaults to **6** (matches the spec retry schedule). |
| `retryDelaysMs` | `number[]` | No | Back-off delays in milliseconds between attempts. Defaults to `[0, 60_000, 300_000, 1_800_000, 7_200_000, 28_800_000]` (immediate, 1 min, 5 min, 30 min, 2 h, 8 h). Pass all-zero arrays in tests to avoid real waits. |
| `rng` | `() => number` | No | Random-number generator returning a value in [0, 1). Defaults to `Math.random`. Pass a seeded function for deterministic tests. |

### `DeliveryEvent` shape

Each `deliver()` call yields `DeliveryEvent` objects with the following fields:

| Field | Type | Description |
|---|---|---|
| `webhookId` | `string` | Unique identifier for the webhook. |
| `eventType` | `string` | Event type (e.g. `"payment.created"`). |
| `status` | `"pending" \| "delivered" \| "failed" \| "exhausted"` | Outcome of this attempt. |
| `timestamp` | `string` | ISO-8601 timestamp of the attempt. |
| `httpStatus` | `number` | HTTP status code (200 on success, 500 on failure, 0 if no response). |
| `responseExcerpt` | `string` | First 200 characters of the response body (empty string if none). |
| `attempt` | `number` | 1-based attempt number. |

The event shape is identical to what the real delivery mechanism emits, so UI
components require no special-case code for simulator vs. live traffic.

## Activation

The simulator is activated by a single Vite environment flag:

```
VITE_SIMULATOR=true
```

This follows the same `VITE_`-prefixed convention already used elsewhere in the
project (for example `VITE_BASE`). Only variables prefixed with `VITE_` are
exposed to client code by Vite, so the flag is read in app code via
`import.meta.env.VITE_SIMULATOR`.

When the flag is unset (or any value other than `true`) the simulator stays
inert and the app behaves as it would against a live backend.

### Enable it for local development

You have two equivalent options.

**Option A — inline on the command line** (one-off, nothing to commit):

```bash
VITE_SIMULATOR=true npm run dev
```

**Option B — a local dotenv file** (persisted for your machine only):

Create a Vite local-environment file in the repository root and add the flag:

```
# this file is git-ignored and never committed
VITE_SIMULATOR=true
```

Then start the dev server as usual:

```bash
npm run dev
```

Vite automatically loads local environment files in development. Use the
`*.local` variant so the file is git-ignored and your toggle never leaks into
the repository or another developer's checkout.

### Dev-mode auto-detection (optional)

Because the simulator is purely a development aid, app code may also gate it on
Vite's built-in development flag, `import.meta.env.DEV`, which is `true` during
`npm run dev` and `false` for `npm run build`. Combining the two — for example
"activate when `import.meta.env.DEV` **and** `VITE_SIMULATOR === 'true'`" — keeps
the explicit toggle while guaranteeing the code path can never run in a
production build.

## Exclusion from production builds

The simulator is excluded from production bundles by a **build-time
environment guard combined with tree-shaking**:

- Vite statically replaces `import.meta.env.DEV` with `false` and
  `import.meta.env.VITE_SIMULATOR` with its build-time value when it produces a
  production bundle (`npm run build`).
- With the guard condition evaluating to a constant `false`, Rollup's
  tree-shaking removes the now-unreachable simulator branch — **and the
  simulator module it imports** — from the output.

As a result:

- **No extra bytes.** The simulator code is not present in the production
  bundle, so it adds nothing to the shipped JavaScript payload.
- **No real endpoint calls.** The simulator never calls a real endpoint in any
  build; in production its code is not even included to run.

Because the toggle defaults to *off*, a plain `npm run build` (the command CI
and the GitHub Pages deploy use) produces a production bundle with the simulator
fully excluded — no special build flags are required.
