# agent-forge-ui

A small, self-contained web application that serves as a live demonstration of
agentic engineering: humans file issues describing features, and the
[agent-forge](https://github.com/Versent/agent-forge) pipeline designs, builds,
tests, and ships them as merge-ready PRs.

## Prerequisites

- [Node.js](https://nodejs.org/) **v20 or later**
- npm (bundled with Node.js)

## Getting started

```bash
# Install dependencies
npm ci

# Start the local development server (http://localhost:5173)
npm run dev
```

## Available scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the Vite development server with hot-module reload |
| `npm run build` | Type-check and produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally for smoke-testing |
| `npm run typecheck` | Run TypeScript type-checking without emitting files |

## Deployment

The application is deployed to **GitHub Pages** at:

```
https://<org>.github.io/agent-forge-ui/
```

### Automatic deployment (CI/CD)

A GitHub Actions workflow (`.github/workflows/deploy.yml`) handles deployment
automatically:

1. Every push to the `main` branch triggers the workflow.
2. The workflow installs dependencies, runs `npm run build`, and uploads the
   `dist/` directory as a GitHub Pages artifact.
3. The artifact is then deployed to GitHub Pages.
4. Only one deployment runs at a time; a new push cancels any in-progress run.

No secrets or tokens need to be configured — the workflow uses the built-in
`GITHUB_TOKEN` via the `id-token: write` permission.

### Enabling GitHub Pages (one-time repository setup)

Before the first automatic deployment you must enable GitHub Pages in the
repository settings:

1. Go to **Settings → Pages** in the GitHub repository.
2. Under **Source**, select **GitHub Actions**.
3. Save. The next push to `main` will trigger a deployment.

### Manual deployment (from your local machine)

If you need to deploy without CI, follow these steps:

```bash
# 1. Install dependencies
npm ci

# 2. Build the production bundle
#    The output is written to dist/
npm run build

# 3. (Optional) Smoke-test the build locally before deploying
npm run preview

# 4. Deploy the dist/ directory to GitHub Pages using the gh-pages CLI tool
#    Install it once: npm install -g gh-pages
gh-pages -d dist
```

> **Note:** The `gh-pages` CLI pushes the contents of `dist/` to the
> `gh-pages` branch. Make sure GitHub Pages is configured to serve from that
> branch (Settings → Pages → Source → Deploy from a branch → `gh-pages`).

### Build output

| Path | Description |
|---|---|
| `dist/` | Production build output — the directory served by GitHub Pages |
| `dist/index.html` | Entry point |
| `dist/assets/` | Hashed JS/CSS bundles |

### Base URL configuration

Vite is configured with `base: '/agent-forge-ui/'` so that all asset URLs are
correct when served from the GitHub Pages sub-path. If you fork this repo or
deploy to a different path, override the base at build time:

```bash
VITE_BASE=/ npm run build          # deploy to root (e.g. custom domain)
VITE_BASE=/my-fork/ npm run build  # deploy to a different sub-path
```

## Project structure

```
.
├── src/              # Application source (TypeScript)
├── public/           # Static assets copied verbatim to dist/
├── index.html        # Vite entry-point HTML
├── vite.config.ts    # Vite configuration (base path, plugins)
├── tsconfig.json     # TypeScript compiler options
├── package.json      # npm scripts and dev dependencies
└── .github/
    └── workflows/
        └── deploy.yml  # GitHub Actions: build + deploy to GitHub Pages
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on proposing changes and
opening pull requests.

## Licence

[MIT](LICENSE) © 2026 Versent
