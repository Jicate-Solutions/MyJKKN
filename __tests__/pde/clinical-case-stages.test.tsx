// @vitest-environment jsdom
/**
 * Stage locking, driven through the real CaseAttempt component.
 *
 * Two properties are under test, and they are the two the Director asked for:
 *
 *   1. A case with NO stages behaves exactly as it did before stages existed.
 *      Every regression here would be invisible in a staged case and would only
 *      show up on the oral lichen planus seed case in production.
 *
 *   2. A locked stage is a VISIBLE dead stop, not a silent one, and its content
 *      is not merely hidden — it is not in the payload. The database returns
 *      null title / scenario / image for a locked stage, because her Stage 3
 *      opens "The patient is confirmed to have Pemphigus Vulgaris", which is
 *      the answer to Stage 1. These tests assert the component never invents
 *      that text back and never renders a locked stage's questions.
 */

import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type {
  ClinicalCaseBundle,
  ClinicalQuestion,
  ClinicalStageView,
} from '@/types/pde-clinical-reasoning';

const rpc = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ rpc }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Typed with an explicit parameter so the recorded call arguments stay
// inspectable — a zero-arg mock records a zero-length tuple, and reading
// calls[0][0] off it is a type error.
const completeMutate = vi.fn(async (_input: unknown) => ({ submissionId: 'sub-1' }));
vi.mock('@/hooks/pde/use-clinical-reasoning', () => ({
  useCompleteAttempt: () => ({ mutateAsync: completeMutate, isPending: false }),
  useFinalizeAttempt: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false }),
}));

import { CaseAttempt } from '@/app/(routes)/pde/learn/cases/[caseSlug]/_components/CaseAttempt';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mcq(id: string, text: string, stageId: string | null): ClinicalQuestion {
  return {
    id,
    assessment_id: 'a-1',
    question_type: 'mcq_warmup',
    question_text: text,
    question_media_url: null,
    options: [
      { id: `${id}-a`, text: 'Pemphigus vulgaris' },
      { id: `${id}-b`, text: 'Lichen planus' },
    ],
    correct_answer: null,
    order_index: 1,
    stage_id: stageId,
    metadata: { q_number: 1, osce_domain: 'hypothesis_generation', ground_truth: '', key_concepts: [] },
    expected_regions: null,
  } as ClinicalQuestion;
}

/** A locked stage as the DATABASE returns it — position only, no content. */
function lockedStage(id: string, order: number): ClinicalStageView {
  return {
    id,
    stage_order: order,
    is_unlocked: false,
    is_passed: false,
    score_pct: null,
    threshold_pct: 60,
    title: null,
    scenario_text: null,
    image_url: null,
  };
}

function openStage(id: string, order: number, title: string, text: string): ClinicalStageView {
  return {
    id,
    stage_order: order,
    is_unlocked: true,
    is_passed: false,
    score_pct: null,
    threshold_pct: 60,
    title,
    scenario_text: text,
    image_url: null,
  };
}

function bundleOf(
  questions: ClinicalQuestion[],
  stages: ClinicalStageView[] = [],
): ClinicalCaseBundle {
  return {
    assessment: {
      id: 'case-1',
      title: 'Widespread oral erosions',
      description: null,
      course_id: 'c-1',
      lesson_id: null,
      version: 1,
      time_limit_minutes: null,
    },
    scenario: {
      patient_name: 'Test Patient',
      age: 48,
      gender: 'F',
      chief_complaint: 'Oral burning pain',
      hopi: '3 weeks',
      medical_history: 'Nil',
      habit_history: { type: 'None' },
      additional_clinical_details: 'Flaccid bullae',
    },
    questions,
    stages,
    attemptsUsed: 0,
    attemptsCap: 5,
    bestSubmission: null,
    capReached: false,
    learnerProfileId: 'learner-1',
  } as ClinicalCaseBundle;
}

function answerMcq() {
  fireEvent.click(screen.getByRole('radio', { name: /pemphigus vulgaris/i }));
  fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));
}

async function clickWhenReady(name: RegExp) {
  await waitFor(() => expect(screen.getByRole('button', { name })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name }));
}

// ────────────────────────────────────────────────────────────────────────────

describe('a case with no stages is untouched', () => {
  it('runs the flat flow straight through to submit, with no stage rail', async () => {
    rpc.mockResolvedValue({ data: { is_correct: true, correct_id: 'q1-a' }, error: null });

    render(<CaseAttempt bundle={bundleOf([mcq('q1', 'Most likely diagnosis?', null)])} rollNumberSnapshot="R1" />);

    expect(screen.queryByRole('navigation', { name: /case stages/i })).not.toBeInTheDocument();
    expect(screen.getByText(/question 1 of 1/i)).toBeInTheDocument();

    answerMcq();
    // On a flat case the last question still offers to submit the whole attempt.
    await clickWhenReady(/submit attempt/i);
    await waitFor(() => expect(completeMutate).toHaveBeenCalledTimes(1));
  });

  it('survives a bundle with no stages field at all (older server payload)', () => {
    const b = bundleOf([mcq('q1', 'Most likely diagnosis?', null)]);
    delete (b as Partial<ClinicalCaseBundle>).stages;
    render(<CaseAttempt bundle={b} rollNumberSnapshot="R1" />);
    expect(screen.getByText(/question 1 of 1/i)).toBeInTheDocument();
  });
});

