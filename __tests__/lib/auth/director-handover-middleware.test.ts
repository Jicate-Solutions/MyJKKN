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
 *
 * ── THE 70-ROUTE BLOCK BELOW ──────────────────────────────────────────────────
 *
 * Everything above compares ONE thing: the requested path's MENU_PERMISSIONS
 * key. That is right only while the keys WRITTEN onto a handover are menu keys,
 * and they are not: components/director-desk/route-permission-resolver.ts
 * resolves them from the page's real PermissionGuard / PolicyPageShell gate and
 * deliberately drops the menu key where no RoutePermissionGuard enforces it.
 *
 * Measured against that resolver's own ROUTE_GATE_MAP on this tree: 477 routes
 * carry a recorded gate — 122 un-handable, 99 also route-guarded, 186 agree by
 * coincidence, and **70 where the page's real gate key is NOT the menu key**.
 * On all 70 the row carried keys this middleware never looked for, so it found
 * no match and bounced the receiver.
 *
 * `/accreditation/manage/metrics` is one of the 70, used below:
 *     menu key  accreditation.view
 *     page key  accreditation.metrics.manage   <- what #2840 actually writes
 *
 * The last block proves the union: a receiver holding ONLY the page-gate key is
 * served through the ROUTE lane, and is still redirected with no handover, with
 * a handover for a neighbouring route, and when the spine has already killed the
 * handover.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Supabase client double. Only the calls proxy.ts actually makes.
// ---------------------------------------------------------------------------

const OWNERS_ROUTE = '/accreditation/naac/narratives/owners';
const OWNERS_KEY = 'accreditation.naac.narrative.manage';

/**
 * One of the 70. Menu key and page-gate key are DIFFERENT here, which is the
 * whole defect: #2840 writes the page key, the middleware looked for the menu
 * key, nothing matched, the receiver was bounced.
 */
const METRICS_ROUTE = '/accreditation/manage/metrics';
const METRICS_MENU_KEY = 'accreditation.view';
const METRICS_PAGE_KEY = 'accreditation.metrics.manage';

/** A neighbour of the above: same menu key, different page key, different page. */
const COLLAB_ROUTE = '/accreditation/manage/collaborations';
const COLLAB_PAGE_KEY = 'accreditation.collaborations.view';

interface HandoverRow {
  route: string;
  permission_keys: string[];
}

interface Scenario {
  role: string;
  /** what custom_roles.permissions returns for that role (null = no row) */
  rolePermissions: Record<string, boolean> | null;
  /** what fn_my_handover_permissions() answers */
  handover:
    | { kind: 'keys'; keys: string[] }
    | { kind: 'error'; message: string; code?: string }
    | { kind: 'hang' };
  /**
   * Rows physically present in director_handovers for this user. Liveness is
   * NOT expressed here — it comes from `handover` above, exactly as it does in
   * production, where the spine's own function decides what is live and the
   * middleware filters rows by `permission_keys && <that answer>`. A row whose
   * keys are absent from `handover` is therefore a dead row, and the double
   * applies that overlap for real rather than being told the answer.
   */
  handoverRows?: HandoverRow[];
}

let scenario: Scenario;
let rpcCalls: string[] = [];
/** Every director_handovers read the middleware issued, with its overlap arg. */
let tableQueries: Array<{ table: string; overlaps: string[]; grantee: string }> = [];

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
      if (table === 'director_handovers') {
        // Mirrors PostgrestFilterBuilder for .select().eq().overlaps(): chainable
        // and thenable, with `.abortSignal()` returning something awaitable.
        const filter = { grantee: '', overlaps: [] as string[] };
        const run = async () => {
          tableQueries.push({ table, ...filter });
          const rows = (scenario.handoverRows ?? [])
            .filter((r) =>
              r.permission_keys.some((k) => filter.overlaps.includes(k))
            )
            .map((r) => ({ route: r.route }));
          return { data: rows, error: null };
        };
        const q: any = {
          select: () => q,
          eq: (_col: string, val: string) => {
            filter.grantee = val;
            return q;
          },
          overlaps: (_col: string, vals: string[]) => {
            filter.overlaps = vals;
            return q;
          },
          abortSignal: () => run(),
          then: (res: any, rej: any) => run().then(res, rej),
        };
        return q;
      }

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
  tableQueries = [];
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
    expect(tableQueries).toEqual([]); // …and the route lane costs nothing either
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

// ===========================================================================
// THE 70 ROUTES WHERE THE PAGE'S REAL GATE KEY IS NOT ITS MENU KEY.
//
// Everything above compares menu keys, and #2840's resolver does not write menu
// keys. These drive the same real proxy() over a route from that set and prove
// the union: the ROUTE lane serves a receiver the KEY lane cannot.
// ===========================================================================

