'use client';

// =====================================================================
// Verdict-at-next-class — Gate 4 of the SCF self-improving loop
// =====================================================================
// The loop's human-verdict channel had working buttons, but they lived one
// click deep in the AI-suggestion dialog and appeared at the WRONG moment
// (right when advice is generated — before the facilitator could have tried
// it). Result: 0 verdicts ever. This card moves the ask onto the
// facilitator's own strongest heartbeat: the moment they mark attendance for
// the NEXT class of the same course. By then (a) a class has happened since
// the advice, so "did you try it?" is answerable, (b) they're thinking about
// exactly that class, and (c) no new habit is required.
//
// Rules of engagement:
//   • Renders NOTHING unless an unverdicted improvement note exists for this
//     course + this facilitator, generated before today (see
//     SessionFeedbackService.getPendingVerdictSuggestion).
//   • Max ONE ask per day per browser (localStorage guard) — never a nag.
//   • Never blocks or delays attendance saving; all failures are silent-to-UI
//     (logged) because this surface is decorative to the save flow.
//   • Anti-gaming: shows understanding as BAND WORDS only (understandingLevel),
//     never a raw number — same rule as the faculty dashboard (#1846/#1866).
//   • Verdict copy mirrors ai-suggestion-dialog exactly; the write goes through
//     the same fn_scf_set_verdict (SECURITY DEFINER, re-authorizes caller
//     against the suggestion's own faculty_email).
// Created: 2026-07-08 (Gate 4 adoption weld).

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  ThumbsUp,
  MinusCircle,
  XCircle,
  X,
  Loader2,
  CheckCircle,
} from 'lucide-react';
import { SessionFeedbackService } from '@/lib/services/session-feedback-service';
import { understandingLevel } from '@/components/session-feedback/understanding-band';
import type { PendingVerdictSuggestion } from '@/types/session-feedback';
import { logger } from '@/lib/utils/enhanced-logger';

type Verdict = 'tried_helped' | 'tried_no_change' | 'not_tried';

// Copy mirrors ai-suggestion-dialog VERDICT_OPTIONS verbatim — one vocabulary
// for the same question everywhere.
const VERDICT_OPTIONS: { value: Verdict; label: string; Icon: typeof ThumbsUp }[] = [
  { value: 'tried_helped', label: 'I tried this — it helped', Icon: ThumbsUp },
  { value: 'tried_no_change', label: 'Tried — no change', Icon: MinusCircle },
  { value: 'not_tried', label: "Didn't try", Icon: XCircle },
];

const BAND_WORD: Record<string, string> = {
  low: 'Low',
  mixed: 'Mixed',
  strong: 'Strong',
  none: '—',
};

/** One-ask-per-day guard (per browser). Set when a card actually shows. */
function askedTodayKey(): string {
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `scf-verdict-ask:${iso}`;
}

export function VerdictAtNextClassCard({ courseCode }: { courseCode: string | null }) {
  const [suggestion, setSuggestion] = useState<PendingVerdictSuggestion | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState<Verdict | null>(null);
  const [savedVerdict, setSavedVerdict] = useState<Verdict | null>(null);

  useEffect(() => {
    if (!courseCode) return;
    // One ask per day, across all courses — respect the facilitator's attention.
    try {
      if (window.localStorage.getItem(askedTodayKey())) return;
    } catch {
      /* storage unavailable (private mode) — fall through, worst case we ask */
    }
    let cancelled = false;
    SessionFeedbackService.getPendingVerdictSuggestion(courseCode).then((row) => {
      if (cancelled || !row) return;
      setSuggestion(row);
      try {
        window.localStorage.setItem(askedTodayKey(), row.id);
      } catch {
        /* ignore */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [courseCode]);

  if (!suggestion || dismissed) return null;

  async function handleVerdict(value: Verdict) {
    if (!suggestion || saving || savedVerdict) return;
    setSaving(value);
    try {
      const ok = await SessionFeedbackService.setSuggestionVerdict(suggestion.id, value);
      if (ok) setSavedVerdict(value);
      else setDismissed(true); // not applied (shouldn't happen) — bow out quietly
    } catch (err) {
      logger.warn('academic/session-feedback', 'verdict save failed', err);
      setDismissed(true); // never noise the attendance flow with an error state
    } finally {
      setSaving(null);
    }
  }

  const summary = suggestion.suggestion?.summary?.trim();
  const quickWin = suggestion.suggestion?.quickWin?.trim();
  const measured = suggestion.outcome_measured_at != null;
  const beforeBand = BAND_WORD[understandingLevel(suggestion.input_avg_understood)];
  const afterBand = BAND_WORD[understandingLevel(suggestion.outcome_avg_understood)];

  return (
    <Card className='border-sky-200 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/30'>
      <CardContent className='pt-4 pb-4'>
        {savedVerdict ? (
          <div className='flex items-center gap-2 text-sm text-sky-900 dark:text-sky-200'>
            <CheckCircle className='h-4 w-4 text-green-600' aria-hidden />
            <span>
              Thanks — noted. The loop uses this to write better suggestions for your classes.
            </span>
          </div>
        ) : (
          <div className='space-y-3'>
            <div className='flex items-start justify-between gap-2'>
              <div className='flex items-center gap-2'>
                <Sparkles className='h-4 w-4 text-sky-600 dark:text-sky-400' aria-hidden />
                <span className='text-sm font-semibold'>
                  Quick check from your last {suggestion.course_code} class
                </span>
                <Badge variant='outline' className='text-[10px]'>
                  30 sec
                </Badge>
              </div>
              <Button
                variant='ghost'
                size='icon'
                className='h-6 w-6 -mt-1'
                aria-label='Dismiss'
                onClick={() => setDismissed(true)}
              >
                <X className='h-3.5 w-3.5' />
              </Button>
            </div>

            {summary && (
              <p className='text-sm text-muted-foreground'>
                Before this class, the feedback loop suggested:{' '}
                <span className='text-foreground'>
                  {summary.length > 200 ? `${summary.slice(0, 200)}…` : summary}
                </span>
              </p>
            )}
            {quickWin && (
              <p className='text-xs text-muted-foreground'>
                <span className='font-medium text-foreground'>Quick win suggested:</span>{' '}
                {quickWin.length > 160 ? `${quickWin.slice(0, 160)}…` : quickWin}
              </p>
            )}
            {measured && afterBand !== '—' && (
              <p className='text-xs text-muted-foreground'>
                Since then, this class&apos;s understanding reads{' '}
                <span className='font-medium text-foreground'>{afterBand}</span>
                {beforeBand !== '—' && beforeBand !== afterBand ? ` (was ${beforeBand})` : ''}.
              </p>
            )}

            <div className='flex flex-wrap items-center gap-2'>
              <span className='text-xs text-muted-foreground'>Did you get a chance to try it?</span>
              {VERDICT_OPTIONS.map(({ value, label, Icon }) => (
                <Button
                  key={value}
                  variant='outline'
                  size='sm'
                  className='h-7 gap-1.5 text-xs'
                  disabled={saving !== null}
                  onClick={() => handleVerdict(value)}
                >
                  {saving === value ? (
                    <Loader2 className='h-3 w-3 animate-spin' aria-hidden />
                  ) : (
                    <Icon className='h-3 w-3' aria-hidden />
                  )}
                  {label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
