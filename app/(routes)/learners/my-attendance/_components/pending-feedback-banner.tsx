'use client';

/**
 * Pending Feedback Nudge Banner
 * Created: 2026-07-03
 * Description: Banner on the learner's own attendance page that surfaces
 *   "present-pending" sessions — classes the learner attended but has not yet
 *   confirmed by submitting post-class feedback. Always renders a link to the
 *   feedback page (BUG-004736/4738 group, 2026-07-22): this is the only
 *   feedback affordance on this page, so it must not disappear when nothing is
 *   currently pending. Framing is reassuring (confirm, never punitive): missing
 *   feedback NEVER marks the learner absent — it only leaves attendance unconfirmed.
 *
 * Substrate (READ-ONLY — imported, never edited):
 *   hooks/use-session-feedback.ts → usePendingSessions(lookbackDays)
 *   (fn_scf_pending_for_learner, already in prod).
 */

import Link from 'next/link';
import { CheckCircle2, Clock, MessageSquarePlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { usePendingSessions } from '@/hooks/use-session-feedback';

const LOOKBACK_DAYS = 30;
const FEEDBACK_ROUTE = '/learners/class-feedback';

export function PendingFeedbackBanner() {
  const { data, isLoading, isError } = usePendingSessions(LOOKBACK_DAYS);

  // Never render an error or loading state here — this is an additive prompt,
  // not core content.
  if (isLoading || isError) return null;

  const count = data?.length ?? 0;

  if (count === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/20">
        <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                No feedback pending
              </p>
              <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300/90">
                You&apos;re all caught up — nothing to confirm right now. Once a class is
                marked present, it will show up here for feedback.
              </p>
            </div>
          </div>
          <Button
            asChild
            variant="outline"
            className="shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:text-emerald-300"
          >
            <Link href={FEEDBACK_ROUTE}>
              <MessageSquarePlus className="mr-2 h-4 w-4" />
              Give feedback
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const sessionWord = count === 1 ? 'session is' : 'sessions are';

  return (
    <Card className="border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/30">
      <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-6 w-6 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-semibold text-amber-900 dark:text-amber-200">
              {count} {sessionWord} present-pending
            </p>
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-300/90">
              You&apos;re marked present for {count === 1 ? 'this class' : 'these classes'} — your
              attendance is already recorded. Just submit post-class feedback to confirm you
              were there. You&apos;re never counted absent for missing feedback.
            </p>
          </div>
        </div>
        <Button
          asChild
          className="shrink-0 bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
        >
          <Link href={FEEDBACK_ROUTE}>
            <MessageSquarePlus className="mr-2 h-4 w-4" />
            Give feedback
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
