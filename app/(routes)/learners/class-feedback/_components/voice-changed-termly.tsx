'use client';

// "You said → this changed" — the learner's TERMLY ledger of changes their own
// voice caused (Director rank-3).
//
// RELATIONSHIP TO THE LIVE CARD (they are not the same surface):
//   * LoopClosureCard is the LIVE loop — a rolling 120-day window that ASKS for
//     the better/same/worse answer and shows the learner's own before/after.
//   * This is the LEDGER — the whole history, grouped by academic year, read
//     only, showing what changed and what the learner already said about it.
//     Collapsed by default so the page's primary job (pending feedback) is
//     never pushed down, and its reads only fire once the learner opens it.
//
// WHAT A LEARNER NEVER SEES HERE (load-bearing, Director-locked):
//   No scores, no medians, no averages, no per-Senior-Learner aggregate — not
//   even the learner's own 1..5 ratings. The ledger is a list of CHANGES and the
//   learner's own words about them, nothing numeric at all.
//
// GROUPING IS BY ACADEMIC YEAR, AND THAT IS DELIBERATE: `semesters` carries no
// start_date / end_date, so real per-semester boundaries do not exist in the
// schema, and semester_order cannot substitute for them (it means YEAR in some
// institutions and SEMESTER in others). academic_years is the only period with
// real DATE columns, so each group is labelled with its real academic_year_name.
// A change that falls outside every known window lands in "Earlier" rather than
// being silently dropped.
//
// SUBSTRATE REUSED (nothing new invented): fn_scf_loop_closure_for_learner for
// the chain and the learner's vote; campus_living_recognition's PRIVATE
// 'voice_confirmed_better' confer for the conferred act (this is the first
// surface that shows it to the learner it belongs to).

import { useMemo, useState } from 'react';
import { format, subYears } from 'date-fns';
import {
  Sparkles,
  MessageSquareQuote,
  Wand2,
  ThumbsUp,
  MinusCircle,
  ThumbsDown,
  Clock3,
  Award,
  CalendarRange,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BeatLoader } from 'react-spinners';
import { useAuth } from '@/hooks/use-auth';
import { useChecklistConfig } from '@/hooks/use-session-feedback';
import {
  useVoiceChangeHistory,
  useMyTermWindows,
  useMyVoiceRecognitions,
  type TermWindow,
} from '@/hooks/use-voice-changed-terms';
import type { LoopClosureRow } from '@/types/scf-learner-loop';

const BRAND = '#0b6d41';

/** How far back the ledger looks. Wide enough to hold a full programme, bounded
 *  so the window can never grow without limit. */
const HISTORY_YEARS = 4;

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The learner's own word on whether the change worked, in their own framing. */
const VOTE_STATE: Record<
  'better' | 'same' | 'worse',
  { label: string; line: string; Icon: typeof ThumbsUp; cls: string }
> = {
  better: {
    label: 'You confirmed it helped',
    line: 'You confirmed this made your sessions better.',
    Icon: ThumbsUp,
    cls: 'border-green-200 bg-green-100 text-green-800',
  },
  same: {
    label: 'You said: same',
    line: 'You said it stayed the same — noted honestly, and the loop keeps working on it.',
    Icon: MinusCircle,
    cls: 'border-border bg-muted text-muted-foreground',
  },
  worse: {
    label: 'You said: worse',
    line: 'You said it got worse — noted honestly, and the loop keeps working on it.',
    Icon: ThumbsDown,
    cls: 'border-amber-200 bg-amber-100 text-amber-800',
  },
};

type Group = { key: string; label: string; isCurrent: boolean; rows: LoopClosureRow[] };

/** Bucket each change into the academic year whose real date window contains the
 *  session it came from. Windows are already newest-first; anything outside them
 *  all is kept in "Earlier" so no change is ever silently lost. */
