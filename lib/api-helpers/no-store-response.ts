// lib/api-helpers/no-store-response.ts
//
// Helpers for returning authenticated, per-user API responses that must NEVER
// be cached by a browser, the Serwist service worker, or any intermediary.
//
// Why this exists (2026-06-03 — admission-leads cross-counselor leak):
// app/sw.ts used to run a NetworkFirst runtime cache over every /api/* response,
// keyed by URL only (no auth/Vary awareness). When the (slow) leads list tripped
// the 10s network-first timeout, the service worker served a STALE/FOREIGN cached
// body — one counselor saw another counselor's leads on hard refresh. The
// load-bearing fix is the NetworkOnly rule for /api/* in app/sw.ts (Serwist
// NetworkFirst ignores Cache-Control). These headers are defense-in-depth so that
// even a future/legacy SW, a CDN, or a shared-browser back/forward cache cannot
// retain a per-user body. Apply to EVERY response (success and error alike).

import { NextResponse } from 'next/server';

export const NO_STORE_HEADERS: Record<string, string> = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  Vary: 'Cookie',
};

/**
 * Drop-in replacement for NextResponse.json() that always attaches the
 * private/no-store headers. Signature mirrors the subset of NextResponse.json
 * used by the leads routes: jsonNoStore(body) and jsonNoStore(body, { status }).
 */
export function jsonNoStore(
  data: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): NextResponse {
  return NextResponse.json(data as never, {
    status: init?.status,
    headers: { ...NO_STORE_HEADERS, ...(init?.headers ?? {}) },
  });
}
