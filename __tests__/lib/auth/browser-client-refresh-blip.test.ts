// @vitest-environment jsdom
/**
 * The browser client must keep the login cookies when its OWN token refresh
 * hits a temporary error (phone test, 2 Oct 2026: an open PWA page on a weak
 * signal still logged the person out).
 *
 * Nothing here fakes Supabase: the real lib/supabase/client.ts builds the real
 * @supabase/ssr createBrowserClient and the real @supabase/auth-js runs. Only
 * globalThis.fetch is stubbed, so the test plays the auth server.
 *
 * The page opens with an EXPIRED session cookie, which is exactly what a phone
 * PWA has after sitting in the background: the client's constructor refreshes
 * at once (GoTrueClient._recoverAndRefresh → _callRefreshToken).
 *   - 500 / 429 / 408 / an HTML 520 page → cookie kept byte-for-byte, and a
 *     later successful refresh renews it.
 *   - 400 refresh_token_not_found → the session is truly dead: cookie removed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const AUTH_COOKIE = 'sb-example-auth-token';
const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'person@jkkn.ac.in',
};

type TokenAnswer = { status: number; body: string; contentType?: string };

let answer: TokenAnswer;
let refreshBodies: string[];
let liveClient: SupabaseClient | null = null;

function encodeSession(session: object): string {
  return 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
}

function expiredSession() {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    access_token: 'header.payload.signature',
    refresh_token: 'refresh-r1',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: nowSec - 600, // expired ten minutes ago
    user: USER,
  };
}

function freshSessionBody(refreshToken: string): string {
  const nowSec = Math.floor(Date.now() / 1000);
  return JSON.stringify({
    access_token: 'header.fresh.signature',
    refresh_token: refreshToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: nowSec + 3600,
    user: USER,
  });
}

function rawAuthCookie(): string | null {
  const pair = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${AUTH_COOKIE}=`));
  return pair ? pair.slice(AUTH_COOKIE.length + 1) : null;
}

function cookieRefreshToken(): string | null {
  const raw = rawAuthCookie();
  if (!raw) return null;
  const json = Buffer.from(raw.replace(/^base64-/, ''), 'base64url').toString('utf8');
  return JSON.parse(json).refresh_token ?? null;
}

function clearCookies() {
  for (const pair of document.cookie.split('; ')) {
    const name = pair.split('=')[0];
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  }
}

/** Run a client call while letting auth-js's retry back-off sleeps elapse. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

async function openPageWithExpiredCookie(): Promise<SupabaseClient> {
  document.cookie = `${AUTH_COOKIE}=${encodeSession(expiredSession())}; path=/`;
  vi.resetModules(); // fresh @supabase/ssr singleton + fresh client.ts instance
  const { createClientSupabaseClient } = await import('@/lib/supabase/client');
  liveClient = createClientSupabaseClient() as unknown as SupabaseClient;
  return liveClient;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  refreshBodies = [];
  clearCookies();
  // Only the back-off sleeps; the auto-refresh ticker is a setInterval.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.spyOn(console, 'error').mockImplementation(() => {}); // auth-js logs each failed attempt
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/auth/v1/token') && url.includes('grant_type=refresh_token')) {
        refreshBodies.push(String(init?.body ?? ''));
        return new Response(answer.body, {
          status: answer.status,
          headers: { 'Content-Type': answer.contentType ?? 'application/json' },
        });
      }
      return new Response(JSON.stringify({ message: 'unexpected call: ' + url }), { status: 404 });
    })
  );
});

afterEach(async () => {
  await liveClient?.auth.stopAutoRefresh();
  liveClient = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearCookies();
});

describe('browser Supabase client: a temporary error on the token refresh', () => {
  it.each([
    ['500', 500, JSON.stringify({ code: 500, error_code: 'unexpected_failure', msg: 'boom' }), 'application/json'],
    ['429', 429, JSON.stringify({ code: 429, error_code: 'over_request_rate_limit', msg: 'slow down' }), 'application/json'],
    ['408', 408, JSON.stringify({ code: 408, msg: 'timeout' }), 'application/json'],
    ['an HTML 520 page', 520, '<html><body>Web server returned an unknown error</body></html>', 'text/html'],
  ])('%s → login cookie kept, and a later successful refresh renews it', async (_label, status, body, contentType) => {
    answer = { status, body, contentType };
    const client = await openPageWithExpiredCookie();
    const before = rawAuthCookie();
    expect(before).not.toBeNull();

    const { error } = await settle(client.auth.getSession());

    expect(refreshBodies.length).toBeGreaterThan(0); // the real refresh really ran
    expect(error?.name).toBe('AuthRetryableFetchError');
    expect(rawAuthCookie()).toBe(before); // byte-identical: nothing wiped, nothing rewritten

    // The signal comes back: the next refresh succeeds with the SAME refresh token.
    answer = { status: 200, body: freshSessionBody('refresh-r2') };
    const callsBefore = refreshBodies.length;
    const after = await settle(client.auth.getSession());

    expect(after.error).toBeNull();
    expect(after.data.session?.refresh_token).toBe('refresh-r2');
    expect(JSON.parse(refreshBodies[callsBefore]).refresh_token).toBe('refresh-r1');
    expect(cookieRefreshToken()).toBe('refresh-r2');
  });

  it('400 refresh_token_not_found → the dead session is removed and the cookie cleared', async () => {
    answer = {
      status: 400,
      body: JSON.stringify({
        code: 400,
        error_code: 'refresh_token_not_found',
        msg: 'Invalid Refresh Token: Refresh Token Not Found',
      }),
    };
    const client = await openPageWithExpiredCookie();

    const { data } = await settle(client.auth.getSession());

    expect(refreshBodies).toHaveLength(1); // a verdict, not retried
    expect(data.session).toBeNull();
    expect(rawAuthCookie()).toBeNull();
  });
});

describe('refreshBlipSafeFetch leaves every other request alone', () => {
  it('a 500 on password sign-in is returned as-is, not thrown', async () => {
    const { refreshBlipSafeFetch } = await import('@/lib/supabase/refresh-blip-fetch');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"msg":"boom"}', { status: 500 })));
    const res = await refreshBlipSafeFetch('https://example.supabase.co/auth/v1/token?grant_type=password', {
      method: 'POST',
    });
    expect(res.status).toBe(500);
  });

  it('a JSON 400 on refresh is returned as-is with its body still readable', async () => {
    const { refreshBlipSafeFetch } = await import('@/lib/supabase/refresh-blip-fetch');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error_code":"refresh_token_not_found"}', { status: 400 }))
    );
    const res = await refreshBlipSafeFetch(
      'https://example.supabase.co/auth/v1/token?grant_type=refresh_token',
      { method: 'POST' }
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error_code: 'refresh_token_not_found' });
  });
});
