'use client';

// =====================================================================
// Re-explanation asks — your sessions (Senior Learner view)
// =====================================================================
// Substrate: 20260725133000_session_clarification_requests.sql (Lane C) had
// been recording learners' re-explanation asks since 2026-07-25 with NO reader
// on the session lead's side — the one person who could act on an open ask
// never learned it existed. This card is that reader.
//
// TWO-SIDED CLOSE (20260731190000, spec clarification-act-two-sided-close-
// 2026-07-30): the lead can now record the ACT ("I went over it again") per
// session-row — a 4-option picker + optional note. The learner keeps the
// VERDICT: only their own "did it help?" answer ever closes an ask. Acts are
// CONTEXT, NEVER EVIDENCE (spec decision 4): recording one improves no score,
// median, or machine item anywhere. Its one power is honesty — and triggering
// the asking learner's follow-up so the loop can actually close.
//
// COUNT-ONLY. fn_scf_clarification_sessions_for_me returns a date, a course
// label and integers; identity is not merely hidden here, it never leaves
// the database. Nothing on this surface can be drilled into a name.
//
// COPY DISCIPLINE — the outcome is LEARNER-SELF-REPORTED (fn_clarification_
// outcome: the same learner who asked reports what happened). "Still open"
// therefore means "they have not reported back yet", NOT "you ignored them".
// The mismatch line (learners answered "not really") is HELP-FIRST, never
// accusatory — it invites a different approach, it accuses no one.
//
// NO SMALL-COUNT SUPPRESSION, deliberately. The sibling
// fn_scf_freetext_carry_counts hides courses below a >=3-learner floor, and
// review asked for the same here. We do NOT, because:
//   • a lead must see that ONE ask exists in order to act on it — hiding it
//     breaks the exact loop this card was built to close, and a single
//     unanswered ask is the case most worth revisiting;
//   • the payload is a low-stakes REQUEST ("please go over that again"), not a
//     score, complaint, or evaluation of the lead — the freetext floor guards
//     learners' written CONCERNS, a different risk class;
//   • the learner self-reports the outcome knowing this loop exists.
// The claim is corrected instead: "No names are stored or shown" is exactly
// true, where "never identifiable" would not be in a four-person elective.
//
// Renders NOTHING when there are no asks — a quiet surface that earns its
// place only when there is a real signal (same doctrine as the free-text
// carry-counts card next to it).

import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { HelpCircle, HandHeart } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SessionFeedbackService } from '@/lib/services/session-feedback-service';
import type {
  ClarificationActType,
  ClarificationSessionCountsRow,
} from '@/types/session-feedback';

const BRAND = '#0b6d41';
const MAX_ROWS = 10;
/** Mirrors the LIMIT in fn_scf_clarification_sessions_for_me. At this many
 *  rows the list is truncated server-side and no total can be asserted. */
const SERVER_ROW_CAP = 50;
const QUERY_KEY = ['scf-clarification-sessions-for-me'] as const;
const NOTE_MAX = 500;

/** The four act options, exactly as locked in the spec (decision 1). */
const ACT_OPTIONS: { value: ClarificationActType; label: string }[] = [
  { value: 're_explained_in_session', label: 'Went over it again in session' },
  { value: 'helped_one_on_one', label: 'Helped the learners 1-on-1' },
  { value: 'shared_material', label: 'Shared material about it' },
  { value: 'planned_next_session', label: 'Planned it for next session' },
];

const ACT_DONE_LABEL: Record<ClarificationActType, string> = {
  re_explained_in_session: 'went over it again',
  helped_one_on_one: 'helped 1-on-1',
  shared_material: 'shared material',
  planned_next_session: 'planned for next session',
};

const rowKey = (r: ClarificationSessionCountsRow) =>
  `${r.attendance_date}|${r.period_id}|${r.course_code}`;

