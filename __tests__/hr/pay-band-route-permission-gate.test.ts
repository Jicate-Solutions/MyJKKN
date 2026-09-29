/**
 * The pay band route is the ONLY thing that stops a signed-in account reading
 * every college's pay matrix: platform_policies' SELECT policy is
 * `auth.uid() IS NOT NULL`, so Postgres adds nothing. These tests run the REAL
 * route and the REAL withAuth against a stand-in session client, and prove the
 * matrix is never read unless the account holds `hr.payroll.salary.view`.
 *
 * No role name appears anywhere: the stand-in answers the three RPCs the way the
 * database would for an account holding (or not holding) a key.
 *
 * Run: npx vitest run __tests__/hr/pay-band-route-permission-gate.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const REQUIRED_KEY = 'hr.payroll.salary.view';

/** What the stand-in database says about the signed-in account. */
let heldKeys: string[] = [];
let superAdmin = false;
let hasSessionCookie = true;
const rpcCalls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
/** Every table the route touched, so "the matrix was never read" is checkable. */
const tablesRead: string[] = [];

const bandRows = [
  {
    scope_id: 'inst-eng',
    value: { pay_matrix: [{ designation: 'Librarian', qualification: 'M.L.I.Sc', basic_pay: 40000 }] },
    updated_at: '2026-09-01T00:00:00Z',
  },
];

function policyQuery() {
  const q = {
    select: () => q,
    eq: () => q,
    then: (resolve: (v: unknown) => unknown) => resolve({ data: bandRows, error: null }),
  };
  return q;
}

const fakeClient = {
  auth: {
    getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
  },
  from: (table: string) => {
    tablesRead.push(table);
    if (table === 'platform_policies') return policyQuery();
    // profiles, read by withAuth's session step.
    return {
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
    };
  },
  rpc: async (fn: string, args?: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    if (fn === 'is_super_admin') return { data: superAdmin, error: null };
    if (fn === 'is_admin') return { data: false, error: null };
    if (fn === 'user_has_permission') {
      return { data: heldKeys.includes(String(args?.permission_name)), error: null };
    }
    return { data: null, error: null };
  },
};

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => fakeClient,
}));
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({}),
}));
vi.mock('@/lib/auth/preview-session', () => ({
  getPreviewClaimsFromCookies: async () => null,
  writePreviewAudit: async () => {},
  canUseWriteMode: () => false,
}));
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

import { GET } from '@/app/api/hr/payroll/pay-bands/route';

function call(headers?: Record<string, string>) {
  return GET(new NextRequest('http://localhost/api/hr/payroll/pay-bands', { headers }));
}

beforeEach(() => {
  heldKeys = [];
  superAdmin = false;
  hasSessionCookie = true;
  rpcCalls.length = 0;
  tablesRead.length = 0;
});

describe('Pay band route: who the permission gate lets through', () => {
  it('ALLOWS an account that is not a super admin but holds hr.payroll.salary.view', async () => {
    heldKeys = [REQUIRED_KEY];

    const res = await call();

    expect(res.status).toBe(200);
    expect(rpcCalls).toContainEqual({
      fn: 'user_has_permission',
      args: { permission_name: REQUIRED_KEY },
    });
    const body = await res.json();
    expect(body.bands).toHaveLength(1);
    expect(body.bands[0].institutionId).toBe('inst-eng');
    expect(body.bands[0].policy.rungs[0].basicPay).toBe(40000);
  });

  it('REFUSES an account without the key with 403, and never reads the pay matrix', async () => {
    const res = await call();

    expect(res.status).toBe(403);
    expect(tablesRead).not.toContain('platform_policies');
    const text = JSON.stringify(await res.json());
    expect(text).toContain(REQUIRED_KEY);
    expect(text).not.toContain('40000');
  });

  it('REFUSES an account holding a neighbouring payroll key but not the salary one', async () => {
    heldKeys = ['hr.payroll.view', 'hr.payroll.salary.edit.draft'];

    const res = await call();

    expect(res.status).toBe(403);
    expect(tablesRead).not.toContain('platform_policies');
  });

  it('ALLOWS a super admin who holds no key', async () => {
    superAdmin = true;

    const res = await call();

    expect(res.status).toBe(200);
    expect(tablesRead).toContain('platform_policies');
  });

  it('REFUSES a request carrying an API key instead of a session, before any read', async () => {
    // An API key skips withAuth's permission check, so the route must not accept one.
    hasSessionCookie = false;

    const res = await call({ authorization: 'Bearer jk_not_a_real_key' });

    expect(res.status).toBe(401);
    expect(tablesRead).not.toContain('platform_policies');
  });
});
