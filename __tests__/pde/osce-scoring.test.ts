// =============================================================================
// __tests__/pde/osce-scoring.test.ts
// PDE Clinical Reasoning — rubric coverage, OSCE denominator, re-score safety
// =============================================================================
//
// Why these tests exist: the bugs they guard were VALID TypeScript that
// typechecked perfectly and did nothing correct at runtime.
//
//   1. The fallback rubric hard-coded q_numbers [1], [2,3], [2], [3], [4] —
//      Q1 to Q4 only. Every production assessment has rubric = NULL and every
//      live case asks 7 or 8 questions, so Q5 onward were claimed by no domain
//      and contributed nothing in either direction.
//   2. The score route read `answers` only as an array. After the first
//      scoring it is an object, so a repeat POST saw ZERO answers and wrote
//      final_score = 0 over a committed pass.
//
// planScoring / deriveFallbackRubric / readStoredAnswers are pure, so all of
// this is provable here without mocking an AI provider at all.
// =============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  planScoring,
  aggregateScore,
  deriveFallbackRubric,
  readStoredAnswers,
  scoreAttempt,
  QUESTION_WEIGHT,
  UNANSWERED_DOMAIN_JUSTIFICATION,
  type DomainAllocation,
  type DomainScore,
  type OsceScore,
  type PdeAnswer,
  type PdeQuestion,
  type RubricDomain,
} from '@/lib/services/pde-osce-scoring';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * The live 7-question shape: every question carries an osce_domain, verified
 * read-only against production on 2026-07-31 (36 of 36 questions tagged).
 */
const LIVE_SEVEN_DOMAINS = [
  'data_gathering',
  'data_gathering',
  'hypothesis_generation',
  'hypothesis_generation',
  'management_planning',
  'patient_communication',
  'professionalism',
];

function makeQuestions(count: number, domains?: (string | null)[]): PdeQuestion[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `q-${i + 1}`,
    q_number: i + 1,
    question_text: `Question ${i + 1}?`,
    ground_truth: `Expected reasoning for question ${i + 1}.`,
    key_concepts: [],
    osce_domain: domains ? (domains[i] ?? null) : null,
  }));
}

/** A live-shaped case: 7 questions, all tagged, no authored rubric. */
function makeLiveCase(): PdeQuestion[] {
  return makeQuestions(7, LIVE_SEVEN_DOMAINS);
}

function answersFor(qNumbers: number[]): PdeAnswer[] {
  return qNumbers.map((n) => ({
    q_number: n,
    student_answer: `A considered response to question ${n}.`,
  }));
}

/**
 * Award every allocation its FULL permitted ceiling — a flawless examiner
 * verdict on everything that was actually answered. Any percentage below 100
 * after this is caused purely by the blank-question denominator.
 */
function perfectOnWhatWasAnswered(allocations: DomainAllocation[]): DomainScore[] {
  return allocations.map((a) => ({
    domain_key: a.domain.key,
    domain_label: a.domain.label,
    score: a.scored_max,
    max_score: a.domain.max_score,
    justification: 'Flawless on every answered question.',
    evidence_q_numbers: a.answered_q_numbers,
    unanswered_q_numbers: a.unanswered_q_numbers,
  }));
}

