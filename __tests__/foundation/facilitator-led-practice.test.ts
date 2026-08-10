/**
 * Foundation — facilitator-led practice.
 *
 * The thing worth testing here is the authorisation boundary, not the happy
 * path. `?forLearner=<uuid>` lets one person record answers under another
 * person's name, so the only interesting questions are: can a caller who does
 * NOT run that learner's group get through, and does the draw route apply the
 * SAME pair of checks that fn_fp_record_attempt will apply at submit time.
 *
 * The second one matters more than it looks. A looser check on the way in would
 * happily draw ten questions for a learner whose answers the database then
 * refuses to save — the session dies at the final click, after the child has
 * done the work.
 *
 * The SQL contract is asserted against the SHIPPED MIGRATION TEXT, never against
 * a TypeScript re-implementation of the predicate. A test that re-implements SQL
 * only proves the re-implementation agrees with itself; this repo has already
 * been bitten by exactly that.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Mocks — hoisted above the handler imports.
// ---------------------------------------------------------------------------

let currentUser: { id: string } | null = { id: 'user-facilitator' };
let teachesResult: boolean | null = false;
let managesResult: boolean | null = false;
let studentRowById: Record<string, unknown> | null = null;
let ownStudentRow: Record<string, unknown> | null = null;
let poolRow: Record<string, unknown> | null = { id: 'pool-1' };
let itemRows: Array<Record<string, unknown>> = [];

/** Every rpc the handler calls, so a test can assert WHICH checks ran. */
let rpcCalls: string[] = [];
/** Which filter the fp_students read used — id (acting for) vs profile_id (self). */
let studentFilters: Array<[string, unknown]> = [];

function sessionBuilder(table: string) {
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn((col: string, val: unknown) => {
      if (table === 'fp_students') studentFilters.push([col, val]);
      return b;
    }),
    in: vi.fn(() => b),
    is: vi.fn(() => b),
    limit: vi.fn(() => b),
    maybeSingle: vi.fn(() => {
      if (table !== 'fp_students') return Promise.resolve({ data: null, error: null });
      const byId = studentFilters.some(([c]) => c === 'id');
      return Promise.resolve({
        data: byId ? studentRowById : ownStudentRow,
        error: null,
      });
    }),
    then: (resolve: any) => resolve({ data: [], error: null }),
  };
  return b;
}

