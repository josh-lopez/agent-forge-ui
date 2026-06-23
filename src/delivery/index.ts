// Dependency-injection seam for the webhook delivery service.
//
// This is the ONE place that decides whether the app uses the real delivery
// mechanism or the developer-fixture simulator. UI components depend only on the
// `WebhookDeliveryService` interface and call `getWebhookDeliveryService()` —
// they contain no simulator-specific logic (AC7, AC8).
//
// Activation is controlled by the `VITE_USE_WEBHOOK_SIMULATOR` environment flag.
// Because `import.meta.env.VITE_*` values are statically replaced by Vite at
// build time, the `if (... === 'true')` guard below collapses to `if (false)`
// in production builds. The bundler then dead-code-eliminates the guarded
// dynamic `import('./simulator')`, so no simulator code reaches the production
// bundle (AC2, AC3, AC4).

import { createRealDeliveryService } from './realDeliveryService';
import type { WebhookDeliveryService } from './types';

export type { DeliveryEvent, DeliveryStatus, WebhookDeliveryService } from './types';

/** Returns true when the dev-mode simulator flag is set. */
export function isSimulatorEnabled(): boolean {
  return import.meta.env.VITE_USE_WEBHOOK_SIMULATOR === 'true';
}

function parseSuccessRate(): number | undefined {
  const raw = import.meta.env.VITE_WEBHOOK_SIMULATOR_SUCCESS_RATE;
  if (raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function parseMaxAttempts(): number | undefined {
  const raw = import.meta.env.VITE_WEBHOOK_SIMULATOR_MAX_ATTEMPTS;
  if (raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Resolve the active webhook delivery service.
 *
 * When the simulator flag is set, the simulator module is loaded via a guarded
 * dynamic import and wired with the `successRate` / `maxAttempts` configuration
 * read from the environment. When the flag is unset, this resolves immediately
 * to the real delivery service and the simulator import is tree-shaken away.
 */
export async function getWebhookDeliveryService(): Promise<WebhookDeliveryService> {
  if (isSimulatorEnabled()) {
    const { createWebhookDeliverySimulator } = await import('./simulator');
    return createWebhookDeliverySimulator({
      successRate: parseSuccessRate(),
      maxAttempts: parseMaxAttempts(),
    });
  }
  return createRealDeliveryService();
}
