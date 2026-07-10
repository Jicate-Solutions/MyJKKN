'use client';

// =====================================================================
// Notes from your feedback loop — the AI note's permanent home
// =====================================================================
// Before this card, a note generated for a facilitator was visible in only
// two transient places: a Topics-to-revisit row (gone once the course's
// average recovers above 3 — and never present for low-TAIL notes, whose
// course average was ≥3 all along) and the one-tap verdict card that rides
// the next attendance save. A facilitator — or the Director impersonating
// one — deliberately looking for "the note the AI sent me" found nothing.
// This card lists every note addressed to the logged-in facilitator, newest
// first, so the loop's output is always findable after the moment passes.
//
// Rules of engagement (inherited from the verdict card, #1869):
//   • Anti-gaming: understanding renders as BAND WORDS only, never a number.
//   • Verdict buttons appear only on unverdicted improvement notes generated
//     before today (same answerability rule as the attendance ask); the write
//     goes through the same fn_scf_set_verdict (SECURITY DEFINER, re-authorizes
//     the caller against the note's own faculty_email).
//   • Verdict copy mirrors ai-suggestion-dialog / verdict-at-next-class
//     verbatim — one vocabulary for the same question everywhere.
//   • Decorative surface: read failures render the quiet empty state, never
//     an error card.
// Created: 2026-07-08 (Gate 4 — give the note an inbox).

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  ThumbsUp,
  MinusCircle,
  XCircle,
  Loader2,
  CheckCircle,
  Trophy,
} from 'lucide-react';
import { SessionFeedbackService } from '@/lib/services/session-feedback-service';
import { understandingLevel } from '@/components/session-feedback/understanding-band';
import type { MyLoopNote, NoteResolutionCounts } from '@/types/session-feedback';
import { logger } from '@/lib/utils/enhanced-logger';

type Verdict = 'tried_helped' | 'tried_no_change' | 'not_tried';

// Copy mirrors ai-suggestion-dialog / verdict-at-next-class VERDICT_OPTIONS
// verbatim — one vocabulary for the same question everywhere.
const VERDICT_OPTIONS: { value: Verdict; label: string; Icon: typeof ThumbsUp }[] = [
  { value: 'tried_helped', label: 'I tried this — it helped', Icon: ThumbsUp },
  { value: 'tried_no_change', label: 'Tried — no change', Icon: MinusCircle },
  { value: 'not_tried', label: "Didn't try", Icon: XCircle },
];

const VERDICT_SAID: Record<Verdict, string> = {
  tried_helped: 'You said: tried it — it helped',
  tried_no_change: 'You said: tried it — no change',
  not_tried: "You said: didn't try it",
};

const BAND_WORD: Record<string, string> = {
  low: 'Low',
  mixed: 'Mixed',
  strong: 'Strong',
  none: '—',
};

