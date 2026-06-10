# agent-forge-ui

A small, self-contained web application that serves as a live demonstration of
agentic engineering: humans file issues describing features, and the
[agent-forge](https://github.com/Versent/agent-forge) pipeline designs, builds,
tests, and ships them as merge-ready PRs.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm (bundled with Node.js)

### Install dependencies

```bash
npm install
```

## Running the Test Suite

The project uses a shell-based test suite wired through `npm test`.

```bash
# Install dependencies first (only needed once)
npm install

# Run all tests
npm test
```

### What the tests cover

| Script | What it checks |
|---|---|
| `tests/test_license.sh` | MIT `LICENSE` file exists with correct year and copyright holder |
| `tests/test_html_lint.sh` | All authored HTML files (`index.html`, `src/**/*.html`) pass [htmlhint](https://htmlhint.com/) rules |

### HTML lint only

To run the HTML linter independently (useful during development):

```bash
npm run lint:html
```

### Lint configuration

HTML lint rules are defined in [`.htmlhintrc`](.htmlhintrc). The rules enforce
standard HTML hygiene: lowercase tag/attribute names, paired tags, unique IDs,
`<!DOCTYPE>` declaration, and a `<title>` element.

### Adding new tests

1. Create a new `tests/test_<name>.sh` script following the pattern of the
   existing scripts (use `pass`/`fail` helpers and exit non-zero on failure).
2. The `tests/run_all.sh` runner discovers and executes all `test_*.sh` files
   automatically — no registration step needed.

## Project Structure

```
.
├── .htmlhintrc          # htmlhint rules for HTML validation
├── package.json         # npm scripts and dev dependencies
├── tests/
│   ├── run_all.sh       # master test runner (invoked by npm test)
│   ├── test_license.sh  # LICENSE file checks
│   └── test_html_lint.sh# HTML lint checks
├── LICENSE              # MIT licence
└── README.md            # this file
```

## Licence

MIT © 2026 Versent — see [LICENSE](LICENSE) for details.
