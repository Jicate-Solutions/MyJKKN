/**
 * Health Score analytics show each person only their own institution.
 *
 * Found on jicate/main (56c421c8eb): GET /api/analytics/usage/health-scores read
 * the institution_id in the query string, and GET .../health-scores/[id] the id
 * in the path, for any principal, HOD, admin or accounts user, and
 * HealthScoreService read that institution with the service-role client (no
 * row-level security) without checking it was theirs. The list with no id was
 * filtered only for a principal, so an HOD, admin or accounts user got every
 * institution.
 *
 * These tests pin, for super admin, principal, admin, accounts and HOD:
 *   - their own institution is allowed (a super admin: any institution);
 *   - another institution is a 403 with a plain message, never an empty 200,
 *     and no health score row is read;
 *   - the list with no id returns only the institutions in scope, with the
 *     scope filter on the query itself;
 *   - the [id] route refuses an out-of-scope id;
 * and that the service, called directly, never returns another institution.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, any>;
type Db = Record<string, Row[]>;

interface QueryCall {
  table: string;
  op: 'eq' | 'in';
  column: string;
  value: unknown;
}

let db: Db = {};
let calls: QueryCall[] = [];
let tablesQueried: string[] = [];
let currentUserId: string | null = null;

/** A small in-memory stand-in for the Supabase query builder (eq, in, gte, lte, order, single). */
function createFakeClient() {
  return {
    from(table: string) {
      tablesQueried.push(table);
      const filters: Array<(r: Row) => boolean> = [];
      let order: { column: string; ascending: boolean } | null = null;

      const run = () => {
        let rows = (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (order) {
          const { column, ascending } = order;
          rows = [...rows].sort((a, b) =>
            a[column] === b[column] ? 0 : (a[column] > b[column] ? 1 : -1) * (ascending ? 1 : -1)
          );
        }
        return Promise.resolve({ data: rows.map((r) => ({ ...r })), error: null });
      };

      const builder: any = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          calls.push({ table, op: 'eq', column, value });
          filters.push((r) => r[column] === value);
          return builder;
        },
        in(column: string, values: unknown[]) {
          calls.push({ table, op: 'in', column, value: values });
          filters.push((r) => values.includes(r[column]));
          return builder;
        },
        gte(column: string, value: any) {
          filters.push((r) => r[column] >= value);
          return builder;
        },
        lte(column: string, value: any) {
          filters.push((r) => r[column] <= value);
          return builder;
        },
        order(column: string, options?: { ascending?: boolean }) {
          order = { column, ascending: options?.ascending !== false };
          return builder;
        },
        single() {
          return run().then((res) =>
            res.data.length === 1
              ? { data: res.data[0], error: null }
              : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } }
          );
        },
        then(resolve: any, reject: any) {
          return run().then(resolve, reject);
        }
      };
      return builder;
    }
  };
}

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

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
      from: (table: string) => createFakeClient().from(table)
    }),
  createServiceRoleClient: () => Promise.resolve(createFakeClient())
}));

vi.mock('@/lib/policies/get-policy-client', () => ({
  getPolicyInt: () => Promise.resolve(10000)
}));

import { GET as listRoute } from '@/app/api/analytics/usage/health-scores/route';
import { GET as detailRoute } from '@/app/api/analytics/usage/health-scores/[id]/route';
import { HealthScoreService } from '@/lib/services/analytics/health-score-service';

// ---------------------------------------------------------------------------
// Two institutions, A and B, each with a health score today and three days
// ago. Every role below except the super admin and principal B belongs to A.
// ---------------------------------------------------------------------------

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const IDS = {
  instA: id('a'),
  instB: id('b'),
  deptA1: id('d1'),
  superAdmin: id('100'),
  principalA: id('101'),
  adminA: id('102'),
  accountsA: id('103'),
  hodA1: id('104'),
  principalB: id('201'),
  adminNoInstitution: id('300'),
  facultyA: id('301')
};

const dayString = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