function NoteRow({
  note,
  confirms,
}: {
  note: MyLoopNote;
  confirms: NoteResolutionCounts | undefined;
}) {
  const [saving, setSaving] = useState<Verdict | null>(null);
  const [savedVerdict, setSavedVerdict] = useState<Verdict | null>(
    note.human_verdict,
  );

  async function handleVerdict(value: Verdict) {
    if (saving || savedVerdict) return;
    setSaving(value);
    try {
      const ok = await SessionFeedbackService.setSuggestionVerdict(note.id, value);
      if (ok) setSavedVerdict(value);
    } catch (err) {
      logger.warn('academic/session-feedback', 'loop-note verdict save failed', err);
    } finally {
      setSaving(null);
    }
  }

  const summary = note.suggestion?.summary?.trim();
  const quickWin = note.suggestion?.quickWin?.trim();
  // Evidence base: the exact closed-window sessions this note coached on
  // (two-sided 48h window) — stamped deterministically by the generator, so the
  // citation never depends on the AI text choosing to mention the dates.
  const contributingDates = (note.suggestion?.contributing_dates ?? [])
    .map((d) => {
      const parsed = new Date(`${d}T00:00:00`);
      return Number.isNaN(parsed.getTime()) ? d : format(parsed, 'd MMM');
    })
    .join(', ');
  const measured = note.outcome_measured_at != null;
  // Director 2026-07-10 (decision 3): once measured, the "was" band derives
  // from the SAME recount the change was computed against (after − change),
  // not the generation-time signal average — those use different estimators,
  // and mixing them can read "Low → Strong" when the measured change was
  // actually small.
  const measuredBaseline =
    note.outcome_avg_understood != null && note.outcome_lift != null
      ? note.outcome_avg_understood - note.outcome_lift
      : null;
  const beforeBand =
    BAND_WORD[understandingLevel(measuredBaseline ?? note.input_avg_understood)];
  const afterBand = BAND_WORD[understandingLevel(note.outcome_avg_understood)];
  const isImprovement = note.kind === 'improvement';
  // Same answerability rule as the attendance ask: a class must have been
  // possible since the advice, so only pre-today notes take a verdict.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const askable =
    isImprovement && !savedVerdict && new Date(note.generated_at) < todayStart;

  return (
    <div className="space-y-2 border-b border-border pb-4 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        {isImprovement ? (
          <Sparkles className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden />
        ) : (
          <Trophy className="h-4 w-4 text-amber-500" aria-hidden />
        )}
        <span className="text-sm font-semibold">{note.course_code}</span>
        <Badge variant="outline" className="text-[10px]">
          {isImprovement ? 'Improvement advice' : "What's working"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {format(new Date(note.generated_at), 'd MMM yyyy')}
        </span>
      </div>

      {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
      {contributingDates && (
        <p className="text-[11px] text-muted-foreground">
          From your classes on {contributingDates} (feedback window closed — the
          sample is final).
        </p>
      )}
      {quickWin && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Quick win:</span> {quickWin}
        </p>
      )}
      {isImprovement && measured && afterBand !== '—' && (
        <p className="text-xs text-muted-foreground">
          Since this note, the class&apos;s understanding reads{' '}
          <span className="font-medium text-foreground">{afterBand}</span>
          {beforeBand !== '—' && beforeBand !== afterBand ? ` (was ${beforeBand})` : ''}.
        </p>
      )}
      {isImprovement && !measured && note.outcome_unmeasurable_at != null && (
        <p className="text-xs text-muted-foreground">
          This course had no later session with enough feedback, so this
          note&apos;s outcome could not be measured.
        </p>
      )}
      {/* The fourth witness — students who flagged the class say whether it got
          better FOR THEM. Appears only at 3+ answers (k-floor in the fn), so no
          individual is ever reconstructable. */}
      {confirms && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            Students who flagged this class say
          </span>
          : {confirms.better} better · {confirms.same} same · {confirms.worse} worse
          {' '}({confirms.total} answered, anonymous)
        </p>
      )}

      {savedVerdict ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle className="h-3.5 w-3.5 text-green-600" aria-hidden />
          {VERDICT_SAID[savedVerdict]}
        </p>
      ) : askable ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Did you get a chance to try it?
          </span>
          {VERDICT_OPTIONS.map(({ value, label, Icon }) => (
            <Button
              key={value}
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={saving !== null}
              onClick={() => handleVerdict(value)}
            >
              {saving === value ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : (
                <Icon className="h-3 w-3" aria-hidden />
              )}
              {label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MyLoopNotesCard() {
  const [notes, setNotes] = useState<MyLoopNote[] | null>(null);
  const [confirmsById, setConfirmsById] = useState<Map<string, NoteResolutionCounts>>(
    new Map(),
  );

  useEffect(() => {
    let cancelled = false;
    SessionFeedbackService.getMyLoopNotes().then((rows) => {
      if (cancelled) return;
      setNotes(rows);
      if (rows.length === 0) return;
      SessionFeedbackService.getNoteResolutionCounts(rows.map((r) => r.id)).then(
        (counts) => {
          if (cancelled) return;
          setConfirmsById(new Map(counts.map((c) => [c.suggestion_id, c])));
        },
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-sky-600 dark:text-sky-400" aria-hidden />
          <CardTitle>Notes from your feedback loop</CardTitle>
        </div>
        <CardDescription>
          When a class&apos;s feedback shows learners struggling — or going
          especially well — the loop writes you a short note. They all stay
          here, newest first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {notes === null ? (
          <p className="text-sm text-muted-foreground">Loading your notes…</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No notes yet. They arrive after your classes collect feedback — you
            will also get a one-tap ask the next time you mark attendance for a
            course with a fresh note.
          </p>
        ) : (
          <div className="space-y-4">
            {notes.map((n) => (
              <NoteRow key={n.id} note={n} confirms={confirmsById.get(n.id)} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
