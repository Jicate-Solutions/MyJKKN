/**
 * GET/PATCH /api/hr/recruitment/candidates/<id>/salary-details — the three
 * inputs of the suggested salary (official job title, department, years before
 * JKKN).
 *
 * Pins: PATCH needs hr.recruitment.edit; writes ONLY the three columns (never
 * role_title, never pay); refuses a job title from another HR organisation and
 * a department from another college; a write that reaches no row is a 403.
 * GET pre-selects the job title the role title names exactly.
 *
 * Run: npx vitest run __tests__/hr/candidate-salary-details-route.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const CANDIDATE = '11111111-1111-4111-8111-111111111111';
const ORG = 'org-a';
const COLLEGE = 'inst-a';
const TITLE_OK = 'aaaaaaaa-0000-4000-8000-000000000001';
const TITLE_OTHER_ORG = 'aaaaaaaa-0000-4000-8000-000000000002';
const DEPT_OK = 'bbbbbbbb-0000-4000-8000-000000000001';
const DEPT_OTHER_COLLEGE = 'bbbbbbbb-0000-4000-8000-000000000002';

let heldKeys: string[] = [];
let updateReachesRow = true;
const updates: Array<Record<string, unknown>> = [];

const DESIGNATIONS = [
  { id: TITLE_OK, name: 'Office Assistant', hr_organization_id: ORG },
  { id: TITLE_OTHER_ORG, name: 'Typist', hr_organization_id: 'org-b' },
];
const DEPARTMENTS = [
  { id: DEPT_OK, department_name: 'Mechanical', institution_id: COLLEGE },
  { id: DEPT_OTHER_COLLEGE, department_name: 'Civil', institution_id: 'inst-b' },
];

function query(table: string) {
  const filters: Record<string, unknown> = {};
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => {
      filters[col] = val;
      return q;
    },
    order: () => q,
    update: (values: Record<string, unknown>) => {
      updates.push(values);
      return q;
    },
    maybeSingle: async () => {
      if (table === 'hr_recruitment_candidates') {
        return {
          data: {
            id: CANDIDATE,
            role_title: '  office assistant ',
            institution_id: COLLEGE,
            hr_organization_id: ORG,
            designation_id: null,
            department_id: null,
            prior_experience_years: null,
          },
          error: null,
        };
      }
      const rows = table === 'hr_designations' ? DESIGNATIONS : DEPARTMENTS;
      const hit = rows.find((r) =>
        Object.entries(filters).every(([k, v]) => (r as Record<string, unknown>)[k] === v)
      );
      return { data: hit ? { id: hit.id } : null, error: null };
    },
    then: (resolve: (v: unknown) => void) => {
      if (updates.length > 0 && table === 'hr_recruitment_candidates') {
        return resolve({ data: updateReachesRow ? [{ id: CANDIDATE }] : [], error: null });
      }
      const rows = (table === 'hr_designations' ? DESIGNATIONS : DEPARTMENTS).filter((r) =>
        Object.entries(filters).every(
          ([k, v]) => k === 'is_active' || (r as Record<string, unknown>)[k] === v
        )
      );
      return resolve({ data: rows, error: null });
    },
  };
  return q;
}

const fakeClient = {
  auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  from: (table: string) => query(table),
  rpc: async (fn: string, args?: Record<string, unknown>) => {
    if (fn === 'is_super_admin' || fn === 'is_admin') return { data: false, error: null };
    if (fn === 'user_has_permission') return { data: heldKeys.includes(String(args?.permission_name)), error: null };
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

import { GET, PATCH } from '@/lib/api/hr/recruitment/candidates/handlers/salary-details';

const ctx = { params: Promise.resolve({ id: CANDIDATE }) };
const url = `http://localhost/api/hr/recruitment/candidates/${CANDIDATE}/salary-details`;
function patch(body: unknown) {
  return PATCH(new NextRequest(url, { method: 'PATCH', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: CANDIDATE }),
  });
}

beforeEach(() => {
  heldKeys = ['hr.recruitment.edit'];
  updateReachesRow = true;
  updates.length = 0;
});

describe('salary details: GET', () => {
  it("lists only the candidate's HR organisation's job titles and college's departments, and pre-selects the exact role title", async () => {
    const body = await (await GET(new NextRequest(url), ctx)).json();
    expect(body.designations).toEqual([{ id: TITLE_OK, name: 'Office Assistant' }]);
    expect(body.departments).toEqual([{ id: DEPT_OK, name: 'Mechanical' }]);
    expect(body.roleTitleMatchId).toBe(TITLE_OK);
    expect(body.details).toEqual({ designation_id: null, department_id: null, prior_experience_years: null });
  });
});

describe('salary details: PATCH', () => {
  it('writes exactly the three columns', async () => {
    const res = await patch({ designation_id: TITLE_OK, department_id: DEPT_OK, prior_experience_years: 3.25 });
    expect(res.status).toBe(200);
    expect(updates).toEqual([{ designation_id: TITLE_OK, department_id: DEPT_OK, prior_experience_years: 3.3 }]);
  });

  it('ignores anything else in the body (role_title, pay)', async () => {
    await patch({ designation_id: null, department_id: null, prior_experience_years: null, role_title: 'X', proposed_monthly_salary: 99 });
    expect(Object.keys(updates[0]).sort()).toEqual(['department_id', 'designation_id', 'prior_experience_years']);
  });

  it('needs hr.recruitment.edit', async () => {
    heldKeys = ['hr.recruitment.view'];
    expect((await patch({ designation_id: TITLE_OK })).status).toBe(403);
    expect(updates).toEqual([]);
  });

  it("refuses a job title from another HR organisation and a department from another college", async () => {
    expect((await patch({ designation_id: TITLE_OTHER_ORG })).status).toBe(400);
    expect((await patch({ department_id: DEPT_OTHER_COLLEGE })).status).toBe(400);
    expect(updates).toEqual([]);
  });

  it('refuses negative or out-of-range years', async () => {
    expect((await patch({ prior_experience_years: -1 })).status).toBe(400);
    expect((await patch({ prior_experience_years: 1000 })).status).toBe(400);
    expect((await patch({ prior_experience_years: '3' })).status).toBe(400);
    expect(updates).toEqual([]);
  });

  it('answers 403 when the row policy lets the write reach no row', async () => {
    updateReachesRow = false;
    expect((await patch({ designation_id: TITLE_OK })).status).toBe(403);
  });
});