function groupByTerm(rows: LoopClosureRow[], windows: TermWindow[], today: string): Group[] {
  if (windows.length === 0) {
    return rows.length > 0
      ? [{ key: 'all', label: 'Your changes so far', isCurrent: true, rows }]
      : [];
  }

  const buckets = new Map<string, LoopClosureRow[]>();
  const earlier: LoopClosureRow[] = [];

  for (const row of rows) {
    const win = windows.find(
      (w) => row.attendance_date >= w.start_date && row.attendance_date <= w.end_date
    );
    if (!win) {
      earlier.push(row);
      continue;
    }
    const list = buckets.get(win.id);
    if (list) list.push(row);
    else buckets.set(win.id, [row]);
  }

  const groups: Group[] = windows
    .filter((w) => buckets.has(w.id))
    .map((w) => ({
      key: w.id,
      label: w.label,
      isCurrent: today >= w.start_date && today <= w.end_date,
      rows: buckets.get(w.id)!,
    }));

  if (earlier.length > 0) {
    groups.push({ key: 'earlier', label: 'Earlier', isCurrent: false, rows: earlier });
  }
  return groups;
}

export function VoiceChangedTermly() {
  const { profile } = useAuth();
  const learnerId = profile?.learner_id ?? null;
  const institutionId = profile?.institution_id ?? null;

  // Reads fire only once the learner opens the ledger — history is never worth
  // a request on a page whose job is the pending list.
  const [open, setOpen] = useState(false);

  const { from, to, today } = useMemo(() => {
    const now = new Date();
    return {
      from: format(subYears(now, HISTORY_YEARS), 'yyyy-MM-dd'),
      to: format(now, 'yyyy-MM-dd'),
      today: format(now, 'yyyy-MM-dd'),
    };
  }, []);

  const { data: changes, isLoading, isError, error } = useVoiceChangeHistory(from, to, open);
  const { data: windows } = useMyTermWindows(institutionId, open);
  const { data: recognitions } = useMyVoiceRecognitions(learnerId, open);

  const { data: checklistConfig } = useChecklistConfig();
  const keyToLabel = useMemo(() => {
    const m = new Map<string, string>();
    (checklistConfig ?? []).forEach((c) => m.set(c.item_key, c.label));
    return m;
  }, [checklistConfig]);

  // suggestion_id -> the conferred act, so a recognition sits beside the change
  // that earned it rather than in a separate stream.
  const conferredBySuggestion = useMemo(() => {
    const m = new Map<string, { title: string; fired_at: string }>();
    (recognitions ?? []).forEach((r) => {
      const sid = r.ref && typeof r.ref === 'object' ? r.ref['suggestion_id'] : null;
      if (typeof sid === 'string' && sid) {
        m.set(sid, { title: r.title, fired_at: r.fired_at });
      }
    });
    return m;
  }, [recognitions]);

  const rows = changes ?? [];
  const groups = useMemo(
    () => groupByTerm(rows, windows ?? [], today),
    [rows, windows, today]
  );

  function themeText(row: LoopClosureRow): string {
    const labels = row.input_theme.map((k) => keyToLabel.get(k) ?? k).filter(Boolean);
    if (labels.length > 0) return labels.join(', ');
    return 'you found the session hard to follow';
  }

  return (
    <details
      className="rounded-lg border bg-card"
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-sm font-medium">
        <Sparkles className="h-4 w-4 shrink-0" style={{ color: BRAND }} />
        You said &rarr; this changed
        <span className="font-normal text-muted-foreground">
          {open && rows.length > 0 ? `(${rows.length})` : 'your record, term by term'}
        </span>
      </summary>

      <p className="border-t px-4 py-2 text-xs text-muted-foreground">
        Every change your voice set off, grouped by academic year — what you raised, what
        changed, when, and your own word on whether it helped. Only real recorded changes
        appear here, and no one&apos;s scores are ever shown.
      </p>

      <div className="border-t px-4 py-3">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <BeatLoader color={BRAND} size={8} />
          </div>
        ) : isError ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {error instanceof Error
              ? error.message
              : 'Could not load your record just now — please try again in a moment.'}
          </p>
        ) : groups.length === 0 ? (
          /* Honest empty state: say plainly that nothing is recorded yet, and what
             would put something here — never a placeholder that implies impact. */
          <div className="space-y-1.5 py-4 text-center">
            <p className="text-sm font-medium">Nothing recorded here yet</p>
            <p className="mx-auto max-w-md text-xs text-muted-foreground">
              When you mark a session as hard to follow and your Senior Learner does something
              differently because of it, that change is listed here with its date. Tell us
              afterwards whether it helped, and your answer is kept beside it. Your next
              10-second check-in is how it starts.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.key} className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </h3>
                  {group.isCurrent ? (
                    <Badge
                      variant="outline"
                      className="h-5 border-[#0b6d41]/30 bg-[#0b6d41]/[0.06] px-1.5 text-[10px] font-medium"
                      style={{ color: BRAND }}
                    >
                      This term
                    </Badge>
                  ) : null}
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {group.rows.length} {group.rows.length === 1 ? 'change' : 'changes'}
                  </span>
                </div>

                <ul className="space-y-2.5">
                  {group.rows.map((row, i) => {
                    const vote = row.my_resolution_vote
                      ? VOTE_STATE[row.my_resolution_vote]
                      : null;
                    const conferred = row.suggestion_id
                      ? conferredBySuggestion.get(row.suggestion_id)
                      : undefined;
                    return (
                      <li
                        key={`${row.attendance_date}-${row.course_code}-${i}`}
                        className="space-y-2 rounded-lg border bg-background/60 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="truncate text-sm font-medium">
                            {row.course_name || row.course_code}
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              {formatDate(row.attendance_date)}
                            </span>
                          </span>
                          {vote ? (
                            <Badge variant="outline" className={`shrink-0 ${vote.cls}`}>
                              <vote.Icon className="mr-1 h-3 w-3" aria-hidden />
                              {vote.label}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="shrink-0 border-border bg-muted text-muted-foreground"
                            >
                              <Clock3 className="mr-1 h-3 w-3" aria-hidden />
                              Not answered yet
                            </Badge>
                          )}
                        </div>

                        <div className="space-y-1.5 text-sm">
                          <p className="flex items-start gap-2 leading-snug">
                            <MessageSquareQuote
                              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                              aria-hidden
                            />
                            <span>
                              <span className="text-muted-foreground">You said: </span>
                              <span className="font-medium">{themeText(row)}</span>
                            </span>
                          </p>

                          {row.the_change ? (
                            <p className="flex items-start gap-2 leading-snug">
                              <Wand2
                                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                                style={{ color: BRAND }}
                                aria-hidden
                              />
                              <span>
                                <span className="text-muted-foreground">This changed: </span>
                                <span className="font-medium text-foreground">
                                  {row.the_change}
                                </span>
                                {row.action_date ? (
                                  <span className="text-muted-foreground">
                                    {' '}
                                    &middot; {formatDate(row.action_date)}
                                  </span>
                                ) : null}
                                {row.action_kind === 'verdict_worked' ? (
                                  <span className="text-muted-foreground">
                                    {' '}
                                    &mdash; and your Senior Learner confirmed it helped
                                  </span>
                                ) : null}
                              </span>
                            </p>
                          ) : null}
                        </div>

                        {vote ? (
                          <p className="border-t pt-2 text-xs text-muted-foreground">
                            {vote.line}
                          </p>
                        ) : (
                          <p className="border-t pt-2 text-xs text-muted-foreground">
                            You haven&apos;t said yet whether this helped you.
                          </p>
                        )}

                        {/* The conferred act itself — private to this learner
                            (is_public = false, SCF anonymity contract), so this
                            is the only place they can see it. */}
                        {conferred ? (
                          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <Award
                              className="mt-0.5 h-3.5 w-3.5 shrink-0"
                              style={{ color: BRAND }}
                              aria-hidden
                            />
                            <span>
                              <span className="font-medium text-foreground">
                                Recognised:{' '}
                              </span>
                              {conferred.title}
                              <span className="text-muted-foreground">
                                {' '}
                                &middot;{' '}
                                {new Date(conferred.fired_at).toLocaleDateString(undefined, {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </span>
                            </span>
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
