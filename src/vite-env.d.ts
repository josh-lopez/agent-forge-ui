/// <reference types="vite/client" />

// Typed declaration of the project's Vite env variables. Keeping it here lets
// TypeScript understand `import.meta.env.VITE_USE_SIMULATOR` (and any future
// VITE_-prefixed flags) without `any` casts.
interface ImportMetaEnv {
  /**
   * Dev-mode toggle that activates the client-side webhook delivery simulator.
   * Set `VITE_USE_SIMULATOR=true` (e.g. in `.env.development` or on the CLI)
   * to enable it. Unset in production builds.
   */
  readonly VITE_USE_SIMULATOR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