function adminBuilder() {
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    in: vi.fn(() => b),
    is: vi.fn(() => b),
    limit: vi.fn(() => Promise.resolve({ data: itemRows, error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: poolRow, error: null })),
    then: (resolve: any) => resolve({ data: itemRows, error: null }),
  };
  return b;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: currentUser } }) },
      from: (t: string) => sessionBuilder(t),
      rpc: (name: string) => {
        rpcCalls.push(name);
        if (name === 'fn_fp_teaches_student') {
          return Promise.resolve({ data: teachesResult, error: null });
        }
        if (name === 'fn_fp_can_manage_student') {
          return Promise.resolve({ data: managesResult, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
    }),
  createServiceRoleClient: () => ({
    from: () => adminBuilder(),
    rpc: () => Promise.resolve({ data: 10, error: null }),
  }),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

// SUT imported AFTER the mocks.
import { GET as getQuestions } from '@/app/api/foundation/practice/[examDefinitionId]/route';

const EXAM_ID = '11111111-2222-4333-8444-555555555555';
const LEARNER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function req(url: string) {
  return new Request(url) as any;
}

function drawFor(query = '') {
  return getQuestions(req(`https://jkkn.ai/api/foundation/practice/${EXAM_ID}${query}`), {
    params: Promise.resolve({ examDefinitionId: EXAM_ID }),
  });
}

beforeEach(() => {
  currentUser = { id: 'user-facilitator' };
  teachesResult = false;
  managesResult = false;
  studentRowById = { id: LEARNER_ID, status: 'active' };
  ownStudentRow = null; // the facilitator is not themself on the programme
  poolRow = { id: 'pool-1' };
  rpcCalls = [];
  studentFilters = [];
  itemRows = [
    {
      id: 'item-1',
      stem: 'Which part of a flower makes the pollen grains?',
      options: [
        { key: 'A', text: 'The stigma' },
        { key: 'C', text: 'The anther' },
      ],
      difficulty: 2,
      q_type: 'mcq_single',
      answer: 'C',
      explanation: 'The anther is the pollen-bearing part of the stamen.',
    },
  ];
});

// ---------------------------------------------------------------------------

describe('?forLearner — acting for somebody else', () => {
  it('refuses a caller who neither runs the group nor manages the school', async () => {
    teachesResult = false;
    managesResult = false;
    const res = await drawFor(`?forLearner=${LEARNER_ID}`);
    expect(res.status).toBe(403);
    // and it must not have leaked a question on the way to saying no
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('anther');
  });

  it('admits the Senior Learner who runs that learner\'s group', async () => {
    teachesResult = true;
    const res = await drawFor(`?forLearner=${LEARNER_ID}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.learnerId).toBe(LEARNER_ID);
  });

  it('admits the school\'s owner, matching what the RPC will accept at submit', async () => {
    managesResult = true;
    const res = await drawFor(`?forLearner=${LEARNER_ID}`);
    expect(res.status).toBe(200);
  });

  it('applies BOTH checks the write path applies, not just one', async () => {
    teachesResult = false;
    managesResult = false;
    await drawFor(`?forLearner=${LEARNER_ID}`);
    expect(rpcCalls).toContain('fn_fp_teaches_student');
    expect(rpcCalls).toContain('fn_fp_can_manage_student');
  });

  it('rejects a non-uuid learner id before any authorisation call', async () => {
    const res = await drawFor('?forLearner=not-a-uuid');
    expect(res.status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });

  it('refuses when the named learner is not active, even for their facilitator', async () => {
    teachesResult = true;
    studentRowById = { id: LEARNER_ID, status: 'withdrawn' };
    const res = await drawFor(`?forLearner=${LEARNER_ID}`);
    expect(res.status).toBe(403);
  });

  it('still never ships the answer key when acting for somebody else', async () => {
    teachesResult = true;
    const res = await drawFor(`?forLearner=${LEARNER_ID}`);
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain('"answer"');
    expect(raw).not.toContain('pollen-bearing');
  });
});

describe('no ?forLearner — answering as yourself is unchanged', () => {
  it('resolves identity by profile_id, never by a supplied id', async () => {
    ownStudentRow = { id: 'own-learner', status: 'active' };
    const res = await drawFor();
    expect(res.status).toBe(200);
    expect(rpcCalls).toHaveLength(0);
    expect(studentFilters.some(([c]) => c === 'profile_id')).toBe(true);
    expect(studentFilters.some(([c]) => c === 'id')).toBe(false);
  });

  it('still refuses a caller who is not enrolled', async () => {
    ownStudentRow = null;
    const res = await drawFor();
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// SQL contract — asserted against the shipped migration, not a re-implementation
// ---------------------------------------------------------------------------

describe('migration 20260808220000_fp_facilitator_may_record_attempt', () => {
  const sql = fs.readFileSync(
    path.join(
      process.cwd(),
      'supabase/migrations/20260808220000_fp_facilitator_may_record_attempt.sql',
    ),
    'utf8',
  );
  /** Comments stripped, so a promise in prose can never satisfy a test. */
  const code = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

  it('adds the Senior Learner predicate to the authorisation guard', () => {
    expect(code).toMatch(/OR fn_fp_teaches_student\(p_student_id\)/);
  });

  it('keeps the two predicates that were already there', () => {
    expect(code).toMatch(/fn_fp_can_manage_student\(p_student_id\)/);
    expect(code).toMatch(/fn_fp_is_own_or_guardian\(p_student_id\)/);
  });

  it('still refuses an unauthorised caller with 42501 rather than falling through', () => {
    expect(code).toMatch(/ERRCODE = '42501'/);
  });

  it('preserves the parental-consent gate', () => {
    expect(code).toMatch(/foundation\.require_parental_consent/);
    expect(code).toMatch(/parental consent required for student/);
  });

  it('revokes EXECUTE from anon — Supabase default privileges grant it separately', () => {
    expect(code).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.fn_fp_record_attempt\(uuid, uuid, jsonb\) FROM anon, PUBLIC;/,
    );
    expect(code).toMatch(
      /GRANT\s+EXECUTE ON FUNCTION public\.fn_fp_record_attempt\(uuid, uuid, jsonb\) TO authenticated;/,
    );
  });

  it('remains SECURITY DEFINER with a pinned search_path', () => {
    expect(code).toMatch(/SECURITY DEFINER/);
    expect(code).toMatch(/SET search_path TO 'public'/);
  });

  it('keeps the divide-by-zero guard on the score', () => {
    expect(code).toMatch(/CASE WHEN v_total > 0/);
  });
});
