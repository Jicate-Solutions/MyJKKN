'use client';

// =====================================================================
// Re-explanation asks — your sessions (Senior Learner view)
// =====================================================================
// Substrate: 20260725133000_session_clarification_requests.sql (Lane C) had
// been recording learners' re-explanation asks since 2026-07-25 with NO reader
// on the session lead's side — the one person who could act on an open ask
// never learned it existed. This card is that reader.
//
// COUNT-ONLY. fn_scf_clarification_sessions_for_me returns a date, a course
// label and five integers; identity is not merely hidden here, it never leaves
// the database. Nothing on this surface can be drilled into a name.
//
// COPY DISCIPLINE — the outcome is LEARNER-SELF-REPORTED (fn_clarification_
// outcome: the same learner who asked reports what happened). "Still open"
// therefore means "they have not reported back yet", NOT "you ignored them".
// Every word here must read as an invitation to revisit a topic, never as an
// accusation, and never as a queue someone is failing to clear.
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

import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { HelpCircle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SessionFeedbackService } from '@/lib/services/session-feedback-service';

const BRAND = '#0b6d41';
const MAX_ROWS = 10;
/** Mirrors the LIMIT in fn_scf_clarification_sessions_for_me. At this many
 *  rows the list is truncated server-side and no total can be asserted. */
const SERVER_ROW_CAP = 50;

export function ClarificationAsksCard() {
  const { data: rows = [] } = useQuery({
    queryKey: ['scf-clarification-sessions-for-me'],
    queryFn: () => SessionFeedbackService.getMyClarificationSessions(),
    staleTime: 5 * 60 * 1000,
  });

  if (rows.length === 0) return null;

  // Headline reads the RPC's UNBOUNDED 30-day scalars, never a sum over the
  // rows: the row list is capped server-side, so summing it would quietly
  // under-report anyone teaching more than 50 sessions with asks.
  const stillOpen = rows[0].still_open_30d;
  const totalAsks = rows[0].asked_30d;
  const visible = rows.slice(0, MAX_ROWS);

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
          stays open until they answer.
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
          <table className="w-full min-w-[460px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Session</th>
                <th className="py-1.5 pr-3 font-medium">Course</th>
                <th className="py-1.5 pr-3 text-right font-medium">Asked</th>
                <th className="py-1.5 pr-3 text-right font-medium">Still open</th>
                <th className="py-1.5 text-right font-medium">
                  Went over it / Not then / No reply
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr
                  // Rows are per SESSION, so the key must carry period_id —
                  // two periods of one course on one day are two rows.
                  key={`${r.attendance_date}-${r.period_id}-${r.course_code}-${i}`}
                  className="border-b last:border-0"
                >
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
                  <td className="py-1.5 text-right">
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
                </tr>
              ))}
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
