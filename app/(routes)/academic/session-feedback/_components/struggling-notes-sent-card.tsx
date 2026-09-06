'use client';

// "A SUPPORT NOTE WENT OUT" — leadership signal (decision #4). Shows institution
// leadership (principal/dean/institution-admin/super — the SAME narrow audience as the
// learner-trajectory card) WHICH learners received an AI-written support note, how many,
// and when. It NEVER shows the note's wording — that stays private to the learner.
//
// Self-hides (renders null) on error or when empty: the sibling LearnerTrajectoryCard
// already surfaces the explicit access-denied message for unauthorized callers, so a
// second one would be noise. This card is a purely ADDITIVE indicator that only appears
// for authorized leadership once at least one note has been sent in the window.

import { useMemo } from 'react';
import { MailCheck } from 'lucide-react';
import { format, subDays } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useStrugglingNotesSent } from '@/hooks/use-struggling-notes-sent';

const BRAND_GREEN = '#0b6d41';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, 'd MMM yyyy');
}

export function StrugglingNotesSentCard({
  from,
  to,
  institutionId,
}: {
  from?: string;
  to?: string;
  /** Narrow to one college — passed through to the RPC's 3-arg overload (this
   *  card's rows carry no institution column, so the server filters instead). */
  institutionId?: string | null;
}) {
  const range = useMemo(() => {
    if (from && to) return { from, to };
    const today = new Date();
    return { from: format(subDays(today, 30), 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
  }, [from, to]);

  const { data, isError } = useStrugglingNotesSent(range.from, range.to, institutionId);
  const rows = data ?? [];

  // Additive signal only — self-hide when unauthorized (sibling trajectory card shows the
  // explicit access message) or when no notes have been sent this window.
  if (isError || rows.length === 0) return null;

  const learners = new Set(rows.map((r) => r.student_id)).size;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailCheck className="h-5 w-5" style={{ color: BRAND_GREEN }} />
          Support Notes Sent
        </CardTitle>
        <CardDescription>
          <span className="font-medium text-foreground">{learners}</span> learner
          {learners === 1 ? '' : 's'} received a private support note this period. You can see
          that a note went out — the note&apos;s wording stays private to the learner.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Learner</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Course</TableHead>
                <TableHead className="text-center">Notes sent</TableHead>
                <TableHead className="text-right">Last sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.student_id}-${r.course_code}`}>
                  <TableCell className="font-medium">
                    {r.learner_name ?? (
                      <span className="italic text-muted-foreground">Unknown</span>
                    )}
                    {r.register_number ? (
                      <span className="block font-mono text-xs font-normal text-muted-foreground">
                        {r.register_number}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.department_name ?? '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.course_code}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="tabular-nums">
                      {r.notes_count}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(r.last_note_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MailCheck className="h-3.5 w-3.5" aria-hidden />
          A support note is auto-written for a learner whose understanding has slid across 3+ of
          their own sessions. Only the learner can read the note&apos;s text.
        </p>
      </CardContent>
    </Card>
  );
}
