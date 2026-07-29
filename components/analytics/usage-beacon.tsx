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

/** Last path beaconed + when, so a REMOUNT of the same path doesn't double-count. */
const LAST_KEY = 'jkkn.usageBeacon.last';

// A remount resets any in-memory ref, so the ref alone cannot deduplicate.
// MyJKKN's login lands on /dashboard and then reloads it with a `?v=<ts>`
// cache-buster — a full remount of the SAME path ~2s later. Verified against
// production on 2026-07-26: that wrote two `dashboard` page_visit rows per
// login, which would inflate the dashboard against every other module in
// exactly the comparison this feature exists to support.
//
// 10s is long enough to absorb a cache-buster reload or a double-submit, short
// enough that genuine re-visits still count. Deliberate trade-off: a user who
// leaves a module and returns within 10s is counted once.
const DEDUPE_WINDOW_MS = 10_000;

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

/** True when this exact path was already beaconed inside the dedupe window. */
function isDuplicate(pathname: string): boolean {
  try {
    const raw = sessionStorage.getItem(LAST_KEY);
    if (!raw) return false;
    const sep = raw.indexOf('|');
    if (sep < 0) return false;
    const at = Number(raw.slice(0, sep));
    // Everything after the FIRST separator is the path, so a '|' inside a
    // pathname parses correctly.
    const path = raw.slice(sep + 1);
    if (!Number.isFinite(at)) return false;
    const age = Date.now() - at;
    // age < 0 means the stored stamp is in the future — the clock jumped
    // backward (NTP correction, manual change). Without the `age >= 0` guard
    // a negative age reads as "within the window" and silently drops every
    // view of that path until the clock catches up. Treat it as not-duplicate
    // and let markSent() below restamp it.
    return path === pathname && age >= 0 && age < DEDUPE_WINDOW_MS;
  } catch {
    // Storage blocked — fall back to the in-memory ref only.
    return false;
  }
}

function markSent(pathname: string): void {
  try {
    sessionStorage.setItem(LAST_KEY, `${Date.now()}|${pathname}`);
  } catch {
    // Ignore.
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
    // Survives remounts, which the ref above does not.
    if (isDuplicate(pathname)) return;

    lastSent.current = pathname;
    markSent(pathname);

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
