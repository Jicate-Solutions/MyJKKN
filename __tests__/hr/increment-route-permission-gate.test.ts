/**
 * GAP closed: the ALLOWED path for someone who is not a super admin.
 *
 * The Annual Increments route is gated on the `hr.payroll.salary.view` key
 * through withAuth's canonical triad — is_super_admin() OR is_admin() OR
 * user_has_permission(key). Every live check of this page so far was made as a
 * super admin, and the role that normally holds the key has no test-login
 * account, so the third arm — "an ordinary account that simply holds the key"
 * — had never been exercised.
 *
 * This runs the REAL route and the REAL withAuth against a stand-in session
 * client. No role name appears anywhere: the stand-in answers the three RPCs
 * the way the database would for an account holding (or not holding) a key.
 * The report builder is replaced so no table is read; what is proven is only
 * whether the gate lets the request through to it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const REQUIRED_KEY = 'hr.payroll.salary.view';

/** What the stand-in database says about the signed-in account. */
let heldKeys: string[] = [];
let superAdmin = false;
let admin = false;
const rpcCalls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
/** Whether the request carries a browser session cookie. */
let hasSessionCookie = true;

const fakeClient = {
  auth: {
    getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
  },
  from: () => ({
    select: () => ({
      eq: () => ({
        single: async () => ({
          data: {
            id: 'user-1',
            email: 'someone@jkkn.ac.in',
            role: 'not-consulted',
            institution_id: 'inst-1',
            full_name: 'Someone',
          },
          error: null,
        }),
      }),
    }),
  }),
  rpc: async (fn: string, args?: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    if (fn === 'is_super_admin') return { data: superAdmin, error: null };
    if (fn === 'is_admin') return { data: admin, error: null };
    if (fn === 'user_has_permission') {
      return { data: heldKeys.includes(String(args?.permission_name)), error: null };
    }
    return { data: null, error: null };
  },
};

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => fakeClient,
}));
// BaseService builds a browser client at import; never used on this path.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({}),
}));
vi.mock('@/lib/auth/preview-session', () => ({
  getPreviewClaimsFromCookies: async () => null,
  writePreviewAudit: async () => {},
  canUseWriteMode: () => false,
}));
// With a session cookie, withAuth takes the session path (the one a person in
// a browser takes); without one it would take the API-key path.
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => (hasSessionCookie ? [{ name: 'sb-project-auth-token', value: 'x' }] : []),
    get: () => undefined,
    set: () => {},
  }),
}));
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  connection: async () => {},
}));

const build = vi.fn();
vi.mock('@/lib/services/hr/increments/increment-report-service', () => ({
  IncrementReportService: { build: (...a: unknown[]) => build(...a) },
}));

import { GET } from '@/app/api/hr/payroll/increments/route';

function call() {
  return GET(new NextRequest('http://localhost/api/hr/payroll/increments?asOf=2026-09-29'));
}

beforeEach(() => {
  heldKeys = [];
  superAdmin = false;
  admin = false;
  rpcCalls.length = 0;
  hasSessionCookie = true;
  build.mockReset();
  build.mockResolvedValue({
    asOf: '2026-09-29',
    colleges: [],
    collegesWithoutRules: [],
    noAccessibleColleges: false,
  });
});

describe('Annual Increments route: who the permission gate lets through', () => {
  it('ALLOWS an account that is not a super admin or admin but holds hr.payroll.salary.view', async () => {
    heldKeys = [REQUIRED_KEY];

    const res = await call();

    expect(res.status).toBe(200);
    expect(build).toHaveBeenCalledTimes(1);
    expect(build.mock.calls[0][1]).toEqual({ asOf: '2026-09-29' });
    // The gate asked the database about exactly this key — not a role name.
    expect(rpcCalls).toContainEqual({
      fn: 'user_has_permission',
      args: { permission_name: REQUIRED_KEY },
    });
    expect((await res.json()).asOf).toBe('2026-09-29');
  });

  it('DENIES an account that holds no relevant key, and never builds the report', async () => {
    const res = await call();

    expect(res.status).toBe(403);
    expect(build).not.toHaveBeenCalled();
    expect(JSON.stringify(await res.json())).toContain(REQUIRED_KEY);
  });

  it('DENIES an account holding a neighbouring payroll key but not the salary one', async () => {
    // A lesser HR/payroll key must not be enough: the page shows current pay
    // beside what a rise would make it.
    heldKeys = ['hr.payroll.view', 'hr.payroll.salary.edit.draft'];

    const res = await call();

    expect(res.status).toBe(403);
    expect(build).not.toHaveBeenCalled();
  });

  it('still ALLOWS a super admin who holds no key (the bypass the page was checked with live)', async () => {
    superAdmin = true;

    const res = await call();

    expect(res.status).toBe(200);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('REFUSES an API key outright: the permission check only runs for a browser session', async () => {
    // withAuth checks requirePermission on the session path only. If this
    // route accepted API keys, a key with plain "read" would skip the salary
    // permission entirely and receive every college's pay.
    hasSessionCookie = false;
    heldKeys = [REQUIRED_KEY];

    const res = await GET(
      new NextRequest('http://localhost/api/hr/payroll/increments', {
        headers: { authorization: 'Bearer jkkn_some_api_key' },
      }),
    );

    expect(res.status).toBe(401);
    expect(build).not.toHaveBeenCalled();
    expect(JSON.stringify(await res.json())).toContain('browser session');
  });
});
