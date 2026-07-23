/**
 * Parent Portal — canonical base URL.
 *
 * Returns the absolute base for parent-facing pages. Prefers an explicit
 * NEXT_PUBLIC_PARENT_PORTAL_URL (set this if the portal lives on its own
 * subdomain, e.g. https://parent.jkkn.ac.in/parent), otherwise derives it from
 * the app origin NEXT_PUBLIC_APP_URL + the /parent route.
 *
 * NOTE: NEXT_PUBLIC_APP_URL itself must stay the bare ORIGIN (no /parent) — it
 * is used as metadataBase and for webhook/callback URLs that append their own
 * paths. This helper is the right thing to use whenever you need a full link
 * INTO the portal (payment return URLs, share/deep links, notifications).
 *
 * Isomorphic: both vars are NEXT_PUBLIC_* so this works on server and client.
 */
export function parentPortalBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_PARENT_PORTAL_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const origin = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${origin}/parent`;
}
