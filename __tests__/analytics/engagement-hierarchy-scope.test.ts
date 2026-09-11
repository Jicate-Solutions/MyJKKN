/**
 * Engagement Analytics — GET /api/analytics/engagement/hierarchy is held to the
 * viewer's scope.
 *
 * Found on jicate/main (d91a49ddcf): the route checked only the viewer's role,
 * then read student_engagement_scores through the service-role client (no
 * row-level security). level=institution returned every institution's
 * breakdown, and every other level filtered only by the parent_id in the query
 * string, so a principal or HOD could read any institution's departments,
 * programs, semesters or sections.
 *
 * What these tests hold on to, for each level x {super admin, principal, HOD}:
 *   - a parent inside the viewer's scope returns that breakdown (200, rows);
 *   - a parent outside it returns 403 with a plain message, never an empty 200,
 *     and no engagement row is read;
 *   - a principal's institution breakdown lists only their own institution.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { buildOrgDb, createFakeClient, IDS, type Db, type QueryCall } from './engagement-fake-db';

let db: Db = buildOrgDb();
let calls: QueryCall[] = [];
let currentUserId: string | null = IDS.principalA;

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () =>
    Promise.resolve({
      auth: {
        getUser: () =>
          Promise.resolve({
            data: { user: currentUserId ? { id: currentUserId } : null },
            error: null
          })
      },
      from: (table: string) => createFakeClient(db, calls).from(table)
    }),
  createServiceRoleClient: () => createFakeClient(db, calls)
}));

vi.mock('@/lib/policies/get-policy-client', () => ({
  getPolicyInt: () => Promise.resolve(10000)
}));

import { GET } from '@/app/api/analytics/engagement/hierarchy/route';

beforeEach(() => {
  db = buildOrgDb();
  calls = [];
  currentUserId = IDS.principalA;
});

async function hierarchy(userId: string, level: string, parentId?: string) {
  currentUserId = userId;
  const params = new URLSearchParams({ level });
  if (parentId) params.set('parent_id', parentId);
  const res = await GET(
    new NextRequest(`http://localhost/api/analytics/engagement/hierarchy?${params.toString()}`)
  );
  const body = await res.json();
  return { status: res.status, body, ids: ((body.data ?? []) as Array<{ id: string }>).map((r) => r.id).sort() };
}

const engagementRowsRead = () => calls.some((c) => c.table === 'student_engagement_scores');

function expectRefused(result: { status: number; body: any }) {
  expect(result.status).toBe(403);
  expect(result.status).not.toBe(200);
  expect(typeof result.body.error).toBe('string');
  expect(result.body.error.length).toBeGreaterThan(10);
  expect(result.body.data).toBeUndefined();
  expect(engagementRowsRead()).toBe(false);
}

describe('institution level', () => {
  it('super admin: every institution', async () => {
    const r = await hierarchy(IDS.superAdmin, 'institution');
    expect(r.status).toBe(200);
    expect(r.ids).toEqual([IDS.instA, IDS.instB].sort());
  });

  it('principal: only their own institution', async () => {
    const r = await hierarchy(IDS.principalA, 'institution');
    expect(r.status).toBe(200);
    expect(r.ids).toEqual([IDS.instA]);
    expect(r.body.data[0].name).toBe('Institution A');
  });

  it('principal: level=all is the same, only their own institution', async () => {
    const r = await hierarchy(IDS.principalA, 'all');
    expect(r.status).toBe(200);
    expect(r.ids).toEqual([IDS.instA]);
  });

  it('HOD: refused (403), institution-level data is outside a department', async () => {
    expectRefused(await hierarchy(IDS.hodA1, 'institution'));
  });
});

describe('department level (parent = institution)', () => {
  it('super admin: any institution', async () => {
    const r = await hierarchy(IDS.superAdmin, 'department', IDS.instB);
    expect(r.status).toBe(200);
    expect(r.ids).toEqual([IDS.deptB1]);
  });

  it('principal: own institution returns its departments, with their names', async () => {
    const r = await hierarchy(IDS.principalA, 'department', IDS.instA);
    expect(r.status).toBe(200);
    expect(r.ids).toEqual([IDS.deptA1, IDS.deptA2].sort());
    // departments has department_name, not name; selecting name used to fail
    // the query and leave this breakdown empty.
    expect(r.body.data.map((d: any) => d.name).sort()).toEqual(['Dept A1', 'Dept A2']);
  });

  it('principal: another institution is refused (403)', async () => {
    expectRefused(await hierarchy(IDS.principalA, 'department', IDS.instB));
  });

  it('HOD: their own institution is still refused (403), it is institution-level', async () => {
    expectRefused(await hierarchy(IDS.hodA1, 'department', IDS.instA));
  });

  it('no parent ("all"): super admin sees every department, principal only their own institution', async () => {
    const all = await hierarchy(IDS.superAdmin, 'department', 'all');
    expect(all.ids).toEqual([IDS.deptA1, IDS.deptA2, IDS.deptB1].sort());
    calls = [];
    const own = await hierarchy(IDS.principalA, 'department', 'all');
    expect(own.status).toBe(200);
    expect(own.ids).toEqual([IDS.deptA1, IDS.deptA2].sort());
  });

  it('no parent ("all"): HOD refused (403)', async () => {
    expectRefused(await hierarchy(IDS.hodA1, 'department'));
  });
});

describe('program level (parent = department)', () => {
  it('super admin: any department', async () => {
    const r = await hierarchy(IDS.superAdmin, 'program', IDS.deptB1);
    expect(r.status).toBe(200);
    expect(r.ids).toEqual([IDS.progB1]);
  });

  it('principal: a department in their institution', async () => {
    const r = await hierarchy(IDS.principalA, 'program', IDS.deptA2);
    expect(r.status).toBe(200);
    expect(r.ids).toEqual([IDS.progA2]);
  });

  it('principal: a department in another institution is refused (403)', async () => {
    expectRefused(await hierarchy(IDS.principalA, 'program', IDS.deptB1));
  });

  it('HOD: their own department', async () => {
    const r = await hierarchy(IDS.hodA1, 'program', IDS.deptA1);
    expect(r.status).toBe(200);
    expect(r.ids).toEqual([IDS.progA1]);
  });

  it('HOD: another department in the same institution is refused (403)', async () => {
    expectRefused(await hierarchy(IDS.hodA1, 'program', IDS.deptA2));
  });

  it('HOD: a department in another institution is refused (403)', async () => {
    expectRefused(await hierarchy(IDS.hodA1, 'program', IDS.deptB1));
  });
});

describe('semester level (parent = program)', () => {
  it('super admin: any program', async () => {
    const r = await hierarchy(IDS.superAdmin, 'semester', IDS.progB1);
    expect(r.status).toBe(200);
    expect(r.ids).toEqual([IDS.semB1]);
  });

  it('principal: a program in their institution', async () => {
    const r = await hierarchy(IDS.principalA, 'semester', IDS.progA1);
    expect(r.status).toBe(200);
    expect(r.ids).toEqual([IDS.semA1]);
  });

  it('principal: a program in another institution is refused (403)', async () => {
    expectRefused(await hierarchy(IDS.principalA, 'semester', IDS.progB1));
  });

  it('HOD: a program in their department', async () => {
    const r = await hierarchy(IDS.hodA1, 'semester', IDS.progA1);
    expect(r.status).toBe(200);
    expect(r.ids).toEqual([IDS.semA1]);
  });

  it('HOD: a program in another department is refused (403)', async () => {
    expectRefused(await hierarchy(IDS.hodA1, 'semester', IDS.progA2));
  });
});

describe('section level (parent = semester)', () => {
  it('super admin: any semester', async () => {
    const r = await hierarchy(IDS.superAdmin, 'section', IDS.semB1);
    expect(r.status).toBe(200);
    expect(r.ids).toEqual([IDS.secB1]);
  });

  it('principal: a semester in their institution', async () => {
    const r = await hierarchy(IDS.principalA, 'section', IDS.semA2);
    expect(r.status).toBe(200);
    expect(r.ids).toEqual([IDS.secA2]);
  });

  it('principal: a semester in another institution is refused (403)', async () => {
    expectRefused(await hierarchy(IDS.principalA, 'section', IDS.semB1));
  });

  it('HOD: a semester in their department', async () => {
    const r = await hierarchy(IDS.hodA1, 'section', IDS.semA1);
    expect(r.status).toBe(200);
    expect(r.ids).toEqual([IDS.secA1]);
  });

  it('HOD: a semester in another department is refused (403)', async () => {
    expectRefused(await hierarchy(IDS.hodA1, 'section', IDS.semA2));
  });
});

describe('the scope filter is on every query, not only the gate', () => {
  it('principal: each level query carries institution_id in [their institution]', async () => {
    for (const [level, parent] of [
      ['institution', undefined],
      ['department', IDS.instA],
      ['program', IDS.deptA1],
      ['semester', IDS.progA1],
      ['section', IDS.semA1]
    ] as const) {
      calls = [];
      const r = await hierarchy(IDS.principalA, level, parent);
      expect(r.status).toBe(200);
      expect(
        calls.some(
          (c) =>
            c.table === 'student_engagement_scores' &&
            c.op === 'in' &&
            c.column === 'institution_id' &&
            JSON.stringify(c.value) === JSON.stringify([IDS.instA])
        )
      ).toBe(true);
    }
  });

  it('HOD: each level query carries department_id in [their department]', async () => {
    for (const [level, parent] of [
      ['program', IDS.deptA1],
      ['semester', IDS.progA1],
      ['section', IDS.semA1]
    ] as const) {
      calls = [];
      const r = await hierarchy(IDS.hodA1, level, parent);
      expect(r.status).toBe(200);
      expect(
        calls.some(
          (c) =>
            c.table === 'student_engagement_scores' &&
            c.op === 'in' &&
            c.column === 'department_id' &&
            JSON.stringify(c.value) === JSON.stringify([IDS.deptA1])
        )
      ).toBe(true);
    }
  });
});

describe('other roles and bad input', () => {
  it('a Senior Learner who teaches a section has no breakdown to see (403 at every level)', async () => {
    for (const [level, parent] of [
      ['institution', undefined],
      ['department', IDS.instA],
      ['program', IDS.deptA1],
      ['semester', IDS.progA1],
      ['section', IDS.semA1]
    ] as const) {
      calls = [];
      expectRefused(await hierarchy(IDS.facultyA1, level, parent));
    }
  });

  it('admin (no engagement scope defined for the role) is refused, not widened', async () => {
    expectRefused(await hierarchy(IDS.adminA, 'department', IDS.instA));
    calls = [];
    expectRefused(await hierarchy(IDS.adminA, 'institution'));
  });

  it('a parent_id that is not an id is a 400', async () => {
    const r = await hierarchy(IDS.superAdmin, 'program', 'not-an-id');
    expect(r.status).toBe(400);
  });

  it('an unknown level is a 400', async () => {
    const r = await hierarchy(IDS.superAdmin, 'campus');
    expect(r.status).toBe(400);
  });

  it('signed out is a 401', async () => {
    currentUserId = null;
    const res = await GET(
      new NextRequest('http://localhost/api/analytics/engagement/hierarchy?level=institution')
    );
    expect(res.status).toBe(401);
  });
});