/** Minimal SupabaseClient stub: records calls, returns nulls (→ all defaults). */
function makeStubSupabase(calls: string[]) {
  return {
    rpc: (fn: string, args?: Record<string, unknown>) => {
      calls.push(`rpc:${fn}:${String(args?.p_key ?? '')}`);
      return Promise.resolve({ data: null, error: null });
    },
    from: (table: string) => {
      calls.push(`from:${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// (a) A 7-question case is scored across all 7 — the headline regression
// ---------------------------------------------------------------------------
describe('deriveFallbackRubric — a 7-question case is scored across all 7', () => {
  const questions = makeLiveCase();

  it('claims every question, leaving none uncovered', () => {
    const rubric = deriveFallbackRubric(questions);
    const claimed = rubric.flatMap((d) => d.q_numbers).sort((a, b) => a - b);
    expect(claimed).toEqual([1, 2, 3, 4, 5, 6, 7]);

    const plan = planScoring(rubric, questions, answersFor([1, 2, 3, 4, 5, 6, 7]));
    expect(plan.uncovered_q_numbers).toEqual([]);
  });

  it('groups the questions by their osce_domain', () => {
    const rubric = deriveFallbackRubric(questions);
    const byKey = new Map(rubric.map((d) => [d.key, d]));
    expect([...byKey.keys()]).toEqual([
      'data_gathering',
      'hypothesis_generation',
      'management_planning',
      'patient_communication',
      'professionalism',
    ]);
    expect(byKey.get('data_gathering')!.q_numbers).toEqual([1, 2]);
    expect(byKey.get('hypothesis_generation')!.q_numbers).toEqual([3, 4]);
    expect(byKey.get('professionalism')!.q_numbers).toEqual([7]);
  });

  it('weights every question equally, so the total is 5 x 7', () => {
    const rubric = deriveFallbackRubric(questions);
    const plan = planScoring(rubric, questions, answersFor([1, 2, 3, 4, 5, 6, 7]));
    const osce = aggregateScore(
      perfectOnWhatWasAnswered(plan.allocations),
      plan.uncovered_q_numbers,
    );
    expect(osce.max_score).toBe(QUESTION_WEIGHT * 7);
    expect(osce.percentage).toBe(100);
  });

  it('rewards Q5-Q7 — under the old rubric they were worth exactly nothing', () => {
    const rubric = deriveFallbackRubric(questions);

    const firstFour = planScoring(rubric, questions, answersFor([1, 2, 3, 4]));
    const allSeven = planScoring(rubric, questions, answersFor([1, 2, 3, 4, 5, 6, 7]));

    const four = aggregateScore(
      perfectOnWhatWasAnswered(firstFour.allocations),
      firstFour.uncovered_q_numbers,
    ).percentage;
    const seven = aggregateScore(
      perfectOnWhatWasAnswered(allSeven.allocations),
      allSeven.uncovered_q_numbers,
    ).percentage;

    // 4 of 7 answered flawlessly = 57.14%, below the 60% passing threshold.
    expect(four).toBeCloseTo((4 / 7) * 100, 2);
    expect(four).toBeLessThan(60);
    expect(seven).toBe(100);
    expect(seven).toBeGreaterThan(four);
  });

  it('handles an 8-question case without another edit', () => {
    const eight = makeQuestions(8, [...LIVE_SEVEN_DOMAINS, 'professionalism']);
    const rubric = deriveFallbackRubric(eight);
    const plan = planScoring(rubric, eight, answersFor([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(plan.uncovered_q_numbers).toEqual([]);
    const osce = aggregateScore(
      perfectOnWhatWasAnswered(plan.allocations),
      plan.uncovered_q_numbers,
    );
    expect(osce.max_score).toBe(QUESTION_WEIGHT * 8);
    expect(osce.percentage).toBe(100);
  });

  it('scores an untagged case under one domain rather than leaving it unscored', () => {
    const untagged = makeQuestions(7); // no osce_domain on any question
    const rubric = deriveFallbackRubric(untagged);
    expect(rubric).toHaveLength(1);
    expect(rubric[0].key).toBe('general_clinical_reasoning');
    expect(rubric[0].q_numbers).toEqual([1, 2, 3, 4, 5, 6, 7]);

    const plan = planScoring(rubric, untagged, answersFor([1, 2, 3, 4, 5, 6, 7]));
    expect(plan.uncovered_q_numbers).toEqual([]);
  });

  it('keeps a partly-tagged case fully covered — an authoring gap costs the learner nothing', () => {
    const partly = makeQuestions(5, [
      'data_gathering',
      null,
      'hypothesis_generation',
      null,
      'management_planning',
    ]);
    const rubric = deriveFallbackRubric(partly);
    const claimed = rubric.flatMap((d) => d.q_numbers).sort((a, b) => a - b);
    expect(claimed).toEqual([1, 2, 3, 4, 5]);
    expect(rubric.find((d) => d.key === 'general_clinical_reasoning')!.q_numbers)
      .toEqual([2, 4]);
  });

  it('still scores a case whose domain is outside the canonical list', () => {
    const odd = makeQuestions(2, ['oral-medicine', 'oral-medicine']);
    const rubric = deriveFallbackRubric(odd);
    expect(rubric).toHaveLength(1);
    expect(rubric[0].key).toBe('oral_medicine');
    expect(rubric[0].label).toBe('Oral Medicine');
    expect(rubric[0].max_score).toBe(QUESTION_WEIGHT * 2);
  });

  it('produces nothing for an assessment with no questions', () => {
    expect(deriveFallbackRubric([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (b) A question no rubric domain claims must appear in uncovered_q_numbers
// ---------------------------------------------------------------------------
describe('planScoring — a question mapped to no domain is surfaced', () => {
  // An AUTHORED rubric is the only way a question can end up claimed by
  // nothing: the derived fallback covers everything by construction.
  const authored: RubricDomain[] = [
    {
      key: 'data_gathering',
      label: 'Data Gathering',
      description: 'History and examination',
      max_score: 10,
      q_numbers: [1, 2],
    },
    {
      key: 'hypothesis_generation',
      label: 'Hypothesis Generation',
      description: 'Differential and provisional diagnosis',
      max_score: 10,
      q_numbers: [3, 4],
    },
  ];
  const questions = makeLiveCase(); // 7 questions; the rubric claims 4

  it('lists every unclaimed question in uncovered_q_numbers', () => {
    const plan = planScoring(authored, questions, answersFor([1, 2, 3, 4, 5, 6, 7]));
    expect(plan.uncovered_q_numbers).toEqual([5, 6, 7]);
  });

  it('carries uncovered_q_numbers onto the OsceScore the API returns', () => {
    const plan = planScoring(authored, questions, answersFor([1, 2, 3, 4, 5, 6, 7]));
    const osce = aggregateScore(
      perfectOnWhatWasAnswered(plan.allocations),
      plan.uncovered_q_numbers,
    );
    expect(osce.uncovered_q_numbers).toEqual([5, 6, 7]);
  });

  it('reports no gap when the authored rubric claims every question', () => {
    const complete: RubricDomain[] = [
      { ...authored[0] },
      { ...authored[1], q_numbers: [3, 4, 5, 6, 7] },
    ];
    const plan = planScoring(complete, questions, answersFor([1, 2, 3, 4, 5, 6, 7]));
    expect(plan.uncovered_q_numbers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (c) Re-scoring an already-scored submission must not zero it
// ---------------------------------------------------------------------------
describe('readStoredAnswers — a repeat score must not blank the attempt', () => {
  const envelopes = answersFor([1, 2, 3, 4, 5, 6, 7]);

  const committedScore: OsceScore = {
    total_score: 30,
    max_score: 35,
    percentage: 85.71,
    domain_scores: [],
    uncovered_q_numbers: [],
  };

  it('reads the pre-scoring array shape', () => {
    const stored = readStoredAnswers(envelopes);
    expect(stored.answers).toHaveLength(7);
    expect(stored.osceScore).toBeNull();
  });

  it('reads the POST-scoring object shape instead of returning nothing', () => {
    // This is the exact value the write-back stores. The old route ran
    // Array.isArray() on it, got false, and scored an empty answer list.
    const stored = readStoredAnswers({
      items: envelopes,
      osce_score: committedScore,
    });
    expect(stored.answers).toHaveLength(7);
    expect(stored.answers[6].student_answer).toContain('question 7');
    expect(stored.osceScore).toEqual(committedScore);
  });

  it('re-scoring the stored shape reproduces the pass, it does not zero it', () => {
    const questions = makeLiveCase();
    const stored = readStoredAnswers({
      items: envelopes,
      osce_score: committedScore,
    });
    const rubric = deriveFallbackRubric(questions);
    const plan = planScoring(rubric, questions, stored.answers);

    // Every domain still has its answers — none fell through to the blank path.
    for (const a of plan.allocations) {
      expect(a.unanswered_q_numbers).toEqual([]);
      expect(a.scored_max).toBe(a.domain.max_score);
    }
    const osce = aggregateScore(
      perfectOnWhatWasAnswered(plan.allocations),
      plan.uncovered_q_numbers,
    );
    expect(osce.percentage).toBe(100);
    expect(osce.percentage).toBeGreaterThanOrEqual(60);
  });

  it('exposes the committed score so the route can no-op instead of re-scoring', () => {
    const stored = readStoredAnswers({
      items: envelopes,
      osce_score: committedScore,
    });
    // Non-null osceScore is the route's re-entry guard: a repeat POST without
    // `rescore: true` returns this untouched.
    expect(stored.osceScore).not.toBeNull();
    expect(stored.osceScore!.percentage).toBe(85.71);
  });

  it('heals a row an earlier repeat POST already nested', () => {
    const nested = {
      items: { items: { items: envelopes, osce_score: committedScore } },
      osce_score: { ...committedScore, percentage: 0, total_score: 0 },
    };
    const stored = readStoredAnswers(nested);
    expect(stored.answers).toHaveLength(7);
    // Outermost score wins — the same one the summary page renders.
    expect(stored.osceScore!.percentage).toBe(0);
  });

  it('returns an empty list for null, a string, or an object with no items', () => {
    expect(readStoredAnswers(null).answers).toEqual([]);
    expect(readStoredAnswers('nonsense').answers).toEqual([]);
    expect(readStoredAnswers({ osce_score: committedScore }).answers).toEqual([]);
    expect(readStoredAnswers({ osce_score: committedScore }).osceScore).toEqual(
      committedScore,
    );
  });

  it('maps the legacy answer_text envelope shape', () => {
    const stored = readStoredAnswers([
      { q_number: 1, answer_text: 'Legacy shaped response.' },
      { answer: 'No q_number — falls back to position.' },
    ]);
    expect(stored.answers[0]).toEqual({
      q_number: 1,
      student_answer: 'Legacy shaped response.',
    });
    expect(stored.answers[1].q_number).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Denominator arithmetic — a skipped question counts as zero
// ---------------------------------------------------------------------------
describe('planScoring — skipped questions are charged to the denominator', () => {
  const questions = makeLiveCase();
  const rubric = deriveFallbackRubric(questions);

  it('cannot reach 100% when only 2 of 7 were answered', () => {
    const plan = planScoring(rubric, questions, answersFor([1, 2]));
    const osce = aggregateScore(
      perfectOnWhatWasAnswered(plan.allocations),
      plan.uncovered_q_numbers,
    );
    // Q1+Q2 are the whole data_gathering domain: 10 of 35.
    expect(osce.total_score).toBe(10);
    expect(osce.max_score).toBe(35);
    expect(osce.percentage).toBeCloseTo(28.57, 2);
    expect(osce.percentage).toBeLessThan(60);
  });

  it('scales a partly-answered domain ceiling and keeps its full weight', () => {
    const plan = planScoring(rubric, questions, answersFor([3]));
    const byKey = new Map(plan.allocations.map((a) => [a.domain.key, a]));
    expect(byKey.get('hypothesis_generation')!.answered_q_numbers).toEqual([3]);
    expect(byKey.get('hypothesis_generation')!.unanswered_q_numbers).toEqual([4]);
    expect(byKey.get('hypothesis_generation')!.scored_max).toBe(5);
    expect(byKey.get('hypothesis_generation')!.domain.max_score).toBe(10);
  });

  it('treats a blank or whitespace-only response as unanswered', () => {
    const blank: PdeAnswer[] = [
      { q_number: 1, student_answer: '' },
      { q_number: 2, student_answer: '   \n\t ' },
    ];
    const plan = planScoring(rubric, questions, blank);
    const byKey = new Map(plan.allocations.map((a) => [a.domain.key, a]));
    expect(byKey.get('data_gathering')!.answered_q_numbers).toEqual([]);
    expect(byKey.get('data_gathering')!.scored_max).toBe(0);
  });

  it('lets a real answer win over an earlier blank for the same question', () => {
    const mixed: PdeAnswer[] = [
      { q_number: 1, student_answer: '' },
      { q_number: 1, student_answer: 'The swelling is tender and fluctuant.' },
    ];
    const one = makeQuestions(1, ['data_gathering']);
    const plan = planScoring(deriveFallbackRubric(one), one, mixed);
    expect(plan.allocations[0].answered_q_numbers).toEqual([1]);
    expect(plan.allocations[0].scored_max).toBe(QUESTION_WEIGHT);
  });

  it('produces no allocations and no divide-by-zero for an empty assessment', () => {
    const plan = planScoring(deriveFallbackRubric([]), [], []);
    expect(plan.allocations).toEqual([]);
    const osce = aggregateScore([], plan.uncovered_q_numbers);
    expect(osce.max_score).toBe(0);
    expect(osce.percentage).toBe(0);
    expect(Number.isNaN(osce.percentage)).toBe(false);
  });

  it('excludes an authored domain the assessment asks nothing about', () => {
    const authored: RubricDomain[] = [
      {
        key: 'data_gathering',
        label: 'Data Gathering',
        description: 'History and examination',
        max_score: 5,
        q_numbers: [1],
      },
      {
        key: 'never_asked',
        label: 'Never Asked',
        description: 'Claims a question this case does not ask',
        max_score: 5,
        q_numbers: [99],
      },
    ];
    const one = makeQuestions(1, ['data_gathering']);
    const plan = planScoring(authored, one, answersFor([1]));
    expect(plan.allocations.map((a) => a.domain.key)).toEqual(['data_gathering']);
    const osce = aggregateScore(
      perfectOnWhatWasAnswered(plan.allocations),
      plan.uncovered_q_numbers,
    );
    // A rubric that over-claims must never cap an otherwise flawless attempt.
    expect(osce.percentage).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// scoreAttempt — the blank paths must never reach an AI provider
// ---------------------------------------------------------------------------
describe('scoreAttempt — blank attempts short-circuit the examiner model', () => {
  it('scores an all-blank 7-question attempt 0% without calling a provider', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('no network call expected'));
    const calls: string[] = [];

    const osce = await scoreAttempt({
      supabase: makeStubSupabase(calls),
      assessmentId: 'assessment-1',
      caseTitle: 'Painful lower right molar',
      questions: makeLiveCase(),
      answers: [],
      rubricDomains: undefined,
    });

    expect(osce.percentage).toBe(0);
    // The denominator now covers all seven questions, not the first four.
    expect(osce.max_score).toBe(QUESTION_WEIGHT * 7);
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const d of osce.domain_scores) {
      expect(d.justification).toBe(UNANSWERED_DOMAIN_JUSTIFICATION);
      expect(d.score).toBe(0);
    }
  });

  it('returns 0% for an assessment with no questions, doing no I/O at all', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('no network call expected'));
    const calls: string[] = [];

    const osce = await scoreAttempt({
      supabase: makeStubSupabase(calls),
      assessmentId: 'assessment-empty',
      caseTitle: 'Empty case',
      questions: [],
      answers: [],
      rubricDomains: undefined,
    });

    expect(osce.percentage).toBe(0);
    expect(osce.max_score).toBe(0);
    expect(osce.domain_scores).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});