function buildDb(): Db {
  const today = dayString(0);
  const threeDaysAgo = dayString(3);
  const profile = (userId: string, role: string, institutionId: string | null, extra: Row = {}) => ({
    id: userId,
    role,
    is_super_admin: false,
    institution_id: institutionId,
    department_id: null,
    ...extra
  });
  return {
    institutions: [
      { id: IDS.instA, name: 'College A' },
      { id: IDS.instB, name: 'College B' }
    ],
    profiles: [
      // The super admin's own profile names College B, to show a super admin is not held to it.
      profile(IDS.superAdmin, 'admin', IDS.instB, { is_super_admin: true }),
      profile(IDS.principalA, 'principal', IDS.instA),
      profile(IDS.adminA, 'admin', IDS.instA),
      profile(IDS.accountsA, 'accounts', IDS.instA),
      profile(IDS.hodA1, 'hod', IDS.instA, { department_id: IDS.deptA1 }),
      profile(IDS.principalB, 'principal', IDS.instB),
      profile(IDS.adminNoInstitution, 'admin', null),
      profile(IDS.facultyA, 'faculty', IDS.instA)
    ],
    staff: [],
    timetable_slots: [],
    institution_health_scores: [
      { id: 'hs-a-0', institution_id: IDS.instA, score_date: today, health_score: 72, health_grade: 'B' },
      { id: 'hs-a-3', institution_id: IDS.instA, score_date: threeDaysAgo, health_score: 70, health_grade: 'B' },
      { id: 'hs-b-0', institution_id: IDS.instB, score_date: today, health_score: 55, health_grade: 'C' },
      { id: 'hs-b-3', institution_id: IDS.instB, score_date: threeDaysAgo, health_score: 58, health_grade: 'C' }
    ]
  };
}

beforeEach(() => {
  db = buildDb();
  calls = [];
  tablesQueried = [];
  currentUserId = null;
});

function resetLog() {
  calls = [];
  tablesQueried = [];
}

async function list(userId: string, params: Record<string, string> = {}) {
  resetLog();
  currentUserId = userId;
  const query = new URLSearchParams(params).toString();
  const res = await listRoute(
    new NextRequest(`http://localhost/api/analytics/usage/health-scores${query ? `?${query}` : ''}`)
  );
  const body = await res.json();
  const institutions = ((body.data ?? []) as Array<{ institution_id: string }>)
    .map((r) => r.institution_id)
    .sort();
  return { status: res.status, body, institutions };
}

async function detail(userId: string, institutionId: string) {
  resetLog();
  currentUserId = userId;
  const res = await detailRoute(
    new NextRequest(`http://localhost/api/analytics/usage/health-scores/${institutionId}?days=30`),
    { params: Promise.resolve({ id: institutionId }) }
  );
  const body = await res.json();
  const institutions = [
    ...new Set(((body.data?.history ?? []) as Array<{ institution_id: string }>).map((r) => r.institution_id))
  ];
  return { status: res.status, body, institutions };
}

const healthRowsRead = () => tablesQueried.includes('institution_health_scores');

const scopeFilter = (institutionIds: string[]): QueryCall => ({
  table: 'institution_health_scores',
  op: 'in',
  column: 'institution_id',
  value: institutionIds
});

function expectRefused(result: { status: number; body: any }) {
  expect(result.status).toBe(403);
  expect(typeof result.body.error).toBe('string');
  expect(result.body.error).toMatch(/do not have access/i);
  expect(result.body.data).toBeUndefined();
  expect(healthRowsRead()).toBe(false);
}

const OWN_INSTITUTION_VIEWERS: Array<[string, string]> = [
  ['principal', IDS.principalA],
  ['admin', IDS.adminA],
  ['accounts', IDS.accountsA],
  ['HOD', IDS.hodA1]
];

