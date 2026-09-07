import { describe, it, expect, vi } from 'vitest';

import {
  AIU_SURFACE_PDE_CLINICAL_COACH,
  normalizeAnswerText,
  extractFinalAnswerForQuestion,
  computeChanged,
  recordAiuTrailDelivery,
  finalizeAiuTrailsForSubmission,
  type AiuDbClient,
} from '@/lib/services/aiu/prompt-trail-service';

// ---------------------------------------------------------------------------
// The seam's judgment lives in three pure helpers: which answer in a
// pde_submissions.answers payload belongs to a coached question, and whether
// the learner changed their work after the AI engagement. Getting either
// wrong marks AIU bands off manufactured evidence, so they are pinned here.
// The two DB writers are best-effort BY CONTRACT — a trail failure must never
// break the learner-facing feature — so the swallow behaviour is pinned too.
// ---------------------------------------------------------------------------

const Q1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const Q2 = 'aaaaaaaa-0000-0000-0000-000000000002';

describe('normalizeAnswerText', () => {
  it('trims strings and rejects empties', () => {
    expect(normalizeAnswerText('  leukoplakia  ')).toBe('leukoplakia');
    expect(normalizeAnswerText('')).toBeNull();
    expect(normalizeAnswerText('   ')).toBeNull();
  });

  it('stringifies scalars but refuses structured values', () => {
    expect(normalizeAnswerText(42)).toBe('42');
    expect(normalizeAnswerText(true)).toBe('true');
    // An image-tag click point is not a learner-authored text revision.
    expect(normalizeAnswerText({ x: 1, y: 2 })).toBeNull();
    expect(normalizeAnswerText(null)).toBeNull();
    expect(normalizeAnswerText(undefined)).toBeNull();
  });
});

describe('extractFinalAnswerForQuestion', () => {
  it('reads the clinical envelope array shape (answer_text)', () => {
    const answers = [
      { question_id: Q1, question_type: 'free_text_socratic', answer_text: 'Final answer 1' },
      { question_id: Q2, question_type: 'free_text_socratic', answer_text: 'Final answer 2' },
    ];
    expect(extractFinalAnswerForQuestion(answers, Q2)).toBe('Final answer 2');
  });

  it('tolerates the student_answer and answer field spellings the score route accepts', () => {
    expect(
      extractFinalAnswerForQuestion([{ question_id: Q1, student_answer: 'via student_answer' }], Q1),
    ).toBe('via student_answer');
    expect(
      extractFinalAnswerForQuestion([{ question_id: Q1, answer: 'via answer' }], Q1),
    ).toBe('via answer');
  });

  it('unwraps the score route post-write shape { items: [...] }', () => {
    const wrapped = {
      items: [{ question_id: Q1, answer_text: 'wrapped final' }],
      osce_score: { percentage: 80 },
    };
    expect(extractFinalAnswerForQuestion(wrapped, Q1)).toBe('wrapped final');
  });

  it('reads the legacy record-keyed shape used by /api/pde/assessments/[id]/submit', () => {
    expect(extractFinalAnswerForQuestion({ [Q1]: 'legacy final' }, Q1)).toBe('legacy final');
  });

  it('returns null for a question the learner never carried into the submission', () => {
    expect(
      extractFinalAnswerForQuestion([{ question_id: Q1, answer_text: 'x' }], Q2),
    ).toBeNull();
  });

  it('returns null on hostile or empty payloads instead of throwing', () => {
    expect(extractFinalAnswerForQuestion(null, Q1)).toBeNull();
    expect(extractFinalAnswerForQuestion('not-a-payload', Q1)).toBeNull();
    expect(extractFinalAnswerForQuestion([null, 42, 'str'], Q1)).toBeNull();
    expect(extractFinalAnswerForQuestion([], Q1)).toBeNull();
    expect(extractFinalAnswerForQuestion([{ question_id: Q1 }], Q1)).toBeNull();
  });
});

