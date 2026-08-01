// =============================================================================
// __tests__/pde/osce-scoring.test.ts
// PDE Clinical Reasoning — OSCE denominator + zero-answer arithmetic
// =============================================================================
//
// Why these tests exist: the bug they guard was VALID TypeScript that
// typechecked perfectly and did nothing correct at runtime. The scoring
// denominator used to be whatever the examiner model happened to be asked
// about, so an attempt answering 2 of 7 questions could reach a passing
// percentage. planScoring is pure, so the arithmetic is provable here without
// mocking an AI provider at all.
// =============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  planScoring,
  aggregateScore,
  loadFallbackRubric,
  scoreAttempt,
  UNANSWERED_DOMAIN_JUSTIFICATION,
  type DomainAllocation,
  type DomainScore,
  type PdeAnswer,
  type PdeQuestion,
  type RubricDomain,
} from '@/lib/services/pde-osce-scoring';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeQuestions(count: number): PdeQuestion[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `q-${i + 1}`,
    q_number: i + 1,
    question_text: `Question ${i + 1}?`,
    ground_truth: `Expected reasoning for question ${i + 1}.`,
    key_concepts: [],
  }));
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
 * after this is caused purely by the blank-question denominator, which is what
 * these tests are proving.
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
// (a) Every question answered
// ---------------------------------------------------------------------------
describe('planScoring — every question answered', () => {
  const rubric = loadFallbackRubric(); // 5 domains x 5 = 25, covering Q1-Q4
  const questions = makeQuestions(4);
  const answers = answersFor([1, 2, 3, 4]);

  it('gives every domain its full weight as the ceiling', () => {
    const plan = planScoring(rubric, questions, answers);
    expect(plan.allocations).toHaveLength(5);
    for (const a of plan.allocations) {
      expect(a.unanswered_q_numbers).toEqual([]);
      expect(a.scored_max).toBe(a.domain.max_score);
    }
  });

  it('can still reach 100% when nothing was skipped', () => {
    const plan = planScoring(rubric, questions, answers);
    const osce = aggregateScore(
      perfectOnWhatWasAnswered(plan.allocations),
      plan.uncovered_q_numbers,
    );
    expect(osce.max_score).toBe(25);
    expect(osce.percentage).toBe(100);
  });

  it('reports no uncovered questions when the rubric claims them all', () => {
    const plan = planScoring(rubric, questions, answers);
    expect(plan.uncovered_q_numbers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (b) 2 of 7 answered — the regression that shipped a 100%
// ---------------------------------------------------------------------------
describe('planScoring — 2 of 7 answered', () => {
  const rubric = loadFallbackRubric();
  const questions = makeQuestions(7);
  const answers = answersFor([1, 2]);

  it('is NOT 100% even when every answered question is scored flawlessly', () => {
    const plan = planScoring(rubric, questions, answers);
    const osce = aggregateScore(
      perfectOnWhatWasAnswered(plan.allocations),
      plan.uncovered_q_numbers,
    );
    expect(osce.percentage).not.toBe(100);
    expect(osce.percentage).toBeLessThan(100);
  });

  it('cannot clear the 60% passing threshold on 2 of 7', () => {
    const plan = planScoring(rubric, questions, answers);
    const osce = aggregateScore(
      perfectOnWhatWasAnswered(plan.allocations),
      plan.uncovered_q_numbers,
    );
    // Q1 -> clinical_findings 5/5 - Q2 -> diagnostic_reasoning 5/5
    // Q2 of {Q2,Q3} -> differential_diagnosis 2.5/5
    // Q3 -> investigation_judgement 0/5 - Q4 -> management_planning 0/5
    expect(osce.total_score).toBe(12.5);
    expect(osce.max_score).toBe(25);
    expect(osce.percentage).toBe(50);
    expect(osce.percentage).toBeLessThan(60);
  });

  it('charges blank questions to the denominator, never to the numerator', () => {
    const plan = planScoring(rubric, questions, answers);
    const byKey = new Map(plan.allocations.map((a) => [a.domain.key, a]));

    expect(byKey.get('differential_diagnosis')!.answered_q_numbers).toEqual([2]);
    expect(byKey.get('differential_diagnosis')!.unanswered_q_numbers).toEqual([3]);
    expect(byKey.get('differential_diagnosis')!.scored_max).toBe(2.5);

    expect(byKey.get('management_planning')!.answered_q_numbers).toEqual([]);
    expect(byKey.get('management_planning')!.unanswered_q_numbers).toEqual([4]);
    expect(byKey.get('management_planning')!.scored_max).toBe(0);
    // The full weight is still charged.
    expect(byKey.get('management_planning')!.domain.max_score).toBe(5);
  });

  it('surfaces the questions no rubric domain claims', () => {
    const plan = planScoring(rubric, questions, answers);
    expect(plan.uncovered_q_numbers).toEqual([5, 6, 7]);
  });
});

// ---------------------------------------------------------------------------
// (c) Zero answered
// ---------------------------------------------------------------------------
describe('planScoring — nothing answered', () => {
  const rubric = loadFallbackRubric();
  const questions = makeQuestions(7);

  it('yields a zero ceiling on every domain while keeping the full total', () => {
    const plan = planScoring(rubric, questions, []);
    expect(plan.allocations).toHaveLength(5);
    for (const a of plan.allocations) {
      expect(a.answered_q_numbers).toEqual([]);
      expect(a.scored_max).toBe(0);
    }
    const osce = aggregateScore(
      perfectOnWhatWasAnswered(plan.allocations),
      plan.uncovered_q_numbers,
    );
    expect(osce.max_score).toBe(25);
    expect(osce.total_score).toBe(0);
    expect(osce.percentage).toBe(0);
  });

  it('treats a blank or whitespace-only response as unanswered', () => {
    const blank: PdeAnswer[] = [
      { q_number: 1, student_answer: '' },
      { q_number: 2, student_answer: '   \n\t ' },
    ];
    const plan = planScoring(rubric, questions, blank);
    const byKey = new Map(plan.allocations.map((a) => [a.domain.key, a]));
    expect(byKey.get('clinical_findings')!.answered_q_numbers).toEqual([]);
    expect(byKey.get('clinical_findings')!.scored_max).toBe(0);
  });

  it('lets a real answer win over an earlier blank for the same question', () => {
    const mixed: PdeAnswer[] = [
      { q_number: 1, student_answer: '' },
      { q_number: 1, student_answer: 'The swelling is tender and fluctuant.' },
    ];
    const plan = planScoring(rubric, makeQuestions(1), mixed);
    const byKey = new Map(plan.allocations.map((a) => [a.domain.key, a]));
    expect(byKey.get('clinical_findings')!.answered_q_numbers).toEqual([1]);
    expect(byKey.get('clinical_findings')!.scored_max).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// (d) Assessment with no questions + rubric/assessment mismatch
// ---------------------------------------------------------------------------
describe('planScoring — no questions to score', () => {
  it('produces no allocations and no divide-by-zero', () => {
    const plan = planScoring(loadFallbackRubric(), [], []);
    expect(plan.allocations).toEqual([]);
    expect(plan.uncovered_q_numbers).toEqual([]);

    const osce = aggregateScore([], plan.uncovered_q_numbers);
    expect(osce.max_score).toBe(0);
    expect(osce.percentage).toBe(0);
    expect(Number.isNaN(osce.percentage)).toBe(false);
  });

  it('excludes a domain the assessment asks nothing about', () => {
    // Only Q1 exists, so the four domains mapped to Q2-Q4 must not be charged.
    const plan = planScoring(loadFallbackRubric(), makeQuestions(1), answersFor([1]));
    expect(plan.allocations.map((a) => a.domain.key)).toEqual([
      'clinical_findings',
    ]);

    const osce = aggregateScore(
      perfectOnWhatWasAnswered(plan.allocations),
      plan.uncovered_q_numbers,
    );
    // A flawless attempt on a one-question case is still 100% — a rubric that
    // over-claims must never cap the learner.
    expect(osce.max_score).toBe(5);
    expect(osce.percentage).toBe(100);
  });

  it('handles an empty rubric without dividing by zero', () => {
    const plan = planScoring([], makeQuestions(3), answersFor([1, 2, 3]));
    expect(plan.allocations).toEqual([]);
    expect(plan.uncovered_q_numbers).toEqual([1, 2, 3]);
    expect(aggregateScore([], plan.uncovered_q_numbers).percentage).toBe(0);
  });

  it('scales a fractional ceiling for a domain spanning many questions', () => {
    const rubric: RubricDomain[] = [
      {
        key: 'wide',
        label: 'Wide domain',
        description: 'Spans three questions',
        max_score: 6,
        q_numbers: [1, 2, 3],
      },
    ];
    const plan = planScoring(rubric, makeQuestions(3), answersFor([1]));
    expect(plan.allocations[0].scored_max).toBe(2);
    expect(plan.allocations[0].domain.max_score).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// scoreAttempt — the blank paths must never reach an AI provider
// ---------------------------------------------------------------------------
describe('scoreAttempt — blank attempts short-circuit the examiner model', () => {
  it('scores an all-blank attempt 0% without calling out to a provider', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('no network call expected'));
    const calls: string[] = [];

    const osce = await scoreAttempt({
      supabase: makeStubSupabase(calls),
      assessmentId: 'assessment-1',
      caseTitle: 'Painful lower right molar',
      questions: makeQuestions(7),
      answers: [],
      rubricDomains: loadFallbackRubric(),
    });

    expect(osce.percentage).toBe(0);
    expect(osce.max_score).toBe(25);
    expect(fetchSpy).not.toHaveBeenCalled();
    // Proves the arithmetic short-circuit ran rather than a failed AI call.
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
      rubricDomains: loadFallbackRubric(),
    });

    expect(osce.percentage).toBe(0);
    expect(osce.max_score).toBe(0);
    expect(osce.domain_scores).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});