export function ClarificationAsksCard() {
  const queryClient = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => SessionFeedbackService.getMyClarificationSessions(),
    staleTime: 5 * 60 * 1000,
  });

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [rowMsg, setRowMsg] = useState<Record<string, string>>({});

  const act = useMutation({
    mutationFn: (input: {
      row: ClarificationSessionCountsRow;
      type: ClarificationActType;
      note: string;
    }) =>
      SessionFeedbackService.recordClarificationAct(
        input.row.attendance_date,
        input.row.period_id,
        input.row.course_code,
        input.type,
        input.note,
      ),
  });

  if (rows.length === 0) return null;

  // Headline reads the RPC's UNBOUNDED 30-day scalars, never a sum over the
  // rows: the row list is capped server-side, so summing it would quietly
  // under-report anyone teaching more than 50 sessions with asks.
  const stillOpen = rows[0].still_open_30d;
  const totalAsks = rows[0].asked_30d;
  const visible = rows.slice(0, MAX_ROWS);

  const recordAct = (row: ClarificationSessionCountsRow, type: ClarificationActType) => {
    const key = rowKey(row);
    act
      .mutateAsync({ row, type, note })
      .then((res) => {
        if (res.success) {
          setOpenKey(null);
          setNote('');
          setRowMsg((m) => ({ ...m, [key]: '' }));
          void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        } else {
          setRowMsg((m) => ({
            ...m,
            [key]:
              res.reason === 'disabled'
                ? 'Recording actions is switched off right now.'
                : 'Could not record that just now — nothing was saved.',
          }));
        }
      })
      .catch(() => {
        setRowMsg((m) => ({
          ...m,
          [key]: 'Could not record that just now — nothing was saved.',
        }));
      });
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HelpCircle className="h-4 w-4" style={{ color: BRAND }} />
          Re-explanation asks — your sessions
        </CardTitle>
        <CardDescription>
          A learner asking again is the system working — a two-minute revisit at
          the start of the next session usually closes the loop. No names are
          stored or shown. Learners report the outcome themselves, so an ask
          stays open until they answer. Recording what you did is context for
          them, never a score for you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            className="text-2xl font-semibold tabular-nums leading-none"
            style={{ color: BRAND }}
          >
            {stillOpen}
          </span>
          <span className="text-sm text-muted-foreground">
            still open of {totalAsks} asked · last 30 days
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Session</th>
                <th className="py-1.5 pr-3 font-medium">Course</th>
                <th className="py-1.5 pr-3 text-right font-medium">Asked</th>
                <th className="py-1.5 pr-3 text-right font-medium">Still open</th>
                <th className="py-1.5 pr-3 text-right font-medium">
                  Went over it / Not then / No reply
                </th>
                <th className="py-1.5 text-right font-medium">Your action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => {
                const key = rowKey(r);
                const acts = r.acts ?? 0;
                const notHelped = r.not_helped ?? 0;
                const expanded = openKey === key;
                const msg = rowMsg[key];
                return (
                  // Rows are per SESSION, so the key must carry period_id —
                  // two periods of one course on one day are two rows.
                  <Fragment key={`${key}-${i}`}>
                    <tr className="border-b last:border-0">
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        {/* parseISO, not new Date(): 'YYYY-MM-DD' through the Date
                            constructor is UTC midnight and renders the previous day
                            in any negative-offset browser. */}
                        {format(parseISO(r.attendance_date), 'd MMM')}
                      </td>
                      <td className="py-1.5 pr-3">
                        <span className="font-medium">{r.course_code}</span>
                        {r.course_name ? (
                          <span className="text-muted-foreground"> · {r.course_name}</span>
                        ) : null}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{r.asks}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {r.still_open > 0 ? (
                          <span className="font-medium">{r.still_open}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-right">
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Badge variant="outline" style={{ color: BRAND, borderColor: BRAND }}>
                            {r.re_explained}
                          </Badge>
                          <Badge variant="outline">{r.refused}</Badge>
                          <Badge variant="outline" className="border-amber-400 text-amber-700">
                            {r.unanswered}
                          </Badge>
                        </span>
                      </td>
                      <td className="py-1.5 text-right">
                        {acts > 0 ? (
                          <span className="inline-flex flex-wrap items-center justify-end gap-1">
                            <Badge
                              variant="outline"
                              className="whitespace-nowrap"
                              style={{ color: BRAND, borderColor: BRAND }}
                            >
                              {r.last_act_type
                                ? ACT_DONE_LABEL[r.last_act_type]
                                : 'acted'}
                            </Badge>
                            {r.open_after_act ? (
                              <Badge
                                variant="outline"
                                className="whitespace-nowrap border-amber-400 text-amber-700"
                              >
                                new ask since
                              </Badge>
                            ) : r.still_open > 0 ? (
                              <span className="whitespace-nowrap text-xs text-muted-foreground">
                                awaiting learners
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                        {r.still_open > 0 || acts === 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenKey(expanded ? null : key);
                              setNote('');
                            }}
                            className="ml-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41]/40"
                            style={{ color: BRAND }}
                          >
                            {expanded ? 'Close' : acts > 0 ? 'Add another' : 'I acted on this'}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {notHelped > 0 ? (
                      <tr className="border-b last:border-0">
                        <td colSpan={6} className="py-1.5">
                          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <HandHeart
                              className="mt-0.5 h-3.5 w-3.5 shrink-0"
                              style={{ color: BRAND }}
                            />
                            <span>
                              You went over this again, but{' '}
                              {notHelped === 1 ? 'a learner who asked' : `${notHelped} learners who asked`}{' '}
                              {notHelped === 1 ? "hasn't" : "haven't"} felt it land yet — maybe a
                              different approach next session.
                            </span>
                          </p>
                        </td>
                      </tr>
                    ) : null}
                    {expanded ? (
                      <tr className="border-b last:border-0 bg-muted/30">
                        <td colSpan={6} className="p-3">
                          <div className="space-y-2">
                            <p className="text-xs font-medium">What did you do?</p>
                            <div className="flex flex-wrap gap-1.5">
                              {ACT_OPTIONS.map((o) => (
                                <button
                                  key={o.value}
                                  type="button"
                                  disabled={act.isPending}
                                  onClick={() => recordAct(r, o.value)}
                                  className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41]/40 disabled:opacity-40"
                                >
                                  {o.label}
                                </button>
                              ))}
                            </div>
                            <input
                              type="text"
                              value={note}
                              maxLength={NOTE_MAX}
                              onChange={(e) => setNote(e.target.value)}
                              placeholder="Optional one-line note the learners will see (e.g. what you tried differently)"
                              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41]/40"
                            />
                            <p className="text-[11px] text-muted-foreground">
                              Tap an option to record it. Context only — learners who asked
                              will be invited to say whether it helped; their answer is the
                              only thing that closes an ask.
                            </p>
                            {msg ? (
                              <p className="text-[11px] text-amber-700">{msg}</p>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {rows.length > MAX_ROWS ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {/* The RPC itself caps at 50 rows, so at exactly 50 we cannot claim
                a total — say "at least" rather than state a number that may be
                short. The headline above is unbounded either way. */}
            Showing the {MAX_ROWS} most recent of{' '}
            {rows.length >= SERVER_ROW_CAP ? `at least ${rows.length}` : rows.length}{' '}
            sessions with asks.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
