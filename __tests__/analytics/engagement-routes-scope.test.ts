/**
 * Engagement Analytics — the learner-level routes on /users/activity >
 * Engagement are held to the viewer's scope.
 *
 * Found on jicate/main (d91a49ddcf): EngagementService.hasAccess() said yes to a
 * principal for ANY id, including id=all (every institution's learners, with
 * names and emails; the at-risk list adds phone numbers), and to an HOD for any
 * institution, program, semester or section. getStudentDetail() skipped the
 * check entirely for a learner with no section. Every read is service-role, so
 * row-level security never narrowed any of it.
 *
 * These tests pin, for super admin / principal / HOD:
 *   - GET /api/analytics/engagement            (the table + cards)
 *   - GET /api/analytics/engagement/at-risk    (the At-Risk modal)
 *   - GET /api/analytics/engagement/sections/compare
 *   - GET /api/analytics/engagement/student/[id]
 *   - GET /api/analytics/engagement/scope      (what the filters may offer)
 * Allowed scope returns data; out of scope is a 403 with a plain message,
 * never an empty 200; and the scope filter is on the query itself.
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

import { GET as getMetricsRoute } from '@/app/api/analytics/engagement/route';
import { GET as getAtRiskRoute } from '@/app/api/analytics/engagement/at-risk/route';
import { GET as getCompareRoute } from '@/app/api/analytics/engagement/sections/compare/route';
import { GET as getStudentRoute } from '@/app/api/analytics/engagement/student/[id]/route';
import { GET as getScopeRoute } from '@/app/api/analytics/engagement/scope/route';
import {
  ENGAGEMENT_EXPORT_COLUMNS,
  engagementRowsForExport
} from '@/app/(routes)/users/activity/_components/engagement-export';

beforeEach(() => {
  db = buildOrgDb();
  calls = [];
  currentUserId = IDS.principalA;
});

const url = (path: string, params: Record<string, string>) =>
  new NextRequest(`http://localhost${path}?${new URLSearchParams(params).toString()}`);

async function metrics(userId: string, level: string, id: string) {
  currentUserId = userId;
  const res = await getMetricsRoute(url('/api/analytics/engagement', { level, id }));
  const body = await res.json();
  const learners = ((body.data?.students ?? []) as Array<{ user_id: string }>).map((s) => s.user_id).sort();
  return { status: res.status, body, learners };
}

async function atRisk(userId: string, level: string, id: string) {
  currentUserId = userId;
  const res = await getAtRiskRoute(url('/api/analytics/engagement/at-risk', { level, id }));
  const body = await res.json();
  const learners = ((body.data ?? []) as Array<{ user_id: string }>).map((s) => s.user_id).sort();
  return { status: res.status, body, learners };
}

async function compare(userId: string, semesterId: string) {
  currentUserId = userId;
  const res = await getCompareRoute(
    url('/api/analytics/engagement/sections/compare', { semester_id: semesterId })
  );
  const body = await res.json();
  return { status: res.status, body, sections: ((body.data ?? []) as any[]).map((s) => s.section_id) };
}

async function student(userId: string, studentId: string) {
  currentUserId = userId;
  const res = await getStudentRoute(
    new NextRequest(`http://localhost/api/analytics/engagement/student/${studentId}`),
    { params: Promise.resolve({ id: studentId }) }
  );
  return { status: res.status, body: await res.json() };
}

const learnerRowsRead = () =>
  calls.some((c) => c.table === 'student_engagement_scores' && c.column !== 'user_id');

function expectRefused(result: { status: number; body: any }) {
  expect(result.status).toBe(403);
  expect(result.status).not.toBe(200);
  expect(typeof result.body.error).toBe('string');
  expect(result.body.error.length).toBeGreaterThan(10);
  expect(result.body.data).toBeUndefined();
}

describe('GET /api/analytics/engagement (learner table and cards)', () => {
  it('super admin: "All Institutions" returns every learner', async () => {
    const r = await metrics(IDS.superAdmin, 'institution', 'all');
    expect(r.status).toBe(200);
    expect(r.learners).toEqual([IDS.learnerA1, IDS.learnerA2, IDS.learnerB1].sort());
  });

  it('principal: "all" returns only their own institution (the filter narrows it)', async () => {
    const r = await metrics(IDS.principalA, 'institution', 'all');
    expect(r.status).toBe(200);
    expect(r.learners).toEqual([IDS.learnerA1, IDS.learnerA2].sort());
  });

  it('principal: own institution, and any department, program, semester or section in it', async () => {
    for (const [level, id, expected] of [
      ['institution', IDS.instA, [IDS.learnerA1, IDS.learnerA2]],
      ['department', IDS.deptA2, [IDS.learnerA2]],
      ['program', IDS.progA1, [IDS.learnerA1]],
      ['semester', IDS.semA2, [IDS.learnerA2]],
      ['section', IDS.secA1, [IDS.learnerA1]]
    ] as const) {
      const r = await metrics(IDS.principalA, level, id);
      expect(r.status, `${level}`).toBe(200);
      expect(r.learners, `${level}`).toEqual([...expected].sort());
    }
  });

  it('principal: another institution, or anything inside it, is refused (403)', async () => {
    for (const [level, id] of [
      ['institution', IDS.instB],
      ['department', IDS.deptB1],
      ['program', IDS.progB1],
      ['semester', IDS.semB1],
      ['section', IDS.secB1]
    ] as const) {
      calls = [];
      const r = await metrics(IDS.principalA, level, id);
      expectRefused(r);
      expect(learnerRowsRead(), `${level}`).toBe(false);
    }
  });

  it('HOD: own department and what sits under it', async () => {
    for (const [level, id] of [
      ['department', IDS.deptA1],
      ['program', IDS.progA1],
      ['semester', IDS.semA1],
      ['section', IDS.secA1]
    ] as const) {
      const r = await metrics(IDS.hodA1, level, id);
      expect(r.status, `${level}`).toBe(200);
      expect(r.learners, `${level}`).toEqual([IDS.learnerA1]);
    }
  });

  it('HOD: the institution (even their own, even "all") and other departments are refused (403)', async () => {
    for (const [level, id] of [
      ['institution', 'all'],
      ['institution', IDS.instA],
      ['department', IDS.deptA2],
      ['program', IDS.progA2],
      ['semester', IDS.semA2],
      ['section', IDS.secA2],
      ['department', IDS.deptB1],
      ['section', IDS.secB1]
    ] as const) {
      calls = [];
      const r = await metrics(IDS.hodA1, level, id);
      expectRefused(r);
      expect(learnerRowsRead(), `${level} ${id}`).toBe(false);
    }
  });

  it('the scope filter is on both queries (daily metrics and learner rows)', async () => {
    await metrics(IDS.principalA, 'institution', 'all');
    for (const table of ['daily_engagement_metrics', 'student_engagement_scores']) {
      expect(
        calls.some(
          (c) =>
            c.table === table &&
            c.op === 'in' &&
            c.column === 'institution_id' &&
            JSON.stringify(c.value) === JSON.stringify([IDS.instA])
        ),
        table
      ).toBe(true);
    }
    calls = [];
    await metrics(IDS.hodA1, 'program', IDS.progA1);
    for (const table of ['daily_engagement_metrics', 'student_engagement_scores']) {
      expect(
        calls.some(
          (c) =>
            c.table === table &&
            c.op === 'in' &&
            c.column === 'department_id' &&
            JSON.stringify(c.value) === JSON.stringify([IDS.deptA1])
        ),
        table
      ).toBe(true);
    }
  });

  it('a Senior Learner who teaches section A1 sees that section only', async () => {
    const own = await metrics(IDS.facultyA1, 'section', IDS.secA1);
    expect(own.status).toBe(200);
    expect(own.learners).toEqual([IDS.learnerA1]);
    expectRefused(await metrics(IDS.facultyA1, 'section', IDS.secA2));
    expectRefused(await metrics(IDS.facultyA1, 'department', IDS.deptA1));
  });

  it('other roles with no engagement scope are refused, not widened', async () => {
    // The retired 'counselor' name, the other counsellor roles and
    // institution_admin have no decision yet; accounts staff whose profile has
    // no institution have nothing to be scoped to.
    for (const userId of [
      IDS.legacyCounselorA,
      IDS.learnerCounselorA,
      IDS.institutionAdminA,
      IDS.accountsNoInstitution
    ]) {
      expectRefused(await metrics(userId, 'institution', IDS.instA));
      expectRefused(await metrics(userId, 'institution', 'all'));
    }
  });
});

describe('admin, counsellor and accounts staff: their own institution, like a principal (2026-09-12)', () => {
  // profiles.role as stored: 'admin' and 'administrator', 'admission_counselor'
  // and 'expo_counselor', 'accounts'. Each is on Institution A.
  const STAFF = [
    ['admin', IDS.adminA],
    ['administrator', IDS.administratorA],
    ['admission_counselor', IDS.admissionCounselorA],
    ['expo_counselor', IDS.expoCounselorA],
    ['accounts', IDS.accountsA]
  ] as const;

  it('table and cards: own institution and anything in it; "all" narrows to it', async () => {
    for (const [role, userId] of STAFF) {
      const own = await metrics(userId, 'institution', IDS.instA);
      expect(own.status, role).toBe(200);
      expect(own.learners, role).toEqual([IDS.learnerA1, IDS.learnerA2].sort());
      const all = await metrics(userId, 'institution', 'all');
      expect(all.status, role).toBe(200);
      expect(all.learners, role).toEqual([IDS.learnerA1, IDS.learnerA2].sort());
      expect((await metrics(userId, 'department', IDS.deptA2)).learners, role).toEqual([IDS.learnerA2]);
      expect((await metrics(userId, 'section', IDS.secA1)).learners, role).toEqual([IDS.learnerA1]);
    }
  });

  it('table and cards: another institution, or anything inside it, is 403 before any learner row is read', async () => {
    for (const [role, userId] of STAFF) {
      for (const [level, id] of [
        ['institution', IDS.instB],
        ['department', IDS.deptB1],
        ['program', IDS.progB1],
        ['semester', IDS.semB1],
        ['section', IDS.secB1]
      ] as const) {
        calls = [];
        expectRefused(await metrics(userId, level, id));
        expect(learnerRowsRead(), `${role} ${level}`).toBe(false);
      }
    }
  });

  it('at-risk: own institution only, and the query carries it', async () => {
    for (const [role, userId] of STAFF) {
      calls = [];
      const own = await atRisk(userId, 'institution', 'all');
      expect(own.status, role).toBe(200);
      expect(own.learners, role).toEqual([IDS.learnerA2]);
      expect(
        calls.some(
          (c) => c.table === 'student_engagement_scores' && c.op === 'in' && c.column === 'institution_id'
        ),
        role
      ).toBe(true);
      expectRefused(await atRisk(userId, 'institution', IDS.instB));
      expectRefused(await atRisk(userId, 'department', IDS.deptB1));
    }
  });

  it('section compare: a semester in own institution; one elsewhere is 403', async () => {
    for (const [role, userId] of STAFF) {
      const own = await compare(userId, IDS.semA2);
      expect(own.status, role).toBe(200);
      expect(own.sections, role).toEqual([IDS.secA2]);
      expectRefused(await compare(userId, IDS.semB1));
    }
  });

  it('learner detail: a learner in own institution; one elsewhere (even with no section) is 403', async () => {
    for (const [role, userId] of STAFF) {
      expect((await student(userId, IDS.learnerA2)).status, role).toBe(200);
      expectRefused(await student(userId, IDS.learnerB1));
      expectRefused(await student(userId, IDS.learnerBNoSection));
    }
  });

  it('scope: the filters get only their institution, the same as a principal', async () => {
    for (const [role, userId] of STAFF) {
      currentUserId = userId;
      const res = await getScopeRoute();
      const body = await res.json();
      expect(res.status, role).toBe(200);
      expect(body.data.type, role).toBe('institution');
      expect(body.data.institutionIds, role).toEqual([IDS.instA]);
      expect(body.data.departmentIds, role).toBeNull();
    }
  });
});

describe('GET /api/analytics/engagement/at-risk (names, emails and phone numbers)', () => {
  it('super admin: every institution', async () => {
    const r = await atRisk(IDS.superAdmin, 'institution', 'all');
    expect(r.status).toBe(200);
    // The list joins sections!inner, so a learner with no section is not listed.
    expect(r.learners).toEqual([IDS.learnerA2, IDS.learnerB1].sort());
  });

  it('principal: "all" is only their institution; another institution is 403', async () => {
    const own = await atRisk(IDS.principalA, 'institution', 'all');
    expect(own.status).toBe(200);
    expect(own.learners).toEqual([IDS.learnerA2]);
    expect(own.body.data[0].contact_phone).toBe('900000002');
    expectRefused(await atRisk(IDS.principalA, 'institution', IDS.instB));
    expectRefused(await atRisk(IDS.principalA, 'department', IDS.deptB1));
  });

  it('HOD: own department returns its at-risk learners (none in A1); another department is 403', async () => {
    const own = await atRisk(IDS.hodA1, 'department', IDS.deptA1);
    expect(own.status).toBe(200);
    expect(own.learners).toEqual([]);
    expectRefused(await atRisk(IDS.hodA1, 'department', IDS.deptA2));
    expectRefused(await atRisk(IDS.hodA1, 'institution', 'all'));
  });
});

describe('GET /api/analytics/engagement/sections/compare', () => {
  it('super admin, principal and HOD see a semester in their scope', async () => {
    expect((await compare(IDS.superAdmin, IDS.semB1)).sections).toEqual([IDS.secB1]);
    expect((await compare(IDS.principalA, IDS.semA2)).sections).toEqual([IDS.secA2]);
    const hod = await compare(IDS.hodA1, IDS.semA1);
    expect(hod.status).toBe(200);
    expect(hod.sections).toEqual([IDS.secA1]);
  });

  it('a semester outside the scope is 403, and the view query carries the scope', async () => {
    expectRefused(await compare(IDS.principalA, IDS.semB1));
    expectRefused(await compare(IDS.hodA1, IDS.semA2));
    calls = [];
    await compare(IDS.hodA1, IDS.semA1);
    expect(
      calls.some(
        (c) => c.table === 'mv_engagement_overview' && c.op === 'in' && c.column === 'department_id'
      )
    ).toBe(true);
  });
});

describe('GET /api/analytics/engagement/student/[id]', () => {
  it('super admin: any learner', async () => {
    const r = await student(IDS.superAdmin, IDS.learnerB1);
    expect(r.status).toBe(200);
    expect(r.body.data.student.name).toBe('Learner B1');
  });

  it('principal: a learner in their institution; one in another is 403', async () => {
    expect((await student(IDS.principalA, IDS.learnerA2)).status).toBe(200);
    expectRefused(await student(IDS.principalA, IDS.learnerB1));
  });

  it('principal: a learner with no section in another institution is 403 (the old check let this through)', async () => {
    expectRefused(await student(IDS.principalA, IDS.learnerBNoSection));
  });

  it('HOD: a learner in their department; one in another department is 403', async () => {
    expect((await student(IDS.hodA1, IDS.learnerA1)).status).toBe(200);
    expectRefused(await student(IDS.hodA1, IDS.learnerA2));
  });

  it('refused before any session history is read', async () => {
    calls = [];
    await student(IDS.hodA1, IDS.learnerA2);
    expect(calls.some((c) => c.table === 'user_sessions')).toBe(false);
  });

  it('a learner with no score today is 404', async () => {
    const r = await student(IDS.superAdmin, IDS.superAdmin);
    expect(r.status).toBe(404);
  });
});

describe('GET /api/analytics/engagement/scope (what the filters may offer)', () => {
  async function scope(userId: string) {
    currentUserId = userId;
    const res = await getScopeRoute();
    return { status: res.status, body: await res.json() };
  }

  it('super admin: no limit at any picker', async () => {
    const r = await scope(IDS.superAdmin);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({
      type: 'global',
      institutionIds: null,
      departmentIds: null,
      programIds: null,
      semesterIds: null,
      sectionIds: null
    });
  });

  it('principal: only their institution', async () => {
    const r = await scope(IDS.principalA);
    expect(r.body.data.type).toBe('institution');
    expect(r.body.data.institutionIds).toEqual([IDS.instA]);
    expect(r.body.data.departmentIds).toBeNull();
  });

  it('HOD: their department, and the institution it belongs to', async () => {
    const r = await scope(IDS.hodA1);
    expect(r.body.data.type).toBe('department');
    expect(r.body.data.institutionIds).toEqual([IDS.instA]);
    expect(r.body.data.departmentIds).toEqual([IDS.deptA1]);
    expect(r.body.data.sectionIds).toBeNull();
  });

  it('a Senior Learner who teaches: the path to their sections only', async () => {
    const r = await scope(IDS.facultyA1);
    expect(r.body.data).toEqual({
      type: 'section',
      institutionIds: [IDS.instA],
      departmentIds: [IDS.deptA1],
      programIds: [IDS.progA1],
      semesterIds: [IDS.semA1],
      sectionIds: [IDS.secA1]
    });
  });

  it('signed out is a 401', async () => {
    currentUserId = null;
    expect((await getScopeRoute()).status).toBe(401);
  });
});

describe('Export Data uses the same scoped query as the table', () => {
  // The page exports engagementMetrics.students, i.e. body.data.students from
  // GET /api/analytics/engagement for the selection on screen.
  const exportedNames = (body: any) =>
    engagementRowsForExport(body.data?.students).map((r) => ENGAGEMENT_EXPORT_COLUMNS[0].accessor(r));

  it('super admin, "All Institutions": every learner', async () => {
    const r = await metrics(IDS.superAdmin, 'institution', 'all');
    expect(exportedNames(r.body).sort()).toEqual(['Learner A1', 'Learner A2', 'Learner B1']);
  });

  it('principal: only their institution, even for "all"', async () => {
    const r = await metrics(IDS.principalA, 'institution', 'all');
    expect(exportedNames(r.body).sort()).toEqual(['Learner A1', 'Learner A2']);
  });

  it('HOD: only their department', async () => {
    const r = await metrics(IDS.hodA1, 'department', IDS.deptA1);
    expect(exportedNames(r.body)).toEqual(['Learner A1']);
  });

  it('out of scope: the page gets a 403 and has no rows to export', async () => {
    const r = await metrics(IDS.hodA1, 'department', IDS.deptA2);
    expect(r.status).toBe(403);
    expect(exportedNames(r.body)).toEqual([]);
  });
});
