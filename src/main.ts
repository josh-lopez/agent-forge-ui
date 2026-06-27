// Main entry point for agent-forge-ui
// The heading is now in index.html for static rendering

import { DeliveryEventStore } from './DeliveryEventStore.ts';
import { ExhaustedAlert } from './ExhaustedAlert.ts';

/**
 * Mount the application.
 *
 * Wires up the shared DeliveryEventStore and attaches the ExhaustedAlert
 * component to the #exhausted-alerts container in index.html.
 */
export function mountApp(): void {
  const store = new DeliveryEventStore();

  const alertContainer = document.getElementById('exhausted-alerts');
  if (alertContainer) {
    new ExhaustedAlert(alertContainer, store);
  }

  // Expose the store on window so the simulator and other dev tools can push
  // events without requiring a module import (dev ergonomics).
  (window as unknown as Record<string, unknown>)['__deliveryStore'] = store;
}
