// =============================================================================
// __tests__/pde/osce-rubric-per-question-type.test.ts
// PDE Clinical Reasoning — each question type is scored by its own evidence
// =============================================================================
//
// mcq_warmup and image_tag answers carry no free text: an MCQ envelope holds the
// option the learner picked, an image-tag envelope holds where they clicked.
// The OSCE rubric read every answer through its text field, so both always came
// back "left blank" and scored zero at full weight — a right answer and a skip
// were worth the same. A question type must never be judged by a field it
// structurally does not have.
//
// The mark is taken from the learner's RAW choice against the answer key, never
// from the `is_correct` / `region_score` the browser wrote into the envelope:
// the learner inserts pde_submissions.answers, so those fields could say
// anything. The forgery cases below pin that.
// =============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  planScoring,
  deriveFallbackRubric,
  readStoredAnswers,
  scoreAttempt,
  type PdeQuestion,
} from '@/lib/services/pde-osce-scoring';
import {
  attachAnswersToQuestions,
  markObjectiveAnswer,
  scoreRegions,
  type ObjectiveAnswerKey,
} from '@/lib/services/pde-objective-marking';

// ---------------------------------------------------------------------------
// Fixtures — the shape the attempt UI writes (CaseAttempt / ClinicalAnswerEnvelope)
// ---------------------------------------------------------------------------

const MCQ_KEY: ObjectiveAnswerKey = {
  question_type: 'mcq_warmup',
  correct_answer: 'opt-b',
  options: [
    { id: 'opt-a', text: 'Aphthous ulcer' },
    { id: 'opt-b', text: 'Oral lichen planus' },
  ],
  expected_regions: null,
};

// One region covering the middle of a 1000 x 1000 image: centre (500, 500),
// tolerance 100 px, so a click on the centre is 100 and anything 200 px or
// more away is 0.
const IMAGE_KEY: ObjectiveAnswerKey = {
  question_type: 'image_tag',
  correct_answer: null,
  options: null,
  expected_regions: [{ x: 0.4, y: 0.4, w: 0.2, h: 0.2, label: 'Lesion' }],
};

const FREE_TEXT_KEY: ObjectiveAnswerKey = {
  question_type: 'free_text_socratic',
  correct_answer: 'Reticular white striae',
  options: null,
  expected_regions: null,
};

function question(n: number, type: string, domain: string): PdeQuestion {
  return {
    id: `q-${n}`,
    q_number: n,
    question_text: `Question ${n}?`,
    ground_truth: `Expected reasoning for question ${n}.`,
    key_concepts: [],
    osce_domain: domain,
    question_type: type,
  };
}

function mcqEnvelope(qid: string, picked: string, claimedCorrect: boolean) {
  return {
    question_id: qid,
    question_type: 'mcq_warmup',
    selected_option_id: picked,
    is_correct: claimedCorrect, // browser-written — must be ignored
    submitted_at: '2026-09-30T10:00:00Z',
  };
}

function imageEnvelope(qid: string, x: number, y: number, claimedScore: number) {
  return {
    question_id: qid,
    question_type: 'image_tag',
    click_point: { x, y, imgWidth: 1000, imgHeight: 1000 },
    region_score: claimedScore, // browser-written — must be ignored
    submitted_at: '2026-09-30T10:00:00Z',
  };
}

function textEnvelope(qid: string) {
  return {
    question_id: qid,
    question_type: 'free_text_socratic',
    answer_text: 'A considered response from the learner.',
    submitted_at: '2026-09-30T10:00:00Z',
  };
}

/** The score route's pipeline, minus the network: stored JSON -> plan. */
function planFromStored(
  questions: PdeQuestion[],
  keys: Record<string, ObjectiveAnswerKey>,
  items: unknown[],
) {
  const stored = readStoredAnswers(items);
  const { answers } = attachAnswersToQuestions(
    stored.items,
    stored.answers,
    questions,
    new Map(Object.entries(keys)),
  );
  return planScoring(deriveFallbackRubric(questions), questions, answers);
}

