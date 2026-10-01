/**
 * "Once they log in, it never logs out at all in the PWA." (Director, 1 Oct 2026)
 *
 * Drives the REAL proxy() export. Only the network edges are faked: the
 * Supabase server client (so the test controls what auth and the profiles
 * table answer, and sees every cookie the client writes through setAll) and
 * the learner lifecycle check.
 *
 * Asserted here:
 *   1. lifecycle status unreadable ('database_error') → never signs out; a 503
 *      self-retrying page with the session cookies kept
 *   2. a real lifecycle block → signs out with scope 'local' (this device only),
 *      and the cookie removals reach the browser on the redirect
 *   3. a disabled account → scope 'local' too
 *   4. profile read fails twice → session kept, reconnecting page, no sign-in
 *   5. profile row genuinely missing (PGRST116) → the existing login hand-off
 *   6. auth unreachable (network/5xx) → reconnecting page; no session → sign-in
 *   7. a refreshed token is written to the REQUEST and the RESPONSE, and
 *      survives a redirect
 *   8. every signed-in visit re-sends the auth cookie chunks with 400 days
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_COOKIE_0 = 'sb-testref-auth-token.0';
const AUTH_COOKIE_1 = 'sb-testref-auth-token.1';
const VERIFIER_COOKIE = 'sb-testref-auth-token-code-verifier';
const FOUR_HUNDRED_DAYS = 400 * 24 * 60 * 60;

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };
type DbResult = { data: unknown; error: { code?: string; message: string } | null };

interface Scenario {
  role: string;
  isActive?: boolean;
  profileCompleted?: boolean;
  accountDisabled?: boolean;
  /** getUser answers, consumed in order (the last one repeats). */
  getUser: Array<{ user: boolean; error?: unknown }>;
  /** Cookies the auth client writes during getUser (a token refresh). */
  refreshWrites?: CookieToSet[];
  /** profiles.single() answers, consumed in order (the last one repeats). */
  profileReads?: DbResult[];
  validation?: Record<string, unknown>;
}

let scenario: Scenario;
let capturedCookies: { getAll(): unknown; setAll(c: CookieToSet[]): void } | null;
let signOutCalls: unknown[];
let getUserCalls: number;
let profileReadCalls: number;

function profileRow() {
  return {
    id: USER_ID,
    role: scenario.role,
    is_active: scenario.isActive ?? true,
    profile_completed: scenario.profileCompleted ?? true,
    institution_id: '22222222-2222-4222-8222-222222222222',
  };
}

function makeClient() {
  return {
    auth: {
      // No access token → proxy.ts skips its token-validation cache and takes
      // the real getUser() branch.
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => {
        const answer =
          scenario.getUser[Math.min(getUserCalls, scenario.getUser.length - 1)];
        getUserCalls += 1;
        if (scenario.refreshWrites && capturedCookies) {
          capturedCookies.setAll(scenario.refreshWrites);
        }
        return {
          data: {
            user: answer.user
              ? {
                  id: USER_ID,
                  email: 'person@jkkn.ac.in',
                  user_metadata: { account_disabled: scenario.accountDisabled === true },
                }
              : null,
          },
          error: answer.error ?? null,
        };
      },
      signOut: async (options?: unknown) => {
        signOutCalls.push(options);
        // What @supabase/ssr does on sign-out: remove every auth cookie chunk.
        capturedCookies?.setAll([
          { name: AUTH_COOKIE_0, value: '', options: { path: '/', maxAge: 0 } },
          { name: AUTH_COOKIE_1, value: '', options: { path: '/', maxAge: 0 } },
        ]);
        return { error: null };
      },
    },
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        overlaps: () => builder,
        abortSignal: async () => ({ data: [], error: null }),
        single: async () => {
          if (table !== 'profiles') return { data: null, error: null };
          const reads = scenario.profileReads ?? [{ data: profileRow(), error: null }];
          const answer = reads[Math.min(profileReadCalls, reads.length - 1)];
          profileReadCalls += 1;
          return answer;
        },
      };
      return builder;
    },
    rpc() {
      const promise = Promise.resolve({ data: [], error: null });
      return { abortSignal: () => promise, then: promise.then.bind(promise) };
    },
  };
}

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: any) => {
    capturedCookies = options.cookies;
    return makeClient();
  },
}));

