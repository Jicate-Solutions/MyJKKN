import { NextResponse } from 'next/server';

/**
 * Browser-only cache policy for read-only REFERENCE LISTS (institutions,
 * departments, BoS lookups): rows every module re-fetches on navigation and
 * that change rarely.
 *
 * Staleness bound: at most 60 seconds old. The browser reuses the body for
 * 60 s without a request; after that every fetch — including a plain page
 * reload — goes to the server. No stale-while-revalidate on purpose: with it
 * browsers keep serving the stored body past max-age, so "60 s" would not
 * be true.
 *
 * `private` — NEVER `public` / `s-maxage`. These responses are scoped to the
 * signed-in user and tenant, so a shared cache (Vercel CDN) must never hold
 * them. `Vary: Cookie` keys the browser cache on the session cookie, so a
 * sign-out / sign-in on a shared machine never replays the previous user's
 * list.
 *
 * An EMPTY list is never cached: an empty dropdown is usually a scope or
 * upstream problem an admin is about to fix, and "reload" must show the fix.
 */
export const REFERENCE_LIST_CACHE = 'private, max-age=60';

/** Apply the policy to a 2xx GET response carrying `count` rows. No-op when the list is empty. */
export function withReferenceListCache(res: NextResponse, count: number): NextResponse {
  if (count < 1) return res;
  res.headers.set('Cache-Control', REFERENCE_LIST_CACHE);
  res.headers.set('Vary', 'Cookie');
  return res;
}
