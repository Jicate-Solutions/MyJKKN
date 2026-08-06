/**
 * Foundation — /api/foundation/practice route handlers, and the SQL contract
 * of the migration that makes practice answerable.
 *
 * The load-bearing test here is the leak test. fp_items carries the answer key
 * and is operator-gated under RLS, so the practice route reads it with the
 * service-role client — which means RLS is NOT the boundary any more, this code
 * is. The mocked table therefore returns `answer` and `explanation` on every
 * row, and the test asserts they are absent from what the learner receives. A
 * future refactor to `select('*')` fails here rather than in production.
 *
 * The SQL-contract tests read the shipped migration text with comments
 * stripped. They exist because a test that re-implements SQL in TypeScript only
 * ever proves the re-implementation agrees with itself.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Mocks — hoisted above the handler imports.
// ---------------------------------------------------------------------------

let currentUser: { id: string } | null = { id: 'user-learner' };
let learnerRow: Record<string, unknown> | null = {
  id: 'learner-1',
  full_name: 'A Learner',
  grade: '6',
  status: 'active',
};
let poolRow: Record<string, unknown> | null = { id: 'pool-1' };
let itemRows: Array<Record<string, unknown>> = [];
let attemptRow: Record<string, unknown> | null = null;
let responseRows: Array<Record<string, unknown>> = [];

/** Every select() the handler makes, so a test can inspect the projection. */
let selects: string[] = [];

function sessionBuilder(table: string) {
  const b: any = {
    select: vi.fn((cols: string) => {
      selects.push(`${table}:${cols}`);
      return b;
    }),
    eq: vi.fn(() => b),
    in: vi.fn(() => b),
    is: vi.fn(() => b),
    limit: vi.fn(() => b),
    maybeSingle: vi.fn(() =>
      Promise.resolve({
        data: table === 'fp_students' ? learnerRow : attemptRow,
        error: null,
      }),
    ),
    then: (resolve: any) =>
      resolve({
        data: table === 'fp_responses' ? responseRows : [],
        error: null,
      }),
  };
  return b;
}

function adminBuilder(table: string) {
  const b: any = {
    select: vi.fn((cols: string) => {
      selects.push(`${table}:${cols}`);
      return b;
    }),
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
    }),
  createServiceRoleClient: () => ({
    from: (t: string) => adminBuilder(t),
    rpc: () => Promise.resolve({ data: 10, error: null }),
  }),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

// SUT imported AFTER the mocks.
import { GET as getQuestions } from '@/app/api/foundation/practice/[examDefinitionId]/route';
import { GET as getResults } from '@/app/api/foundation/practice/attempts/[attemptId]/route';

const EXAM_ID = '11111111-2222-4333-8444-555555555555';
const ATTEMPT_ID = '99999999-8888-4777-8666-555555555555';

function req(url: string) {
  return new Request(url) as any;
}

beforeEach(() => {
  currentUser = { id: 'user-learner' };
  learnerRow = { id: 'learner-1', full_name: 'A Learner', grade: '6', status: 'active' };
  poolRow = { id: 'pool-1' };
  selects = [];
  // Deliberately laced with the answer key: if the handler ever passes a row
  // through untouched, these strings surface in the response body.
  itemRows = [
    {
      id: 'item-1',
      stem: 'Which part of a flower makes the pollen grains?',
      options: [{ key: 'A', text: 'The stigma' }, { key: 'C', text: 'The anther' }],
      difficulty: 2,
      q_type: 'mcq_single',
      answer: 'C',
      explanation: 'The anther is the pollen-bearing part of the stamen.',
    },
  ];
  attemptRow = { id: ATTEMPT_ID, student_id: 'learner-1', assessment_id: 'pool-1', score: 0.5 };
  responseRows = [{ item_id: 'item-1', chosen: 'A', is_correct: false, time_ms: 900 }];
});

// ---------------------------------------------------------------------------

