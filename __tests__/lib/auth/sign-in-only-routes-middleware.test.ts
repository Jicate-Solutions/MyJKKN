/**
 * Sign-in-only routes at the EDGE — follow-up to the #4272 blind review.
 *
 * #4272 mapped /hr/playbooks to `view_profile`, the sign-in-only value the
 * sidebar and the client route guard (isPageAccessible) treat as "any signed-in
 * person". The edge middleware did not: for every role outside the eleven that
 * proxy.ts exempts, routeMatcher.hasAccess() looked the value up in the role's
 * stored permission map, so a custom role (the HR head among them) whose map had
 * no literal `view_profile: true` was redirected to /unauthorized before the
 * page could render — while the client guard would have opened it.
 *
 * The fix is one shared helper, isSignInOnlyPermission(), now read by all three
 * gates. Asserted here:
 *   1. hasAccess('/hr/playbooks', 'hr_head', <map without view_profile>) is true
 *   2. a custom role with no HR key reaches /hr/playbooks but not /hr or /hr/payroll
 *   3. every sign-in-only route in MENU_PERMISSIONS is open at the edge AND the
 *      edge agrees with isPageAccessible on it
 *   4. holding the sign-in-only values as keys opens NOTHING else — a sentinel
 *      never grants more than "signed in"
 *   5. through the real proxy(): the same, end to end, and a SIGNED-OUT request
 *      for every sign-in-only route is still sent to the login page
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Supabase client double — only the calls proxy.ts makes (pattern from
// __tests__/lib/auth/director-handover-middleware.test.ts).
// ---------------------------------------------------------------------------

interface Scenario {
  signedIn: boolean;
  role: string;
  rolePermissions: Record<string, boolean> | null;
}

let scenario: Scenario;
let rpcCalls: string[] = [];
let tablesRead: string[] = [];

const USER_ID = '33333333-3333-4333-8333-333333333333';

function makeClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () =>
        scenario.signedIn
          ? {
              data: { user: { id: USER_ID, email: 'x@jkkn.ac.in', user_metadata: {} } },
              error: null,
            }
          : { data: { user: null }, error: null },
      signOut: async () => ({ error: null }),
    },
    from(table: string) {
      tablesRead.push(table);
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
            : { data: [], error: null };
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        overlaps: () => builder,
        abortSignal: async () => result,
        single: async () => result,
        then: (res: any, rej: any) => Promise.resolve(result).then(res, rej),
      };
      return builder;
    },
    rpc(fn: string) {
      rpcCalls.push(fn);
      // No handover: the role decision alone must carry these requests.
      const promise = Promise.resolve({ data: [], error: null });
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

vi.mock('@/lib/services/auth/student-validation-service', () => ({
  StudentValidationService: {
    validateStudentAccess: async () => ({ allowed: true, accessTier: 'full' }),
  },
}));

async function loadProxy() {
  const mod = await import('@/proxy');
  return mod.proxy;
}

function request(path: string) {
  return new NextRequest(new URL(`https://www.jkkn.ai${path}`));
}

function redirectTarget(res: any): URL | null {
  const loc = res?.headers?.get?.('location');
  return loc ? new URL(loc) : null;
}

beforeEach(async () => {
  rpcCalls = [];
  tablesRead = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  const { profileCache } = await import('@/lib/auth/profile-cache');
  profileCache.clear();
  const { __clearHandoverKeyCache } = await import('@/lib/auth/handover-route-access');
  __clearHandoverKeyCache();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** The roles proxy.ts reads no permission map for. Custom roles are everything else. */
const PROXY_EXEMPT_ROLES = [
  'super_admin', 'administrator', 'faculty', 'staff', 'student', 'guest',
  'driver', 'hod', 'admission', 'registrar', 'principal',
];

/** An HR head's map as a custom role would carry it — HR keys, no `view_profile`. */
const HR_HEAD_MAP: Record<string, boolean> = {
  'hr.view': true,
  'hr.payroll.institution.view': true,
  'hr.harness.playbooks.manage': true,
};

/** A custom role that holds no HR key at all. */
const NO_HR_ROLE = 'library_assistant';
const NO_HR_MAP: Record<string, boolean> = { 'library.view': true };

/** Turns a MENU_PERMISSIONS path into a concrete request path. */
function concrete(path: string): string {
  return path.replace(/\[[^\]]+\]/g, 'x1');
}

// ---------------------------------------------------------------------------
// 1-4: routeMatcher.hasAccess, the function proxy.ts calls
// ---------------------------------------------------------------------------

