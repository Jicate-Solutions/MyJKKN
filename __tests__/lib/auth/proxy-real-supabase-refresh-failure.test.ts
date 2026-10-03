/**
 * The repair-round finding, proven with the REAL libraries.
 *
 * Unlike proxy-never-logout-on-blips.test.ts, nothing here fakes the Supabase
 * client: the real @supabase/ssr createServerClient and @supabase/auth-js run
 * inside the real proxy(). Only global fetch is stubbed, so the test plays the
 * auth server's /token endpoint.
 *
 * Request carries an EXPIRED session cookie → getSession() refreshes →
 *   - 500 / 429 / 408 / an HTML 520 page: auth-js removes the session itself
 *     (_callRefreshToken → _removeSession) and @supabase/ssr queues sb-* cookie
 *     removals through setAll. The proxy must answer Reconnecting and must NOT
 *     forward those removals, or a momentary error logs the person out.
 *   - 400 refresh_token_not_found: the session is truly dead — sign-in, with the
 *     removals carried so stale cookies do not linger.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const AUTH_COOKIE = 'sb-example-auth-token';

vi.mock('@/lib/services/auth/student-validation-service', () => ({
  StudentValidationService: { validateStudentAccess: async () => ({ allowed: true }) },
}));

function expiredSessionCookie(): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const session = {
    access_token: 'header.payload.signature',
    refresh_token: 'refresh-r1',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: nowSec - 600, // expired ten minutes ago → getSession() must refresh
    user: { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', email: 'person@jkkn.ac.in' },
  };
  return 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
}

let tokenCalls: number;

function stubTokenEndpoint(status: number, body: string, contentType = 'application/json') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/auth/v1/token')) {
        tokenCalls += 1;
        return new Response(body, { status, headers: { 'Content-Type': contentType } });
      }
      // Nothing else should be reached on these paths.
      return new Response(JSON.stringify({ message: 'unexpected call: ' + url }), { status: 599 });
    })
  );
}

async function runProxy() {
  const { proxy } = await import('@/proxy');
  const request = new NextRequest(new URL('https://www.jkkn.ai/dashboard'), {
    headers: { cookie: `${AUTH_COOKIE}=${expiredSessionCookie()}` },
  });
  return proxy(request);
}

beforeAll(async () => {
  await import('@/proxy');
}, 60_000);

beforeEach(() => {
  tokenCalls = 0;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('proxy.ts with the real @supabase/ssr + auth-js: a failed refresh', () => {
  it.each([
    ['500', 500, JSON.stringify({ code: 500, error_code: 'unexpected_failure', msg: 'boom' }), 'application/json'],
    ['429', 429, JSON.stringify({ code: 429, error_code: 'over_request_rate_limit', msg: 'slow down' }), 'application/json'],
    ['408', 408, JSON.stringify({ code: 408, msg: 'timeout' }), 'application/json'],
    ['an HTML 520 page', 520, '<html><body>Web server returned an unknown error</body></html>', 'text/html'],
  ])('%s → Reconnecting, and no sb-* cookie removal reaches the browser', async (_label, status, body, type) => {
    stubTokenEndpoint(status, body, type);
    const response = await runProxy();

    expect(tokenCalls).toBeGreaterThan(0); // the real refresh really ran
    expect(response.status).toBe(503);
    expect(response.headers.get('location')).toBeNull();
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).not.toContain(AUTH_COOKIE);
    expect(setCookie).not.toMatch(/Max-Age=0/i);
  });

  it('400 refresh_token_not_found → sign-in, with the auth cookie removed', async () => {
    stubTokenEndpoint(
      400,
      JSON.stringify({ code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' })
    );
    const response = await runProxy();

    expect(tokenCalls).toBe(1);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/auth/login');
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${AUTH_COOKIE}=;`);
    expect(setCookie).toMatch(/Max-Age=0/i);
  });
});
