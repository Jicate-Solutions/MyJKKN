'use client';

// L3 — Faculty session insight (anonymized post-class feedback).
// Renders an aggregate-only, anonymized understanding signal over the
// caller faculty's OWN sessions. Individual learner responses are never
// shown — the RPC (fn_scf_faculty_summary) returns only counts + averages.
// Spec: specs/post-class-feedback-attendance-gate-2026-06-15.md (L3).

import { useMemo } from 'react';
import { format, subDays } from 'date-fns';
import { BeatLoader } from 'react-spinners';
import { MessageSquare, ShieldCheck, AlertTriangle } from 'lucide-react';

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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useFacultyFeedbackSummary } from '@/hooks/use-session-feedback';
import type { FacultySummaryRow } from '@/types/session-feedback';

const BRAND_GREEN = '#0b6d41';

/** Bucket an understanding average into a color band.
 *  green >= 4, amber 3–3.9, red < 3. Null = no signal. */
function understandingBand(avg: number | null): 'good' | 'warn' | 'bad' | 'none' {
  if (avg === null || Number.isNaN(avg)) return 'none';
  if (avg >= 4) return 'good';
  if (avg >= 3) return 'warn';
  return 'bad';
}

const BAND_BAR: Record<'good' | 'warn' | 'bad' | 'none', string> = {
  good: 'bg-green-500',
  warn: 'bg-amber-500',
  bad: 'bg-red-500',
  none: 'bg-muted-foreground/30',
};

const BAND_BADGE: Record<'good' | 'warn' | 'bad' | 'none', string> = {
  good: 'bg-green-100 text-green-800 border-green-200',
  warn: 'bg-amber-100 text-amber-800 border-amber-200',
  bad: 'bg-red-100 text-red-800 border-red-200',
  none: 'bg-muted text-muted-foreground border-border',
};

/** Understanding cell: numeric average + a small color-banded bar. */
function UnderstandingCell({ avg }: { avg: number | null }) {
  const band = understandingBand(avg);
  // Bar fill scaled over the 1..5 understanding scale.
  const pct =
    avg === null || Number.isNaN(avg) ? 0 : Math.max(0, Math.min(100, (avg / 5) * 100));
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className={BAND_BADGE[band]}>
        {avg === null || Number.isNaN(avg) ? '—' : avg.toFixed(1)}
      </Badge>
      <div
        className="h-2 w-20 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={
          avg === null || Number.isNaN(avg)
            ? 'No understanding signal'
            : `Average understanding ${avg.toFixed(1)} out of 5`
        }
      >
        <div
          className={`h-full rounded-full ${BAND_BAR[band]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function FacultySessionInsightPage() {
  // Default range: last 30 days (inclusive of today).
  const { from, to } = useMemo(() => {
    const today = new Date();
    return {
      from: format(subDays(today, 30), 'yyyy-MM-dd'),
      to: format(today, 'yyyy-MM-dd'),
    };
  }, []);

  const { data, isLoading, isError, error } = useFacultyFeedbackSummary(from, to);
  const rows: FacultySummaryRow[] = data ?? [];

  return (
    <ContentLayout>
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/academic">Academic</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Session Feedback (Faculty)</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" style={{ color: BRAND_GREEN }} />
            <CardTitle>My Session Feedback</CardTitle>
          </div>
          <CardDescription>
            Understanding signal across your own sessions (last 30 days:{' '}
            {format(new Date(from), 'd MMM')} – {format(new Date(to), 'd MMM yyyy')}).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4 border-green-200 bg-green-50">
            <ShieldCheck className="h-4 w-4" style={{ color: BRAND_GREEN }} />
            <AlertDescription className="text-green-900">
              Aggregated and anonymous — individual learner responses are never shown.
            </AlertDescription>
          </Alert>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <BeatLoader color={BRAND_GREEN} size={10} />
              <p className="text-sm text-muted-foreground">Loading your session feedback…</p>
            </div>
          ) : isError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {error instanceof Error
                  ? error.message
                  : 'Could not load your session feedback. Please try again.'}
              </AlertDescription>
            </Alert>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium">No feedback on your sessions yet.</p>
              <p className="text-xs text-muted-foreground">
                Feedback appears here once learners submit it for the sessions you taught.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead className="text-right">Responses</TableHead>
                    <TableHead>Avg. understood</TableHead>
                    <TableHead className="text-right">Low understanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => {
                    const dateLabel = (() => {
                      const d = new Date(r.attendance_date);
                      return Number.isNaN(d.getTime())
                        ? r.attendance_date
                        : format(d, 'd MMM yyyy');
                    })();
                    return (
                      <TableRow key={`${r.attendance_date}-${r.period_id}-${i}`}>
                        <TableCell className="whitespace-nowrap font-medium">
                          {dateLabel}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {r.course_code ?? 'Unspecified'}
                            </span>
                            {r.course_name ? (
                              <span className="text-xs text-muted-foreground">
                                {r.course_name}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.responses}
                        </TableCell>
                        <TableCell>
                          <UnderstandingCell avg={r.avg_understood} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.low_understanding > 0 ? (
                            <Badge variant="outline" className={BAND_BADGE.bad}>
                              {r.low_understanding}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </ContentLayout>
  );
}
