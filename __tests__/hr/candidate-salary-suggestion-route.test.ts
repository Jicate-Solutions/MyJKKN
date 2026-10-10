/**
 * Who gets a suggested salary from
 * GET /api/hr/recruitment/candidates/<id>/salary-suggestion, and what it says.
 *
 * Runs the REAL handler, through the REAL candidate dispatch table, against a
 * stand-in session client. The stand-in answers
 * hr_candidate_salary_suggestion_inputs() the way the rehearsed migration does
 * (supabase/tests/hr-candidate-salary-suggestion/run.sh): RAISE 42501 without
 * hr.payroll.salary.view, the candidate only when visible, and only the amount
 * for THEIR department. Its `platform_policies` table would hand back every
 * rule to anyone, so if the handler ever read the table, `tablesRead` would say so.
 *
 * Run: npx vitest run __tests__/hr/candidate-salary-suggestion-route.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const KEY = 'hr.payroll.salary.view';
const VISIBLE = '11111111-1111-4111-8111-111111111111';
const HIDDEN = '22222222-2222-4222-8222-222222222222';
const NO_RULE = '33333333-3333-4333-8333-333333333333';

let signedIn = true;
let heldKeys: string[] = [];
let superAdmin = false;
let plainAdmin = false;
const rpcCalls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
const tablesRead: string[] = [];

function row(id: string, rate: number | null) {
  return {
    candidate_uuid: id,
    institution_id: 'inst-a',
    institution_name: 'College A',
    designation_id: 'des-1',
    designation: 'Office Assistant',
    department_id: 'dept-a',
    department_name: 'Mechanical',
    // numeric arrives over PostgREST as a string
    prior_experience_years: '4.0',
    prior_experience_source: 'CV page 2',
    band: {
      pay_matrix: [
        { designation: 'Office Assistant', basic_pay: 30000 },
        { designation: 'Office Assistant', basic_pay: 47000 },
      ],
    },
    rule_rate: rate === null ? null : String(rate),
    rule_round_to: null,
    rule_updated_at: '2026-10-08T00:00:00Z',
  };
}

function inputsRpc(args?: Record<string, unknown>) {
  if (!(superAdmin || heldKeys.includes(KEY))) {
    return { data: null, error: { code: '42501', message: 'hr.payroll.salary.view is required to suggest a salary.' } };
  }
  const id = String(args?.p_candidate_id);
  if (id === VISIBLE) return { data: [row(id, 1000)], error: null };
  if (id === NO_RULE) return { data: [row(id, null)], error: null };
  return { data: [], error: null };
}

const fakeClient = {
  auth: {
    getUser: async () =>
      signedIn ? { data: { user: { id: 'user-1' } }, error: null } : { data: { user: null }, error: null },
  },
  from: (table: string) => {
    tablesRead.push(table);
    throw new Error(`no table read expected, got ${table}`);
  },
  rpc: async (fn: string, args?: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    if (fn === 'is_super_admin') return { data: superAdmin, error: null };
    if (fn === 'is_admin') return { data: plainAdmin, error: null };
    if (fn === 'user_has_permission') return { data: heldKeys.includes(String(args?.permission_name)), error: null };
    if (fn === 'hr_candidate_salary_suggestion_inputs') return inputsRpc(args);
    return { data: null, error: null };
  },
};

vi.mock('server-only', () => ({}));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => fakeClient }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => {} }),
}));
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  connection: async () => {},
}));

import { matchCandidateRoute } from '@/lib/api/hr/recruitment/candidates/dispatch';

async function call(id: string) {
  const match = matchCandidateRoute(['salary-suggestion'])!;
  const handler = match.entry.module.GET!;
  return handler(new NextRequest(`http://localhost/api/hr/recruitment/candidates/${id}/salary-suggestion`), {
    params: Promise.resolve({ id, packageId: '' }),
  });
}

beforeEach(() => {
  signedIn = true;
  heldKeys = [];
  superAdmin = false;
  plainAdmin = false;
  rpcCalls.length = 0;
  tablesRead.length = 0;
});

describe('candidate salary suggestion route', () => {
  it('is GET only', () => {
    const match = matchCandidateRoute(['salary-suggestion'])!;
    expect(match.entry.methods).toEqual(['GET']);
    expect(match.entry.module.POST).toBeUndefined();
    expect(match.entry.module.PATCH).toBeUndefined();
    expect(match.entry.module.DELETE).toBeUndefined();
  });

  it('gives a holder of hr.payroll.salary.view the worked-out figure and lines, not the band or rule', async () => {
    heldKeys = [KEY];
    const res = await call(VISIBLE);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestion.verdict).toBe('suggested');
    // 30,000 floor + 4 × 500.
    expect(body.suggestion.suggested).toBe(32000);
    expect(body.suggestion.lines[0].label).toBe('Band floor for Office Assistant');
    const text = JSON.stringify(body);
    expect(text).not.toContain('47000');
    expect(text).not.toContain('47,000');
    expect(body.suggestion.bandMax).toBeUndefined();
    expect(body.rule).toBeUndefined();
    expect(body.rule_rate).toBeUndefined();
    expect(tablesRead).toEqual([]);
    expect(rpcCalls).toContainEqual({ fn: 'hr_candidate_salary_suggestion_inputs', args: { p_candidate_id: VISIBLE } });
  });

  it('refuses (403) someone without the key, before the database is asked', async () => {
    heldKeys = ['hr.recruitment.view', 'hr.recruitment.edit'];
    const res = await call(VISIBLE);
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toMatch(/32000|30000/);
    expect(rpcCalls.map((c) => c.fn)).not.toContain('hr_candidate_salary_suggestion_inputs');
  });

  it('answers 401 when nobody is signed in', async () => {
    signedIn = false;
    heldKeys = [KEY];
    expect((await call(VISIBLE)).status).toBe(401);
  });

  it('answers 404 for a candidate the caller may not see', async () => {
    heldKeys = [KEY];
    expect((await call(HIDDEN)).status).toBe(404);
  });

  it('refuses (403) a plain admin without the key, as the database function does, before it is asked', async () => {
    plainAdmin = true;
    const res = await call(VISIBLE);
    expect(res.status).toBe(403);
    expect(rpcCalls.map((c) => c.fn)).not.toContain('hr_candidate_salary_suggestion_inputs');
  });

  it('a super admin with no key gets the figure', async () => {
    superAdmin = true;
    expect((await call(VISIBLE)).status).toBe(200);
  });

  it('says plainly when the Director has not set the department amount (today, for everyone)', async () => {
    heldKeys = [KEY];
    const body = await (await call(NO_RULE)).json();
    expect(body.suggestion.verdict).toBe('cannot_suggest');
    expect(body.suggestion.suggested).toBeNull();
    expect(body.suggestion.reasons[0].code).toBe('department_amount_not_set');
    expect(body.suggestion.reasons[0].fix.href).toBe('/hr/admin/policies/salary-suggestion');
  });

  it('refuses an id that is not a uuid', async () => {
    heldKeys = [KEY];
    expect((await call('not-an-id')).status).toBe(400);
  });
});
