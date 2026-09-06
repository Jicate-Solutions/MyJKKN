// @vitest-environment jsdom
//
// Foundation — whose answers are these?
//
// When one person records answers for another, mis-attribution is silent and
// permanent: nothing downstream can tell that a child's run was filed under the
// previous child's name. The two places that make attribution visible — the
// banner during the run, and the wording of the review — are therefore load
// bearing, and neither is covered by the route tests.
//
// This suite exists because the route tests did NOT catch a real crash here: a
// prop was added to Review's type but never destructured, so the review screen
// threw a ReferenceError the moment a session was run for somebody else. Ninety
// five green tests said nothing, because none of them rendered anything.
import '@testing-library/jest-dom';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(() => cleanup());

const DRAW = {
  assessmentId: 'pool-1',
  learnerId: 'learner-9',
  questions: [
    {
      id: 'item-1',
      stem: 'Which part of a flower makes the pollen grains?',
      options: [
        { key: 'A', text: 'The stigma' },
        { key: 'C', text: 'The anther' },
      ],
      difficulty: 2,
      q_type: 'mcq_single',
    },
  ],
};

const REVIEW = {
  total: 1,
  correct: 1,
  skipped: 0,
  questions: [
    {
      itemId: 'item-1',
      stem: 'Which part of a flower makes the pollen grains?',
      options: DRAW.questions[0].options,
      chosen: 'C',
      correctAnswer: 'C',
      isCorrect: true,
      explanation: 'The anther is the pollen-bearing part of the stamen.',
    },
  ],
};

vi.mock('@/hooks/foundation/use-foundation', () => ({
  useRecordAttempt: () => ({ mutateAsync: vi.fn(async () => 'attempt-1') }),
}));

// The flag button reaches for its own data; irrelevant to attribution.
vi.mock('@/app/(routes)/foundation/_components/item-flag-button', () => ({
  ItemFlagButton: () => null,
}));

import { PracticeRunner } from '@/app/(routes)/foundation/practice/_components/practice-runner';

function renderRunner(props: Record<string, unknown> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PracticeRunner
        examDefinitionId="11111111-2222-4333-8444-555555555555"
        examName="Foundation Science — Class 6"
        onExit={() => {}}
        {...(props as any)}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      new Response(
        JSON.stringify(String(url).includes('/attempts/') ? REVIEW : DRAW),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ),
  );
});

describe('recording answers for somebody else', () => {
  it('names the learner on screen for the whole run', async () => {
    renderRunner({ forLearnerId: 'learner-9', forLearnerName: 'Meena R' });
    expect(await screen.findByText(/Recording answers for/i)).toBeInTheDocument();
    expect(screen.getByText('Meena R')).toBeInTheDocument();
  });

  it('shows no such banner when you are answering as yourself', async () => {
    renderRunner();
    await screen.findByText(/pollen grains/i);
    expect(screen.queryByText(/Recording answers for/i)).not.toBeInTheDocument();
  });

  it('asks the route for that learner, not for the caller', async () => {
    renderRunner({ forLearnerId: 'learner-9', forLearnerName: 'Meena R' });
    await screen.findByText(/pollen grains/i);
    const calls = (globalThis.fetch as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u: string) => u.includes('forLearner=learner-9'))).toBe(true);
  });

  it('attributes the review to the learner, never to the person recording', async () => {
    renderRunner({ forLearnerId: 'learner-9', forLearnerName: 'Meena R' });
    fireEvent.click(await screen.findByText('The anther'));
    fireEvent.click(await screen.findByRole('button', { name: /finish/i }));

    // The crash this file was written for: Review used a prop it never
    // destructured, so this render threw instead of producing text.
    expect(await screen.findByText(/answered/i)).toBeInTheDocument();
    expect(screen.getByText('Meena R')).toBeInTheDocument();
    expect(screen.queryByText(/^You answered/)).not.toBeInTheDocument();
  });

  it('still says "You answered" when it really was you', async () => {
    renderRunner();
    fireEvent.click(await screen.findByText('The anther'));
    fireEvent.click(await screen.findByRole('button', { name: /finish/i }));
    expect(await screen.findByText(/You answered/)).toBeInTheDocument();
  });
});
