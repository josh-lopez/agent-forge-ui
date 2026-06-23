// The real webhook delivery mechanism.
//
// NOTE: building/modifying the real delivery mechanism is out of scope for this
// issue (#80). This module is the production-default implementation that the DI
// seam resolves to when the simulator flag is NOT set. The actual network/retry
// machinery is provided by the webhook-delivery work tracked separately; here we
// only expose the stable `WebhookDeliveryService` contract so the dev-mode swap
// has a concrete production counterpart to replace.

import type {
  DeliveryEventListener,
  WebhookDeliveryService,
} from './types';

class RealDeliveryService implements WebhookDeliveryService {
  deliver(webhookId: string, listener: DeliveryEventListener): void {
    // The concrete real-delivery implementation lives in the delivery
    // mechanism work (out of scope here). It would perform real HTTP delivery
    // with the exponential back-off retry schedule and emit DeliveryEvents to
    // `listener`. We keep a no-op stub so production builds compile and the DI
    // seam is type-complete.
    void webhookId;
    void listener;
  }
}

/** Factory for the production delivery service. */
export function createRealDeliveryService(): WebhookDeliveryService {
  return new RealDeliveryService();
}
