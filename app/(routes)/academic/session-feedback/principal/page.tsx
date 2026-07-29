'use client';

// L4 — Principal escalation dashboard for the post-class feedback module.
// Surfaces sessions where learners reported low understanding (avg < 3, >= 3
// responses) so the principal/HOD/dean can follow up with the faculty.
//
// CLOSES THE OUTER LOOP (#10): for each escalated session we also show the NEXT
// same-faculty+course session's understanding and the "lift" (did the follow-up
// improve understanding next time?). Reads via useEscalationFollowups(from, to)
// → fn_scf_escalation_followups, which RAISES for non-authorized callers. On
// that error we render an EXPLICIT access-denied message (no silent redirect —
// hard project rule, CLAUDE.md #27).
//
// "next session" = the earliest later session taught by the SAME faculty for the
//   SAME course (with >= 1 response). "lift" = next avg understood − escalated
//   avg understood (positive = improved).
// Spec: specs/post-class-feedback-attendance-gate-2026-06-15.md

import { useMemo } from 'react';
import { AlertTriangle, TrendingDown } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { format, subDays } from 'date-fns';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
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
import { useEscalationFollowups } from '@/hooks/use-session-feedback';
import type { EscalationFollowupRow } from '@/types/session-feedback';
import { FollowupCell } from '../_components/followup-cell';
import { ScfLeadershipConcernsCard } from '../_components/scf-leadership-concerns-card';
import { ScfVerdictIntegrityCard } from '../_components/scf-verdict-integrity-card';
import { UnderstandingBand } from '@/components/session-feedback/understanding-band';

const BRAND_GREEN = '#0b6d41';

export default function PrincipalEscalationPage() {
  // Default range: last 30 days (inclusive of today).
  const { from, to } = useMemo(() => {
    const today = new Date();
    return {
      from: format(subDays(today, 30), 'yyyy-MM-dd'),
      to: format(today, 'yyyy-MM-dd'),
    };
  }, []);

  const { data, isLoading, isError, error } = useEscalationFollowups(from, to);

  // Worst-first: lowest avg_understood first (nulls last), then most responses.
  const rows = useMemo<EscalationFollowupRow[]>(() => {
    const list = [...(data ?? [])];
    list.sort((a, b) => {
      const av = a.avg_understood;
      const bv = b.avg_understood;
      if (av == null && bv == null) return b.responses - a.responses;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av !== bv) return av - bv;
      return b.responses - a.responses;
    });
    return list;
  }, [data]);

  return (
    <ContentLayout title="Session Escalations">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/academic">Academic</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Session Escalations</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5" style={{ color: BRAND_GREEN }} />
            Session Escalations
          </CardTitle>
          <CardDescription>
            Sessions where learners reported low understanding (avg &lt; 3, &ge; 3
            responses). The <span className="font-medium">Follow-up</span> column
            shows whether understanding improved in the next session of the same
            class — closing the loop on each escalation.
          </CardDescription>
          <p className="mt-1 text-xs text-muted-foreground">
            Showing {from} to {to}
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <BeatLoader color={BRAND_GREEN} />
              <p className="mt-4 text-sm text-muted-foreground">
                Loading escalations…
              </p>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <AlertTriangle className="h-10 w-10 text-amber-500" />
              <p className="max-w-md text-sm font-medium text-foreground">
                You don&apos;t have access to escalations — contact your
                administrator.
              </p>
              {error instanceof Error && error.message ? (
                <p className="max-w-md text-xs text-muted-foreground">
                  {error.message}
                </p>
              ) : null}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <p className="text-sm text-muted-foreground">
                No sessions need escalation in this period.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Faculty</TableHead>
                    <TableHead className="text-right">Responses</TableHead>
                    <TableHead className="text-right">Avg understood</TableHead>
                    <TableHead className="text-right">Low understanding</TableHead>
                    <TableHead className="text-right">Follow-up</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow
                      key={`${r.attendance_date}-${r.period_id}-${r.course_code ?? 'na'}`}
                    >
                      <TableCell className="whitespace-nowrap">
                        {r.attendance_date}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {r.course_code ?? '—'}
                        </div>
                        {r.course_name ? (
                          <div className="text-xs text-muted-foreground">
                            {r.course_name}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.faculty_email ?? '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.responses}
                      </TableCell>
                      <TableCell className="text-right">
                        <UnderstandingBand avg={r.avg_understood} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="destructive">{r.low_understanding}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <FollowupCell row={r} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Additive leadership signal: good-average classes with exactly one help-ask.
          Self-hides when empty or unauthorized. */}
      <ScfLeadershipConcernsCard from={from} to={to} />

      {/* Claims vs numbers — verdict integrity (leadership-only; dark until a
          verdict has a measured outcome). Director interview 2026-07-09. */}
      <ScfVerdictIntegrityCard from={from} to={to} />
    </ContentLayout>
  );
}
