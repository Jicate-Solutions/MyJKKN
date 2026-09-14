// OneMark Wave 3 Lane A — GET /api/foundation/onemark/results/learner/[studentId]
//
// Try-out defect 2 (PR #3431, 2026-09-12), half A: the live
// fn_onemark_learner_report emits `student_id` as a bare uuid and no `student`
// object, so the report header read "Name not recorded" for a learner whose
// fp_students.full_name is on file. The route already reads that row for its
// access check; the fix is to carry the name through from it.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

let currentUser: { id: string } | null = { id: 'user-1' };
let studentRow: Record<string, unknown> | null = null;
let selectedColumns = '';
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock('next/server', async () => {
  const actual = await vi.importActual<any>('next/server');
  return { ...actual, connection: () => Promise.resolve() };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: currentUser } }) },
      from: (table: string) => ({
        select: (cols: string) => {
          if (table === 'fp_students') selectedColumns = cols;
          return {
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: studentRow, error: null }),
            }),
          };
        },
      }),
      rpc: () => Promise.resolve(rpcResult),
    }),
}));

import { GET } from '@/app/api/foundation/onemark/results/learner/[studentId]/route';

const STUDENT = '08f23565-4f0f-4fe8-b2e2-43a892afdb85';
const EXAM = 'b72a99f1-eca9-4531-92df-29831e1ef6ef';

/** What production's fn_onemark_learner_report returned on 2026-09-12. */
const liveRpcPayload = {
  student_id: STUDENT,
  exam_definition_id: EXAM,
  progress: { student_id: STUDENT, exam_definition_id: EXAM, current_mastery_avg: null, current_topics: [] },
  vault: { active: 2, mastered: 0, due_now: 2, next_due_at: null },
  sittings: [{ attempt_id: 'a3', mode: 'timed', status: 'submitted', score: 2, out_of: 5 }],
};

function call(studentId = STUDENT, exam = EXAM) {
  const req = new NextRequest(`http://x/api/foundation/onemark/results/learner/${studentId}?exam=${exam}`);
  return GET(req, { params: Promise.resolve({ studentId }) });
}

beforeEach(() => {
  currentUser = { id: 'user-1' };
  studentRow = { id: STUDENT, full_name: 'Test Student', grade: '12' };
  selectedColumns = '';
  rpcResult = { data: liveRpcPayload, error: null };
});

describe('learner report route — defect 2 half A, the header has a name', () => {
  it('names the learner from the fp_students row it already reads, when the RPC sends only student_id', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report.student.name).toBe('Test Student');
    expect(body.report.student.id).toBe(STUDENT);
    expect(body.report.student.cohort_label).toBe('Class 12');
    expect(body.report.exam.id).toBe(EXAM);
  });

  it('asks fp_students for the name, not just the id', async () => {
    await call();
    expect(selectedColumns).toContain('full_name');
  });

  it('lets an RPC that does send a student object win, and passes its counts through', async () => {
    rpcResult = {
      data: {
        ...liveRpcPayload,
        student: { id: STUDENT, full_name: 'Test Student', grade: '12' },
        exam: { id: EXAM, config_key: 'tn_hsc_physics', display_name: 'HSC Physics' },
        progress: { ...liveRpcPayload.progress, attempted: 5, correct: 2, skipped: 1 },
        topics: [{ topic_id: 't1', label: 'Unit 1: Electrostatics', total: 5, correct: 2 }],
      },
      error: null,
    };
    const body = await (await call()).json();
    expect(body.report.student.name).toBe('Test Student');
    expect(body.report.exam.name).toBe('HSC Physics');
    expect(body.report.progress).toEqual({ attempted: 5, correct: 2, accuracy: 40 });
    expect(body.report.topics[0].label).toBe('Unit 1: Electrostatics');
  });

  it('still refuses a learner the session cannot see — the name read is the access check, not a bypass', async () => {
    studentRow = null;
    const res = await call();
    expect(res.status).toBe(403);
  });

  it('still rejects a missing exam id before touching the database', async () => {
    const req = new NextRequest(`http://x/api/foundation/onemark/results/learner/${STUDENT}`);
    const res = await GET(req, { params: Promise.resolve({ studentId: STUDENT }) });
    expect(res.status).toBe(400);
    expect(selectedColumns).toBe('');
  });
});
