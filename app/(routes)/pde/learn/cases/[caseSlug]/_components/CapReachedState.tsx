'use client';

/**
 * CapReachedState — shown when the learner has used all lifetime attempts.
 *
 * Cap reset is faculty-only (Agent D's [Grant N more attempts] action).
 * This screen guides the learner toward asking faculty, and shows their
 * best previous submission for review.
 */

import Link from 'next/link';
import type { ClinicalSubmissionSummary } from '@/types/pde-clinical-reasoning';

interface CapReachedStateProps {
  attemptsCap: number;
  bestSubmission: ClinicalSubmissionSummary | null;
  caseTitle: string;
  caseSlug: string;
}

export function CapReachedState({
  attemptsCap,
  bestSubmission,
  caseTitle,
  caseSlug,
}: CapReachedStateProps) {
  const bestScore =
    bestSubmission?.final_score ?? bestSubmission?.auto_score ?? null;

  return (
    <div className="mx-auto mt-8 max-w-2xl rounded-lg border bg-card px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-xl font-semibold sm:text-2xl">All attempts used</h1>
      <p className="mt-3 text-sm text-muted-foreground sm:text-base">
        You&apos;ve worked through this case <strong>{attemptsCap} times</strong>. That&apos;s the
        lifetime cap set by your institution&apos;s clinical-reasoning policy. To keep working on
        <em> {caseTitle}</em>, ask your faculty to grant you additional attempts.
      </p>

      {bestScore !== null && bestSubmission ? (
        <div className="mt-6 rounded-md bg-muted px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Your best</div>
          <div className="mt-1 text-2xl font-semibold">{Math.round(Number(bestScore))}%</div>
          <Link
            href={`/pde/learn/cases/${caseSlug}/summary/${bestSubmission.id}`}
            className="mt-2 inline-block text-sm text-primary underline-offset-2 hover:underline"
          >
            Review my best attempt →
          </Link>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/pde/learn/cases"
          className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Back to clinical cases
        </Link>
        <span className="inline-flex items-center justify-center rounded-md border border-dashed bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Request reset from your faculty
        </span>
      </div>
    </div>
  );
}
