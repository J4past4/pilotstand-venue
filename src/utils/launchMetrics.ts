export type ClientMetricEvent =
  | 'stand_created'
  | 'template_used'
  | 'brief_exported'
  | 'png_exported'
  | 'json_exported'
  | 'estimate_viewed'
  | 'quote_requested'
  | 'supplier_inquiry';

export interface ClientMetricPayload {
  event: ClientMetricEvent;
  estimatedTotalGbp?: number;
  standAreaM2?: number;
  categories?: string[];
}

let metricsEndpointAvailable = true;

/**
 * Fire-and-forget anonymous demand telemetry used to measure total BOM volume
 * and top requested equipment categories for supplier partnerships.
 */
export function trackLaunchMetric(payload: ClientMetricPayload): void {
  if (!metricsEndpointAvailable || typeof fetch === 'undefined') return;
  try {
    void fetch('/api/metrics', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    })
      .then((resp) => {
        if (resp.status === 404) {
          metricsEndpointAvailable = false;
        }
      })
      .catch(() => {
        // Silently ignore telemetry network errors
      });
  } catch {
    // Ignore
  }
}
