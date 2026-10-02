/**
 * Keep the browser login when a token refresh hits a temporary error.
 *
 * Director ruling (1 Oct 2026): a temporary error must never log anyone out.
 *
 * Why this exists: the browser Supabase client refreshes its token by itself
 * (autoRefreshToken). @supabase/auth-js 2.75 (GoTrueClient._callRefreshToken)
 * deletes the session — and @supabase/ssr then wipes the sb-* login cookies —
 * whenever that refresh fails with anything it does not class as retryable.
 * Its retryable set is only "fetch threw" and HTTP 502/503/504
 * (lib/fetch.js NETWORK_ERROR_CODES). A 500, 429 (rate limit), 408 (timeout)
 * or a proxy's HTML error page (e.g. Cloudflare 520) therefore signed the
 * person out of an open PWA page on a weak signal (phone test, 2 Oct).
 *
 * The fix: for the refresh request ONLY, turn those answers into a thrown
 * network error. auth-js wraps a thrown fetch in AuthRetryableFetchError,
 * keeps the session and tries again on its next tick.
 *
 * Untouched on purpose:
 * - every other request (sign-in, PKCE exchange, sign-out, REST, storage);
 * - 502/503/504, which auth-js already retries;
 * - a JSON 4xx answer from the auth server (400 refresh_token_not_found,
 *   invalid grant, session missing) — that is a real verdict, and the person
 *   must still be signed out.
 */

/** HTTP statuses auth-js already treats as retryable — pass them through. */
const ALREADY_RETRIED_BY_AUTH_JS = new Set([502, 503, 504]);

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** True only for POST …/auth/v1/token?grant_type=refresh_token. */
export function isRefreshTokenRequest(input: RequestInfo | URL): boolean {
  try {
    const url = new URL(requestUrl(input));
    return (
      url.pathname.endsWith('/auth/v1/token') &&
      url.searchParams.get('grant_type') === 'refresh_token'
    );
  } catch {
    return false;
  }
}

function temporaryFailure(status: number): TypeError {
  // auth-js turns any thrown fetch into AuthRetryableFetchError (status 0).
  return new TypeError(
    `Failed to fetch: token refresh answered HTTP ${status}; keeping the session and retrying later`
  );
}

/**
 * A fetch for the browser Supabase client. Resolves the real fetch at call
 * time so tests (and polyfills) that replace globalThis.fetch are honoured.
 */
export const refreshBlipSafeFetch: typeof fetch = async (input, init) => {
  const response = await globalThis.fetch(input, init);

  if (!isRefreshTokenRequest(input)) return response;
  // A 200 with an unreadable body already becomes a retryable error inside auth-js.
  if (response.ok) return response;
  if (ALREADY_RETRIED_BY_AUTH_JS.has(response.status)) return response;

  const status = response.status;
  if (status >= 500 || status === 429 || status === 408) {
    throw temporaryFailure(status);
  }

  // Any other 4xx: the auth server always answers in JSON. A body that is not
  // JSON (an HTML page from a proxy, firewall or captive portal) is not a
  // verdict about the session. Read a CLONE so auth-js can still read the
  // original body when it is a real answer.
  try {
    JSON.parse(await response.clone().text());
  } catch {
    throw temporaryFailure(status);
  }
  return response;
};
