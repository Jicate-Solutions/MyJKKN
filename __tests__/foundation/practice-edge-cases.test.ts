/**
 * Foundation practice — the four edge cases decided 2026-08-01.
 *
 *   1. A skipped question must not count for or against the learner.
 *   2. A question enough different people have reported must stop being SERVED,
 *      not merely stop counting toward mastery.
 *   3. An interrupted run must be resumable.
 *   4. Questions the learner has not met should come first.
 *
 * (3) is browser-storage behaviour in the component and is covered by the
 * walkthrough rather than here. (1) is enforced jointly: the client omits
 * blanks, and this file pins the server half — that the results route reports
 * `total` as ANSWERED and `skipped` separately, so "2 of 7" can never silently
 * become "2 of 10".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Table-aware mocks
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
let flagRows: Array<Record<string, unknown>> = [];
let attemptRows: Array<Record<string, unknown>> = [];
let responseRows: Array<Record<string, unknown>> = [];
let attemptRow: Record<string, unknown> | null = null;
let policy: Record<string, number> = {};

function tableData(table: string): any[] {
  switch (table) {
    case 'fp_items':
      return itemRows;
    case 'fp_item_flags':
      return flagRows;
    case 'fp_attempts':
      return attemptRows;
    case 'fp_responses':
      return responseRows;
    default:
      return [];
  }
}

function builder(table: string, sessionSide: boolean) {
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    in: vi.fn(() => b),
    is: vi.fn(() => b),
    limit: vi.fn(() => Promise.resolve({ data: tableData(table), error: null })),
    maybeSingle: vi.fn(() =>
      Promise.resolve({
        data:
          table === 'fp_students'
            ? learnerRow
            : table === 'fp_assessments'
              ? poolRow
              : table === 'fp_attempts' && sessionSide
                ? attemptRow
                : null,
        error: null,
      }),
    ),
    then: (resolve: any) =>
      resolve({ data: tableData(table), error: null }),
  };
  return b;
}

const rpc = vi.fn((_name: string, args: any) =>
  Promise.resolve({ data: policy[args?.p_key] ?? args?.p_default, error: null }),
);

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: currentUser } }) },
      from: (t: string) => builder(t, true),
    }),
  createServiceRoleClient: () => ({
    from: (t: string) => builder(t, false),
    rpc,
  }),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

import { NextRequest } from 'next/server';
import { GET as getQuestions } from '@/app/api/foundation/practice/[examDefinitionId]/route';
import { GET as getResults } from '@/app/api/foundation/practice/attempts/[attemptId]/route';

const EXAM = '11111111-2222-4333-8444-555555555555';
const ATTEMPT = '99999999-8888-4777-8666-555555555555';
const id = (n: number) =>
  `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

// A NextRequest, not a bare Request: the results route reads
// request.nextUrl.searchParams, which only exists on the Next wrapper.
function req(url = 'https://jkkn.ai/x') {
  return new NextRequest(url) as any;
}

beforeEach(() => {
  currentUser = { id: 'user-learner' };
  learnerRow = { id: 'learner-1', full_name: 'A Learner', grade: '6', status: 'active' };
  poolRow = { id: 'pool-1' };
  flagRows = [];
  attemptRows = [];
  responseRows = [];
  attemptRow = { id: ATTEMPT, student_id: 'learner-1', assessment_id: 'pool-1', score: 0.5 };
  policy = {};
  itemRows = Array.from({ length: 6 }, (_, i) => ({
    id: id(i + 1),
    stem: `Question ${i + 1}`,
    options: [{ key: 'A', text: 'a' }, { key: 'B', text: 'b' }],
    difficulty: 1,
    q_type: 'mcq_single',
    answer: 'B',
    explanation: `Because ${i + 1}.`,
  }));
  rpc.mockClear();
});

// ---------------------------------------------------------------------------
// 2. Reported questions stop being served
// ---------------------------------------------------------------------------

describe('a question enough people reported is no longer served', () => {
  it('drops an item once DISTINCT reporters reach the threshold', async () => {
    policy['foundation.item_flag.suppress_threshold'] = 2;
    flagRows = [
      { item_id: id(1), flagged_by: 'p1' },
      { item_id: id(1), flagged_by: 'p2' }, // two different people -> suppressed
    ];

    const res = await getQuestions(req(), {
      params: Promise.resolve({ examDefinitionId: EXAM }),
    });
    const body = await res.json();
    const served = body.questions.map((q: any) => q.id);
    expect(served).not.toContain(id(1));
    expect(served).toHaveLength(5);
  });

  it('keeps an item one person reported — one report must not remove it', async () => {
    policy['foundation.item_flag.suppress_threshold'] = 2;
    flagRows = [{ item_id: id(1), flagged_by: 'p1' }];

    const res = await getQuestions(req(), {
      params: Promise.resolve({ examDefinitionId: EXAM }),
    });
    const body = await res.json();
    expect(body.questions.map((q: any) => q.id)).toContain(id(1));
  });

  it('does not let one person suppress a question by reporting it twice', async () => {
    policy['foundation.item_flag.suppress_threshold'] = 2;
    flagRows = [
      { item_id: id(1), flagged_by: 'p1' },
      { item_id: id(1), flagged_by: 'p1' },
    ];

    const res = await getQuestions(req(), {
      params: Promise.resolve({ examDefinitionId: EXAM }),
    });
    const body = await res.json();
    expect(body.questions.map((q: any) => q.id)).toContain(id(1));
  });

  it('follows the config row, not a hard-coded 2', async () => {
    policy['foundation.item_flag.suppress_threshold'] = 1;
    flagRows = [{ item_id: id(1), flagged_by: 'p1' }];

    const res = await getQuestions(req(), {
      params: Promise.resolve({ examDefinitionId: EXAM }),
    });
    const body = await res.json();
    expect(body.questions.map((q: any) => q.id)).not.toContain(id(1));
  });

  it('says so honestly when every question is under review', async () => {
    policy['foundation.item_flag.suppress_threshold'] = 1;
    flagRows = itemRows.map((it: any) => ({ item_id: it.id, flagged_by: 'p1' }));

    const res = await getQuestions(req(), {
      params: Promise.resolve({ examDefinitionId: EXAM }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/waiting to be checked/i);
  });
});

// ---------------------------------------------------------------------------
// 4. Unseen questions first
// ---------------------------------------------------------------------------

describe('questions the learner has not met come first', () => {
  it('puts every unseen question ahead of every seen one', async () => {
    policy['foundation.practice.question_count'] = 3;
    attemptRows = [{ id: 'att-1' }];
    // The learner has already answered items 1, 2 and 3.
    responseRows = [{ item_id: id(1) }, { item_id: id(2) }, { item_id: id(3) }];

    const res = await getQuestions(req(), {
      params: Promise.resolve({ examDefinitionId: EXAM }),
    });
    const body = await res.json();
    const served = body.questions.map((q: any) => q.id);

    expect(served).toHaveLength(3);
    // 4, 5 and 6 are the unseen ones and must fill the whole run.
    expect(new Set(served)).toEqual(new Set([id(4), id(5), id(6)]));
  });

  it('falls back to seen questions once the unseen ones run out', async () => {
    policy['foundation.practice.question_count'] = 5;
    attemptRows = [{ id: 'att-1' }];
    responseRows = itemRows.slice(0, 4).map((it: any) => ({ item_id: it.id }));

    const res = await getQuestions(req(), {
      params: Promise.resolve({ examDefinitionId: EXAM }),
    });
    const body = await res.json();
    const served = body.questions.map((q: any) => q.id);
    expect(served).toHaveLength(5);
    // The two unseen ones must be first.
    expect(new Set(served.slice(0, 2))).toEqual(new Set([id(5), id(6)]));
  });

  it('serves normally for a learner with no history', async () => {
    policy['foundation.practice.question_count'] = 4;
    const res = await getQuestions(req(), {
      params: Promise.resolve({ examDefinitionId: EXAM }),
    });
    const body = await res.json();
    expect(body.questions).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// 1. Skipped questions: shown, but never counted
// ---------------------------------------------------------------------------

describe('skipped questions are shown but not counted', () => {
  it('reports total as ANSWERED and skipped separately', async () => {
    responseRows = [
      { item_id: id(1), chosen: 'B', is_correct: true, time_ms: 100 },
      { item_id: id(2), chosen: 'A', is_correct: false, time_ms: 100 },
    ];
    const res = await getResults(
      req(`https://jkkn.ai/x?skipped=${id(3)},${id(4)}`),
      { params: Promise.resolve({ attemptId: ATTEMPT }) },
    );
    const body = await res.json();

    expect(body.total).toBe(2); // answered, NOT 4
    expect(body.correct).toBe(1);
    expect(body.skipped).toBe(2);
    expect(body.questions).toHaveLength(4);
  });

  it('returns a skipped question ungraded but with its answer to learn from', async () => {
    responseRows = [{ item_id: id(1), chosen: 'B', is_correct: true, time_ms: 100 }];
    const res = await getResults(req(`https://jkkn.ai/x?skipped=${id(3)}`), {
      params: Promise.resolve({ attemptId: ATTEMPT }),
    });
    const body = await res.json();
    const skipped = body.questions.find((q: any) => q.itemId === id(3));

    expect(skipped.chosen).toBeNull();
    expect(skipped.isCorrect).toBeNull(); // neither right nor wrong
    expect(skipped.correctAnswer).toBe('B');
    expect(skipped.explanation).toContain('Because');
  });

  it('ignores a skipped id that was actually answered', async () => {
    responseRows = [{ item_id: id(1), chosen: 'B', is_correct: true, time_ms: 100 }];
    const res = await getResults(req(`https://jkkn.ai/x?skipped=${id(1)}`), {
      params: Promise.resolve({ attemptId: ATTEMPT }),
    });
    const body = await res.json();
    expect(body.skipped).toBe(0);
    expect(body.questions).toHaveLength(1);
  });

  // The security half: `skipped` names items and gets answer keys back, so it
  // must never return more than one run's worth in total.
  it('never reveals more than one run of answers, however many ids are passed', async () => {
    policy['foundation.practice.question_count'] = 5;
    responseRows = [
      { item_id: id(1), chosen: 'B', is_correct: true, time_ms: 10 },
      { item_id: id(2), chosen: 'B', is_correct: true, time_ms: 10 },
    ];
    const many = Array.from({ length: 40 }, (_, i) => id(i + 10)).join(',');

    const res = await getResults(req(`https://jkkn.ai/x?skipped=${many}`), {
      params: Promise.resolve({ attemptId: ATTEMPT }),
    });
    const body = await res.json();

    // 5 per run minus 2 already answered = at most 3 more revealed.
    expect(body.skipped).toBe(3);
    expect(body.questions.length).toBeLessThanOrEqual(5);
  });

  it('reveals nothing extra when the run was fully answered', async () => {
    policy['foundation.practice.question_count'] = 2;
    responseRows = [
      { item_id: id(1), chosen: 'B', is_correct: true, time_ms: 10 },
      { item_id: id(2), chosen: 'B', is_correct: true, time_ms: 10 },
    ];
    const res = await getResults(
      req(`https://jkkn.ai/x?skipped=${id(30)},${id(31)}`),
      { params: Promise.resolve({ attemptId: ATTEMPT }) },
    );
    const body = await res.json();
    expect(body.skipped).toBe(0);
  });

  it('rejects a non-uuid in the skipped list rather than passing it to the database', async () => {
    responseRows = [{ item_id: id(1), chosen: 'B', is_correct: true, time_ms: 10 }];
    const res = await getResults(
      req('https://jkkn.ai/x?skipped=not-a-uuid,../../etc/passwd'),
      { params: Promise.resolve({ attemptId: ATTEMPT }) },
    );
    const body = await res.json();
    expect(body.skipped).toBe(0);
  });
});
