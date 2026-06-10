import { defineConfig } from 'vite';

// The repository name is used as the base path for GitHub Pages.
// When deploying to https://<org>.github.io/<repo>/, Vite must know
// the sub-path so that asset URLs are generated correctly.
// Override VITE_BASE at build time if you deploy to a different path:
//   VITE_BASE=/ npm run build
const base = process.env.VITE_BASE ?? '/agent-forge-ui/';

export default defineConfig({
  base,
});
