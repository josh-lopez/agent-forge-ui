# Webhook delivery simulator

The webhook delivery simulator is a **client-side, developer-only** fixture that
lets you exercise every webhook delivery state (pending → failed → retrying →
delivered / exhausted) without a running backend or any real network calls. It
emits exactly the same delivery-event shape the real delivery mechanism uses, so
UI components need no special-case code.

This document explains **how to turn the simulator on in development** and **why
it never ships in a production build**. The simulator module itself (its API,
`successRate` parameter, and retry behaviour) is documented alongside the module
in `src/`.

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