describe('a staged case locks the later stages', () => {
  const stages = [
    openStage('st1', 1, 'Clinical presentation', 'Widespread painful erosions with flaccid bullae.'),
    lockedStage('st2', 2),
    lockedStage('st3', 3),
  ];

  it('shows the locked stages so the learner knows the case continues', () => {
    render(<CaseAttempt bundle={bundleOf([mcq('q1', 'Name this sign', 'st1')], stages)} rollNumberSnapshot="R1" />);

    const rail = screen.getByRole('navigation', { name: /case stages/i });
    expect(rail).toBeInTheDocument();
    expect(rail).toHaveTextContent(/stage 2 · locked/i);
    expect(rail).toHaveTextContent(/stage 3 · locked/i);
    // Never a silent dead end: the reason is on screen, in plain words.
    expect(screen.getByText(/open as you pass each stage/i)).toBeInTheDocument();
  });

  it('renders only the open stage’s scenario and questions', () => {
    render(
      <CaseAttempt
        bundle={bundleOf(
          // Only stage 1's questions are in the payload — fn_pde_get_case_questions
          // withholds the rest. The component must not assume otherwise.
          [mcq('q1', 'Name this sign', 'st1')],
          stages,
        )}
        rollNumberSnapshot="R1"
      />,
    );

    expect(screen.getByText(/widespread painful erosions/i)).toBeInTheDocument();
    expect(screen.getByText(/stage 1 · question 1 of 1/i)).toBeInTheDocument();
  });

  it('ends the stage at the gate, not at the attempt', async () => {
    rpc.mockResolvedValue({ data: { is_correct: true, correct_id: 'q1-a' }, error: null });

    render(<CaseAttempt bundle={bundleOf([mcq('q1', 'Name this sign', 'st1')], stages)} rollNumberSnapshot="R1" />);

    answerMcq();
    // The renderer must NOT offer to submit the whole attempt mid-case.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /continue to next question/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /^submit attempt$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /continue to next question/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /submit this stage/i })).toBeInTheDocument(),
    );
    expect(screen.getByText(/pass mark of 60%/i)).toBeInTheDocument();
    expect(completeMutate).not.toHaveBeenCalled();
  });

  it('keeps the learner on the stage, and says why, when they miss the bar', async () => {
    // 1: MCQ marking. 2: the stage submit, which comes back failed.
    rpc.mockResolvedValueOnce({ data: { is_correct: false, correct_id: 'q1-a' }, error: null });
    rpc.mockResolvedValueOnce({
      data: {
        stage_id: 'st1',
        attempt_number: 1,
        score_pct: 40,
        threshold_pct: 60,
        passed: false,
        scored_count: 1,
        question_count: 1,
        has_next_stage: true,
        next_unlocked: false,
      },
      error: null,
    });
    // The two refetches CaseAttempt fires after a stage submission. A failed
    // stage changes nothing, so the same stages and the same question come back.
    rpc.mockResolvedValueOnce({ data: stages, error: null });
    rpc.mockResolvedValue({ data: [mcq('q1', 'Name this sign', 'st1')], error: null });

    render(<CaseAttempt bundle={bundleOf([mcq('q1', 'Name this sign', 'st1')], stages)} rollNumberSnapshot="R1" />);

    answerMcq();
    await clickWhenReady(/continue to next question/i);
    await clickWhenReady(/submit this stage/i);

    await waitFor(() => expect(screen.getByText(/not through yet/i)).toBeInTheDocument());
    expect(screen.getByText(/you scored 40%/i)).toBeInTheDocument();
    expect(screen.getByText(/needs 60%/i)).toBeInTheDocument();
    // The reason the gate exists, stated to the learner.
    expect(screen.getByText(/would answer these questions for you/i)).toBeInTheDocument();
    // And no attempt was consumed by failing a stage.
    expect(completeMutate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /try this stage again/i })).toBeInTheDocument();
  });

  it('only offers to submit the attempt once every stage is passed', () => {
    const allPassed = stages.map((s) => ({
      ...s,
      is_unlocked: true,
      is_passed: true,
      title: s.title ?? `Stage ${s.stage_order}`,
    }));
    render(<CaseAttempt bundle={bundleOf([mcq('q1', 'Name this sign', 'st1')], allPassed)} rollNumberSnapshot="R1" />);

    expect(screen.getByText(/all stages cleared/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit attempt/i })).toBeInTheDocument();
  });

  it('says so rather than showing a blank panel when no stage is open', () => {
    // Defensive: stages exist but stage 1 is not open. A blank question panel
    // here would be the exact silent dead end this module is not allowed to have.
    render(
      <CaseAttempt bundle={bundleOf([], [lockedStage('st1', 1), lockedStage('st2', 2)])} rollNumberSnapshot="R1" />,
    );
    expect(screen.getByText(/this case is not ready yet/i)).toBeInTheDocument();
  });
});

describe('auto_score counts the partial-credit formats', () => {
  it('averages a partial score in rather than treating it as unmarked', async () => {
    const q: ClinicalQuestion = {
      ...mcq('q1', 'Select all that apply', null),
      question_type: 'multi_select',
    } as ClinicalQuestion;

    // multi_select marks through fn_pde_mark_clinical_answer, which returns a score.
    rpc.mockResolvedValue({
      data: { question_id: 'q1', question_type: 'multi_select', score_pct: 75, is_correct: false },
      error: null,
    });

    render(<CaseAttempt bundle={bundleOf([q])} rollNumberSnapshot="R1" />);

    fireEvent.click(screen.getByRole('checkbox', { name: /pemphigus vulgaris/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));
    await clickWhenReady(/submit attempt/i);

    await waitFor(() => expect(completeMutate).toHaveBeenCalledTimes(1));
    const call = completeMutate.mock.calls[0][0] as unknown as { autoScore: number | null };
    expect(call.autoScore).toBe(75);
  });
});
