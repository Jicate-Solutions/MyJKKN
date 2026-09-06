'use client';

/**
 * OverdueClosedState — shown when a LOCKED (class_only) case's assignment
 * deadline for the learner's section has passed. New attempts are closed, but
 * any submitted work stays reviewable. Mirrors CapReachedState's shape so the
 * two "you can't start a new attempt" screens feel like one system.
 *
 * This is an explicit closed state, not a bare 404/redirect (CLAUDE.md rule #27).
 */

import Link from 'next/link';
import type { ClinicalSubmissionSummary } from '@/types/pde-clinical-reasoning';

interface OverdueClosedStateProps {
  caseTitle: string;
  caseSlug: string;
  bestSubmission: ClinicalSubmissionSummary | null;
}

export function OverdueClosedState({
  caseTitle,
  caseSlug,
  bestSubmission,
}: OverdueClosedStateProps) {
  const bestScore =
    bestSubmission?.final_score ?? bestSubmission?.auto_score ?? null;

  return (
    <div className="mx-auto mt-8 max-w-2xl rounded-lg border bg-card px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-xl font-semibold sm:text-2xl">Overdue — this case is closed</h1>
      <p className="mt-3 text-sm text-muted-foreground sm:text-base">
        The deadline your Senior Learner set for <em>{caseTitle}</em> has passed, so new
        attempts are closed for your section.{' '}
        {bestSubmission
          ? 'Your submitted work is still available to review below.'
          : 'If you think this is a mistake, ask your Senior Learner to extend the deadline.'}
      </p>

      {bestScore !== null && bestSubmission ? (
        <div className="mt-6 rounded-md bg-muted px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Your best</div>
          <div className="mt-1 text-2xl font-semibold">{Math.round(Number(bestScore))}%</div>
          <Link
            href={`/pde/learn/cases/${caseSlug}/summary/${bestSubmission.id}`}
            className="mt-2 inline-block text-sm text-primary underline-offset-2 hover:underline"
          >
            Review my submitted attempt →
          </Link>
        </div>
      ) : null}

      <div className="mt-6">
        <Link
          href="/pde/learn/cases"
          className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Back to clinical cases
        </Link>
      </div>
    </div>
  );
}
