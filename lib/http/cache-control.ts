import { NextResponse } from 'next/server';

/**
 * Browser-only cache policy for read-only REFERENCE LISTS (institutions,
 * departments, BoS lookups): rows every module re-fetches on navigation and
 * that change rarely.
 *
 * Staleness bound: the browser reuses the body for 60 s without a request;
 * for the next 300 s it may serve the stale copy ONE more time while it
 * refetches in the background. An admin's edit is therefore visible within
 * 60 s on the next page load, and never later than the following fetch.
 *
 * `private` — NEVER `public` / `s-maxage`. These responses are scoped to the
 * signed-in user and tenant, so a shared cache (Vercel CDN) must never hold
 * them. `Vary: Cookie` keys the browser cache on the session cookie, so a
 * sign-out / sign-in on a shared machine never replays the previous user's
 * list.
 */
export const REFERENCE_LIST_CACHE = 'private, max-age=60, stale-while-revalidate=300';

/** Apply the reference-list policy to a 2xx GET response. Never use on errors or writes. */
export function withReferenceListCache(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', REFERENCE_LIST_CACHE);
  res.headers.set('Vary', 'Cookie');
  return res;
}
