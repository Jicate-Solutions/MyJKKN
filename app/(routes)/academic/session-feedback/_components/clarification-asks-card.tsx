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
// Renders NOTHING when there are no asks — a quiet surface that earns its
// place only when there is a real signal (same doctrine as the free-text
// carry-counts card next to it).

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
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

export function ClarificationAsksCard() {
  const { data: rows = [] } = useQuery({
    queryKey: ['scf-clarification-sessions-for-me'],
    queryFn: () => SessionFeedbackService.getMyClarificationSessions(),
    staleTime: 5 * 60 * 1000,
  });

  if (rows.length === 0) return null;

  const stillOpen = rows.reduce((n, r) => n + (r.still_open || 0), 0);
  const totalAsks = rows.reduce((n, r) => n + (r.asks || 0), 0);
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
          ever shown. Learners report the outcome themselves, so an ask stays
          open until they answer.
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
              {visible.map((r) => (
                <tr
                  key={`${r.attendance_date}-${r.course_code}`}
                  className="border-b last:border-0"
                >
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {format(new Date(r.attendance_date), 'd MMM')}
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
            Showing the {MAX_ROWS} most recent of {rows.length} sessions with asks.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
