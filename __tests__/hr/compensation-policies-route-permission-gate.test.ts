/**
 * The compensation-policies route serves the Pay Scales, Allowances and
 * Motivation Fund editors their row. These tests run the REAL route and the REAL
 * withAuth against a stand-in session client and prove the row is never read
 * unless the account holds `hr.payroll.salary.view` (or is a super admin), that
 * an API key is refused, and that the route cannot be pointed at any other key.
 *
 * No role name appears anywhere: the stand-in answers the three RPCs the way the
 * database would for an account holding (or not holding) a key.
 *
 * Run: npx vitest run __tests__/hr/compensation-policies-route-permission-gate.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const REQUIRED_KEY = 'hr.payroll.salary.view';
const COLLEGE = '5de4fba1-4564-41ed-8c73-5d948b74b843';

let heldKeys: string[] = [];
let superAdmin = false;
let hasSessionCookie = true;
const rpcCalls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
const tablesRead: string[] = [];
const filters: Array<[string, unknown]> = [];

const payRow = {
  policy_key: 'hr.pay_scales',
  value: { pay_matrix: [{ designation: 'Professor', qualification: 'PhD', basic_pay: 98765 }] },
  description: 'pay matrix',
  updated_at: '2026-09-01T00:00:00Z',
  updated_by: null,
};

function policyQuery() {
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => {
      filters.push([col, val]);
      return q;
    },
    maybeSingle: async () => ({ data: payRow, error: null }),
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

import { GET } from '@/app/api/hr/compensation-policies/route';

function call(query: string, headers?: Record<string, string>) {
  return GET(new NextRequest(`http://localhost/api/hr/compensation-policies?${query}`, { headers }));
}
const PAY_QUERY = `key=hr.pay_scales&institutionId=${COLLEGE}`;

beforeEach(() => {
  heldKeys = [];
  superAdmin = false;
  hasSessionCookie = true;
  rpcCalls.length = 0;
  tablesRead.length = 0;
  filters.length = 0;
});

describe('Compensation policies route: who the permission gate lets through', () => {
  it('ALLOWS an account that is not a super admin but holds hr.payroll.salary.view', async () => {
    heldKeys = [REQUIRED_KEY];

    const res = await call(PAY_QUERY);

    expect(res.status).toBe(200);
    expect(rpcCalls).toContainEqual({
      fn: 'user_has_permission',
      args: { permission_name: REQUIRED_KEY },
    });
    const body = await res.json();
    expect(body.row.value.pay_matrix[0].basic_pay).toBe(98765);
    // The read is pinned to the one institution-scoped row asked for.
    expect(filters).toEqual([
      ['policy_key', 'hr.pay_scales'],
      ['scope_type', 'institution'],
      ['scope_id', COLLEGE],
    ]);
  });

  it('REFUSES an account without the key with 403, and never reads the row', async () => {
    const res = await call(PAY_QUERY);

    expect(res.status).toBe(403);
    expect(tablesRead).not.toContain('platform_policies');
    const text = JSON.stringify(await res.json());
    expect(text).toContain(REQUIRED_KEY);
    expect(text).not.toContain('98765');
  });

  it('REFUSES an account holding neighbouring payroll keys but not the salary one', async () => {
    heldKeys = ['hr.payroll.view', 'hr.payroll.salary.edit.draft', 'hr.policies.view'];

    const res = await call(PAY_QUERY);

    expect(res.status).toBe(403);
    expect(tablesRead).not.toContain('platform_policies');
  });

  it('ALLOWS a super admin who holds no key (the editors are super-admin pages)', async () => {
    superAdmin = true;

    const res = await call(PAY_QUERY);

    expect(res.status).toBe(200);
    expect(tablesRead).toContain('platform_policies');
  });

  it('REFUSES a request carrying an API key instead of a session with 401, before any read', async () => {
    hasSessionCookie = false;

    const res = await call(PAY_QUERY, { authorization: 'Bearer jk_not_a_real_key' });

    expect(res.status).toBe(401);
    expect(tablesRead).not.toContain('platform_policies');
  });
});

describe('Compensation policies route: it cannot be turned into a general policy reader', () => {
  it('refuses any key outside the three compensation keys, even for a permitted account', async () => {
    heldKeys = [REQUIRED_KEY];

    for (const key of ['ig.webhook_verify_token', 'hr.payroll.tds_slabs', '']) {
      const res = await call(`key=${encodeURIComponent(key)}&institutionId=${COLLEGE}`);
      expect(res.status, key).toBe(400);
    }
    expect(tablesRead).not.toContain('platform_policies');
  });

  it('refuses a missing or malformed institution id', async () => {
    heldKeys = [REQUIRED_KEY];

    expect((await call('key=hr.pay_scales')).status).toBe(400);
    expect((await call('key=hr.pay_scales&institutionId=all')).status).toBe(400);
    expect(tablesRead).not.toContain('platform_policies');
  });

  it('serves the allowances and motivation-fund rows the other two editors read', async () => {
    heldKeys = [REQUIRED_KEY];

    for (const key of ['hr.allowances_and_increments', 'hr.motivation_fund']) {
      const res = await call(`key=${key}&institutionId=${COLLEGE}`);
      expect(res.status, key).toBe(200);
    }
  });
});
