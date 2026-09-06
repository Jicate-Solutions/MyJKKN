'use client';

// "You changed this class" — the learner-facing close of the SCF loop (#3b).
//
// Shows the SPECIFIC chain the learner's OWN feedback set off:
//     what you said  →  what your facilitator changed  →  YOUR understanding rose.
//
// HONESTY (load-bearing, per brief):
//   • The before/after numbers (my_prior_understood -> my_next_understood) are THIS learner's
//     own 1..5 ratings, pulled from their own later same-course session. We NEVER show a
//     cohort/class mean as the learner's value.
//   • cohort_lift gates an explicitly-labelled "across the whole class" footnote,
//     only when positive — and the footnote speaks in WORDS ONLY (no delta, no
//     'average'): the Director's no-mechanics rule (#1909, 2026-07-09) bars
//     counts/averages on every learner surface, and the page header right above
//     this card promises "never a class average".
//   • A row exists only when a REAL facilitator action is on record (fn_scf_loop_closure_for_learner
//     returns nothing otherwise), so the card never invents a change.
//   • Rows where the learner has no later session yet are shown as "awaiting" — no premature win.
//   • Renders nothing until at least one real chain exists, to keep the page's primary job clean.

import { useMemo } from 'react';
import { format, subDays } from 'date-fns';
import {
  Sparkles,
  ArrowRight,
  TrendingUp,
  Clock3,
  MessageSquareQuote,
  Wand2,
  ThumbsUp,
  MinusCircle,
  ThumbsDown,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useChecklistConfig } from '@/hooks/use-session-feedback';
import { useLoopClosure, useCastResolutionVote } from '@/hooks/use-learner-loop';
import type { LoopClosureRow } from '@/types/scf-learner-loop';

const BRAND = '#0b6d41';

// Same 1..5 scale the feedback dialog uses, so the learner sees consistent words.
const UNDERSTOOD_LABEL: Record<number, string> = {
  1: 'Lost',
  2: 'Shaky',
  3: 'OK',
  4: 'Good',
  5: 'Clear',
};

