'use client';

/**
 * CoachFeedbackPanel — renders Socratic AI feedback with retry on failure.
 *
 * States:
 *   - idle:    no submission yet
 *   - loading: waiting for /api/pde/coach
 *   - error:   show toast-style banner + [Retry] button; answer is NOT
 *              persisted to pde_submissions until feedback succeeds
 *   - success: show feedback + [Continue] button
 *
 * Per spec: "On API failure (502 from Agent B's FeedbackError), show toast +
 * [Retry] button + DO NOT save answer. Only persist pde_submissions row once
 * all answers + AI feedback succeed."
 */

interface CoachFeedbackPanelProps {
  status: 'idle' | 'loading' | 'error' | 'success';
  feedback: string | null;
  errorMessage: string | null;
  onRetry: () => void;
  onContinue: () => void;
  isLastQuestion: boolean;
}

export function CoachFeedbackPanel({
  status,
  feedback,
  errorMessage,
  onRetry,
  onContinue,
  isLastQuestion,
}: CoachFeedbackPanelProps) {
  if (status === 'idle') return null;

  if (status === 'loading') {
    return (
      <div
        className="mt-4 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-sky-500" />
          Coach is thinking…
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        role="alert"
        aria-live="assertive"
      >
        <div className="font-medium">Coach feedback couldn&apos;t load</div>
        <div className="mt-1 text-xs">{errorMessage}</div>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-900 hover:bg-red-50"
        >
          Retry
        </button>
      </div>
    );
  }

  // success
  return (
    <div
      className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
      role="status"
      aria-live="polite"
    >
      <div className="text-xs font-semibold uppercase tracking-wide opacity-80">
        Coach
      </div>
      <p className="mt-1 whitespace-pre-wrap leading-relaxed">{feedback}</p>
      <button
        type="button"
        onClick={onContinue}
        className="mt-4 inline-flex items-center justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
      >
        {isLastQuestion ? 'Submit attempt' : 'Continue to next question'}
      </button>
    </div>
  );
}
