'use client';

/**
 * Pending Feedback Nudge Banner
 * Created: 2026-07-03
 * Description: Prominent amber banner on the learner's own attendance page that
 *   surfaces "present-pending" sessions — classes the learner attended but has
 *   not yet confirmed by submitting post-class feedback. Hidden entirely when
 *   nothing is pending. Framing is reassuring (confirm, never punitive): missing
 *   feedback NEVER marks the learner absent — it only leaves attendance unconfirmed.
 *
 * Substrate (READ-ONLY — imported, never edited):
 *   hooks/use-session-feedback.ts → usePendingSessions(lookbackDays)
 *   (fn_scf_pending_for_learner, already in prod).
 */

import Link from 'next/link';
import { Clock, MessageSquarePlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { usePendingSessions } from '@/hooks/use-session-feedback';

const LOOKBACK_DAYS = 30;
const FEEDBACK_ROUTE = '/learners/class-feedback';

export function PendingFeedbackBanner() {
  const { data, isLoading, isError } = usePendingSessions(LOOKBACK_DAYS);

  // Stay invisible until we know there is something to nudge about. Never render
  // an error or loading state here — this is an additive prompt, not core content.
  if (isLoading || isError) return null;

  const count = data?.length ?? 0;
  if (count === 0) return null;

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
              You&apos;re marked present for {count === 1 ? 'this class' : 'these classes'} — just
              submit post-class feedback to confirm your attendance. You&apos;re never counted
              absent for missing feedback; this only confirms you were there.
            </p>
          </div>
        </div>
        <Button
          asChild
          className="shrink-0 bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
        >
          <Link href={FEEDBACK_ROUTE}>
            <MessageSquarePlus className="mr-2 h-4 w-4" />
            Confirm attendance
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
