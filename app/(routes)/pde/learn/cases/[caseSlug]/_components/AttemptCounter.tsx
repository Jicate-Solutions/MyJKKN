'use client';

/**
 * AttemptCounter — prominent "Attempt N of M" widget shown above the case.
 * Phone-responsive: stays readable at 360px (compact pill) and expands on
 * tablet+ to show best-score context.
 */

import type { ClinicalSubmissionSummary } from '@/types/pde-clinical-reasoning';

interface AttemptCounterProps {
  attemptsUsed: number;
  attemptsCap: number;
  current: number; // = attemptsUsed + 1 while attempt is in progress
  bestSubmission: ClinicalSubmissionSummary | null;
}

export function AttemptCounter({
  attemptsUsed,
  attemptsCap,
  current,
  bestSubmission,
}: AttemptCounterProps) {
  const remaining = Math.max(0, attemptsCap - attemptsUsed);
  const bestScore =
    bestSubmission?.final_score ?? bestSubmission?.auto_score ?? null;

  // colour shifts as the learner approaches the cap
  const tone =
    remaining === 0
      ? 'bg-red-100 text-red-900 border-red-200'
      : remaining === 1
        ? 'bg-amber-100 text-amber-900 border-amber-200'
        : 'bg-emerald-100 text-emerald-900 border-emerald-200';

  return (
    <div
      className={`mt-4 flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${tone}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <span className="text-base font-semibold">
          Attempt {current} of {attemptsCap}
        </span>
        <span className="text-xs opacity-80">
          {remaining === 0 ? 'No attempts remaining' : `${remaining} attempts remaining`}
        </span>
      </div>
      {bestScore !== null ? (
        <div className="text-xs opacity-80">
          Best so far: <strong>{Math.round(Number(bestScore))}</strong>%
        </div>
      ) : null}
    </div>
  );
}
