'use client';

// ============================================================================
// USAGE BEACON — the missing client half of the usage-tracking substrate.
//
// Created: 2026-07-26
//
// CONTEXT: `usage_events`, `module_usage_daily`, `feature_usage_summary`,
// `institution_health_scores`, the `compute_*` rollup RPCs, the
// `UsageTrackingService`, and `POST /api/analytics/usage/events` have all been
// live since 2026-02-06.
//
// What DOES write today: the endpoint's explicit mode ({module,feature,
// event_type}), from 16 `trackUsage()` call sites in 6 services — billing
// invoices + receipts, academic attendance + timetables, learner profiles,
// exports. So `usage_events` holds create/update/delete/export rows for those
// six areas and nothing else.
//
// What NEVER wrote: page visits. `UsageTrackingService.trackPageVisit`'s own
// docstring says "Called from the browser via POST /api/analytics/usage/events"
// — but no browser code ever called it. Without page visits, adoption of a
// module is invisible unless someone happens to write data in it, so every
// read-mostly module reads as zero.
//
// This component is that caller. One mount in `app/(routes)/layout.tsx` covers
// every page under the authenticated shell — present and future — instead of
// the per-handler `withUsageTracking` wrapper, which after five months had been
// applied to 1 of 1,612 API routes because adopting it means editing them all.
//
// SAFETY
//   - Fire-and-forget. Never blocks render, never surfaces an error to the user.
//   - Server-gated: the endpoint refuses to write while the platform policy
//     `analytics.usage_beacon.enabled` is false. This component is not the
//     kill switch and must not be trusted as one.
//   - While dark, the server's answer is cached in sessionStorage so the beacon
//     costs one request per session rather than one per navigation.
// ============================================================================

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/** Set once the server tells us tracking is off, to stop beaconing this session. */
const DISABLED_KEY = 'jkkn.usageBeacon.disabled';

function isDisabledForSession(): boolean {
  try {
    return sessionStorage.getItem(DISABLED_KEY) === '1';
  } catch {
    // Private mode / storage blocked — fall through and just beacon.
    return false;
  }
}

function markDisabledForSession(): void {
  try {
    sessionStorage.setItem(DISABLED_KEY, '1');
  } catch {
    // Ignore — worst case we beacon again next navigation.
  }
}

export function UsageBeacon() {
  const pathname = usePathname();
  // Guards React's double-invoked effects in dev and any same-path re-render.
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (lastSent.current === pathname) return;
    if (isDisabledForSession()) return;

    lastSent.current = pathname;

    // `url` is the only field Mode 1 of the endpoint needs; it does the
    // module mapping server-side via mapUrlToModule() so the client never
    // decides what a module is.
    fetch('/api/analytics/usage/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: pathname }),
      keepalive: true,
    })
      .then(async (res) => {
        if (!res.ok) {
          // 401 on a logged-out shell, 5xx on a bad day — either way, stop
          // retrying for this session rather than beaconing every navigation.
          markDisabledForSession();
          return;
        }
        const body = (await res.json().catch(() => null)) as
          | { tracked?: boolean }
          | null;
        // Explicit `tracked: false` means the policy is dark. Stand down.
        if (body && body.tracked === false) markDisabledForSession();
      })
      .catch(() => {
        // Offline or aborted navigation. Silent by design.
      });
  }, [pathname]);

  return null;
}