describe('GET /api/foundation/practice/[examDefinitionId]', () => {
  it('refuses an unauthenticated caller with 401', async () => {
    currentUser = null;
    const res = await getQuestions(req('https://jkkn.ai/x'), {
      params: Promise.resolve({ examDefinitionId: EXAM_ID }),
    });
    expect(res.status).toBe(401);
  });

  it('refuses a signed-in caller who is not enrolled with 403', async () => {
    learnerRow = null;
    const res = await getQuestions(req('https://jkkn.ai/x'), {
      params: Promise.resolve({ examDefinitionId: EXAM_ID }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects a non-uuid exam id before touching the database', async () => {
    const res = await getQuestions(req('https://jkkn.ai/x'), {
      params: Promise.resolve({ examDefinitionId: 'not-a-uuid' }),
    });
    expect(res.status).toBe(400);
    expect(selects).toHaveLength(0);
  });

  it('never returns the answer key or the explanation', async () => {
    const res = await getQuestions(req('https://jkkn.ai/x'), {
      params: Promise.resolve({ examDefinitionId: EXAM_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const blob = JSON.stringify(body);

    expect(blob).not.toContain('answer');
    expect(blob).not.toContain('explanation');
    // and not merely renamed — the values themselves are gone
    expect(blob).not.toContain('pollen-bearing');
    expect(Object.keys(body.questions[0]).sort()).toEqual([
      'difficulty',
      'id',
      'options',
      'q_type',
      'stem',
    ]);
  });

  it('asks the database only for the columns a learner may see', async () => {
    await getQuestions(req('https://jkkn.ai/x'), {
      params: Promise.resolve({ examDefinitionId: EXAM_ID }),
    });
    const itemSelect = selects.find((s) => s.startsWith('fp_items:'));
    expect(itemSelect).toBeDefined();
    expect(itemSelect).not.toContain('answer');
    expect(itemSelect).not.toContain('explanation');
    expect(itemSelect).not.toContain('*');
  });
});

describe('GET /api/foundation/practice/attempts/[attemptId]', () => {
  it('refuses an unauthenticated caller with 401', async () => {
    currentUser = null;
    const res = await getResults(req('https://jkkn.ai/x'), {
      params: Promise.resolve({ attemptId: ATTEMPT_ID }),
    });
    expect(res.status).toBe(401);
  });

  it('404s an attempt RLS did not return, without confirming it exists', async () => {
    attemptRow = null;
    const res = await getResults(req('https://jkkn.ai/x'), {
      params: Promise.resolve({ attemptId: ATTEMPT_ID }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).not.toMatch(/permission|denied|not yours/i);
  });

  it('reports is_correct as stored, rather than recomputing it', async () => {
    // The stored verdict says WRONG even though chosen would compare equal to
    // the key. The route must report the record, not its own opinion.
    responseRows = [{ item_id: 'item-1', chosen: 'C', is_correct: false, time_ms: 900 }];
    const res = await getResults(req('https://jkkn.ai/x'), {
      params: Promise.resolve({ attemptId: ATTEMPT_ID }),
    });
    const body = await res.json();
    expect(body.questions[0].isCorrect).toBe(false);
    expect(body.correct).toBe(0);
  });

  it('reveals the answer and the explanation once the run is submitted', async () => {
    const res = await getResults(req('https://jkkn.ai/x'), {
      params: Promise.resolve({ attemptId: ATTEMPT_ID }),
    });
    const body = await res.json();
    expect(body.questions[0].correctAnswer).toBe('C');
    expect(body.questions[0].explanation).toContain('pollen-bearing');
  });
});

// ---------------------------------------------------------------------------
// SQL contract — read the shipped migration, not a model of it.
// ---------------------------------------------------------------------------

describe('20260808180000_fp_practice_pools.sql', () => {
  const sql = fs
    .readFileSync(
      path.join(
        process.cwd(),
        'supabase/migrations/20260808180000_fp_practice_pools.sql',
      ),
      'utf8',
    )
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

  it('creates practice pools, not diagnostics or mocks', () => {
    expect(sql).toMatch(/INSERT INTO fp_assessments/i);
    expect(sql).toMatch(/'practice'/);
  });

  it('is idempotent — every insert is guarded by NOT EXISTS', () => {
    const inserts = sql.match(/INSERT INTO/gi) ?? [];
    const guards = sql.match(/NOT EXISTS/gi) ?? [];
    expect(inserts.length).toBeGreaterThan(0);
    expect(guards.length).toBe(inserts.length);
  });

  it("uses a classification the table's CHECK constraint allows", () => {
    // platform_policies_classification_check permits only these two.
    const classifications = sql.match(/'(operational|major|minor|critical)'/g) ?? [];
    for (const c of classifications) {
      expect(['operational', 'major']).toContain(c.replaceAll("'", ''));
    }
  });

  it('activates no questions — going live stays a separate, deliberate act', () => {
    expect(sql).not.toMatch(/UPDATE\s+fp_items/i);
    expect(sql).not.toMatch(/UPDATE\s+exam_definitions/i);
  });
});
