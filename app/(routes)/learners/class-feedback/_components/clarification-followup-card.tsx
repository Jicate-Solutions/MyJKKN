'use client';

// Two-sided close — the learner's half of the loop. After a lead records
// "I acted on this" against a session's re-explanation asks, the asking
// learner sees ONE follow-up at their next feedback submission:
// "Your Senior Learner says this was covered again — did it help?"
//
// Spec: specs/clarification-act-two-sided-close-2026-07-30.md (decision 3 —
// the act triggers the follow-up; this is how the backlog actually closes).
//
// ⚠️ ONE-TAP INVARIANT, AS AMENDED BY THE DIRECTOR 2026-07-30 (deliberate —
// do not "fix" back): on a day when BOTH this follow-up AND the daily
// Classroom Practice question are due, the learner sees BOTH, follow-up
// FIRST. The cap is: one rotation question + (only when due) the learner's
// OWN follow-up. The follow-up is the learner's own open loop — answering it
// is closing their own ask, not filling an extra survey item.
//
// ISOLATION CONTRACT (same as classroom-practice-micro):
//   • renders NOTHING while loading, when nothing is due, or on ANY failure;
//   • never blocks or delays the dialog; no toasts, no thrown errors;
//   • answers land in a quiet thanks state immediately — a failure to record
//     is deliberately indistinguishable to the learner.
//
// ANSWER MAPPING (spec):
//   "Yes — clearer now"            → outcome 're_explained'
//   "Not really"                   → outcome 'not_helped'
//   "I wasn't there / doesn't apply" → NO write; the ask stays pending.

import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { CheckCircle2, MessageCircleQuestion } from 'lucide-react';
import { SessionFeedbackService } from '@/lib/services/session-feedback-service';
import type {
  ClarificationActType,
  ClarificationFollowupAsk,
  ReportableClarificationOutcome,
} from '@/types/session-feedback';

const BRAND = '#0b6d41';

/** What the lead's act reads as, in the learner's card. */
const ACT_COPY: Record<ClarificationActType, string> = {
  re_explained_in_session: 'says this was covered again in session',
  helped_one_on_one: 'says they helped learners on this one-on-one',
  shared_material: 'says they shared material about this',
  planned_next_session: 'says this is planned for the next session',
};

export function ClarificationFollowupCard() {
  const { data: ask, isLoading } = useQuery<ClarificationFollowupAsk | null>({
    queryKey: ['scf-clarification-followup-pending'],
    queryFn: () => SessionFeedbackService.getPendingClarificationFollowup(),
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const [phase, setPhase] = useState<'asking' | 'thanks' | 'gone'>('asking');
  const sentRef = useRef(false);

  const report = useMutation({
    mutationFn: (outcome: ReportableClarificationOutcome) =>
      SessionFeedbackService.reportClarificationOutcome(
        ask!.attendance_date,
        ask!.period_id,
        outcome,
      ),
    retry: false,
  });

  // Zero footprint while unknown, and forever when nothing is due.
  if (isLoading || !ask) return null;
  if (phase === 'gone') return null;

  const answer = (outcome: ReportableClarificationOutcome | null) => {
    // Double-tap guard (a ref, not isPending — two taps in one frame both
    // read a stale isPending).
    if (sentRef.current) return;
    sentRef.current = true;
    if (outcome === null) {
      // "I wasn't there / doesn't apply" — writes nothing; the ask stays
      // pending and may be asked again another day.
      setPhase('gone');
      return;
    }
    setPhase('thanks');
    report.mutateAsync(outcome).catch(() => {
      /* silent by design — the thanks state is already on screen */
    });
  };

  if (phase === 'thanks') {
    return (
      <div className="rounded-md border bg-muted/30 p-3">
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: BRAND }} />
          <span>Thank you — your ask is closed with your own answer.</span>
        </p>
      </div>
    );
  }

  const courseLabel = [ask.course_code, ask.course_name].filter(Boolean).join(' · ');

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="space-y-2">
        <p className="flex items-start gap-1.5 text-sm font-medium">
          <MessageCircleQuestion
            className="mt-0.5 h-4 w-4 shrink-0"
            style={{ color: BRAND }}
          />
          <span>
            You asked for a re-explanation
            {courseLabel ? <> of <span className="font-semibold">{courseLabel}</span></> : null}{' '}
            ({format(parseISO(ask.attendance_date), 'd MMM')}). Your Senior Learner{' '}
            {ACT_COPY[ask.act_type] ?? 'says this was covered again'} — did it help?
          </span>
        </p>
        {ask.note ? (
          <p className="rounded-md bg-background px-2 py-1.5 text-xs text-muted-foreground">
            &ldquo;{ask.note}&rdquo;
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => answer('re_explained')}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41]/40"
            style={{ backgroundColor: BRAND }}
          >
            Yes — clearer now
          </button>
          <button
            type="button"
            onClick={() => answer('not_helped')}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41]/40"
          >
            Not really
          </button>
          <button
            type="button"
            onClick={() => answer(null)}
            className="rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41]/40"
          >
            I wasn&apos;t there / doesn&apos;t apply
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Your answer is the only one that closes this — nobody can close it for you.
        </p>
      </div>
    </div>
  );
}