describe('computeChanged', () => {
  it('true when the learner revised after the AI engagement', () => {
    expect(computeChanged('draft answer', 'revised answer')).toBe(true);
  });

  it('false when the learner kept their answer (whitespace-insensitive)', () => {
    expect(computeChanged('same answer', '  same answer  ')).toBe(false);
  });

  it('null when either side is missing — unknown is not "accepted"', () => {
    expect(computeChanged('draft', null)).toBeNull();
    expect(computeChanged(null, 'final')).toBeNull();
    expect(computeChanged(undefined, undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DB writers — chainable client mock
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

/** Minimal chainable mock: every filter returns `this`; terminal reads resolve
 *  from the per-table script. Captures update payloads for assertions. */
function makeClient(script: {
  profileInstitution?: string | null;
  insertResult?: { data: Row | null; error: { message: string } | null };
  openTrails?: { data: Row[] | null; error: { message: string } | null };
  updateError?: { message: string } | null;
  throwOnFrom?: boolean;
}) {
  const inserted: Row[] = [];
  const updated: Array<{ payload: Row; id: unknown }> = [];

  const client: AiuDbClient = {
    from: (table: string) => {
      if (script.throwOnFrom) throw new Error('relation does not exist');

      const state: { updatePayload?: Row; lastEq?: unknown } = {};
      const chain: Record<string, unknown> = {};
      const self = () => chain;

      chain.select = vi.fn(self);
      chain.insert = vi.fn((payload: Row) => {
        inserted.push(payload);
        return chain;
      });
      chain.update = vi.fn((payload: Row) => {
        state.updatePayload = payload;
        return chain;
      });
      chain.eq = vi.fn((col: string, val: unknown) => {
        if (col === 'id') state.lastEq = val;
        return chain;
      });
      chain.is = vi.fn(() => {
        // Terminal for the finalize UPDATE chain (.update().eq('id').is())
        if (state.updatePayload !== undefined) {
          updated.push({ payload: state.updatePayload, id: state.lastEq });
          return Promise.resolve({ error: script.updateError ?? null });
        }
        // Terminal for the open-trails SELECT chain
        return Promise.resolve(
          script.openTrails ?? { data: [], error: null },
        );
      });
      chain.maybeSingle = vi.fn(() => {
        if (table === 'profiles') {
          return Promise.resolve({
            data:
              script.profileInstitution === undefined
                ? null
                : { institution_id: script.profileInstitution },
            error: null,
          });
        }
        return Promise.resolve(
          script.insertResult ?? { data: { id: 'trail-1' }, error: null },
        );
      });

      return chain;
    },
  };

  return { client, inserted, updated };
}

describe('recordAiuTrailDelivery', () => {
  const baseArgs = {
    learnerId: 'learner-uuid',
    surface: AIU_SURFACE_PDE_CLINICAL_COACH,
    promptSent: 'SYSTEM PROMPT with ground truth',
    aiOutput: 'Socratic feedback as produced',
    learnerInput: 'the answer the AI saw',
    context: { assessment_id: 'a-1', question_id: Q1 },
  };

  it('resolves institution_id from profiles when not provided and inserts the capture row', async () => {
    const { client, inserted } = makeClient({ profileInstitution: 'inst-9' });
    const id = await recordAiuTrailDelivery(client, baseArgs);
    expect(id).toBe('trail-1');
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      learner_id: 'learner-uuid',
      institution_id: 'inst-9',
      surface: AIU_SURFACE_PDE_CLINICAL_COACH,
      prompt_sent: 'SYSTEM PROMPT with ground truth',
      ai_output: 'Socratic feedback as produced',
      learner_input: 'the answer the AI saw',
    });
  });

  it('never throws — a missing table becomes a null return, not a broken coach', async () => {
    const { client } = makeClient({ throwOnFrom: true });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(recordAiuTrailDelivery(client, baseArgs)).resolves.toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('returns null (and logs) on an insert error instead of raising', async () => {
    const { client } = makeClient({
      profileInstitution: null,
      insertResult: { data: null, error: { message: 'permission denied' } },
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(recordAiuTrailDelivery(client, baseArgs)).resolves.toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('finalizeAiuTrailsForSubmission', () => {
  const answersRaw = [
    { question_id: Q1, answer_text: 'revised final answer' },
    { question_id: Q2, answer_text: 'unchanged answer' },
  ];

  it('closes open trails with learner_final, the changed flag, and the submission ref', async () => {
    const { client, updated } = makeClient({
      openTrails: {
        data: [
          {
            id: 't1',
            learner_input: 'draft answer',
            context: { assessment_id: 'a-1', question_id: Q1 },
          },
          {
            id: 't2',
            learner_input: 'unchanged answer',
            context: { assessment_id: 'a-1', question_id: Q2 },
          },
        ],
        error: null,
      },
    });

    const closed = await finalizeAiuTrailsForSubmission(client, {
      learnerId: 'learner-uuid',
      surface: AIU_SURFACE_PDE_CLINICAL_COACH,
      assessmentId: 'a-1',
      answersRaw,
      submissionId: 'sub-7',
    });

    expect(closed).toBe(2);
    expect(updated).toHaveLength(2);
    expect(updated[0]).toMatchObject({
      id: 't1',
      payload: {
        learner_final: 'revised final answer',
        changed: true,
        context: { assessment_id: 'a-1', question_id: Q1, submission_id: 'sub-7' },
      },
    });
    expect(updated[1]).toMatchObject({
      id: 't2',
      payload: { learner_final: 'unchanged answer', changed: false },
    });
  });

  it('leaves a trail open when its question has no final answer — no manufactured "accepted"', async () => {
    const { client, updated } = makeClient({
      openTrails: {
        data: [
          {
            id: 't3',
            learner_input: 'coached then abandoned',
            context: { assessment_id: 'a-1', question_id: 'question-never-submitted' },
          },
        ],
        error: null,
      },
    });

    const closed = await finalizeAiuTrailsForSubmission(client, {
      learnerId: 'learner-uuid',
      surface: AIU_SURFACE_PDE_CLINICAL_COACH,
      assessmentId: 'a-1',
      answersRaw,
      submissionId: 'sub-7',
    });

    expect(closed).toBe(0);
    expect(updated).toHaveLength(0);
  });

  it('never throws — lookup failure returns 0 closed', async () => {
    const { client } = makeClient({
      openTrails: { data: null, error: { message: 'relation missing' } },
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      finalizeAiuTrailsForSubmission(client, {
        learnerId: 'learner-uuid',
        surface: AIU_SURFACE_PDE_CLINICAL_COACH,
        assessmentId: 'a-1',
        answersRaw,
        submissionId: 'sub-7',
      }),
    ).resolves.toBe(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
