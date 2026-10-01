'use client';

/**
 * CapReachedState — shown when the learner has used all lifetime attempts.
 *
 * Cap reset is faculty-only (the [Grant N more attempts] action on the case
 * roster). This screen shows the learner their best previous submission and
 * tells them where the decision now sits.
 *
 * It used to end at "ask your faculty to grant you additional attempts", which
 * left the learner to find that person themselves and left the Senior Learner
 * unaware anyone was stuck. The Senior Learner is now told automatically, and
 * `facultyNotified` says whether that provably happened for THIS learner on
 * THIS case. It is never assumed: when the notice could not be delivered the
 * old ask-them wording stands, because a screen that claims someone was told
 * when nobody was is worse than one that asks the learner to go and ask.
 */

import Link from 'next/link';
import type { ClinicalSubmissionSummary } from '@/types/pde-clinical-reasoning';

interface CapReachedStateProps {
  attemptsCap: number;
  bestSubmission: ClinicalSubmissionSummary | null;
  caseTitle: string;
  caseSlug: string;
  /** True only when a notice provably reached their Senior Learner. */
  facultyNotified?: boolean;
}

export function CapReachedState({
  attemptsCap,
  bestSubmission,
  caseTitle,
  caseSlug,
  facultyNotified = false,
}: CapReachedStateProps) {
  const bestScore =
    bestSubmission?.final_score ?? bestSubmission?.auto_score ?? null;

  return (
    <div className="mx-auto mt-8 max-w-2xl rounded-lg border bg-card px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-xl font-semibold sm:text-2xl">All attempts used</h1>
      <p className="mt-3 text-sm text-muted-foreground sm:text-base">
        You&apos;ve worked through this case <strong>{attemptsCap} times</strong>. That&apos;s the
        lifetime cap set by your institution&apos;s clinical-reasoning policy, so
        <em> {caseTitle}</em> is closed to you until someone grants you more attempts.
      </p>

      {facultyNotified ? (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <strong className="font-semibold">Your Senior Learner has been told.</strong>{' '}
          They were sent a notification naming you and this case, and can grant you more
          attempts from their case roster. You don&apos;t need to do anything to start
          that — though there&apos;s no harm in reminding them.
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong className="font-semibold">Ask your Senior Learner.</strong> We
          couldn&apos;t notify them automatically this time, so please tell them yourself
          that you&apos;re out of attempts on this case. They can grant you more.
        </div>
      )}

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

      {/*
        A request-a-reset chip used to sit here: a <span> dressed as a button,
        which looked clickable, did nothing, and was the only instruction on
        the screen. The banner above now carries that message and says whether
        anyone was actually told, so the fake control is gone rather than left
        here to be clicked at.
      */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
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
