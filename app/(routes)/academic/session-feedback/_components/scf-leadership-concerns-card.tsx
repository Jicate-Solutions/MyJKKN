'use client';

// "ONE VOICE ASKED FOR HELP" — leadership signal. Shown to the SAME audience as the
// sibling Session Escalations table it sits under (fn_scf_leadership_concerns mirrors
// fn_scf_escalation_followups' gate: super_admin / administrator / institution_admin /
// dean / hod / principal / coordinator, institution-scoped). Lists courses where a
// GOOD-average class (3 <= avg < 4.5) had EXACTLY ONE genuine help-ask. The teacher gets
// NO coaching tip for these (a single voice would over-react to n=1, and that learner
// is already supported by the private struggling-note); leadership sees the single
// voice here so it isn't lost. The summary is an AI aggregate line — never a verbatim
// student comment, never a student identity.
//
// Self-hides (renders null) on error or when empty — a purely ADDITIVE indicator that
// only appears for authorized leadership once at least one concern exists in the window.
// The sibling Session Escalations table already surfaces the explicit access-denied
// message for unauthorized callers, so a second one here would be noise.

import { useMemo } from 'react';
import { MessageCircleWarning } from 'lucide-react';
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
import { useScfLeadershipConcerns } from '@/hooks/use-scf-leadership-concerns';
import { UnderstandingBand } from '@/components/session-feedback/understanding-band';

const BRAND_GREEN = '#0b6d41';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, 'd MMM yyyy');
}

export function ScfLeadershipConcernsCard({ from, to }: { from?: string; to?: string }) {
  const range = useMemo(() => {
    if (from && to) return { from, to };
    const today = new Date();
    return { from: format(subDays(today, 30), 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
  }, [from, to]);

  const { data, isError, error } = useScfLeadershipConcerns(range.from, range.to);
  const rows = data ?? [];

  // Auth-denied → self-hide (the sibling Session Escalations table already surfaces the
  // explicit access message for this audience, so a second one would be noise).
  const isAuthDenied =
    error instanceof Error && /not authoriz|not authenticat/i.test(error.message);
  if (isAuthDenied) return null;

  // A transient / non-auth failure must NOT silently hide real leadership concerns — surface
  // a small notice so leadership knows the signal couldn't load (vs. a genuine empty state).
  if (isError) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircleWarning className="h-5 w-5" style={{ color: BRAND_GREEN }} />
            Single-Voice Concerns
          </CardTitle>
          <CardDescription>
            Couldn&apos;t load single-voice concerns right now. Refresh to try again.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Additive signal only — self-hide when there are no concerns this window.
  if (rows.length === 0) return null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircleWarning className="h-5 w-5" style={{ color: BRAND_GREEN }} />
          Single-Voice Concerns
        </CardTitle>
        <CardDescription>
          Classes that scored well overall but had{' '}
          <span className="font-medium text-foreground">one</span>{' '}
          learner ask for help. The teacher isn&apos;t sent a tip for these (a single voice
          can mislead, and that learner is supported privately) — but the signal is surfaced
          here so it isn&apos;t lost.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead>Faculty</TableHead>
                <TableHead className="text-right">Responses</TableHead>
                <TableHead className="text-right">Avg understood</TableHead>
                <TableHead>What was flagged</TableHead>
                <TableHead className="text-right">Flagged</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={`${r.institution_id ?? 'na'}-${r.course_code}-${r.faculty_email ?? 'na'}-${r.window_from}-${r.window_to}`}
                >
                  <TableCell className="font-mono text-xs font-medium">{r.course_code}</TableCell>
                  <TableCell className="text-sm">{r.faculty_email ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.responses ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <UnderstandingBand avg={r.avg_understood} />
                  </TableCell>
                  <TableCell className="max-w-md text-xs text-muted-foreground">
                    {r.concern_summary ?? '—'}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(r.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MessageCircleWarning className="h-3.5 w-3.5" aria-hidden />
          A concern is flagged when an otherwise well-understood class had exactly one genuine
          request for help. The summary is an aggregate — no individual comment or learner is shown.
        </p>
      </CardContent>
    </Card>
  );
}
