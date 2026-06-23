/// <reference types="vite/client" />

// Typed environment variables exposed to client code by Vite. Only `VITE_`-
// prefixed variables are exposed; using a non-prefixed name would silently be
// `undefined` at runtime.
interface ImportMetaEnv {
  /**
   * When set to the string `"true"`, the app swaps the real webhook delivery
   * mechanism for the client-side simulator (developer fixture). See
   * `src/delivery/index.ts`.
   */
  readonly VITE_USE_WEBHOOK_SIMULATOR?: string;
  /** Simulator success probability, "0.0"–"1.0". Defaults to 0.5. */
  readonly VITE_WEBHOOK_SIMULATOR_SUCCESS_RATE?: string;
  /** Maximum simulated delivery attempts before `exhausted`. */
  readonly VITE_WEBHOOK_SIMULATOR_MAX_ATTEMPTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
