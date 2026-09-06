// @vitest-environment jsdom
/**
 * Regression guard: an AI coach outage or a marking outage must NEVER discard
 * what the learner submitted.
 *
 * Before this fix both components swallowed the failure and never called
 * onAnswered, so the learner's written reasoning / chosen option was absent
 * from the submitted attempt and from the summary — gone with no record.
 * The coach is a live external LLM call (~15s per question), so timeouts are
 * an everyday event.
 */

import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import type { ClinicalQuestion } from '@/types/pde-clinical-reasoning';

// The MCQ component grades through a Supabase RPC; the coach hook imports the
// same module. Stub it so no real client is constructed under test.
const rpc = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ rpc }),
}));

import { FreeTextSocraticQuestion } from '@/app/(routes)/pde/learn/cases/[caseSlug]/_components/FreeTextSocraticQuestion';
import { MCQWarmupQuestion } from '@/app/(routes)/pde/learn/cases/[caseSlug]/_components/MCQWarmupQuestion';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function withQueryClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

const freeTextQuestion = {
  id: 'q-free-1',
  assessment_id: 'a-1',
  question_type: 'free_text_socratic',
  question_text: 'What is your differential diagnosis, and why?',
  question_media_url: null,
  options: null,
  correct_answer: null,
  order_index: 1,
  metadata: {
    q_number: 1,
    osce_domain: 'hypothesis_generation',
    ground_truth: 'gt',
    key_concepts: [],
  },
  expected_regions: null,
} as ClinicalQuestion;

const mcqQuestion = {
  ...freeTextQuestion,
  id: 'q-mcq-1',
  question_type: 'mcq_warmup',
  question_text: 'Which investigation comes first?',
  options: [
    { id: 'opt-a', text: 'Orthopantomogram' },
    { id: 'opt-b', text: 'Incisional biopsy' },
  ],
} as ClinicalQuestion;

const LEARNER_ANSWER =
  'Given the 3-week non-healing ulcer with rolled margins in a long-term tobacco user, ' +
  'my leading hypothesis is oral squamous cell carcinoma.';

describe('FreeTextSocraticQuestion — coach failure preserves the answer', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'Coach upstream timed out' }), {
          status: 504,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
  });

  it('records the written answer when the coach call fails', async () => {
    const onAnswered = vi.fn();
    render(
      withQueryClient(
        <FreeTextSocraticQuestion
          question={freeTextQuestion}
          learnerId="learner-1"
          assessmentId="a-1"
          onAnswered={onAnswered}
          onContinue={vi.fn()}
          isLastQuestion={false}
        />,
      ),
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: LEARNER_ANSWER } });
    fireEvent.click(screen.getByRole('button', { name: /get coach feedback/i }));

    await waitFor(() => expect(onAnswered).toHaveBeenCalledTimes(1));

    const envelope = onAnswered.mock.calls[0][0];
    expect(envelope.question_id).toBe('q-free-1');
    expect(envelope.question_type).toBe('free_text_socratic');
    // The whole point: the writing survives.
    expect(envelope.answer_text).toBe(LEARNER_ANSWER);
    // No coaching was given — say so explicitly, and do not invent feedback.
    expect(envelope.coach_feedback).toBeUndefined();
    expect(envelope.coach_failed).toBe(true);
    expect(typeof envelope.submitted_at).toBe('string');
  });

  it('still shows the error and Retry, and offers a way to continue', async () => {
    const onContinue = vi.fn();
    const onAnswered = vi.fn();
    render(
      withQueryClient(
        <FreeTextSocraticQuestion
          question={freeTextQuestion}
          learnerId="learner-1"
          assessmentId="a-1"
          onAnswered={onAnswered}
          onContinue={onContinue}
          isLastQuestion={false}
        />,
      ),
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: LEARNER_ANSWER } });
    fireEvent.click(screen.getByRole('button', { name: /get coach feedback/i }));

    // Error banner + Retry are unchanged.
    await waitFor(() =>
      expect(screen.getByText(/coach feedback couldn.t load/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /^retry$/i })).toBeInTheDocument();

    // Without a way forward the attempt is never written at all (one INSERT on
    // the final question), so the saved answer would still be lost.
    const carryOn = screen.getByRole('button', { name: /continue without coach feedback/i });
    fireEvent.click(carryOn);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('a later successful retry updates the same envelope instead of adding a second one', async () => {
    const onAnswered = vi.fn();
    render(
      withQueryClient(
        <FreeTextSocraticQuestion
          question={freeTextQuestion}
          learnerId="learner-1"
          assessmentId="a-1"
          onAnswered={onAnswered}
          onContinue={vi.fn()}
          isLastQuestion={false}
        />,
      ),
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: LEARNER_ANSWER } });
    fireEvent.click(screen.getByRole('button', { name: /get coach feedback/i }));
    await waitFor(() => expect(onAnswered).toHaveBeenCalledTimes(1));

    // Coach comes back up.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ feedback: 'What would change your mind?' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /^retry$/i }));
    await waitFor(() => expect(onAnswered).toHaveBeenCalledTimes(2));

    const [first, second] = onAnswered.mock.calls.map((c) => c[0]);
    // Same question_id both times — CaseAttempt.recordAnswer overwrites by
    // question_id, so this is an update, never a duplicate row.
    expect(second.question_id).toBe(first.question_id);
    expect(second.answer_text).toBe(LEARNER_ANSWER);
    expect(second.coach_feedback).toBe('What would change your mind?');
    expect(second.coach_failed).toBeUndefined();
  });
});

describe('MCQWarmupQuestion — marking failure preserves the selection', () => {
  it('records the chosen option with the verdict left unresolved', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'RPC unavailable' } });
    const onAnswered = vi.fn();
    render(
      <MCQWarmupQuestion
        question={mcqQuestion}
        onAnswered={onAnswered}
        onContinue={vi.fn()}
        isLastQuestion={false}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /incisional biopsy/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));

    await waitFor(() => expect(onAnswered).toHaveBeenCalledTimes(1));

    const envelope = onAnswered.mock.calls[0][0];
    expect(envelope.question_id).toBe('q-mcq-1');
    expect(envelope.question_type).toBe('mcq_warmup');
    expect(envelope.selected_option_id).toBe('opt-b');
    // Unresolved, NOT false — the server never graded it.
    expect(envelope.is_correct).toBeUndefined();
    expect(envelope.marking_failed).toBe(true);
  });

  it('never claims the learner was wrong when marking failed', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'RPC unavailable' } });
    render(
      <MCQWarmupQuestion
        question={mcqQuestion}
        onAnswered={vi.fn()}
        onContinue={vi.fn()}
        isLastQuestion={false}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /orthopantomogram/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));

    await waitFor(() => expect(screen.getByText(/RPC unavailable/i)).toBeInTheDocument());
    expect(screen.queryByText(/not quite/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Correct\.$/)).not.toBeInTheDocument();
    expect(screen.getByText(/could not be checked right now/i)).toBeInTheDocument();
  });
});
