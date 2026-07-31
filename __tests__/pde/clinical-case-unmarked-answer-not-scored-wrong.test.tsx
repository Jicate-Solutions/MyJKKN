// @vitest-environment jsdom
/**
 * Regression guard: an MCQ the server never graded must NOT be scored as wrong.
 *
 * #2630 gave the learner a way past a marking outage — the chosen option is
 * recorded with `marking_failed: true` and no `is_correct` — but CaseAttempt's
 * auto_score still read `a.is_correct ? 100 : 0`, so an unresolved answer fell
 * through the ternary as a hard zero WHILE keeping its slot in the denominator.
 * A learner with one correct MCQ and one unmarked MCQ scored 50%: identical to
 * having answered the second one incorrectly. The safeguard penalised exactly
 * the learner it exists to protect.
 *
 * These tests drive the real component, so they fail against the pre-fix
 * scoring block rather than against a re-implementation of it.
 */

import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ClinicalCaseBundle, ClinicalQuestion } from '@/types/pde-clinical-reasoning';

const rpc = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ rpc }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Capture what CaseAttempt actually submits. finalize is a no-op success so the
// flow reaches the end without taking the warn-and-continue branch.
const completeMutate = vi.fn(async () => ({ submissionId: 'sub-1' }));
vi.mock('@/hooks/pde/use-clinical-reasoning', () => ({
  useCompleteAttempt: () => ({ mutateAsync: completeMutate, isPending: false }),
  useFinalizeAttempt: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false }),
}));

import { CaseAttempt } from '@/app/(routes)/pde/learn/cases/[caseSlug]/_components/CaseAttempt';

beforeAll(() => {
  // CaseAttempt scrolls the next question into view on advance; jsdom has no
  // implementation, so without this the second question throws.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mcq(id: string, text: string): ClinicalQuestion {
  return {
    id,
    assessment_id: 'a-1',
    question_type: 'mcq_warmup',
    question_text: text,
    question_media_url: null,
    options: [
      { id: `${id}-a`, text: 'Orthopantomogram' },
      { id: `${id}-b`, text: 'Incisional biopsy' },
    ],
    correct_answer: null,
    order_index: 1,
    metadata: {
      q_number: 1,
      osce_domain: 'hypothesis_generation',
      ground_truth: '',
      key_concepts: [],
    },
    expected_regions: null,
  } as ClinicalQuestion;
}

function bundleOf(questions: ClinicalQuestion[]): ClinicalCaseBundle {
  return {
    assessment: {
      id: 'case-1',
      title: 'Non-healing ulcer',
      description: null,
      course_id: 'c-1',
      lesson_id: null,
      version: 1,
      time_limit_minutes: null,
    },
    scenario: {
      patient_name: 'Test Patient',
      age: 52,
      gender: 'M',
      chief_complaint: 'Ulcer',
      hopi: '3 weeks',
      medical_history: 'Nil',
      habit_history: { type: 'None' },
      additional_clinical_details: 'Rolled margins',
    },
    questions,
    attemptsUsed: 0,
    attemptsCap: 5,
    bestSubmission: null,
    capReached: false,
    learnerProfileId: 'learner-1',
  } as ClinicalCaseBundle;
}

/** Pick an option and submit it to the (mocked) marking RPC. */
function chooseAndSubmit(option: RegExp) {
  fireEvent.click(screen.getByRole('radio', { name: option }));
  fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));
}

async function clickWhenReady(name: RegExp) {
  await waitFor(() => expect(screen.getByRole('button', { name })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name }));
}

function submitted() {
  expect(completeMutate).toHaveBeenCalledTimes(1);
  return completeMutate.mock.calls[0][0] as unknown as {
    autoScore: number | null;
    passed: boolean | null;
    answers: Array<Record<string, unknown>>;
  };
}