function understoodLabel(n: number | null): string {
  if (n == null) return '—';
  return `${n}/5 · ${UNDERSTOOD_LABEL[n] ?? ''}`.trim();
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

type ResolutionVote = 'better' | 'same' | 'worse';

const VOTE_OPTIONS: { value: ResolutionVote; label: string; Icon: typeof ThumbsUp }[] = [
  { value: 'better', label: 'Better', Icon: ThumbsUp },
  { value: 'same', label: 'Same', Icon: MinusCircle },
  { value: 'worse', label: 'Worse', Icon: ThumbsDown },
];

const VOTE_SAID: Record<ResolutionVote, string> = {
  better: 'You said: better — thanks, that closes your loop.',
  same: 'You said: same — noted honestly; the loop keeps working on it.',
  worse: 'You said: worse — noted honestly; the loop keeps working on it.',
};

/** The learner's explicit word on whether the change worked FOR THEM.
 *  One tap, changeable, stored per (note, learner); shown to staff only as
 *  3+ aggregates. This is the loop's fourth witness. */
function ResolutionAsk({
  suggestionId,
  savedVote,
}: {
  suggestionId: string;
  savedVote: ResolutionVote | null;
}) {
  const castVote = useCastResolutionVote();

  if (savedVote) {
    return (
      <p className="flex items-center gap-1.5 border-t pt-2 text-xs text-muted-foreground">
        <CheckCircle className="h-3.5 w-3.5 text-green-600" aria-hidden />
        {VOTE_SAID[savedVote]}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-2">
      <span className="text-xs text-muted-foreground">
        In your own words — since this change, is that class better for you?
      </span>
      {VOTE_OPTIONS.map(({ value, label, Icon }) => (
        <Button
          key={value}
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          disabled={castVote.isPending}
          onClick={() => castVote.mutate({ suggestionId, vote: value })}
        >
          {castVote.isPending && castVote.variables?.vote === value ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <Icon className="h-3 w-3" aria-hidden />
          )}
          {label}
        </Button>
      ))}
    </div>
  );
}

export function LoopClosureCard() {
  // "This term" — the last 120 days, matching MyVoiceReceipt's window.
  const { from, to } = useMemo(() => {
    // Local-date formatting (date-fns), not UTC toISOString — avoids an off-by-one
    // at the window boundary for IST users near midnight.
    const today = new Date();
    return {
      from: format(subDays(today, 120), 'yyyy-MM-dd'),
      to: format(today, 'yyyy-MM-dd'),
    };
  }, []);

  const { data, isLoading } = useLoopClosure(from, to);
  const { data: checklistConfig } = useChecklistConfig();

  // Map checklist item_key -> human label for the learner's input theme.
  const keyToLabel = useMemo(() => {
    const m = new Map<string, string>();
    (checklistConfig ?? []).forEach((c) => m.set(c.item_key, c.label));
    return m;
  }, [checklistConfig]);

  const rows = data ?? [];

  // Stay invisible while loading or empty: no real chain -> nothing to show.
  if (isLoading || rows.length === 0) return null;

  function themeText(row: LoopClosureRow): string {
    const labels = row.input_theme.map((k) => keyToLabel.get(k) ?? k).filter(Boolean);
    if (labels.length > 0) return labels.join(', ');
    return 'you found it hard to follow';
  }

  return (
    <Card className="border-[#0b6d41]/30 bg-[#0b6d41]/[0.04] dark:bg-card">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" style={{ color: BRAND }} />
          <h2 className="text-lg font-semibold" style={{ color: BRAND }}>
            You changed this class
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          When your feedback led your facilitator to do something different, here&apos;s the exact
          chain — and how <span className="font-medium text-foreground">your own</span> understanding
          moved afterwards. We only ever show your own ratings here, never a class average.
        </p>

        <ul className="space-y-3">
          {rows.map((row, i) => {
            const rose = row.my_understanding_rose;
            const hasNext = row.my_next_understood != null;
            return (
              <li
                key={`${row.attendance_date}-${row.course_code}-${i}`}
                className="rounded-lg border bg-background/60 p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-sm truncate">
                    {row.course_name || row.course_code}
                    <span className="ml-2 text-xs text-muted-foreground font-normal">
                      {formatDate(row.attendance_date)}
                    </span>
                  </span>
                  {rose ? (
                    <Badge variant="outline" className="border-green-200 bg-green-100 text-green-800 shrink-0">
                      <TrendingUp className="mr-1 h-3 w-3" />
                      Loop closed
                    </Badge>
                  ) : hasNext ? (
                    <Badge variant="outline" className="border-border bg-muted text-muted-foreground shrink-0">
                      Change made
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-200 bg-amber-100 text-amber-800 shrink-0">
                      <Clock3 className="mr-1 h-3 w-3" />
                      Awaiting your next class
                    </Badge>
                  )}
                </div>

                {/* The three-step chain: you said -> facilitator changed -> your understanding moved. */}
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="leading-snug">
                      <span className="text-muted-foreground">You said: </span>
                      <span className="font-medium">{themeText(row)}</span>
                      <span className="text-muted-foreground"> (you rated it {understoodLabel(row.my_prior_understood)})</span>
                    </p>
                  </div>

                  {row.the_change ? (
                    <div className="flex items-start gap-2">
                      <Wand2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: BRAND }} />
                      <p className="leading-snug">
                        <span className="text-muted-foreground">Your facilitator: </span>
                        <span className="font-medium text-foreground">{row.the_change}</span>
                        {row.action_kind === 'verdict_worked' && (
                          <span className="text-muted-foreground"> — and confirmed it helped</span>
                        )}
                      </p>
                    </div>
                  ) : null}

                  <div className="flex items-start gap-2">
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    {rose ? (
                      <p className="leading-snug">
                        <span className="font-medium text-green-700">Your understanding rose</span>{' '}
                        from {understoodLabel(row.my_prior_understood)} to{' '}
                        {understoodLabel(row.my_next_understood)}
                        {row.my_next_date ? (
                          <span className="text-muted-foreground"> in your {formatDate(row.my_next_date)} class</span>
                        ) : null}
                        .
                      </p>
                    ) : hasNext ? (
                      <p className="leading-snug text-muted-foreground">
                        In your next {row.course_name || row.course_code} class your understanding was{' '}
                        {understoodLabel(row.my_next_understood)} — we&apos;ll keep tracking it honestly.
                      </p>
                    ) : (
                      <p className="leading-snug text-muted-foreground">
                        Your next {row.course_name || row.course_code} class will show whether this
                        change helped <span className="font-medium text-foreground">you</span> — no guesses until then.
                      </p>
                    )}
                  </div>
                </div>

                {/* Class-wide corroboration ONLY — explicitly labelled, words-only
                    (no delta, no 'average'): learner surfaces never print class
                    numbers, and the header above promises "never a class average". */}
                {rose && row.cohort_lift != null && row.cohort_lift > 0 ? (
                  <p className="text-[11px] text-muted-foreground border-t pt-2">
                    Across the whole class, understanding also rose after this change.
                  </p>
                ) : null}

                {/* The learner's OWN word on it — Better/Same/Worse. Only asked once a real
                    change is on record AND they've sat a later class (so it's answerable).
                    Faculty/leadership only ever see this in groups of 3+ (k-floor in the
                    aggregate fn), never who said what. */}
                {row.suggestion_id && hasNext ? (
                  <ResolutionAsk
                    suggestionId={row.suggestion_id}
                    savedVote={row.my_resolution_vote}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
