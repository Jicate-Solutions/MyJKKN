/**
 * THE FIFTH LAYER — proof that edge middleware stops bouncing handover receivers.
 *
 * This drives the REAL `proxy()` export end to end. Nothing about the decision
 * is restated here: the route → permission-key resolution is the real
 * `routeMatcher` over the real `MENU_PERMISSIONS`, and the redirect is the real
 * `NextResponse.redirect`. Only the network edges are faked — the Supabase
 * client, so the test can control what `custom_roles.permissions` and
 * `fn_my_handover_permissions()` answer.
 *
 * The scenario is the one in the spine migration header, verbatim: the Director
 * hands over /accreditation/naac/narratives/owners — gated on
 * `accreditation.naac.narrative.manage`, a key that lived on one role held by
 * one person — to the COO. `coo` is not one of the eleven role strings proxy.ts
 * exempts, so before this fix the COO was redirected to /unauthorized with every
 * server-side piece of the spine working correctly behind it.
 *
 * Asserted here:
 *   1. COO WITH a live handover for that key  -> served (no redirect)
 *   2. the same COO WITHOUT it                -> 307 to /unauthorized
 *   3. a stale/rejected key in the handover   -> still redirected (no blanket allow)
 *   4. RPC error / absent function            -> redirected (fail closed, and the
 *                                                pre-migration production state)
 *   5. RPC hangs                              -> redirected inside the 300 ms budget
 *   6. a user who passes on ROLE              -> the RPC is never called (0 added latency)
 *   7. an exempt role (hod) is unaffected     -> the RPC is never called
 *   8. dynamic segments resolve through the SAME matcher, not a second one
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Supabase client double. Only the calls proxy.ts actually makes.
// ---------------------------------------------------------------------------

const OWNERS_ROUTE = '/accreditation/naac/narratives/owners';
const OWNERS_KEY = 'accreditation.naac.narrative.manage';

interface Scenario {
  role: string;
  /** what custom_roles.permissions returns for that role (null = no row) */
  rolePermissions: Record<string, boolean> | null;
  /** what fn_my_handover_permissions() answers */
  handover:
    | { kind: 'keys'; keys: string[] }
    | { kind: 'error'; message: string; code?: string }
    | { kind: 'hang' };
}

let scenario: Scenario;
let rpcCalls: string[] = [];

const USER_ID = '11111111-1111-4111-8111-111111111111';

function makeClient() {
  return {
    auth: {
      // No session cookie in the double, so proxy.ts skips its token-validation
      // cache entirely and takes the real getUser() branch below.
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({
        data: {
          user: { id: USER_ID, email: 'coo@jkkn.ac.in', user_metadata: {} },
        },
        error: null,
      }),
      signOut: async () => ({ error: null }),
    },
    from(table: string) {
      const result =
        table === 'profiles'
          ? {
              data: {
                id: USER_ID,
                role: scenario.role,
                is_active: true,
                profile_completed: true,
                institution_id: '22222222-2222-4222-8222-222222222222',
              },
              error: null,
            }
          : table === 'custom_roles'
            ? {
                data: scenario.rolePermissions
                  ? { permissions: scenario.rolePermissions }
                  : null,
                error: null,
              }
            : { data: null, error: null };

      const builder: any = {
        select: () => builder,
        eq: () => builder,
        single: async () => result,
      };
      return builder;
    },
    rpc(fn: string) {
      rpcCalls.push(fn);
      const answer = scenario.handover;

      const settle = async () => {
        if (answer.kind === 'hang') {
          // Longer than the 300 ms budget by a wide margin.
          await new Promise((r) => setTimeout(r, 5_000));
          return { data: [], error: null };
        }
        if (answer.kind === 'error') {
          return {
            data: null,
            error: { message: answer.message, code: answer.code ?? 'PGRST202' },
          };
        }
        return { data: answer.keys, error: null };
      };

      // Mirrors PostgrestFilterBuilder: thenable, and `.abortSignal()` returns
      // something awaitable.
      const promise = settle();
      return {
        abortSignal: () => promise,
        then: (res: any, rej: any) => promise.then(res, rej),
      };
    },
  };
}

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => makeClient(),
}));

// getUser() in proxy.ts returns { data: { user }, error } — the double above
// returns the user object directly under `data`, so normalise via a thin shim.
vi.mock('@/lib/services/auth/student-validation-service', () => ({
  StudentValidationService: {
    validateStudentAccess: async () => ({ allowed: true, accessTier: 'full' }),
  },
}));

// ---------------------------------------------------------------------------

async function loadProxy() {
  const mod = await import('@/proxy');
  return mod.proxy;
}

