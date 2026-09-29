/**
 * The /api/hr/salary-revisions routes and the scheduled job, run for real
 * (the real withAuth, the real service) against stand-in clients.
 *
 * The stand-in SESSION client answers the database functions of
 * 20270519090000 the way the rehearsal shows them answering (run.sh). The
 * stand-in SERVICE-ROLE client answers only hr_salary_revision_suggestion_inputs
 * and records which staff ids it was asked about — the raw band and rule may
 * only be read for people the caller's own scoped read returned.
 *
 * Run: npx vitest run __tests__/hr/salary-revision-routes.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const A1 = '11111111-1111-4111-8111-111111111111';
const A2 = '22222222-2222-4222-8222-222222222222';
const OUTSIDE = '33333333-3333-4333-8333-333333333333';
const REQ = '44444444-4444-4444-8444-444444444444';
const OPEN = '55555555-5555-4555-8555-555555555555';

let heldKeys: string[] = [];
let superAdmin = false;
let approver = false;
let openFor: Record<string, string> = {};
let rpcError: { code: string; message: string; details?: string } | null = null;
const calls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
const adminCalls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
const tablesRead: string[] = [];

const ROW = (over: Record<string, unknown> = {}) => ({
  id: REQ, staff_id: A1, person_name: 'Member One', staff_code: 'F1', designation: 'Office Assistant',
  institution_id: 'inst-a', institution_name: 'College A', department_name: 'Dept A1',
  asked_by: 'user-1', asked_by_name: 'HOD', asked_as: 'hod', route: 'via_principal',
  is_self: false, is_for_senior: false, current_monthly_gross: '48000.00', asked_monthly_gross: '56500.00',
  is_cut: false, final_monthly_gross: null, final_is_cut: null, reason: 'Good work', status: 'waiting_director',
  starts_on: null, created_at: '2026-09-29T05:00:00Z', principal_decided_at: '2026-09-29T06:00:00Z',
  director_decided_at: null, applied_at: null, comment_count: 0, ...over,
});

function chain(table: string) {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.eq = () => c;
  c.order = async () => ({ data: [{ id: 'o1', new_monthly_gross: '52500.00' }], error: null });
  c.single = async () => ({
    data: { id: 'user-1', email: 'someone@jkkn.ac.in', role: 'not-consulted', institution_id: 'inst-a', full_name: 'Someone' },
    error: null,
  });
  tablesRead.push(table);
  return c;
}

const fakeClient = {
  auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  from: (table: string) => chain(table),
  rpc: async (fn: string, args?: Record<string, unknown>) => {
    calls.push({ fn, args });
    if (fn === 'is_super_admin') return { data: superAdmin, error: null };
    if (fn === 'is_admin') return { data: false, error: null };
    if (fn === 'user_has_permission') return { data: heldKeys.includes(String(args?.permission_name)), error: null };
    if (rpcError && fn.startsWith('fn_hr_salary_revision_') && fn !== 'fn_hr_salary_revision_can_approve') {
      return { data: null, error: rpcError };
    }
    switch (fn) {
      case 'fn_hr_salary_revision_can_approve': return { data: approver, error: null };
      case 'fn_hr_salary_revision_list': return { data: [ROW()], error: null };
      case 'fn_hr_salary_revision_apply_due': return { data: 0, error: null };
      case 'fn_hr_salary_revision_people':
        return { data: [{ staff_uuid: A1, person_name: 'Member One', monthly_gross: '48000.00', is_self: false, open_request_id: null }], error: null };
      case 'fn_hr_salary_revision_get':
        return { data: { request: ROW(), decision_note: null, comments: [] }, error: null };
      case 'fn_hr_salary_revision_propose': {
        const open = openFor[String(args?.p_staff_id)];
        if (open) return { data: null, error: { code: '23505', message: 'A salary revision for this person is already waiting.', details: open } };
        return { data: REQ, error: null };
      }
      case 'fn_hr_salary_revision_college_decide': return { data: args?.p_agree ? 'waiting_director' : 'stopped', error: null };
      case 'fn_hr_salary_revision_director_decide': return { data: args?.p_approve ? 'approved' : 'refused', error: null };
      case 'fn_hr_salary_revision_director_approve_many': return { data: (args?.p_request_ids as string[]).length, error: null };
      case 'fn_hr_salary_revision_comment': return { data: 'c1', error: null };
      default: return { data: null, error: null };
    }
  },
};

const fakeAdmin = {
  rpc: async (fn: string, args?: Record<string, unknown>) => {
    adminCalls.push({ fn, args });
    if (fn === 'hr_salary_revision_suggestion_inputs') {
      return {
        data: (args?.p_staff_ids as string[]).map((id) => ({
          staff_uuid: id, institution_id: 'inst-a', designation: 'Office Assistant', date_of_joining: '2020-06-01',
          experience_years: 0, has_extended_profile: false, qualifications: [], research_papers: 0,
          monthly_gross: '48000.00',
          band: { pay_matrix: [{ designation: 'Office Assistant', basic_pay: 40000 }, { designation: 'Office Assistant', basic_pay: 50000 }] },
          rule: { per_year_at_jkkn: 1500 }, rule_source: 'college', rule_updated_at: '2026-09-29T00:00:00Z',
        })),
        error: null,
      };
    }
    if (fn === 'fn_hr_salary_revision_apply_due' || fn === 'fn_hr_salary_revision_weekly_digest') return { data: 2, error: null };
    return { data: null, error: null };
  },
};

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => fakeClient,
  createServiceRoleClient: () => fakeAdmin,
}));
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => ({}) }));
vi.mock('@/lib/auth/preview-session', () => ({
  getPreviewClaimsFromCookies: async () => null,
  writePreviewAudit: async () => {},
  canUseWriteMode: () => false,
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [{ name: 'sb-project-auth-token', value: 'x' }], get: () => undefined, set: () => {} }),
}));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), connection: async () => {} }));

import * as listRoute from '@/app/api/hr/salary-revisions/route';
import * as peopleRoute from '@/app/api/hr/salary-revisions/people/route';
import * as oneRoute from '@/app/api/hr/salary-revisions/[id]/route';
import * as manyRoute from '@/app/api/hr/salary-revisions/approve-many/route';
import * as outcomesRoute from '@/app/api/hr/salary-revisions/my-outcomes/route';
import * as cronRoute from '@/app/api/cron/hr-salary-revisions/route';

const req = (url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, body === undefined ? undefined : {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const fnCalls = (fn: string) => calls.filter((c) => c.fn === fn);

beforeEach(() => {
  heldKeys = ['hr.payroll.salary_revision.ask'];
  superAdmin = false;
  approver = false;
  openFor = {};
  rpcError = null;
  calls.length = 0;
  adminCalls.length = 0;
  tablesRead.length = 0;
  process.env.CRON_SECRET = 'cron-secret';
});

describe('GET /api/hr/salary-revisions', () => {
  it('refuses someone without the ask key before any salary revision function runs', async () => {
    heldKeys = [];
    const res = await listRoute.GET(req('/api/hr/salary-revisions?view=mine'), {} as never);
    expect(res.status).toBe(403);
    expect(calls.some((c) => c.fn.startsWith('fn_hr_salary_revision_'))).toBe(false);
  });

  it('shows the asker the suggested figure but NOT the band warning (ruling 6 is for the Director)', async () => {
    const res = await listRoute.GET(req('/api/hr/salary-revisions?view=mine'), {} as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(fnCalls('fn_hr_salary_revision_list')[0].args).toEqual({ p_view: 'mine' });
    expect(body.requests[0].suggestion.verdict).toBe('suggested');
    expect(body.requests[0].band_warning).toBeNull();
    expect(JSON.stringify(body)).not.toContain('pay_matrix');
    expect(JSON.stringify(body)).not.toContain('per_year_at_jkkn');
  });

  it('on the Director’s list, writes any raise that is due FIRST, then warns about the band', async () => {
    const res = await listRoute.GET(req('/api/hr/salary-revisions?view=director'), {} as never);
    const body = await res.json();
    const order = calls.map((c) => c.fn).filter((f) => f.startsWith('fn_hr_salary_revision_'));
    expect(order.indexOf('fn_hr_salary_revision_apply_due')).toBeLessThan(order.indexOf('fn_hr_salary_revision_list'));
    expect(body.requests[0].band_warning).toBe('Above the band by ₹6,500');
  });

  it('reads the band and rule only for the people the caller’s own list returned', async () => {
    await listRoute.GET(req('/api/hr/salary-revisions?view=all'), {} as never);
    expect(adminCalls).toEqual([{ fn: 'hr_salary_revision_suggestion_inputs', args: { p_staff_ids: [A1] } }]);
  });

  it('refuses an unknown list', async () => {
    const res = await listRoute.GET(req('/api/hr/salary-revisions?view=everything'), {} as never);
    expect(res.status).toBe(400);
  });

  it('turns the database’s refusal into 403, not 500', async () => {
    rpcError = { code: '42501', message: 'Only the Director can open the approval list.' };
    const res = await listRoute.GET(req('/api/hr/salary-revisions?view=director'), {} as never);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/hr/salary-revisions (ask)', () => {
  it('refuses a blank reason without calling the database (ruling 13)', async () => {
    const res = await listRoute.POST(req('/api/hr/salary-revisions', { staffId: A1, monthlyGross: 52000, reason: '  ' }), {} as never);
    expect(res.status).toBe(400);
    expect(fnCalls('fn_hr_salary_revision_propose')).toHaveLength(0);
  });

  it('refuses a figure that is not a number', async () => {
    const res = await listRoute.POST(req('/api/hr/salary-revisions', { staffId: A1, monthlyGross: '52000', reason: 'x' }), {} as never);
    expect(res.status).toBe(400);
  });

  it('passes the figure and the reason to the database and returns the new id', async () => {
    const res = await listRoute.POST(req('/api/hr/salary-revisions', { staffId: A1, monthlyGross: 52000, reason: 'Good work' }), {} as never);
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe(REQ);
    expect(fnCalls('fn_hr_salary_revision_propose')[0].args).toEqual({ p_staff_id: A1, p_monthly_gross: 52000, p_reason: 'Good work' });
  });

  it('tells a second asker which request is waiting (ruling 10)', async () => {
    openFor[A1] = OPEN;
    const res = await listRoute.POST(req('/api/hr/salary-revisions', { staffId: A1, monthlyGross: 52000, reason: 'x' }), {} as never);
    expect(res.status).toBe(409);
    expect((await res.json()).openRequestId).toBe(OPEN);
  });
});

describe('GET /api/hr/salary-revisions/people', () => {
  it('works out the suggestion for a person in the caller’s own list', async () => {
    const res = await peopleRoute.GET(req(`/api/hr/salary-revisions/people?staffId=${A1}`), {} as never);
    expect(res.status).toBe(200);
    expect((await res.json()).suggestion.verdict).toBe('suggested');
  });

  it('never reads the band or rule for someone outside the caller’s list', async () => {
    const res = await peopleRoute.GET(req(`/api/hr/salary-revisions/people?staffId=${OUTSIDE}`), {} as never);
    expect(res.status).toBe(404);
    expect(adminCalls).toHaveLength(0);
  });
});

describe('POST /api/hr/salary-revisions/:id', () => {
  it('a no needs a reason (ruling 14)', async () => {
    const res = await oneRoute.POST(req(`/api/hr/salary-revisions/${REQ}`, { action: 'refuse', reason: '' }), ctx(REQ) as never);
    expect(res.status).toBe(400);
    expect(fnCalls('fn_hr_salary_revision_director_decide')).toHaveLength(0);
  });

  it('a stop needs a reason (ruling 2)', async () => {
    const res = await oneRoute.POST(req(`/api/hr/salary-revisions/${REQ}`, { action: 'college_stop' }), ctx(REQ) as never);
    expect(res.status).toBe(400);
  });

  it('the Director may approve at his own figure (ruling 12)', async () => {
    const res = await oneRoute.POST(req(`/api/hr/salary-revisions/${REQ}`, { action: 'approve', finalMonthlyGross: 52500 }), ctx(REQ) as never);
    expect(res.status).toBe(200);
    expect(fnCalls('fn_hr_salary_revision_director_decide')[0].args).toEqual({
      p_request_id: REQ, p_approve: true, p_final_monthly_gross: 52500, p_reason: null,
    });
  });

  it('approving with no figure approves the amount asked', async () => {
    await oneRoute.POST(req(`/api/hr/salary-revisions/${REQ}`, { action: 'approve' }), ctx(REQ) as never);
    expect(fnCalls('fn_hr_salary_revision_director_decide')[0].args?.p_final_monthly_gross).toBeNull();
  });

  it('refuses a zero figure', async () => {
    const res = await oneRoute.POST(req(`/api/hr/salary-revisions/${REQ}`, { action: 'approve', finalMonthlyGross: 0 }), ctx(REQ) as never);
    expect(res.status).toBe(400);
  });

  it('agree, stop, comment and refuse reach the right database function', async () => {
    await oneRoute.POST(req(`/api/hr/salary-revisions/${REQ}`, { action: 'college_agree' }), ctx(REQ) as never);
    await oneRoute.POST(req(`/api/hr/salary-revisions/${REQ}`, { action: 'college_stop', reason: 'Wait' }), ctx(REQ) as never);
    await oneRoute.POST(req(`/api/hr/salary-revisions/${REQ}`, { action: 'comment', body: 'Agreed' }), ctx(REQ) as never);
    await oneRoute.POST(req(`/api/hr/salary-revisions/${REQ}`, { action: 'refuse', reason: 'Budget closed' }), ctx(REQ) as never);
    expect(fnCalls('fn_hr_salary_revision_college_decide').map((c) => c.args?.p_agree)).toEqual([true, false]);
    expect(fnCalls('fn_hr_salary_revision_comment')[0].args).toEqual({ p_request_id: REQ, p_body: 'Agreed' });
    expect(fnCalls('fn_hr_salary_revision_director_decide')[0].args).toMatchObject({ p_approve: false, p_reason: 'Budget closed' });
  });

  it('a request no longer waiting answers 409', async () => {
    rpcError = { code: '55000', message: 'This request is no longer waiting for the principal.' };
    const res = await oneRoute.POST(req(`/api/hr/salary-revisions/${REQ}`, { action: 'college_agree' }), ctx(REQ) as never);
    expect(res.status).toBe(409);
  });

  it('unknown actions and bad ids are refused', async () => {
    expect((await oneRoute.POST(req(`/api/hr/salary-revisions/${REQ}`, { action: 'delete' }), ctx(REQ) as never)).status).toBe(400);
    expect((await oneRoute.POST(req('/api/hr/salary-revisions/x', { action: 'comment', body: 'y' }), ctx('x') as never)).status).toBe(404);
  });

  it('the single view asks the database whether the caller is the Director before showing the band', async () => {
    approver = true;
    const res = await oneRoute.GET(req(`/api/hr/salary-revisions/${REQ}`), ctx(REQ) as never);
    expect((await res.json()).request.band_warning).toBe('Above the band by ₹6,500');
    approver = false;
    const res2 = await oneRoute.GET(req(`/api/hr/salary-revisions/${REQ}`), ctx(REQ) as never);
    expect((await res2.json()).request.band_warning).toBeNull();
  });
});

describe('POST /api/hr/salary-revisions/approve-many (ruling 15)', () => {
  it('needs the approve key', async () => {
    const res = await manyRoute.POST(req('/api/hr/salary-revisions/approve-many', { ids: [REQ] }), {} as never);
    expect(res.status).toBe(403);
  });
  it('approves exactly the ticked ids', async () => {
    heldKeys = ['hr.payroll.salary_revision.approve'];
    const res = await manyRoute.POST(req('/api/hr/salary-revisions/approve-many', { ids: [REQ, OPEN] }), {} as never);
    expect(res.status).toBe(200);
    expect(fnCalls('fn_hr_salary_revision_director_approve_many')[0].args).toEqual({ p_request_ids: [REQ, OPEN] });
  });
  it('refuses a list with anything that is not an id', async () => {
    heldKeys = ['hr.payroll.salary_revision.approve'];
    const res = await manyRoute.POST(req('/api/hr/salary-revisions/approve-many', { ids: [REQ, 'x'] }), {} as never);
    expect(res.status).toBe(400);
    expect(fnCalls('fn_hr_salary_revision_director_approve_many')).toHaveLength(0);
  });
});

describe('GET /api/hr/salary-revisions/my-outcomes (ruling 5)', () => {
  it('any signed-in person may ask; it reads only the outcomes table (RLS returns their own)', async () => {
    heldKeys = [];
    const res = await outcomesRoute.GET(req('/api/hr/salary-revisions/my-outcomes'), {} as never);
    expect(res.status).toBe(200);
    expect(tablesRead).toContain('hr_salary_revision_outcomes');
    expect(tablesRead).not.toContain('hr_salary_revision_requests');
  });
});

describe('GET /api/cron/hr-salary-revisions', () => {
  it('refuses a call without the secret', async () => {
    const res = await cronRoute.GET(req('/api/cron/hr-salary-revisions?mode=apply'));
    expect(res.status).toBe(401);
  });
  it('apply mode writes the raises that are due; digest mode sends the weekly reminder (ruling 11)', async () => {
    const apply = await cronRoute.GET(req('/api/cron/hr-salary-revisions?mode=apply&secret=cron-secret'));
    const digest = await cronRoute.GET(req('/api/cron/hr-salary-revisions?mode=digest&secret=cron-secret'));
    expect(apply.status).toBe(200);
    expect(digest.status).toBe(200);
    expect(adminCalls.map((c) => c.fn)).toEqual(['fn_hr_salary_revision_apply_due', 'fn_hr_salary_revision_weekly_digest']);
  });
  it('refuses any other mode', async () => {
    const res = await cronRoute.GET(req('/api/cron/hr-salary-revisions?mode=approve&secret=cron-secret'));
    expect(res.status).toBe(400);
    expect(adminCalls).toHaveLength(0);
  });
});
