/**
 * Who gets a salary suggestion from GET /api/hr/payroll/salary-suggestions.
 *
 * Runs the REAL route and the REAL withAuth against a stand-in session client.
 * The stand-in answers hr_salary_suggestion_inputs() the way the rehearsed
 * migration does (supabase/tests/hr-salary-suggestion/run.sh, throwaway
 * PostgreSQL 16, helpers copied verbatim): RAISE 42501 without the key, and the
 * person only when their college is in the caller's scope. Its
 * `platform_policies` table hands back every rule to anyone — so if the service
 * ever read the table instead, `tablesRead` would say so.
 *
 * No role name appears: the stand-in answers from held keys and a college scope.
 *
 * Run: npx vitest run __tests__/hr/salary-suggestion-route-permission-gate.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const REQUIRED_KEY = 'hr.payroll.salary.view';
const A = 'inst-a';
const B = 'inst-b';
const PERSON_A = '11111111-1111-4111-8111-111111111111';
const PERSON_B = '22222222-2222-4222-8222-222222222222';
const C = 'inst-c';
const PERSON_C = '33333333-3333-4333-8333-333333333333';

let heldKeys: string[] = [];
let superAdmin = false;
let admin = false;
let scope: 'all' | string[] = [A];
let hasSessionCookie = true;
const rpcCalls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
const tablesRead: string[] = [];

const PEOPLE: Record<string, { institution_id: string; rule: unknown; rule_source?: 'college' | 'group' }> = {
  [PERSON_A]: { institution_id: A, rule: { per_year_at_jkkn: 500 } },
  [PERSON_B]: { institution_id: B, rule: { per_year_at_jkkn: 900 } },
  // College C has no rule of its own: the migration hands back the group-wide one.
  [PERSON_C]: { institution_id: C, rule: { per_year_at_jkkn: 700 }, rule_source: 'group' },
};

function inputsRpc(args?: Record<string, unknown>) {
  if (!(superAdmin || heldKeys.includes(REQUIRED_KEY))) {
    return {
      data: null,
      error: { code: '42501', message: 'hr.payroll.salary.view is required to suggest a salary.' },
    };
  }
  const id = String(args?.p_staff_id);
  const p = PEOPLE[id];
  const visible = p && (superAdmin || scope === 'all' || (scope as string[]).includes(p.institution_id));
  if (!visible) return { data: [], error: null };
  return {
    data: [
      {
        staff_uuid: id,
        institution_id: p.institution_id,
        designation: 'Office Assistant',
        date_of_joining: '2020-06-15',
        experience_years: 0,
        has_extended_profile: false,
        qualifications: [],
        research_papers: 0,
        monthly_gross: '21000.00',
        band: { pay_matrix: [{ designation: 'Office Assistant', basic_pay: 20000 }, { designation: 'Office Assistant', basic_pay: 30000 }] },
        rule: p.rule,
        rule_source: p.rule_source ?? 'college',
        rule_updated_at: '2026-09-29T00:00:00Z',
      },
    ],
    error: null,
  };
}

const fakeClient = {
  auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  from: (table: string) => {
    tablesRead.push(table);
    return {
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { id: 'user-1', email: 'someone@jkkn.ac.in', role: 'not-consulted', institution_id: A, full_name: 'Someone' },
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
    if (fn === 'hr_salary_suggestion_inputs') return inputsRpc(args);
    return { data: null, error: null };
  },
};

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => fakeClient }));
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => ({}) }));
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

import { GET } from '@/app/api/hr/payroll/salary-suggestions/route';

function call(staffId: string, headers?: Record<string, string>) {
  return GET(
    new NextRequest(`http://localhost/api/hr/payroll/salary-suggestions?staffId=${staffId}`, { headers })
  );
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

describe('Salary suggestion route: what each caller gets', () => {
  it('gives an own-college holder of the key a worked-out suggestion for someone in their college', async () => {
    heldKeys = [REQUIRED_KEY];

    const res = await call(PERSON_A);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestion.verdict).toBe('suggested');
    expect(body.suggestion.bandMin).toBe(20000);
    expect(body.suggestion.currentMonthlyPay).toBe(21000);
    expect(body.ruleSource).toBe('college');
    // The raw rule is not sent; only the worked-out suggestion.
    expect(body.rule).toBeUndefined();
    expect(tablesRead).not.toContain('platform_policies');
    expect(rpcCalls).toContainEqual({ fn: 'hr_salary_suggestion_inputs', args: { p_staff_id: PERSON_A } });
  });

  it('answers 404 for someone in ANOTHER college, and leaks nothing of theirs', async () => {
    heldKeys = [REQUIRED_KEY];
    scope = [A];

    const res = await call(PERSON_B);

    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toMatch(/900|30000|21000/);
  });

  it('gives an all-college holder the other college too', async () => {
    heldKeys = [REQUIRED_KEY];
    scope = 'all';

    const res = await call(PERSON_B);

    expect(res.status).toBe(200);
  });

  it('gives a super admin who holds no key anyone', async () => {
    superAdmin = true;
    scope = [];

    expect((await call(PERSON_B)).status).toBe(200);
  });
});

describe('Salary suggestion route: a college with no rule of its own', () => {
  it('INTENDED: a holder scoped to that one college sees the group-wide amounts in the lines — it is the effective rule there', async () => {
    heldKeys = [REQUIRED_KEY];
    scope = [C];

    const res = await call(PERSON_C);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ruleSource).toBe('group');
    const years = body.suggestion.lines.find((l: { label: string }) => l.label === 'Years at JKKN');
    expect(years.note).toContain('₹700 a year');
    expect(years.amount % 700).toBe(0);
    expect(years.amount).toBeGreaterThan(0);
    // The group-wide row itself is still never sent.
    expect(body.rule).toBeUndefined();
  });

  it('but not for a college outside their scope', async () => {
    heldKeys = [REQUIRED_KEY];
    scope = [A];

    const res = await call(PERSON_C);

    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toMatch(/700/);
  });
});

describe('Salary suggestion route: who is refused', () => {
  it('asks the database for the salary key by name', async () => {
    heldKeys = [REQUIRED_KEY];
    await call(PERSON_A);
    expect(rpcCalls).toContainEqual({ fn: 'user_has_permission', args: { permission_name: REQUIRED_KEY } });
  });

  it('REFUSES an account without the key with 403, before any read', async () => {
    const res = await call(PERSON_A);

    expect(res.status).toBe(403);
    expect(rpcCalls.map((c) => c.fn)).not.toContain('hr_salary_suggestion_inputs');
    expect(JSON.stringify(await res.json())).toContain(REQUIRED_KEY);
  });

  it('REFUSES a neighbouring payroll key', async () => {
    heldKeys = ['hr.payroll.view', 'hr.payroll.salary.edit.draft'];

    expect((await call(PERSON_A)).status).toBe(403);
    expect(rpcCalls.map((c) => c.fn)).not.toContain('hr_salary_suggestion_inputs');
  });

  it('answers 403, not 500, when the route admits someone the database then refuses', async () => {
    admin = true;

    const res = await call(PERSON_A);

    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).toContain(REQUIRED_KEY);
  });

  it('answers 401 with no session, and refuses an API key instead of one', async () => {
    hasSessionCookie = false;

    expect((await call(PERSON_A)).status).toBe(401);
    expect((await call(PERSON_A, { authorization: 'Bearer jk_not_a_real_key' })).status).toBe(401);
    expect(rpcCalls.map((c) => c.fn)).not.toContain('hr_salary_suggestion_inputs');
  });

  it('answers 400 for a missing or malformed person id, without reading', async () => {
    heldKeys = [REQUIRED_KEY];

    expect((await call('')).status).toBe(400);
    expect((await call("x' or 1=1")).status).toBe(400);
    expect(rpcCalls.map((c) => c.fn)).not.toContain('hr_salary_suggestion_inputs');
  });

  it('has no write method', async () => {
    const route = await import('@/app/api/hr/payroll/salary-suggestions/route');
    expect(Object.keys(route).filter((k) => /^(POST|PUT|PATCH|DELETE)$/.test(k))).toEqual([]);
  });
});
