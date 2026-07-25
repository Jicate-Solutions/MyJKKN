'use client';

// Clarification touchpoint (Lane C, CARRE evidence instrumentation) — shown
// ONLY at the post-feedback confirmation moment inside the FeedbackDialog.
// LC brief C4: topics assigned without explanation; re-explanation refused to
// on-duty attendees — and no trace of ask → outcome exists anywhere. This is
// that trace: the learner records "I asked for a re-explanation of this
// session", and (mirroring the SCF verdict pattern) the SAME learner
// self-reports what happened. Their own record, their own words — nothing is
// machine-scored and nobody is ranked on it.

import { toast } from 'sonner';
import { BeatLoader } from 'react-spinners';
import { CheckCircle2, HelpCircle } from 'lucide-react';
import {
  useClarification,
  useAskClarification,
  useReportClarificationOutcome,
} from '@/hooks/use-session-feedback';
import type { ClarificationOutcome } from '@/types/session-feedback';

const BRAND = '#0b6d41';

type ReportableOutcome = Exclude<ClarificationOutcome, 'pending'>;

const OUTCOME_CHOICES: { value: ReportableOutcome; label: string }[] = [
  { value: 're_explained', label: 'It was explained again' },
  { value: 'refused', label: 'It was refused' },
  { value: 'unanswered', label: 'No response yet' },
];

const OUTCOME_RECORDED: Record<ReportableOutcome, string> = {
  re_explained: 'it was explained again',
  refused: 'it was refused',
  unanswered: 'no response yet',
};

interface ClarificationTouchpointProps {
  attendanceDate: string;
  timetableId: string;
  periodId: string;
}

export function ClarificationTouchpoint({
  attendanceDate,
  timetableId,
  periodId,
}: ClarificationTouchpointProps) {
  const { data: row, isLoading } = useClarification(attendanceDate, periodId);
  const ask = useAskClarification();
  const report = useReportClarificationOutcome();

  const busy = ask.isPending || report.isPending;

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      {isLoading ? (
        <div className="flex justify-center py-1.5">
          <BeatLoader color={BRAND} size={6} />
        </div>
      ) : !row ? (
        <div className="space-y-2">
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: BRAND }} />
            <span>
              Did you ask for this session to be explained again? Recording it keeps a
              trace of your ask — only you and leadership can see it.
            </span>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              ask
                .mutateAsync({ attendanceDate, timetableId, periodId })
                .catch((err: unknown) =>
                  toast.error(err instanceof Error ? err.message : 'Could not record your request.'),
                )
            }
            className="w-full rounded-md border border-[#0b6d41]/40 bg-background px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41]/40 disabled:opacity-60"
            style={{ color: BRAND }}
          >
            {ask.isPending ? (
              <BeatLoader color={BRAND} size={6} />
            ) : (
              'I asked for a re-explanation of this session'
            )}
          </button>
        </div>
      ) : row.outcome === 'pending' ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">You asked for a re-explanation — what happened?</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {OUTCOME_CHOICES.map((choice) => (
              <button
                key={choice.value}
                type="button"
                disabled={busy}
                onClick={() =>
                  report
                    .mutateAsync({ attendanceDate, periodId, outcome: choice.value })
                    .catch((err: unknown) =>
                      toast.error(
                        err instanceof Error ? err.message : 'Could not record what happened.',
                      ),
                    )
                }
                className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs font-medium transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41]/40 disabled:opacity-60"
              >
                {choice.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            You can leave this — it stays recorded as asked, with no answer yet.
          </p>
        </div>
      ) : (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: BRAND }} />
          <span>
            Recorded: you asked for a re-explanation and{' '}
            {OUTCOME_RECORDED[row.outcome as ReportableOutcome] ?? row.outcome}. Thank you —
            this is your own record of what happened.
          </span>
        </p>
      )}
    </div>
  );
}
