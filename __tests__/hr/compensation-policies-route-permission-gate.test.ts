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
const OTHER_COLLEGE = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5';
const RPC = 'hr_compensation_policies';

let heldKeys: string[] = [];
let superAdmin = false;
let hasSessionCookie = true;
const rpcCalls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
const tablesRead: string[] = [];
/** The colleges the stand-in database says the caller can access. */
let accessibleColleges: string[] = [COLLEGE, OTHER_COLLEGE];
/** Replaces the function's answer for one test (e.g. a database refusal). */
let rpcOverride: (() => { data: unknown; error: unknown }) | null = null;

/** What hr_compensation_policies() returns: one row per accessible college. */
function rpcRows() {
  return accessibleColleges.map((id) => ({
    institution_id: id,
    has_row: true,
    policy_value: {
      pay_matrix: [
        { designation: 'Professor', qualification: 'PhD', basic_pay: id === COLLEGE ? 98765 : 55555 },
      ],
    },
    description: 'pay matrix',
    updated_at: '2026-09-01T00:00:00Z',
    updated_by: null,
  }));
}

const fakeClient = {
  auth: {
    getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
  },
  from: (table: string) => {
    tablesRead.push(table);
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
    if (fn === RPC) return rpcOverride ? rpcOverride() : { data: rpcRows(), error: null };
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
  accessibleColleges = [COLLEGE, OTHER_COLLEGE];
  rpcOverride = null;
});

const readRow = () => rpcCalls.some((c) => c.fn === RPC);

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
    // The read goes through the scoped database function, never the table.
    expect(rpcCalls).toContainEqual({ fn: RPC, args: { p_key: 'hr.pay_scales' } });
    expect(tablesRead).not.toContain('platform_policies');
  });

  it('REFUSES an account without the key with 403, and never reads the row', async () => {
    const res = await call(PAY_QUERY);

    expect(res.status).toBe(403);
    expect(readRow()).toBe(false);
    const text = JSON.stringify(await res.json());
    expect(text).toContain(REQUIRED_KEY);
    expect(text).not.toContain('98765');
  });

  it('REFUSES an account holding neighbouring payroll keys but not the salary one', async () => {
    heldKeys = ['hr.payroll.view', 'hr.payroll.salary.edit.draft', 'hr.policies.view'];

    const res = await call(PAY_QUERY);

    expect(res.status).toBe(403);
    expect(readRow()).toBe(false);
  });

  it('ALLOWS a super admin who holds no key (the editors are super-admin pages)', async () => {
    superAdmin = true;

    const res = await call(PAY_QUERY);

    expect(res.status).toBe(200);
    expect(readRow()).toBe(true);
  });

  it('REFUSES a request carrying an API key instead of a session with 401, before any read', async () => {
    hasSessionCookie = false;

    const res = await call(PAY_QUERY, { authorization: 'Bearer jk_not_a_real_key' });

    expect(res.status).toBe(401);
    expect(readRow()).toBe(false);
  });
});

describe('Compensation policies route: it cannot be turned into a general policy reader', () => {
  it('refuses any key outside the three compensation keys, even for a permitted account', async () => {
    heldKeys = [REQUIRED_KEY];

    for (const key of ['ig.webhook_verify_token', 'hr.payroll.tds_slabs', '']) {
      const res = await call(`key=${encodeURIComponent(key)}&institutionId=${COLLEGE}`);
      expect(res.status, key).toBe(400);
    }
    expect(readRow()).toBe(false);
  });

  it('refuses a missing or malformed institution id', async () => {
    heldKeys = [REQUIRED_KEY];

    expect((await call('key=hr.pay_scales')).status).toBe(400);
    expect((await call('key=hr.pay_scales&institutionId=all')).status).toBe(400);
    expect(readRow()).toBe(false);
  });

  it('serves the allowances and motivation-fund rows the other two editors read', async () => {
    heldKeys = [REQUIRED_KEY];

    for (const key of ['hr.allowances_and_increments', 'hr.motivation_fund']) {
      const res = await call(`key=${key}&institutionId=${COLLEGE}`);
      expect(res.status, key).toBe(200);
    }
  });
});

describe('Compensation policies route: a key holder sees only their own colleges', () => {
  it('serves the caller\'s own college', async () => {
    heldKeys = [REQUIRED_KEY];
    accessibleColleges = [COLLEGE];

    const res = await call(PAY_QUERY);

    expect(res.status).toBe(200);
    expect((await res.json()).row.value.pay_matrix[0].basic_pay).toBe(98765);
  });

  it('REFUSES another college with 403 and none of its figures, even though the id was asked for', async () => {
    heldKeys = [REQUIRED_KEY];
    accessibleColleges = [COLLEGE];

    const res = await call(`key=hr.pay_scales&institutionId=${OTHER_COLLEGE}`);

    expect(res.status).toBe(403);
    const text = JSON.stringify(await res.json());
    expect(text).toContain('do not have access to this college');
    expect(text).not.toContain('55555');
    expect(text).not.toContain('98765');
  });

  it('a college the caller can see but that has no row yet is an empty row, not a refusal', async () => {
    heldKeys = [REQUIRED_KEY];
    accessibleColleges = [COLLEGE];
    rpcOverride = () => ({ data: [{ ...rpcRows()[0], has_row: false, policy_value: null }], error: null });

    const res = await call(PAY_QUERY);

    expect(res.status).toBe(200);
    expect((await res.json()).row).toBeNull();
  });

  it('a database refusal (42501) is a 403, not a 500', async () => {
    heldKeys = [REQUIRED_KEY];
    rpcOverride = () => ({ data: null, error: { code: '42501', message: 'hr.payroll.salary.view is required' } });

    expect((await call(PAY_QUERY)).status).toBe(403);
  });
});