describe('GET /api/analytics/usage/health-scores (list)', () => {
  it('super admin: with no id, every institution, and no institution filter', async () => {
    const r = await list(IDS.superAdmin);
    expect(r.status).toBe(200);
    expect(r.institutions).toEqual([IDS.instA, IDS.instB].sort());
    expect(calls.some((c) => c.table === 'institution_health_scores' && c.op === 'in')).toBe(false);
  });

  it('super admin: any institution by id, including one that is not on their profile', async () => {
    for (const inst of [IDS.instA, IDS.instB]) {
      const r = await list(IDS.superAdmin, { institution_id: inst });
      expect(r.status).toBe(200);
      expect(r.institutions).toEqual([inst]);
    }
  });

  describe.each(OWN_INSTITUTION_VIEWERS)('%s', (_role, userId) => {
    it('own institution by id is allowed', async () => {
      const r = await list(userId, { institution_id: IDS.instA });
      expect(r.status).toBe(200);
      expect(r.institutions).toEqual([IDS.instA]);
      expect(r.body.data[0].institution_name).toBe('College A');
    });

    it('another institution by id is refused (403) before any health score row is read', async () => {
      expectRefused(await list(userId, { institution_id: IDS.instB }));
    });

    it('with no id, only their own institution, and the scope filter is on the query itself', async () => {
      const r = await list(userId);
      expect(r.status).toBe(200);
      expect(r.institutions).toEqual([IDS.instA]);
      expect(calls).toContainEqual(scopeFilter([IDS.instA]));
    });
  });

  it('a principal of the other college is held to that college', async () => {
    const own = await list(IDS.principalB);
    expect(own.status).toBe(200);
    expect(own.institutions).toEqual([IDS.instB]);
    expectRefused(await list(IDS.principalB, { institution_id: IDS.instA }));
  });

  it('a user with no institution on their profile gets a 403 with a plain message, not an empty 200', async () => {
    expectRefused(await list(IDS.adminNoInstitution));
    expectRefused(await list(IDS.adminNoInstitution, { institution_id: IDS.instA }));
  });

  it('a role the route does not allow is still refused (403)', async () => {
    const r = await list(IDS.facultyA, { institution_id: IDS.instA });
    expect(r.status).toBe(403);
    expect(r.body.data).toBeUndefined();
    expect(healthRowsRead()).toBe(false);
  });
});

describe('GET /api/analytics/usage/health-scores/[id] (detail)', () => {
  it('super admin: any institution, with only that institution in the history', async () => {
    for (const inst of [IDS.instA, IDS.instB]) {
      const r = await detail(IDS.superAdmin, inst);
      expect(r.status).toBe(200);
      expect(r.institutions).toEqual([inst]);
      expect(r.body.data.history).toHaveLength(2);
      expect(r.body.data.current.institution_id).toBe(inst);
    }
  });

  describe.each(OWN_INSTITUTION_VIEWERS)('%s', (_role, userId) => {
    it('own institution returns its current score and history, with the scope filter on the query', async () => {
      const r = await detail(userId, IDS.instA);
      expect(r.status).toBe(200);
      expect(r.institutions).toEqual([IDS.instA]);
      expect(r.body.data.history).toHaveLength(2);
      expect(r.body.data.current).toMatchObject({
        institution_id: IDS.instA,
        health_score: 72,
        institution_name: 'College A'
      });
      expect(calls).toContainEqual(scopeFilter([IDS.instA]));
    });

    it('another institution is refused (403) before any health score row is read', async () => {
      expectRefused(await detail(userId, IDS.instB));
    });
  });

  it('a user with no institution on their profile is refused (403)', async () => {
    expectRefused(await detail(IDS.adminNoInstitution, IDS.instA));
  });
});

describe('HealthScoreService called directly (the second check)', () => {
  it('getHealthScores returns nothing for another institution and reads no health score row', async () => {
    resetLog();
    expect(await HealthScoreService.getHealthScores(IDS.hodA1, IDS.instB)).toEqual([]);
    expect(healthRowsRead()).toBe(false);
  });

  it('getHealthScoreDetail returns nothing for another institution and reads no health score row', async () => {
    resetLog();
    expect(await HealthScoreService.getHealthScoreDetail(IDS.accountsA, IDS.instB)).toEqual({
      current: null,
      history: []
    });
    expect(healthRowsRead()).toBe(false);
  });
});
