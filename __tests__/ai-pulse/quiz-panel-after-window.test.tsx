// @vitest-environment jsdom
/**
 * AI Pulse live page — the post-session quiz panel once its windows have shut.
 * =============================================================================
 *
 * BUG-005876 and BUG-006153 (same learner, 21 Aug and 17 Sep) opened the
 * 23 Jul session page and reported "My quiz not showing". They HAD taken the
 * quiz — production holds their score — but the panel checked the windows
 * before it checked for a saved attempt, so weeks later it said "The quiz
 * unlocks when the session ends" and hid the attempt.
 *
 * Pinned here:
 *   1. A saved attempt is shown whatever the clock says.
 *   2. Its pass/fail is the STORED verdict (what the engagement gate reads),
 *      not a re-judgement against a default threshold the panel never loaded.
 *   3. With no attempt and every window shut, an ENDED session says the quiz
 *      has closed; only a session still to come says it will unlock.
 */

import '@testing-library/jest-dom';
import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/lib/services/ai-pulse/live-session-service', () => ({
  useSubmitQuiz: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const getQuiz = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/ai-pulse/quiz-service', () => ({
  QuizService: { getQuiz },
}));

import { QuizPanel } from '@/app/(routes)/ai-pulse/live/[cycle]/_components/quiz-panel';

afterEach(() => {
  cleanup();
  getQuiz.mockReset();
});

const WINDOWS_SHUT = { quizOpen: false, asyncWindowOpen: false } as const;

describe('QuizPanel after both quiz windows have closed', () => {
  it('shows a saved attempt instead of promising the quiz will unlock', () => {
    render(
      <QuizPanel
        cycleId="c1"
        {...WINDOWS_SHUT}
        sessionEnded
        alreadySubmitted
        existingScore={80}
        existingPassed
      />,
    );

    expect(screen.getByTestId('ai-pulse-quiz-result')).toHaveTextContent(
      'Submitted (live window). Score: 80% — passed.',
    );
    expect(screen.queryByText(/unlocks when the session ends/i)).toBeNull();
  });

  it('reports the stored verdict, not a default threshold the panel never loaded', () => {
    // A 23 Jul attempt: that cycle's live pass mark was 40, so 40% PASSED and
    // quiz_passed=true is stored. The panel's unloaded default is 50.
    render(
      <QuizPanel
        cycleId="c1"
        {...WINDOWS_SHUT}
        sessionEnded
        alreadySubmitted
        existingScore={40}
        existingPassed
      />,
    );

    expect(screen.getByTestId('ai-pulse-quiz-result')).toHaveTextContent(
      'Score: 40% — passed.',
    );
    expect(screen.queryByText(/did not pass/i)).toBeNull();
  });

  it('labels an async make-up attempt as async even after the window shut', () => {
    render(
      <QuizPanel
        cycleId="c1"
        {...WINDOWS_SHUT}
        sessionEnded
        alreadySubmitted
        existingScore={60}
        existingPassed
        existingAsyncMakeup
      />,
    );

    expect(screen.getByTestId('ai-pulse-quiz-result')).toHaveTextContent(
      'Submitted (async make-up window).',
    );
  });

  it('says the quiz has closed when the session is over and nothing was submitted', () => {
    render(
      <QuizPanel
        cycleId="c1"
        {...WINDOWS_SHUT}
        sessionEnded
        alreadySubmitted={false}
        asyncWindowHours={24}
      />,
    );

    expect(screen.getByTestId('ai-pulse-quiz-closed')).toHaveTextContent(
      'The quiz for this session has closed.',
    );
    expect(screen.queryByText(/unlocks when the session ends/i)).toBeNull();
  });

  it('still says the quiz will unlock for a session that has not ended', () => {
    render(
      <QuizPanel
        cycleId="c1"
        {...WINDOWS_SHUT}
        sessionEnded={false}
        alreadySubmitted={false}
      />,
    );

    expect(screen.getByText(/unlocks when the session ends/i)).toBeInTheDocument();
    expect(screen.queryByTestId('ai-pulse-quiz-closed')).toBeNull();
  });
});
