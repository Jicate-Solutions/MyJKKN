'use client';

// L4 — Principal escalation dashboard for the post-class feedback module.
// Surfaces sessions where learners reported low understanding (avg < 3, >= 3
// responses) so the principal/HOD/dean can follow up with the faculty.
//
// Reads via useEscalations(from, to) → fn_scf_principal_escalations, which
// RAISES for non-authorized callers. On that error we render an EXPLICIT
// access-denied message (no silent redirect — hard project rule, CLAUDE.md #27).
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
import { useEscalations } from '@/hooks/use-session-feedback';
import type { EscalationRow } from '@/types/session-feedback';

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

  const { data, isLoading, isError, error } = useEscalations(from, to);

  // Worst-first: lowest avg_understood first (nulls last), then most responses.
  const rows = useMemo<EscalationRow[]>(() => {
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
            responses) — for follow-up with the faculty.
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
                        <span className="font-semibold tabular-nums text-red-600">
                          {r.avg_understood != null
                            ? r.avg_understood.toFixed(2)
                            : '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="destructive">{r.low_understanding}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </ContentLayout>
  );
}
