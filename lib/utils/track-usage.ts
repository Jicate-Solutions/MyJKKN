// ============================================
// CLIENT-SIDE USAGE TRACKING UTILITY
// ============================================
// Created: 2026-02-06
// Purpose: Fire-and-forget tracking from client-side services
// Sends events to POST /api/analytics/usage/events
// ============================================

import type { UsageEventType } from '@/types/usage-analytics';

interface TrackUsageParams {
  module: string;
  feature: string;
  eventType: UsageEventType;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget client-side usage tracking.
 * Sends a tracking event to the server API.
 * Never throws — silently ignores failures so it never disrupts the calling operation.
 *
 * @example
 * trackUsage({
 *   module: 'billing/invoices',
 *   feature: 'create_invoice',
 *   eventType: 'create',
 * });
 */
export function trackUsage(params: TrackUsageParams): void {
  try {
    // Use sendBeacon for fire-and-forget when available (survives page navigation)
    const payload = JSON.stringify({
      module: params.module,
      feature: params.feature,
      event_type: params.eventType,
      metadata: params.metadata || {},
    });

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/analytics/usage/events', blob);
    } else {
      // Fallback to fetch
      fetch('/api/analytics/usage/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Never fail
  }
}