function request(path: string) {
  // proxy.ts only reads nextUrl.pathname, nextUrl.search, request.url and cookies.
  return new NextRequest(new URL(`https://www.jkkn.ai${path}`));
}

function redirectTarget(res: any): string | null {
  const loc = res?.headers?.get?.('location');
  return loc ? new URL(loc).pathname : null;
}

beforeEach(async () => {
  rpcCalls = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  const { profileCache } = await import('@/lib/auth/profile-cache');
  profileCache.clear();
  const { __clearHandoverKeyCache } = await import(
    '@/lib/auth/handover-route-access'
  );
  __clearHandoverKeyCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('proxy.ts — the fifth layer', () => {
  it('the motivating page is gated on the key the incident named', async () => {
    const { routeMatcher } = await import('@/lib/auth/route-matcher');
    expect(routeMatcher.match(OWNERS_ROUTE)?.permission).toBe(OWNERS_KEY);
  });

  it('coo WITH a live handover is served (was: bounced to /unauthorized)', async () => {
    scenario = {
      role: 'coo',
      rolePermissions: { 'dashboard.view': true }, // no narrative key
      handover: { kind: 'keys', keys: [OWNERS_KEY] },
    };
    const proxy = await loadProxy();
    const res = await proxy(request(OWNERS_ROUTE) as any);

    expect(redirectTarget(res)).not.toBe('/unauthorized');
    expect(res.headers.get('x-access-via')).toBe('director-handover');
    expect(rpcCalls).toContain('fn_my_handover_permissions');
  });

  it('the SAME coo WITHOUT the handover is redirected to /unauthorized', async () => {
    scenario = {
      role: 'coo',
      rolePermissions: { 'dashboard.view': true },
      handover: { kind: 'keys', keys: [] },
    };
    const proxy = await loadProxy();
    const res = await proxy(request(OWNERS_ROUTE) as any);

    expect(redirectTarget(res)).toBe('/unauthorized');
    expect(res.headers.get('x-access-via')).toBeNull();
  });

  it('a handover for a DIFFERENT key does not open this page', async () => {
    scenario = {
      role: 'coo',
      rolePermissions: { 'dashboard.view': true },
      handover: { kind: 'keys', keys: ['hr.leave.approve'] },
    };
    const proxy = await loadProxy();
    const res = await proxy(request(OWNERS_ROUTE) as any);
    expect(redirectTarget(res)).toBe('/unauthorized');
  });

  it('FAILS CLOSED when the RPC errors — including "function does not exist", which is production today', async () => {
    scenario = {
      role: 'coo',
      rolePermissions: { 'dashboard.view': true },
      handover: {
        kind: 'error',
        message:
          'Could not find the function public.fn_my_handover_permissions without parameters',
        code: 'PGRST202',
      },
    };
    const proxy = await loadProxy();
    const res = await proxy(request(OWNERS_ROUTE) as any);
    expect(redirectTarget(res)).toBe('/unauthorized');
  });

  it('FAILS CLOSED and FAST when the RPC hangs — inside the 300 ms budget', async () => {
    scenario = {
      role: 'coo',
      rolePermissions: { 'dashboard.view': true },
      handover: { kind: 'hang' },
    };
    const proxy = await loadProxy();
    const { HANDOVER_LOOKUP_TIMEOUT_MS } = await import(
      '@/lib/auth/handover-route-access'
    );

    const started = Date.now();
    const res = await proxy(request(OWNERS_ROUTE) as any);
    const elapsed = Date.now() - started;

    expect(redirectTarget(res)).toBe('/unauthorized');
    // Budget + the two 200 ms retries proxy.ts may itself perform is not in
    // play here (auth and profile both succeed), so the only wait is ours.
    expect(elapsed).toBeLessThan(HANDOVER_LOOKUP_TIMEOUT_MS + 250);
  });

  it('adds ZERO cost for a user who passes on role — the RPC is never called', async () => {
    scenario = {
      role: 'coo',
      rolePermissions: { [OWNERS_KEY]: true }, // holds it by role
      handover: { kind: 'keys', keys: [OWNERS_KEY] },
    };
    const proxy = await loadProxy();
    const res = await proxy(request(OWNERS_ROUTE) as any);

    expect(redirectTarget(res)).not.toBe('/unauthorized');
    expect(rpcCalls).toEqual([]); // <- the latency claim, measured
    expect(res.headers.get('x-access-via')).toBeNull();
  });

  it('an exempt role (hod) is untouched — still allowed, still no RPC', async () => {
    scenario = {
      role: 'hod',
      rolePermissions: null,
      handover: { kind: 'keys', keys: [] },
    };
    const proxy = await loadProxy();
    const res = await proxy(request(OWNERS_ROUTE) as any);

    expect(redirectTarget(res)).not.toBe('/unauthorized');
    expect(rpcCalls).toEqual([]);
  });

  it('dynamic segments resolve through the SAME matcher (a literal id is not a second matcher)', async () => {
    const { routeMatcher } = await import('@/lib/auth/route-matcher');
    const detail = '/accreditation/naac/narratives/9f2c-not-a-literal-segment';
    const key = routeMatcher.match(detail)?.permission;
    expect(key).toBe('accreditation.naac.narrative.view');

    scenario = {
      role: 'coo',
      rolePermissions: { 'dashboard.view': true },
      handover: { kind: 'keys', keys: [key!] },
    };
    const proxy = await loadProxy();
    const res = await proxy(request(detail) as any);
    expect(redirectTarget(res)).not.toBe('/unauthorized');

    // …and the OWNERS key alone does not open the detail route, proving the
    // key really is what is being compared.
    const { __clearHandoverKeyCache } = await import(
      '@/lib/auth/handover-route-access'
    );
    __clearHandoverKeyCache();
    scenario = {
      role: 'coo',
      rolePermissions: { 'dashboard.view': true },
      handover: { kind: 'keys', keys: [OWNERS_KEY] },
    };
    const res2 = await proxy(request(detail) as any);
    expect(redirectTarget(res2)).toBe('/unauthorized');
  });

  it('a transient RPC failure is NOT cached — the next request asks again', async () => {
    const { routeAllowedByHandover, __clearHandoverKeyCache } = await import(
      '@/lib/auth/handover-route-access'
    );
    __clearHandoverKeyCache();

    let call = 0;
    const client = {
      rpc: () => {
        call++;
        return call === 1
          ? Promise.resolve({ data: null, error: { message: 'boom' } })
          : Promise.resolve({ data: [OWNERS_KEY], error: null });
      },
    };

    expect(await routeAllowedByHandover(client, USER_ID, OWNERS_ROUTE)).toBe(false);
    expect(await routeAllowedByHandover(client, USER_ID, OWNERS_ROUTE)).toBe(true);
    expect(call).toBe(2);
  });

  it('a live key set is reused within its TTL, and an EMPTY one expires far sooner', async () => {
    const {
      routeAllowedByHandover,
      __clearHandoverKeyCache,
      HANDOVER_KEYS_TTL_MS,
      HANDOVER_EMPTY_TTL_MS,
    } = await import('@/lib/auth/handover-route-access');

    expect(HANDOVER_EMPTY_TTL_MS).toBeLessThan(HANDOVER_KEYS_TTL_MS);

    // Fake Date only — setTimeout stays real so the lookup's deadline works.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      __clearHandoverKeyCache();
      let calls = 0;
      const withKeys = {
        rpc: () => {
          calls++;
          return Promise.resolve({ data: [OWNERS_KEY], error: null });
        },
      };

      expect(await routeAllowedByHandover(withKeys, 'u-live', OWNERS_ROUTE)).toBe(true);
      vi.setSystemTime(Date.now() + HANDOVER_EMPTY_TTL_MS + 1_000);
      expect(await routeAllowedByHandover(withKeys, 'u-live', OWNERS_ROUTE)).toBe(true);
      expect(calls).toBe(1); // still cached — a live set survives the short TTL

      __clearHandoverKeyCache();
      let emptyCalls = 0;
      const withNone = {
        rpc: () => {
          emptyCalls++;
          return Promise.resolve({ data: [], error: null });
        },
      };
      expect(await routeAllowedByHandover(withNone, 'u-none', OWNERS_ROUTE)).toBe(false);
      expect(await routeAllowedByHandover(withNone, 'u-none', OWNERS_ROUTE)).toBe(false);
      expect(emptyCalls).toBe(1); // a burst of prefetches collapses to one lookup
      vi.setSystemTime(Date.now() + HANDOVER_EMPTY_TTL_MS + 1_000);
      expect(await routeAllowedByHandover(withNone, 'u-none', OWNERS_ROUTE)).toBe(false);
      expect(emptyCalls).toBe(2); // …but a brand-new handover is seen within seconds
    } finally {
      vi.useRealTimers();
    }
  });

  it('a denial with no MENU_PERMISSIONS key (static PROTECTED_ROUTES) never even asks', async () => {
    const { routeAllowedByHandover, __clearHandoverKeyCache } = await import(
      '@/lib/auth/handover-route-access'
    );
    __clearHandoverKeyCache();
    let called = 0;
    const client = {
      rpc: () => {
        called++;
        return Promise.resolve({ data: [OWNERS_KEY], error: null });
      },
    };
    const allowed = await routeAllowedByHandover(
      client,
      USER_ID,
      '/no/such/route/anywhere'
    );
    expect(allowed).toBe(false);
    expect(called).toBe(0);
  });
});