describe('auto_score — an unmarked MCQ is not scored as wrong', () => {
  it('scores 100%, not 50%, for one correct MCQ + one MCQ the server never graded', async () => {
    // Q1 marks fine and is correct. Q2's marking RPC is down.
    rpc.mockResolvedValueOnce({ data: { is_correct: true, correct_id: 'q1-b' }, error: null });
    rpc.mockResolvedValue({ data: null, error: { message: 'RPC unavailable' } });

    render(
      <CaseAttempt
        bundle={bundleOf([mcq('q1', 'Which investigation first?'), mcq('q2', 'Which margin sign?')])}
        rollNumberSnapshot="R1"
      />,
    );

    chooseAndSubmit(/incisional biopsy/i);
    await clickWhenReady(/continue to next question/i);

    // Q2: marking fails, learner takes the #2630 escape hatch on the last question.
    chooseAndSubmit(/orthopantomogram/i);
    await clickWhenReady(/submit attempt without checking/i);

    await waitFor(() => expect(completeMutate).toHaveBeenCalledTimes(1));
    const result = submitted();

    // The regression scored this (100 + 0) / 2 = 50. Correct is 100 / 1 = 100.
    expect(result.autoScore).not.toBe(50);
    expect(result.autoScore).toBe(100);
    expect(result.passed).toBe(true);

    // The unresolved answer is still on record and still distinguishable from a
    // wrong one, so faculty can re-grade rather than guess.
    const q2 = result.answers.find((a) => a.question_id === 'q2');
    expect(q2).toBeDefined();
    expect(q2?.selected_option_id).toBe('q2-a');
    expect(q2?.marking_failed).toBe(true);
    expect(q2?.is_correct).toBeUndefined();
  });

  it('still counts a genuinely WRONG answer as zero on both sides of the fraction', async () => {
    // Q1 correct, Q2 unmarked, Q3 marked and wrong.
    // Only Q2 leaves the fraction: 100 / 2 = 50, NOT 100 / 1 = 100.
    rpc.mockResolvedValueOnce({ data: { is_correct: true, correct_id: 'q1-b' }, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'RPC unavailable' } });
    rpc.mockResolvedValueOnce({ data: { is_correct: false, correct_id: 'q3-b' }, error: null });

    render(
      <CaseAttempt
        bundle={bundleOf([mcq('q1', 'First?'), mcq('q2', 'Second?'), mcq('q3', 'Third?')])}
        rollNumberSnapshot="R1"
      />,
    );

    chooseAndSubmit(/incisional biopsy/i);
    await clickWhenReady(/continue to next question/i);

    chooseAndSubmit(/orthopantomogram/i);
    await clickWhenReady(/continue without checking/i);

    chooseAndSubmit(/orthopantomogram/i);
    await clickWhenReady(/submit attempt/i);

    await waitFor(() => expect(completeMutate).toHaveBeenCalledTimes(1));
    const result = submitted();

    // Excluding the unmarked one must not also excuse the wrong one.
    expect(result.autoScore).toBe(50);
    expect(result.passed).toBe(false);
  });

  it('counts the question again once a retry succeeds — exclusion must not outlive the outage', async () => {
    // Marking fails, the learner retries, marking comes back up and says WRONG.
    // The successful envelope replaces the unmarked one (recordAnswer overwrites
    // by question_id) and carries no marking_failed, so the question must return
    // to the denominator and score 0 — not stay excluded and flatter the learner.
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'RPC unavailable' } });
    rpc.mockResolvedValueOnce({ data: { is_correct: false, correct_id: 'q1-b' }, error: null });

    render(
      <CaseAttempt bundle={bundleOf([mcq('q1', 'Only question')])} rollNumberSnapshot="R1" />,
    );

    chooseAndSubmit(/orthopantomogram/i);
    await waitFor(() => expect(screen.getByText(/could not be checked right now/i)).toBeInTheDocument());

    // Retry the same selection; this time the server answers.
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));
    await clickWhenReady(/submit attempt/i);

    await waitFor(() => expect(completeMutate).toHaveBeenCalledTimes(1));
    const result = submitted();

    expect(result.autoScore).toBe(0);
    expect(result.passed).toBe(false);
    const q1 = result.answers.find((a) => a.question_id === 'q1');
    expect(q1?.is_correct).toBe(false);
    expect(q1?.marking_failed).toBeUndefined();
  });

  it('leaves auto_score null (never NaN) when every scorable answer is unresolved', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'RPC unavailable' } });

    render(
      <CaseAttempt
        bundle={bundleOf([mcq('q1', 'Which investigation first?')])}
        rollNumberSnapshot="R1"
      />,
    );

    chooseAndSubmit(/incisional biopsy/i);
    await clickWhenReady(/submit attempt without checking/i);

    await waitFor(() => expect(completeMutate).toHaveBeenCalledTimes(1));
    const result = submitted();

    // Denominator collapses to 0 -> null. Must not become NaN, and must not
    // become 0 (which would read as "scored zero" rather than "not scored").
    expect(result.autoScore).toBeNull();
    expect(result.passed).toBeNull();
    expect(Number.isNaN(result.autoScore as unknown as number)).toBe(false);
  });
});