const validateStudentAccess = vi.fn(async () => scenario.validation);
vi.mock('@/lib/services/auth/student-validation-service', () => ({
  StudentValidationService: { validateStudentAccess: () => validateStudentAccess() },
}));

vi.mock('@/lib/config/feature-flags', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/config/feature-flags')>();
  return {
    ...original,
    FEATURE_FLAGS: { ...original.FEATURE_FLAGS, ENABLE_STUDENT_PORTAL: true },
  };
});

async function runProxy(path: string) {
  const { proxy } = await import('@/proxy');
  const request = new NextRequest(new URL(`https://www.jkkn.ai${path}`), {
    headers: {
      cookie: `${AUTH_COOKIE_0}=OLD0; ${AUTH_COOKIE_1}=OLD1; ${VERIFIER_COOKIE}=V`,
    },
  });
  const response = await proxy(request);
  return { request, response };
}

function location(response: Response): URL | null {
  const loc = response.headers.get('location');
  return loc ? new URL(loc) : null;
}

function setCookie(response: any, name: string) {
  return response.cookies.get(name) as
    | { name: string; value: string; maxAge?: number; secure?: boolean; httpOnly?: boolean }
    | undefined;
}

// proxy.ts pulls in a large import graph; load it once, outside any test's
// 5 s budget, so a cold import cannot time a test out mid-request.
beforeAll(async () => {
  await import('@/proxy');
}, 60_000);

beforeEach(async () => {
  capturedCookies = null;
  signOutCalls = [];
  getUserCalls = 0;
  profileReadCalls = 0;
  validateStudentAccess.mockClear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  const { profileCache } = await import('@/lib/auth/profile-cache');
  profileCache.clear();
});

