# agent-forge-ui

A demonstration web UI built by [agent-forge](https://github.com/versent/agent-forge). This project serves as a live showcase of agentic engineering: humans file issues describing features, and the agent-forge pipeline designs, builds, tests, and ships them as merge-ready pull requests.

## Project Purpose

agent-forge-ui is a small, self-contained front-end application that demonstrates the agent-forge workflow in action. It is not a production service, but rather a reference implementation showing how the agent-forge pipeline can autonomously deliver working, tested, and reviewable code changes.

## Project Structure

```
.
├── src/                    # Application source code (TypeScript)
├── spec/                   # Product specification and requirements
├── tests/                  # Test scripts and test utilities
├── .agent-forge/           # Agent-forge configuration and metadata
├── package.json            # Node.js project configuration and dependencies
├── vite.config.ts          # Vite build tool configuration
├── tsconfig.json           # TypeScript compiler configuration
├── index.html              # Application entry point
├── style.css               # Global stylesheet
├── LICENSE                 # MIT License
├── CONTRIBUTING.md         # Contribution guidelines
└── README.md               # This file
```

## Prerequisites

To run this project locally, you'll need:

- **Node.js** — see the `engines` field in `package.json` for the minimum required version
- **npm** — bundled with Node.js

Check your versions:
```bash
node --version
npm --version
```

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

This installs all required dependencies listed in `package.json`.

### 2. Run the Development Server

```bash
npm run dev
```

This starts a local development server (typically at `http://localhost:5173` with Vite). The application will automatically reload when you make changes to the source code.

### 3. Build for Production

```bash
npm run build
```

This creates an optimized production build in the `dist/` directory. The build output is ready for deployment to a static hosting service.

### 4. Preview the Production Build Locally

```bash
npm run preview
```

This serves the production build locally so you can verify it works before deploying.

## Development Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes in the `src/` directory.

3. Test your changes locally using the development server.

4. Commit your changes with clear, descriptive messages.

5. Push your branch and open a pull request for review.

For detailed contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

### Webhook delivery metrics export

The metrics dashboard includes an **Export** control that lets you download the
current webhook reliability snapshot directly from the browser — no backend
call is made.

Two formats are supported:

| Button | Format | MIME type | Filename pattern |
|---|---|---|---|
| **Export CSV** | RFC 4180 CSV | `text/csv` | `webhook-metrics-<timestamp>.csv` |
| **Export JSON** | Pretty-printed JSON | `application/json` | `webhook-metrics-<timestamp>.json` |

**CSV layout** — one header row followed by one row for the overall aggregate
(`eventType = "overall"`) and one row per event type. Columns:
`eventType`, `successRate`, `avgRetryCount`, `medianTtdMs`, `p95TtdMs`.
Numeric values are rounded to four decimal places.

**JSON layout** — mirrors the in-memory `MetricsSnapshot` shape:
`exportedAt` (ISO-8601), `overall` aggregate, and a `byEventType` array.

The download is triggered by a `<a download>` click on a `Blob` URL and works
in all modern browsers. The exported file captures the snapshot at the moment
the button is clicked, so repeated exports reflect the latest live data.

### Webhook delivery simulator (dev only)

During development you can activate a client-side webhook delivery simulator to
exercise every delivery state without a backend. It is gated behind the
`VITE_SIMULATOR` flag and is excluded from production builds, so it adds no
bytes to the shipped bundle and makes no real network calls. To enable it:

```bash
VITE_SIMULATOR=true npm run dev
```

See [docs/simulator.md](docs/simulator.md) for the full activation guide and an
explanation of how it is kept out of production builds.

## Testing

### Running tests

Run the full test suite from the repository root:

```bash
npm test
```

This runs the [Vitest](https://vitest.dev/) unit-test suite (in a `jsdom`
browser-like environment) followed by the legacy shell-based checks in the
`tests/` directory. The command exits non-zero if any test fails, which is what
the CI pipeline gates on.

Vitest reuses the project's `vite.config.ts` (via `vitest.config.ts`), so path
aliases and Vite-specific imports resolve the same way they do in the app build.

To run only the Vitest unit tests, or to re-run them automatically on file
changes during development:

```bash
npm run test:unit    # single Vitest run
npm run test:watch   # watch mode
```

Vitest unit tests live alongside the shell tests under `tests/` and use the
`*.test.ts` / `*.spec.ts` naming convention.

## Deployment

The application is deployed to **GitHub Pages** as a project site, served from
`https://<owner>.github.io/<repo>/` (for this repository, the path segment is
`/agent-forge-ui/`). Deployment is fully automated by a GitHub Actions
workflow — no manual upload or third-party account is required, and no deploy
tokens or secrets are stored in the repository (the built-in `GITHUB_TOKEN` is
used).

### How it works

- The workflow at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
  runs on every push to `main` (and can be triggered manually from the Actions
  tab via **Run workflow**).
- It installs dependencies, runs `npm run build`, and uploads the contents of
  the `dist/` directory (Vite's production build output) as a Pages artifact.
- A separate `deploy` job publishes that artifact to GitHub Pages. Because
  `deploy` declares `needs: build`, the site is only published when the build
  succeeds — a failing build aborts the deploy.
- During the Pages build the workflow sets the `VITE_BASE` environment variable
  to `/<repo>/` so Vite emits asset URLs under the project-site sub-path. Local
  `npm run dev` and `npm run build` default `base` to `/`, so local development
  and preview are unaffected.

### One-time setup (repository maintainer)

GitHub Pages must be configured to deploy from GitHub Actions before the first
deploy will go live:

1. In the repository on GitHub, open **Settings → Pages**.
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. Push to `main` (or trigger the **Deploy to GitHub Pages** workflow manually
   from the **Actions** tab). The workflow builds and publishes the site.
4. Once the `deploy` job finishes, the public URL appears in the workflow run
   summary and under **Settings → Pages** (e.g.
   `https://<owner>.github.io/agent-forge-ui/`).

### Deploying a one-off build manually

If you need to build and publish from your machine instead of CI, build with the
correct base path so asset URLs resolve correctly:

Build with the GitHub Pages sub-path:

```bash
VITE_BASE="/agent-forge-ui/" npm run build
```

The deployable site is now in `./dist`.

Then upload the contents of `dist/` to your static host. For any non-Pages
static host (Netlify, Vercel, S3 + CloudFront, etc.), set the build command to
`npm run build`, the publish/output directory to `dist`, and the base path to
`/` (the default) since those hosts serve from the domain root.

## Non-Goals

This repository focuses solely on the front-end UI. The following are explicitly out of scope:

- Backend services (the agent-forge control plane is maintained separately)
- Production data or secrets
- Internal agent-forge pipeline documentation (see the main agent-forge repository for that)

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Questions or Issues?

- Check the [spec/README.md](spec/README.md) for product requirements and design decisions.
- Review [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.
- Open an issue on GitHub to report bugs or request features.