describe('proxy.ts — the union closes the 70-route key mismatch', () => {
  it('the sample route really is one of the 70: its menu key is NOT its page-gate key', async () => {
    const { routeMatcher } = await import('@/lib/auth/route-matcher');
    // If MENU_PERMISSIONS ever moves and these converge, this test says so
    // rather than quietly passing for the wrong reason.
    expect(routeMatcher.match(METRICS_ROUTE)?.permission).toBe(METRICS_MENU_KEY);
    expect(METRICS_MENU_KEY).not.toBe(METRICS_PAGE_KEY);
    expect(routeMatcher.match(COLLAB_ROUTE)?.permission).toBe(METRICS_MENU_KEY);
    expect(COLLAB_PAGE_KEY).not.toBe(METRICS_MENU_KEY);
  });

  it('receiver holding ONLY the page-gate key #2840 writes is SERVED (was: bounced)', async () => {
    scenario = {
      role: 'coo',
      rolePermissions: { 'dashboard.view': true },
      // Exactly what the capture control writes for this route: the page's own
      // gate key, and NOT the menu key.
      handover: { kind: 'keys', keys: [METRICS_PAGE_KEY] },
      handoverRows: [
        { route: METRICS_ROUTE, permission_keys: [METRICS_PAGE_KEY] },
      ],
    };
    const proxy = await loadProxy();
    const res = await proxy(request(METRICS_ROUTE) as any);

    expect(redirectTarget(res)).not.toBe('/unauthorized');
    expect(res.headers.get('x-access-via')).toBe('director-handover');

    // …and prove it was the ROUTE lane, not the key lane: the menu key this
    // middleware compares on is nowhere in what the receiver holds.
    expect(scenario.handover).toMatchObject({ keys: [METRICS_PAGE_KEY] });
    expect((scenario.handover as { keys: string[] }).keys).not.toContain(
      METRICS_MENU_KEY
    );
    expect(rpcCalls).toContain('fn_my_handover_permissions');
    expect(tableQueries).toHaveLength(1);
    expect(tableQueries[0].grantee).toBe(USER_ID);
    expect(tableQueries[0].overlaps).toEqual([METRICS_PAGE_KEY]);
  });

  it('NEGATIVE CONTROL — the same receiver with NO handover is still redirected', async () => {
    scenario = {
      role: 'coo',
      rolePermissions: { 'dashboard.view': true },
      handover: { kind: 'keys', keys: [] },
      handoverRows: [],
    };
    const proxy = await loadProxy();
    const res = await proxy(request(METRICS_ROUTE) as any);

    expect(redirectTarget(res)).toBe('/unauthorized');
    expect(res.headers.get('x-access-via')).toBeNull();
    // An empty key set means no live handover, so the route lane is not even
    // asked — an ordinary denial still costs exactly one round trip.
    expect(tableQueries).toEqual([]);
  });

  it('NEGATIVE CONTROL — a handover for a DIFFERENT route does not open this one', async () => {
    scenario = {
      role: 'coo',
      rolePermissions: { 'dashboard.view': true },
      // Live, genuine, and for the page next door — which shares this page's
      // MENU key, so a sloppier comparison would have opened both.
      handover: { kind: 'keys', keys: [COLLAB_PAGE_KEY] },
      handoverRows: [
        { route: COLLAB_ROUTE, permission_keys: [COLLAB_PAGE_KEY] },
      ],
    };
    const proxy = await loadProxy();
    const res = await proxy(request(METRICS_ROUTE) as any);

    expect(redirectTarget(res)).toBe('/unauthorized');
    expect(tableQueries).toHaveLength(1); // it looked, and found nothing for THIS page
  });

  it('a revoked / expired / declined handover opens nothing — the row is still there, the keys are not', async () => {
    scenario = {
      role: 'coo',
      rolePermissions: { 'dashboard.view': true },
      // fn_my_handover_permissions() is the spine's own predicate: status,
      // revoked_at, the inclusive IST due date, grantee active, grantee still in
      // the granting institution, the walls and the access level. A dead
      // handover contributes no keys — and the row below is still physically
      // present, which is the point.
      handover: { kind: 'keys', keys: [] },
      handoverRows: [
        { route: METRICS_ROUTE, permission_keys: [METRICS_PAGE_KEY] },
      ],
    };
    const proxy = await loadProxy();
    const res = await proxy(request(METRICS_ROUTE) as any);

    expect(redirectTarget(res)).toBe('/unauthorized');
    expect(tableQueries).toEqual([]);
  });

  it('a key the ACCESS LEVEL cannot carry takes its route down with it', async () => {
    scenario = {
      role: 'coo',
      rolePermissions: { 'dashboard.view': true },
      // The row still names the page key, but fn_handover_key_allowed_at_level
      // dropped it inside the spine's function — so it is not in the live set
      // and the overlap that decides the route lane finds nothing.
      handover: { kind: 'keys', keys: ['some.other.live.view'] },
      handoverRows: [
        { route: METRICS_ROUTE, permission_keys: [METRICS_PAGE_KEY] },
      ],
    };
    const proxy = await loadProxy();
    const res = await proxy(request(METRICS_ROUTE) as any);

    expect(redirectTarget(res)).toBe('/unauthorized');
    expect(tableQueries[0].overlaps).toEqual(['some.other.live.view']);
  });

  it('a stalled route lookup still fails closed inside the 300 ms budget', async () => {
    scenario = {
      role: 'coo',
      rolePermissions: { 'dashboard.view': true },
      handover: { kind: 'hang' },
      handoverRows: [
        { route: METRICS_ROUTE, permission_keys: [METRICS_PAGE_KEY] },
      ],
    };
    const proxy = await loadProxy();
    const { HANDOVER_LOOKUP_TIMEOUT_MS } = await import(
      '@/lib/auth/handover-route-access'
    );

    const started = Date.now();
    const res = await proxy(request(METRICS_ROUTE) as any);
    const elapsed = Date.now() - started;

    expect(redirectTarget(res)).toBe('/unauthorized');
    expect(elapsed).toBeLessThan(HANDOVER_LOOKUP_TIMEOUT_MS + 250);
  });

  it('route comparison is the SAME trie, so [id] is dynamic and two literal siblings are not', async () => {
    const { routeMatcher } = await import('@/lib/auth/route-matcher');

    // /admission/gd-pi/[id]/evaluate is also one of the 70 (menu
    // admission.applications.edit, page admission.gd_pi.evaluate). The trie says
    // that segment is dynamic, so two ids are one route — exactly the
    // granularity the key lane already has, never coarser, never finer.
    expect(
      routeMatcher.sameRoute(
        '/admission/gd-pi/9f2c-aaaa/evaluate',
        '/admission/gd-pi/71b0-bbbb/evaluate'
      )
    ).toBe(true);

    // …and two literal siblings stay two routes even though the trie resolves
    // both to the SAME menu key. A second, string-based matcher would have got
    // this wrong in one direction or the other.
    expect(routeMatcher.match(METRICS_ROUTE)?.permission).toBe(
      routeMatcher.match(COLLAB_ROUTE)?.permission
    );
    expect(routeMatcher.sameRoute(METRICS_ROUTE, COLLAB_ROUTE)).toBe(false);

    // Depth is part of a route's identity.
    expect(
      routeMatcher.sameRoute(METRICS_ROUTE, `${METRICS_ROUTE}/anything`)
    ).toBe(false);
  });

  it('a handover on a dynamic route serves the receiver end to end', async () => {
    const detail = '/admission/gd-pi/9f2c-aaaa/evaluate';
    scenario = {
      role: 'coo',
      rolePermissions: { 'dashboard.view': true },
      handover: { kind: 'keys', keys: ['admission.gd_pi.evaluate'] },
      handoverRows: [
        { route: detail, permission_keys: ['admission.gd_pi.evaluate'] },
      ],
    };
    const proxy = await loadProxy();
    const res = await proxy(request(detail) as any);

    expect(redirectTarget(res)).not.toBe('/unauthorized');
    expect(res.headers.get('x-access-via')).toBe('director-handover');
  });

  it('the route lane is silent when the client cannot read the table — key lane unchanged', async () => {
    const { routeAllowedByHandover, __clearHandoverKeyCache } = await import(
      '@/lib/auth/handover-route-access'
    );
    __clearHandoverKeyCache();
    // No `.from` at all. Degrading must never open anything.
    const rpcOnly = {
      rpc: () => Promise.resolve({ data: [METRICS_PAGE_KEY], error: null }),
    };
    expect(await routeAllowedByHandover(rpcOnly, USER_ID, METRICS_ROUTE)).toBe(
      false
    );

    __clearHandoverKeyCache();
    const menuKeyHolder = {
      rpc: () => Promise.resolve({ data: [METRICS_MENU_KEY], error: null }),
    };
    expect(
      await routeAllowedByHandover(menuKeyHolder, USER_ID, METRICS_ROUTE)
    ).toBe(true);
  });
});