describe('proxy.ts — a brief error never logs anyone out', () => {
  it('1. learner lifecycle unreadable (database_error): no sign-out, reconnecting page, session kept', async () => {
    scenario = {
      role: 'student',
      getUser: [{ user: true }],
      validation: { allowed: false, reason: 'database_error', isGraduated: false },
    };
    const { response } = await runProxy('/learners/my-marks');

    expect(signOutCalls).toEqual([]);
    expect(response.status).toBe(503);
    expect(location(response)).toBeNull();
    expect(await response.text()).toContain('Reconnecting');
    expect(response.headers.get('cache-control')).toContain('no-store');
    // The session is kept — re-sent, not removed.
    expect(setCookie(response, AUTH_COOKIE_0)?.value).toBe('OLD0');
    expect(setCookie(response, AUTH_COOKIE_0)?.maxAge).toBe(FOUR_HUNDRED_DAYS);
  });

  it('2. a real lifecycle block signs out THIS device only, and the removal reaches the browser', async () => {
    scenario = {
      role: 'student',
      getUser: [{ user: true }],
      validation: {
        allowed: false,
        accessTier: 'none',
        reason: 'student_exited',
        status: 'exited',
        isGraduated: false,
      },
    };
    const { response } = await runProxy('/learners/my-marks');

    expect(signOutCalls).toEqual([{ scope: 'local' }]);
    const to = location(response);
    expect(to?.pathname).toBe('/auth/login');
    expect(to?.searchParams.get('reason')).toBe('student_exited');
    expect(setCookie(response, AUTH_COOKIE_0)?.value).toBe('');
    expect(setCookie(response, AUTH_COOKIE_0)?.maxAge).toBe(0);
  });

  it('3. a disabled account signs out with scope local', async () => {
    scenario = { role: 'faculty', accountDisabled: true, getUser: [{ user: true }] };
    const { response } = await runProxy('/dashboard');

    expect(signOutCalls).toEqual([{ scope: 'local' }]);
    expect(location(response)?.searchParams.get('reason')).toBe('disabled');
    expect(setCookie(response, AUTH_COOKIE_1)?.maxAge).toBe(0);
  });

  it('4. profile read fails twice: the session is kept and no sign-in page is shown', async () => {
    scenario = {
      role: 'faculty',
      getUser: [{ user: true }],
      profileReads: [{ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }],
    };
    const { response } = await runProxy('/dashboard');

    expect(profileReadCalls).toBe(2);
    expect(signOutCalls).toEqual([]);
    expect(response.status).toBe(503);
    expect(location(response)).toBeNull();
    expect(setCookie(response, AUTH_COOKIE_0)?.value).toBe('OLD0');
  });

  it('5. profile row genuinely missing (PGRST116) keeps the existing login hand-off, session kept', async () => {
    scenario = {
      role: 'faculty',
      getUser: [{ user: true }],
      profileReads: [{ data: null, error: { code: 'PGRST116', message: 'no rows' } }],
    };
    const { response } = await runProxy('/dashboard');

    expect(signOutCalls).toEqual([]);
    const to = location(response);
    expect(to?.pathname).toBe('/auth/login');
    expect(to?.searchParams.get('error')).toBe('profile_load_failed');
    expect(setCookie(response, AUTH_COOKIE_0)?.maxAge).toBe(FOUR_HUNDRED_DAYS);
  });

  it('6a. auth unreachable (network error, twice) → reconnecting page, not the sign-in page', async () => {
    scenario = {
      role: 'faculty',
      getUser: [{ user: false, error: new AuthRetryableFetchError('fetch failed', 0) }],
    };
    const { response } = await runProxy('/dashboard');

    expect(getUserCalls).toBe(2);
    expect(response.status).toBe(503);
    expect(location(response)).toBeNull();
  });

  it('6b. no session at all → sign-in page, destination preserved', async () => {
    scenario = { role: 'faculty', getUser: [{ user: false, error: new AuthSessionMissingError() }] };
    const { response } = await runProxy('/dashboard?tab=x');

    const to = location(response);
    expect(to?.pathname).toBe('/auth/login');
    expect(to?.searchParams.get('redirectedFrom')).toBe('/dashboard?tab=x');
  });

  it('7a. a refreshed token is written to the request (for server components) and the response', async () => {
    scenario = {
      role: 'faculty',
      getUser: [{ user: true }],
      refreshWrites: [
        { name: AUTH_COOKIE_0, value: 'NEW0', options: { path: '/', sameSite: 'lax', maxAge: FOUR_HUNDRED_DAYS } },
      ],
    };
    const { request, response } = await runProxy('/dashboard');

    expect(location(response)).toBeNull();
    expect(request.cookies.get(AUTH_COOKIE_0)?.value).toBe('NEW0');
    // NextResponse.next({ request }) forwards the updated request cookies.
    expect(response.headers.get('x-middleware-request-cookie') ?? '').toContain(`${AUTH_COOKIE_0}=NEW0`);
    expect(setCookie(response, AUTH_COOKIE_0)?.value).toBe('NEW0');
    // Headers set after the rebuild are still there.
    expect(response.headers.get('x-user-id')).toBe(USER_ID);
  });

  it('7b. a refreshed token survives a redirect', async () => {
    scenario = {
      role: 'faculty',
      profileCompleted: false,
      getUser: [{ user: true }],
      refreshWrites: [
        { name: AUTH_COOKIE_0, value: 'NEW0', options: { path: '/', sameSite: 'lax', maxAge: FOUR_HUNDRED_DAYS } },
      ],
    };
    const { response } = await runProxy('/dashboard');

    expect(location(response)?.pathname).toBe('/auth/complete-profile');
    expect(setCookie(response, AUTH_COOKIE_0)?.value).toBe('NEW0');
  });

  it('8. every signed-in visit re-sends the auth cookie chunks with 400 days, server-side', async () => {
    scenario = { role: 'faculty', getUser: [{ user: true }] };
    const { response } = await runProxy('/dashboard');

    for (const name of [AUTH_COOKIE_0, AUTH_COOKIE_1]) {
      const cookie = setCookie(response, name);
      expect(cookie?.maxAge).toBe(FOUR_HUNDRED_DAYS);
      expect(cookie?.secure).toBe(true);
      expect(cookie?.httpOnly).toBe(false);
    }
    // The PKCE verifier is not an auth-token chunk and is left alone.
    expect(setCookie(response, VERIFIER_COOKIE)).toBeUndefined();
  });
});
