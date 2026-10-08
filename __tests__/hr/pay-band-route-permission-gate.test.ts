/**
 * Who gets which colleges' pay bands from GET /api/hr/payroll/pay-bands.
 *
 * platform_policies' SELECT policy is `auth.uid() IS NOT NULL`, so a plain table
 * read would return every college's pay matrix to anyone. Two locks replace it:
 * the route's check of `hr.payroll.salary.view`, and the database function
 * hr_pay_band_policies(), which checks the key again and returns only the
 * colleges role_has_institution_access() admits for the caller.
 *
 * These tests run the REAL route and the REAL withAuth against a stand-in
 * session client. The stand-in answers hr_pay_band_policies() the way the
 * rehearsed migration does (checked on a throwaway PostgreSQL 16 with the
 * helpers copied verbatim from supabase/setup/02_functions.sql), and its
 * `platform_policies` table hands back EVERY college — so if the service ever
 * went back to reading the table, the own-college test would see all three
 * colleges and fail.
 *
 * No role name appears anywhere: the stand-in answers from held keys and an
 * institution scope, as the database would.
 *
 * Run: npx vitest run __tests__/hr/pay-band-route-permission-gate.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const REQUIRED_KEY = 'hr.payroll.salary.view';
const A = 'inst-a';
const B = 'inst-b';
const C = 'inst-c';

/** What the stand-in database says about the signed-in account. */
let heldKeys: string[] = [];
let superAdmin = false;
let admin = false;
/** 'all' = a role with institution_scope 'all'; otherwise the colleges the caller may see. */
let scope: 'all' | string[] = [A];
let hasSessionCookie = true;
const rpcCalls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
/** Every table the route touched, so "the table was never read" is checkable. */
const tablesRead: string[] = [];

function band(institutionId: string, basicPay: number) {
  return {
    institution_id: institutionId,
    band: { pay_matrix: [{ designation: 'Typist', basic_pay: basicPay }] },
    band_updated_at: '2026-09-01T00:00:00Z',
  };
}
const ALL_BANDS = [band(A, 6500), band(B, 7000), band(C, 7500)];

/** hr_pay_band_policies(), as the migration defines it. */
function payBandRpc() {
  if (!(superAdmin || heldKeys.includes(REQUIRED_KEY))) {
    return {
      data: null,
      error: { code: '42501', message: 'hr.payroll.salary.view is required to see pay bands.' },
    };
  }
  const visible =
    superAdmin || scope === 'all'
      ? ALL_BANDS
      : ALL_BANDS.filter((r) => (scope as string[]).includes(r.institution_id));
  return { data: visible, error: null };
}

/** The raw table: every college, to anyone signed in. Reading it is the leak. */
function rawPolicyTable() {
  const rows = ALL_BANDS.map((r) => ({
    scope_id: r.institution_id,
    value: r.band,
    updated_at: r.band_updated_at,
  }));
  const q = {
    select: () => q,
    eq: () => q,
    in: () => q,
    then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
  };
  return q;
}

const fakeClient = {
  auth: {
    getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
  },
  from: (table: string) => {
    tablesRead.push(table);
    if (table === 'platform_policies') return rawPolicyTable();
    // profiles, read by withAuth's session step.
    return {
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              id: 'user-1',
              email: 'someone@jkkn.ac.in',
              role: 'not-consulted',
              institution_id: A,
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
    if (fn === 'is_admin') return { data: admin, error: null };
    if (fn === 'user_has_permission') {
      return { data: heldKeys.includes(String(args?.permission_name)), error: null };
    }
    if (fn === 'hr_pay_band_policies') return payBandRpc();
    return { data: null, error: null };
  },
};

vi.mock('server-only', () => ({}));
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

function call(query = '', headers?: Record<string, string>) {
  return GET(new NextRequest(`http://localhost/api/hr/payroll/pay-bands${query}`, { headers }));
}

async function collegesIn(res: Response): Promise<string[]> {
  const body = await res.json();
  return body.bands.map((b: { institutionId: string }) => b.institutionId).sort();
}

beforeEach(() => {
  heldKeys = [];
  superAdmin = false;
  admin = false;
  scope = [A];
  hasSessionCookie = true;
  rpcCalls.length = 0;
  tablesRead.length = 0;
});

describe('Pay band route: which colleges each caller gets', () => {
  it('gives an OWN-college holder of the key only their own college', async () => {
    heldKeys = [REQUIRED_KEY];
    scope = [A];

    const res = await call();

    expect(res.status).toBe(200);
    expect(await collegesIn(res)).toEqual([A]);
    expect(tablesRead).not.toContain('platform_policies');
  });

  it('gives an ALL-college holder of the key every college', async () => {
    heldKeys = [REQUIRED_KEY];
    scope = 'all';

    const res = await call();

    expect(res.status).toBe(200);
    expect(await collegesIn(res)).toEqual([A, B, C]);
  });

  it('adds a college the caller was granted on top of their own', async () => {
    heldKeys = [REQUIRED_KEY];
    scope = [A, C];

    const res = await call();

    expect(await collegesIn(res)).toEqual([A, C]);
  });

  it('ignores a college named in the request: the database decides, not the caller', async () => {
    heldKeys = [REQUIRED_KEY];
    scope = [A];

    const res = await call(`?institutionId=${B}&institution_id=${B}`);

    expect(await collegesIn(res)).toEqual([A]);
    expect(rpcCalls.filter((c) => c.fn === 'hr_pay_band_policies')).toEqual([
      { fn: 'hr_pay_band_policies', args: undefined },
    ]);
  });

  it('gives a super admin who holds no key every college', async () => {
    superAdmin = true;
    scope = [];

    const res = await call();

    expect(res.status).toBe(200);
    expect(await collegesIn(res)).toEqual([A, B, C]);
  });
});

describe('Pay band route: who is refused', () => {
  it('ALLOWS past the route gate only on the salary key, asked of the database by name', async () => {
    heldKeys = [REQUIRED_KEY];

    await call();

    expect(rpcCalls).toContainEqual({
      fn: 'user_has_permission',
      args: { permission_name: REQUIRED_KEY },
    });
  });

  it('REFUSES an account without the key with 403, and never reads a band', async () => {
    const res = await call();

    expect(res.status).toBe(403);
    expect(tablesRead).not.toContain('platform_policies');
    expect(rpcCalls.map((c) => c.fn)).not.toContain('hr_pay_band_policies');
    const text = JSON.stringify(await res.json());
    expect(text).toContain(REQUIRED_KEY);
    expect(text).not.toContain('6500');
  });

  it('REFUSES an account holding a neighbouring payroll key but not the salary one', async () => {
    heldKeys = ['hr.payroll.view', 'hr.payroll.salary.edit.draft'];

    const res = await call();

    expect(res.status).toBe(403);
    expect(rpcCalls.map((c) => c.fn)).not.toContain('hr_pay_band_policies');
  });

  it('answers 403, not 500, when the route admits someone the database then refuses', async () => {
    // withAuth's triad also admits is_admin(); the database function asks only
    // for the key, exactly as hr_staff_salary_directory() does.
    admin = true;

    const res = await call();

    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).toContain(REQUIRED_KEY);
    expect(tablesRead).not.toContain('platform_policies');
  });

  it('REFUSES a request carrying an API key instead of a session, before any read', async () => {
    // An API key skips withAuth's permission check, so the route must not accept one.
    hasSessionCookie = false;

    const res = await call('', { authorization: 'Bearer jk_not_a_real_key' });

    expect(res.status).toBe(401);
    expect(rpcCalls.map((c) => c.fn)).not.toContain('hr_pay_band_policies');
  });
});