function makeStubSupabase() {
  return {
    rpc: () => Promise.resolve({ data: null, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
    }),
  } as unknown as SupabaseClient;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// (1) The mark comes from the key, not from the envelope's claim
// ---------------------------------------------------------------------------
describe('markObjectiveAnswer — MCQ and image tag are marked from the raw choice', () => {
  it('marks an MCQ right or wrong against correct_answer', () => {
    expect(markObjectiveAnswer(MCQ_KEY, mcqEnvelope('q-1', 'opt-b', true))).toBe(100);
    expect(markObjectiveAnswer(MCQ_KEY, mcqEnvelope('q-1', 'opt-a', false))).toBe(0);
  });

  it('falls back to options[].is_correct when correct_answer is empty', () => {
    const key: ObjectiveAnswerKey = {
      ...MCQ_KEY,
      correct_answer: '',
      options: [
        { id: 'opt-a', text: 'Aphthous ulcer' },
        { id: 'opt-b', text: 'Oral lichen planus', is_correct: true },
      ],
    };
    expect(markObjectiveAnswer(key, mcqEnvelope('q-1', 'opt-b', false))).toBe(100);
  });

  it('ignores a forged is_correct: a wrong option claimed correct scores 0', () => {
    expect(markObjectiveAnswer(MCQ_KEY, mcqEnvelope('q-1', 'opt-a', true))).toBe(0);
  });

  it('marks an image tag from the click point against expected_regions', () => {
    expect(markObjectiveAnswer(IMAGE_KEY, imageEnvelope('q-2', 500, 500, 0))).toBe(100);
    expect(markObjectiveAnswer(IMAGE_KEY, imageEnvelope('q-2', 550, 500, 0))).toBe(75);
    expect(markObjectiveAnswer(IMAGE_KEY, imageEnvelope('q-2', 950, 950, 0))).toBe(0);
  });

  it('ignores a forged region_score: a miss claimed as 100 scores 0', () => {
    expect(markObjectiveAnswer(IMAGE_KEY, imageEnvelope('q-2', 950, 950, 100))).toBe(0);
  });

  it('returns undefined (a skip) when no choice was made', () => {
    expect(
      markObjectiveAnswer(MCQ_KEY, { question_id: 'q-1', question_type: 'mcq_warmup' }),
    ).toBeUndefined();
    expect(
      markObjectiveAnswer(IMAGE_KEY, { question_id: 'q-2', question_type: 'image_tag' }),
    ).toBeUndefined();
  });

  it('never marks free text — that stays with the examiner', () => {
    expect(markObjectiveAnswer(FREE_TEXT_KEY, textEnvelope('q-3'))).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// (1b) A learner-written image size must not widen a region (W12 review, #4131)
// ---------------------------------------------------------------------------
describe('scoreRegions — the reported image size cannot buy marks', () => {
  // As ImageTagRegionAuthor saves it: fractions, tolerance_px 16.
  const authored = [{ x: 0.7, y: 0.7, w: 0.1, h: 0.1, label: 'Lesion', tolerance_px: 16 }];

  it('scores the shrunken-image probe 0 (it used to score 100)', () => {
    expect(
      scoreRegions({ x: 0, y: 0, imgWidth: 0.001, imgHeight: 0.001 }, authored).score,
    ).toBe(0);
    const key: ObjectiveAnswerKey = { ...IMAGE_KEY, expected_regions: authored };
    expect(
      markObjectiveAnswer(key, {
        question_id: 'q-2',
        click_point: { x: 0, y: 0, imgWidth: 0.001, imgHeight: 0.001 },
        region_score: 100,
      }),
    ).toBe(0);
  });

  it('still gives an honest centre click 100 and honest near-misses the old pixel score', () => {
    // 1200 x 800 image; region centre = (0.75 x 1200, 0.75 x 800) = (900, 600).
    const at = (x: number, y: number) =>
      scoreRegions({ x, y, imgWidth: 1200, imgHeight: 800 }, authored).score;
    expect(at(900, 600)).toBe(100);
    // Old formula: 1 - dist / (2 x 16). 8 px away -> 75; 32 px or more -> 0.
    expect(at(908, 600)).toBe(75);
    expect(at(900, 592)).toBe(75);
    expect(at(932, 600)).toBe(0);
  });

  it('caps the tolerance at the region, however small the reported image', () => {
    // A click at the far corner of the region's own box, on a shrunken image:
    // the tolerance is capped at the region's size, so no free 100.
    const s = scoreRegions({ x: 0.0008, y: 0.0008, imgWidth: 0.001, imgHeight: 0.001 }, authored).score;
    expect(s).toBeLessThan(100);
  });

  it('uses the default tolerance for 0, negative or non-finite tolerance_px — never NaN, never a free 100', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const regions = [{ x: 0.4, y: 0.4, w: 0.2, h: 0.2, tolerance_px: bad }];
      const centre = scoreRegions({ x: 500, y: 500, imgWidth: 1000, imgHeight: 1000 }, regions).score;
      const far = scoreRegions({ x: 50, y: 50, imgWidth: 1000, imgHeight: 1000 }, regions).score;
      expect(centre).toBe(100);
      expect(far).toBe(0);
      // Default = region half-size: 50 px off a 200 px region -> 75.
      expect(
        scoreRegions({ x: 550, y: 500, imgWidth: 1000, imgHeight: 1000 }, regions).score,
      ).toBe(75);
    }
  });

  it('scores an image tag with no regions 0, like an MCQ with no key', () => {
    expect(scoreRegions({ x: 1, y: 1, imgWidth: 10, imgHeight: 10 }, []).score).toBe(0);
    expect(scoreRegions({ x: 1, y: 1, imgWidth: 10, imgHeight: 10 }, null).score).toBe(0);
    const noKey: ObjectiveAnswerKey = { ...IMAGE_KEY, expected_regions: [] };
    expect(markObjectiveAnswer(noKey, imageEnvelope('q-2', 500, 500, 100))).toBe(0);
  });
});

describe('markObjectiveAnswer — MCQ key read as leniently as fn_pde_mark_objective', () => {
  it('accepts is_correct written as text, as the SQL boolean cast does', () => {
    for (const flag of ['true', 'TRUE', 't', 'yes', '1', 1]) {
      const key: ObjectiveAnswerKey = {
        ...MCQ_KEY,
        correct_answer: null,
        options: [
          { id: 'opt-a', text: 'Aphthous ulcer' },
          { id: 'opt-b', text: 'Oral lichen planus', is_correct: flag },
        ],
      };
      expect(markObjectiveAnswer(key, mcqEnvelope('q-1', 'opt-b', false))).toBe(100);
      expect(markObjectiveAnswer(key, mcqEnvelope('q-1', 'opt-a', true))).toBe(0);
    }
  });

  it('does not treat false-ish text as correct', () => {
    const key: ObjectiveAnswerKey = {
      ...MCQ_KEY,
      correct_answer: null,
      options: [{ id: 'opt-a', is_correct: 'false' }, { id: 'opt-b', is_correct: 0 }],
    };
    expect(markObjectiveAnswer(key, mcqEnvelope('q-1', 'opt-a', true))).toBe(0);
    expect(markObjectiveAnswer(key, mcqEnvelope('q-1', 'opt-b', true))).toBe(0);
  });

  it('matches numeric option ids by their text, as ->> does', () => {
    const key: ObjectiveAnswerKey = {
      ...MCQ_KEY,
      correct_answer: null,
      options: [{ id: 1, text: 'A' }, { id: 2, text: 'B', is_correct: true }],
    };
    expect(markObjectiveAnswer(key, { question_id: 'q-1', selected_option_id: '2' })).toBe(100);
    expect(markObjectiveAnswer(key, { question_id: 'q-1', selected_option_id: 2 })).toBe(100);
    expect(markObjectiveAnswer(key, { question_id: 'q-1', selected_option_id: '1' })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// (2) Stored envelopes -> scoring plan: an objective answer is not "blank"
// ---------------------------------------------------------------------------
describe('planScoring over stored envelopes — MCQ / image tag are not scored as blank', () => {
  const questions = [
    question(1, 'mcq_warmup', 'data_gathering'),
    question(2, 'image_tag', 'data_gathering'),
    question(3, 'free_text_socratic', 'hypothesis_generation'),
  ];
  const keys = { 'q-1': MCQ_KEY, 'q-2': IMAGE_KEY, 'q-3': FREE_TEXT_KEY };

  it('puts a correct MCQ and a hit image tag in the objective share, at full marks', () => {
    const plan = planFromStored(questions, keys, [
      mcqEnvelope('q-1', 'opt-b', true),
      imageEnvelope('q-2', 500, 500, 100),
      textEnvelope('q-3'),
    ]);
    const dg = plan.allocations.find((a) => a.domain.key === 'data_gathering')!;
    // The regression: on the text path both landed here, blank, worth nothing.
    expect(dg.unanswered_q_numbers).toEqual([]);
    expect(dg.objective_q_numbers).toEqual([1, 2]);
    expect(dg.objective_earned).toBe(10);
    // No free text in this domain, so nothing is sent to the examiner.
    expect(dg.answered_q_numbers).toEqual([]);
    expect(dg.scored_max).toBe(0);
  });

  it('scores a wrong MCQ 0 but keeps it in the denominator (answered, not skipped)', () => {
    const plan = planFromStored(questions, keys, [
      mcqEnvelope('q-1', 'opt-a', true), // wrong, though the envelope claims right
      imageEnvelope('q-2', 550, 500, 100), // 75, though the envelope claims 100
    ]);
    const dg = plan.allocations.find((a) => a.domain.key === 'data_gathering')!;
    expect(dg.objective_q_numbers).toEqual([1, 2]);
    expect(dg.objective_earned).toBe(3.75); // 0 + 5 x 0.75
    expect(dg.domain.max_score).toBe(10);
  });

  it('attaches answers by question_id, so a skipped question shifts nothing', () => {
    // The UI appends only answered questions: Q1 skipped, so the image-tag
    // envelope sits at index 0. Matched by position it would be judged as Q1.
    const plan = planFromStored(questions, keys, [imageEnvelope('q-2', 500, 500, 0)]);
    const dg = plan.allocations.find((a) => a.domain.key === 'data_gathering')!;
    expect(dg.objective_q_numbers).toEqual([2]);
    expect(dg.unanswered_q_numbers).toEqual([1]);
    expect(dg.objective_earned).toBe(5);
  });

  it('leaves an all-free-text attempt exactly as before', () => {
    const textOnly = [
      question(1, 'free_text_socratic', 'data_gathering'),
      question(2, 'free_text_socratic', 'data_gathering'),
      question(3, 'free_text_socratic', 'hypothesis_generation'),
    ];
    const plan = planFromStored(
      textOnly,
      { 'q-1': FREE_TEXT_KEY, 'q-2': FREE_TEXT_KEY, 'q-3': FREE_TEXT_KEY },
      [textEnvelope('q-1'), textEnvelope('q-3')],
    );
    // The fields main already had: identical values.
    expect(
      plan.allocations.map((a) => ({
        key: a.domain.key,
        answered: a.answered_q_numbers,
        unanswered: a.unanswered_q_numbers,
        scored_max: a.scored_max,
      })),
    ).toEqual([
      { key: 'data_gathering', answered: [1], unanswered: [2], scored_max: 5 },
      { key: 'hypothesis_generation', answered: [3], unanswered: [], scored_max: 5 },
    ]);
    // The new objective share stays empty for free text.
    expect(
      plan.allocations.map((a) => [a.objective_q_numbers, a.objective_earned]),
    ).toEqual([
      [[], 0],
      [[], 0],
    ]);
    expect(plan.uncovered_q_numbers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (3) End to end: an objective-only case scores without any examiner call
// ---------------------------------------------------------------------------
describe('scoreAttempt — an all-correct MCQ + image-tag case scores 100%', () => {
  it('awards full marks from the key, with no AI provider call', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('no network call expected'));
    const questions = [
      question(1, 'mcq_warmup', 'data_gathering'),
      question(2, 'image_tag', 'data_gathering'),
    ];
    const stored = readStoredAnswers([
      mcqEnvelope('q-1', 'opt-b', true),
      imageEnvelope('q-2', 500, 500, 100),
    ]);
    const { answers } = attachAnswersToQuestions(
      stored.items,
      stored.answers,
      questions,
      new Map([
        ['q-1', MCQ_KEY],
        ['q-2', IMAGE_KEY],
      ]),
    );

    const osce = await scoreAttempt({
      supabase: makeStubSupabase(),
      assessmentId: 'assessment-1',
      caseTitle: 'White lacy patches on the buccal mucosa',
      questions,
      answers,
    });

    // Was 0%: both answers read as blank through the text path.
    expect(osce.percentage).toBe(100);
    expect(osce.total_score).toBe(10);
    expect(osce.max_score).toBe(10);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps the objective marks when the examiner call fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('provider down'));
    const questions = [
      question(1, 'mcq_warmup', 'data_gathering'),
      question(2, 'free_text_socratic', 'data_gathering'),
    ];
    const stored = readStoredAnswers([
      mcqEnvelope('q-1', 'opt-b', true),
      textEnvelope('q-2'),
    ]);
    const { answers } = attachAnswersToQuestions(
      stored.items,
      stored.answers,
      questions,
      new Map([
        ['q-1', MCQ_KEY],
        ['q-2', FREE_TEXT_KEY],
      ]),
    );

    const osce = await scoreAttempt({
      supabase: makeStubSupabase(),
      assessmentId: 'assessment-1',
      caseTitle: 'White lacy patches on the buccal mucosa',
      questions,
      answers,
    });

    // The free-text share is lost to the outage; the MCQ's 5 is not.
    expect(osce.total_score).toBe(5);
    expect(osce.max_score).toBe(10);
  });
});