describe('routeMatcher.hasAccess — sign-in-only routes', () => {
  it('fixture sanity: hr_head and the no-HR role are CUSTOM roles, so their map is read', () => {
    // If either were exempt, userPermissions would be undefined and every
    // assertion below would pass for the wrong reason.
    expect(PROXY_EXEMPT_ROLES).not.toContain('hr_head');
    expect(PROXY_EXEMPT_ROLES).not.toContain(NO_HR_ROLE);
  });

  it("hasAccess('/hr/playbooks', 'hr_head', <map without view_profile>) is true", async () => {
    const { routeMatcher } = await import('@/lib/auth/route-matcher');
    expect(routeMatcher.match('/hr/playbooks')?.permission).toBe('view_profile');
    expect(HR_HEAD_MAP.view_profile).toBeUndefined();
    expect(routeMatcher.hasAccess('/hr/playbooks', 'hr_head', HR_HEAD_MAP)).toBe(true);
    expect(routeMatcher.hasAccess('/hr/playbooks', 'hr_head', {})).toBe(true);
  });

  it('a custom role with no HR key reaches /hr/playbooks but not /hr or /hr/payroll', async () => {
    const { routeMatcher } = await import('@/lib/auth/route-matcher');
    expect(routeMatcher.hasAccess('/hr/playbooks', NO_HR_ROLE, NO_HR_MAP)).toBe(true);
    expect(routeMatcher.hasAccess('/hr', NO_HR_ROLE, NO_HR_MAP)).toBe(false);
    expect(routeMatcher.hasAccess('/hr/payroll', NO_HR_ROLE, NO_HR_MAP)).toBe(false);
  });

  it('the shared helper is the only answer: sign-in-only values are sentinels, super_admin is not sign-in-only', async () => {
    const { isSignInOnlyPermission, isSentinelPermission } = await import(
      '@/lib/navigation/permission-filter'
    );
    for (const v of ['view_profile', 'view_dashboard']) {
      expect(isSignInOnlyPermission(v)).toBe(true);
      expect(isSentinelPermission(v)).toBe(true);
    }
    expect(isSignInOnlyPermission('super_admin')).toBe(false);
    expect(isSignInOnlyPermission('hr.view')).toBe(false);
  });

  it('every sign-in-only route in MENU_PERMISSIONS is open at the edge, and the edge agrees with isPageAccessible', async () => {
    const { routeMatcher } = await import('@/lib/auth/route-matcher');
    const { MENU_PERMISSIONS } = await import('@/lib/sidebarMenuLink');
    const { isPageAccessible, isSignInOnlyPermission } = await import(
      '@/lib/navigation/permission-filter'
    );

    const signInOnly = Object.entries(MENU_PERMISSIONS)
      .filter(([, key]) => isSignInOnlyPermission(key))
      .map(([path]) => path)
      .sort();

    // The list this review was asked to check. A new entry should be a
    // deliberate edit here, not a silent widening.
    expect(signInOnly).toEqual([
      '/',
      '/gate-pass',
      '/hr/my-pay-changes',
      '/hr/playbooks',
      '/my-desk',
      '/profile',
      '/whats-new',
    ]);

    for (const path of signInOnly) {
      const edge = routeMatcher.hasAccess(path, NO_HR_ROLE, {});
      const client = isPageAccessible(
        path,
        routeMatcher.match(path)?.permission,
        {},
        false,
        NO_HR_ROLE
      );
      expect({ path, edge }).toEqual({ path, edge: true });
      expect({ path, client }).toEqual({ path, client: true });
    }
  });

  it('a sentinel never grants more than signed in: holding the values as keys opens no other route', async () => {
    const { routeMatcher } = await import('@/lib/auth/route-matcher');
    const { MENU_PERMISSIONS } = await import('@/lib/sidebarMenuLink');
    const { isSignInOnlyPermission } = await import('@/lib/navigation/permission-filter');

    const holdsOnlySentinels = { view_profile: true, view_dashboard: true };
    const leaked: string[] = [];
    let checked = 0;

    for (const path of Object.keys(MENU_PERMISSIONS)) {
      const req = concrete(path);
      const resolved = routeMatcher.match(req)?.permission;
      if (!resolved || isSignInOnlyPermission(resolved)) continue;
      checked++;
      if (routeMatcher.hasAccess(req, NO_HR_ROLE, holdsOnlySentinels)) leaked.push(req);
    }

    expect(checked).toBeGreaterThan(500);
    expect(leaked).toEqual([]);
  });

  it('negative control: /whats-new/highlights keeps its own key and stays shut', async () => {
    const { routeMatcher } = await import('@/lib/auth/route-matcher');
    expect(routeMatcher.match('/whats-new/highlights')?.permission).toBe(
      'whats_new.highlights.manage'
    );
    expect(routeMatcher.hasAccess('/whats-new/highlights', NO_HR_ROLE, {})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5: the real proxy(), end to end
// ---------------------------------------------------------------------------

describe('proxy.ts — sign-in-only routes end to end', () => {
  it('hr_head with no view_profile in its map is SERVED /hr/playbooks (was: /unauthorized)', async () => {
    scenario = { signedIn: true, role: 'hr_head', rolePermissions: HR_HEAD_MAP };
    const proxy = await loadProxy();
    const res = await proxy(request('/hr/playbooks') as any);

    expect(tablesRead).toContain('custom_roles'); // the map really was consulted
    expect(redirectTarget(res)).toBeNull();
    // Served on the role decision — the handover lane was never needed.
    expect(rpcCalls).not.toContain('fn_my_handover_permissions');
  });

  it('a custom role with no HR key: /hr/playbooks served, /hr and /hr/payroll redirected', async () => {
    scenario = { signedIn: true, role: NO_HR_ROLE, rolePermissions: NO_HR_MAP };
    const proxy = await loadProxy();

    expect(redirectTarget(await proxy(request('/hr/playbooks') as any))).toBeNull();
    expect(redirectTarget(await proxy(request('/hr') as any))?.pathname).toBe('/unauthorized');
    expect(redirectTarget(await proxy(request('/hr/payroll') as any))?.pathname).toBe(
      '/unauthorized'
    );
  });

  it('a SIGNED-OUT request for every sign-in-only route is still sent to the login page', async () => {
    scenario = { signedIn: false, role: NO_HR_ROLE, rolePermissions: NO_HR_MAP };
    const proxy = await loadProxy();

    for (const path of [
      '/hr/playbooks',
      '/hr/my-pay-changes',
      '/my-desk',
      '/profile',
      '/whats-new',
      '/gate-pass',
    ]) {
      const target = redirectTarget(await proxy(request(path) as any));
      expect({ path, to: target?.pathname }).toEqual({ path, to: '/auth/login' });
      expect(target?.searchParams.get('redirectedFrom')).toBe(path);
    }
    // Refused before any profile or role map was read.
    expect(tablesRead).not.toContain('custom_roles');
  });
});
