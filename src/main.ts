// Main entry point for agent-forge-ui.
//
// The static landing-page heading/tagline live in index.html; this module wires
// the runtime behaviour. Crucially, it consumes the webhook delivery layer ONLY
// through the dependency-injection seam in `src/delivery/index.ts`
// (`getWebhookDeliveryService()`) — it contains no simulator-specific logic.
//
// When the `VITE_USE_WEBHOOK_SIMULATOR` flag is set, the seam resolves to the
// client-side simulator and the UI consumes simulated delivery events (AC1).
// When the flag is unset (the production default), the seam resolves to the real
// delivery mechanism and the simulator module is tree-shaken out (AC2/AC3/AC4).
// Either way, the events have an identical shape (AC8), so the consuming code
// below needs no special-casing.

import { getWebhookDeliveryService } from './delivery';
import type { DeliveryEvent } from './delivery';

/**
 * Bootstraps the app's runtime behaviour. Resolves the active delivery service
 * through the DI seam and begins consuming delivery events. This is intentionally
 * implementation-agnostic: it works identically whether the simulator or the real
 * mechanism is active.
 */
export async function mountApp(
  onDeliveryEvent: (event: DeliveryEvent) => void = defaultEventSink,
): Promise<void> {
  const service = await getWebhookDeliveryService();
  // A representative webhook the UI starts observing on load. UI components that
  // render delivery status / event logs subscribe via this same callback.
  service.deliver('webhook-bootstrap', onDeliveryEvent);
}

/** Default event sink: log delivery events for visibility during development. */
function defaultEventSink(event: DeliveryEvent): void {
  // eslint-disable-next-line no-console
  console.debug('[delivery]', event.status, event.attempt, event.httpStatusCode);
}

// Auto-mount when running in a browser document. Guarded so importing this
// module from tests (no DOM bootstrap desired) does not trigger delivery.
if (typeof document !== 'undefined') {
  void mountApp();
}
