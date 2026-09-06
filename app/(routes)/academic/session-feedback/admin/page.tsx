'use client';

// L5 — Super-admin / institution-leadership ALL-COLLEGE feedback dashboard.
// The cross-college sibling of the principal escalation lane: instead of one
// institution's breaching sessions, it shows the submission + understanding
// picture for EVERY college in scope (super_admin = all 8; institution
// leadership = own institution only), grouped three ways:
//   • College Summary   — sessions / responses / students / avg / low sessions
//   • Faculty Summary    — worst-understanding faculty first (cross-college)
//   • Understanding Trend — per-day average understanding over the window
//
// ANONYMITY: every number here comes from an aggregate RPC
// (fn_scf_admin_college_summary / _faculty_summary / _trend). No per-student
// feedback content (understood/checklist/free_text) is ever fetched or shown.
//
// On RPC error (non-authorized caller) we render an EXPLICIT access-denied
// message — never a silent redirect (hard project rule, CLAUDE.md #27).
// Spec: specs/post-class-feedback-attendance-gate-2026-06-15.md (admin lane)

import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, Building2, Users, BarChart3, TrendingDown, Gauge } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { useQueryClient } from '@tanstack/react-query';
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
import {
  useAdminCollegeSummary,
  useAdminFacultySummary,
  useAdminTrend,
  useFacilitatorFeedbackCoverage,
} from '@/hooks/use-session-feedback';
import { LoopActivityCard } from '../_components/loop-activity-card';
import { FacilitatorStrengthsCard } from '../_components/facilitator-strengths-card';
import { FacilitatorPulseCard } from '../_components/facilitator-pulse-card';
import { LearnerTrajectoryCard } from '../_components/learner-trajectory-card';
import { StrugglingNotesSentCard } from '../_components/struggling-notes-sent-card';
import {
  DashboardFilters,
  type DashboardFilterState,
} from '@/app/(routes)/academic/attendance/dashboard/_components/dashboard-filters';
import { UnderstandingBand } from '@/components/session-feedback/understanding-band';
import type {
  AdminCollegeSummaryRow,
  AdminFacultySummaryRow,
  AdminTrendRow,
  FacilitatorCoverageRow,
} from '@/types/session-feedback';

const BRAND_GREEN = '#0b6d41';

/** Every figure on this page covers exactly this many days, inclusive of both
 *  ends — the SAME constant + arithmetic as the attendance dashboard's Feedback
 *  Confirmation tab, so the two surfaces can never describe different spans. */
const WINDOW_DAYS = 30;


/** Color a coverage %: red 0–24, amber 25–59, green 60+. */
function coverageColor(pct: number): string {
  if (pct < 25) return 'text-red-600';
  if (pct < 60) return 'text-amber-600';
  return 'text-green-600';
}

/** Shared loading / access-denied / empty wrapper so all three tables behave
 *  identically — and so the access-denied block (no silent redirect) is in one
 *  place. */
function TableShell({
  isLoading,
  isError,
  error,
  isEmpty,
  emptyLabel,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <BeatLoader color={BRAND_GREEN} />
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <p className="max-w-md text-sm font-medium text-foreground">
          You don&apos;t have access to the all-college dashboard — contact your
          administrator.
        </p>
        {error instanceof Error && error.message ? (
          <p className="max-w-md text-xs text-muted-foreground">{error.message}</p>
        ) : null}
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }
  return <div className="overflow-x-auto">{children}</div>;
}

export default function AdminFeedbackDashboardPage() {
  const qc = useQueryClient();

  // The filter bar's state: date anchor + optionally one college.
  const [filters, setFilters] = useState<DashboardFilterState>({
    selectedDate: new Date(),
  });

  // Last WINDOW_DAYS days ending at the selected date. Depend on the date's
  // time value so a stable Date reference doesn't recompute each render.
  // subDays(end, WINDOW_DAYS - 1): WINDOW_DAYS days INCLUSIVE of both ends —
  // the same arithmetic as the Feedback Confirmation tab (subDays(end, 30)
  // would cover 31 days and re-open the "two spans, two totals" discrepancy).
  const anchorMs = filters.selectedDate.getTime();
  const { from, to } = useMemo(() => {
    const end = new Date(anchorMs);
    return {
      from: format(subDays(end, WINDOW_DAYS - 1), 'yyyy-MM-dd'),
      to: format(end, 'yyyy-MM-dd'),
    };
  }, [anchorMs]);

  // The college chosen in the filter bar. `undefined` = every college the
  // caller is allowed to see (the RPCs already enforce that scope).
  const selectedInstitutionId = filters.institutionId;

  const college = useAdminCollegeSummary(from, to);
  const faculty = useAdminFacultySummary(from, to);
  // Trend returns no institution column, so it cannot be narrowed client-side —
  // the RPC takes the college as an argument instead (3-arg overload).
  const trend = useAdminTrend(from, to, selectedInstitutionId);
  const coverage = useFacilitatorFeedbackCoverage(from, to);

  // Picker options come from the UNFILTERED college summary: exactly the
  // colleges the server let this caller see (super admin = all with data in
  // window, scoped leadership = own), so the picker can never widen scope.
  const pickerInstitutions = useMemo(() => {
    const rows = (college.data ?? []) as AdminCollegeSummaryRow[];
    return rows
      .filter((r) => r.institution_id)
      .map((r) => ({
        id: r.institution_id,
        name: r.institution_name ?? 'Unknown college',
      }));
  }, [college.data]);

  const handleFiltersChange = useCallback(
    (f: DashboardFilterState) => setFilters(f),
    [],
  );
  const handleRefresh = useCallback(() => {
    qc.invalidateQueries();
  }, [qc]);

  // The remaining panels DO carry institution_id per row, so narrowing them
  // here is a filter, never a widening — the server already decided what you
  // may see. Memoized: these arrays feed the useMemo roll-ups below.
  const collegeRows = useMemo(() => {
    const rows = (college.data ?? []) as AdminCollegeSummaryRow[];
    return selectedInstitutionId
      ? rows.filter((r) => r.institution_id === selectedInstitutionId)
      : rows;
  }, [college.data, selectedInstitutionId]);

  const facultyRows = useMemo(() => {
    const rows = (faculty.data ?? []) as AdminFacultySummaryRow[];
    return selectedInstitutionId
      ? rows.filter((r) => r.institution_id === selectedInstitutionId)
      : rows;
  }, [faculty.data, selectedInstitutionId]);

  const coverageRows = useMemo(() => {
    const rows = (coverage.data ?? []) as FacilitatorCoverageRow[];
    return selectedInstitutionId
      ? rows.filter((r) => r.institution_id === selectedInstitutionId)
      : rows;
  }, [coverage.data, selectedInstitutionId]);

  // Trend is narrowed server-side (it returns no institution column).
  const trendRows = (trend.data ?? []) as AdminTrendRow[];

  // Coverage headline: how many facilitators have collected ANY feedback, and what
  // fraction of all taught sessions are covered (the adoption gap, in one line).
  const coverageTotals = useMemo(() => {
    const total = coverageRows.length;
    const drivers = coverageRows.filter((r) => r.covered_sessions > 0).length;
    let taught = 0;
    let covered = 0;
    for (const r of coverageRows) {
      taught += r.taught_sessions;
      covered += r.covered_sessions;
    }
    return {
      total,
      drivers,
      nonDrivers: total - drivers,
      taught,
      covered,
      pct: taught > 0 ? Math.round((covered / taught) * 1000) / 10 : 0,
    };
  }, [coverageRows]);

  // Headline totals across all colleges in scope (cheap client roll-up).
  const totals = useMemo(() => {
    let responses = 0;
    let students = 0;
    let lowSessions = 0;
    let lowFlagResponses = 0;
    let lowFlagSessions = 0;
    let weighted = 0;
    for (const r of collegeRows) {
      responses += r.responses;
      students += r.students;
      lowSessions += r.low_sessions;
      lowFlagResponses += r.low_flag_responses ?? 0;
      lowFlagSessions += r.low_flag_sessions ?? 0;
      if (r.avg_understood != null) weighted += r.avg_understood * r.responses;
    }
    const avg = responses > 0 ? weighted / responses : null;
    return {
      colleges: collegeRows.length,
      responses,
      students,
      lowSessions,
      lowFlagResponses,
      lowFlagSessions,
      avg,
    };
  }, [collegeRows]);

  // Max responses-per-day, for scaling the inline trend bars.
  const maxTrendResponses = useMemo(
    () => trendRows.reduce((m, r) => Math.max(m, r.responses), 0),
    [trendRows],
  );

  return (
    <ContentLayout title="All-College Feedback">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/academic">Academic</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>All-College Feedback</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Filter bar: date anchor + college picker. Options are the caller's own
          college-summary scope; the picker only appears when there is more than
          one college to choose from (scoped leadership sees just the date). */}
      <div className="mb-4">
        <DashboardFilters
          title="Feedback Filters"
          showAcademicYear={false}
          canViewAllInstitutions={pickerInstitutions.length > 1}
          institutions={pickerInstitutions}
          onFiltersChange={handleFiltersChange}
          onRefresh={handleRefresh}
          isLoading={college.isLoading}
        />
      </div>

      {/* Headline strip */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">Colleges</span>
            <span className="text-2xl font-semibold tabular-nums">
              {totals.colleges}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">Responses</span>
            <span className="text-2xl font-semibold tabular-nums">
              {totals.responses}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">Understanding</span>
            <UnderstandingBand avg={totals.avg} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">Low sessions</span>
            <span className="text-2xl font-semibold tabular-nums text-red-600">
              {totals.lowSessions}
            </span>
            {/* Second lens (Director, 2026-07-11): individual struggling voices.
                A learner tapping 1-2/5 in an otherwise-fine class never moves the
                whole-class counter above — without this line the two truths look
                contradictory ("so many low flags, but only 4 low sessions"). */}
            {totals.lowFlagResponses > 0 ? (
              <span className="text-[11px] leading-snug text-muted-foreground">
                {totals.lowFlagResponses.toLocaleString('en-IN')} individual low ratings across{' '}
                {totals.lowFlagSessions.toLocaleString('en-IN')} sessions — routed to learner support notes
              </span>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        Showing {from} to {to} ·{' '}
        {selectedInstitutionId ? 'selected college' : 'all colleges in scope'}
      </p>

      {/* College Summary */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" style={{ color: BRAND_GREEN }} />
            College Summary
          </CardTitle>
          <CardDescription>
            Submission and understanding picture per college — how many sessions
            collected feedback, how many learners responded, and how many sessions
            breached the low-understanding threshold (&ge; 3 responses, avg &lt; 3).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TableShell
            isLoading={college.isLoading}
            isError={college.isError}
            error={college.error}
            isEmpty={collegeRows.length === 0}
            emptyLabel="No feedback collected in this period."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>College</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Responses</TableHead>
                  <TableHead className="text-right">Students</TableHead>
                  <TableHead className="text-right">Avg understood</TableHead>
                  <TableHead className="text-right">Low sessions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {collegeRows.map((r) => (
                  <TableRow key={r.institution_id}>
                    <TableCell className="font-medium">
                      {r.institution_name ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.sessions}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.responses}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.students}
                    </TableCell>
                    <TableCell className="text-right">
                      <UnderstandingBand avg={r.avg_understood} />
                    </TableCell>
                    <TableCell className="text-right">
                      {r.low_sessions > 0 ? (
                        <Badge variant="destructive">{r.low_sessions}</Badge>
                      ) : (
                        <span className="text-muted-foreground tabular-nums">0</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableShell>
        </CardContent>
      </Card>

      {/* Feedback Coverage by Learning Facilitator — who is DRIVING the loop vs not.
          Denominator = sessions actually taught (attendance marked), drawn from
          student_attendance, so a facilitator who taught but got zero feedback shows
          at 0% ("Never"). This is the view the session_feedback-only summaries cannot
          produce. Attendance-marking coverage lives in the facilitator attendance
          report (/academic/attendance/reports), so it is not duplicated here. */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5" style={{ color: BRAND_GREEN }} />
            Feedback Coverage by Learning Facilitator
          </CardTitle>
          <CardDescription>
            {coverageTotals.total > 0 ? (
              <>
                <span className="font-medium text-foreground">
                  {coverageTotals.drivers} of {coverageTotals.total}
                </span>{' '}
                learning facilitators have collected feedback —{' '}
                <span className="font-medium text-red-600">
                  {coverageTotals.nonDrivers} not yet
                </span>
                . {coverageTotals.covered} of {coverageTotals.taught} taught sessions
                covered ({coverageTotals.pct}%). Coverage = sessions with at least one
                learner response &divide; sessions actually taught (attendance marked).
              </>
            ) : (
              'Sessions actually taught vs. sessions that collected feedback, per learning facilitator.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TableShell
            isLoading={coverage.isLoading}
            isError={coverage.isError}
            error={coverage.error}
            isEmpty={coverageRows.length === 0}
            emptyLabel="No taught sessions in this period."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Learning facilitator</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Taught</TableHead>
                  <TableHead className="text-right">With feedback</TableHead>
                  <TableHead className="w-[22%]">Coverage</TableHead>
                  <TableHead className="text-right">Last feedback</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Row key MUST be institution+staff: the coverage RPC returns one
                    row per (teacher x college taught), so cross-college teachers
                    repeat the same staff_id. Duplicate React keys corrupt list
                    reconciliation — picking a college left ZOMBIE rows from the
                    unfiltered render in the DOM (a Pharmacy facilitator visibly
                    listed under the Dental filter) while the headline counted the
                    correctly filtered array. */}
                {coverageRows.map((r) => (
                  <TableRow key={`${r.institution_id}-${r.staff_id}`}>
                    <TableCell className="font-medium">
                      {r.facilitator_name ?? (
                        <span className="italic text-muted-foreground">Unknown</span>
                      )}
                      {r.designation ? (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {r.designation}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.department_name ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.taught_sessions}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.covered_sessions}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: `${Math.max(0, Math.min(100, r.coverage_pct))}%`,
                              backgroundColor:
                                r.coverage_pct <= 0 ? '#dc2626' : BRAND_GREEN,
                            }}
                            aria-hidden
                          />
                        </div>
                        <span
                          className={`w-10 text-right text-xs font-semibold tabular-nums ${coverageColor(r.coverage_pct)}`}
                        >
                          {r.coverage_pct.toFixed(0)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {r.last_feedback ? (
                        <span className="whitespace-nowrap text-muted-foreground">
                          {r.last_feedback}
                        </span>
                      ) : (
                        <Badge variant="destructive">Never</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableShell>
        </CardContent>
      </Card>

      {/* SCF self-improving-loop intelligence — streams #2–#4 (orchestrator-wired).
          Loop Activity panel (#4) · Facilitator Strengths board (#3c) · Learner
          Trajectory at-risk early-warning (#3a). from/to share the dashboard window. */}
      <LoopActivityCard from={from} to={to} institutionId={selectedInstitutionId} />
      <FacilitatorStrengthsCard from={from} to={to} institutionId={selectedInstitutionId} />
      <FacilitatorPulseCard from={from} to={to} institutionId={selectedInstitutionId} />
      <LearnerTrajectoryCard from={from} to={to} institutionId={selectedInstitutionId} />
      {/* "A support note went out" — leadership sees that a note was sent, never its text (#2 visibility). */}
      <StrugglingNotesSentCard from={from} to={to} institutionId={selectedInstitutionId} />

      {/* Faculty Summary */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" style={{ color: BRAND_GREEN }} />
            Faculty Summary
          </CardTitle>
          <CardDescription>
            Faculty across all colleges in scope, lowest average understanding
            first — so the staff who most need support surface at the top.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TableShell
            isLoading={faculty.isLoading}
            isError={faculty.isError}
            error={faculty.error}
            isEmpty={facultyRows.length === 0}
            emptyLabel="No faculty feedback in this period."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Faculty</TableHead>
                  <TableHead>College</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Responses</TableHead>
                  <TableHead className="text-right">Avg understood</TableHead>
                  <TableHead className="text-right">Low sessions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {facultyRows.map((r, i) => (
                  <TableRow key={`${r.institution_id}-${r.faculty_email ?? 'na'}-${i}`}>
                    <TableCell className="text-sm">
                      {r.faculty_email ?? (
                        <span className="text-muted-foreground italic">
                          unassigned
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.institution_name ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.sessions}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.responses}
                    </TableCell>
                    <TableCell className="text-right">
                      <UnderstandingBand avg={r.avg_understood} />
                    </TableCell>
                    <TableCell className="text-right">
                      {r.low_sessions > 0 ? (
                        <Badge variant="destructive">{r.low_sessions}</Badge>
                      ) : (
                        <span className="text-muted-foreground tabular-nums">0</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableShell>
        </CardContent>
      </Card>

      {/* Understanding Trend (inline bars — no chart dependency) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" style={{ color: BRAND_GREEN }} />
            Understanding Trend
          </CardTitle>
          <CardDescription>
            Average understanding per day across all colleges in scope. Bar length
            reflects the number of responses that day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TableShell
            isLoading={trend.isLoading}
            isError={trend.isError}
            error={trend.error}
            isEmpty={trendRows.length === 0}
            emptyLabel="No feedback collected in this period."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Responses</TableHead>
                  <TableHead className="text-right">Students</TableHead>
                  <TableHead className="text-right">Avg understood</TableHead>
                  <TableHead className="w-[40%]">Volume</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trendRows.map((r) => {
                  const pct =
                    maxTrendResponses > 0
                      ? Math.max(4, Math.round((r.responses / maxTrendResponses) * 100))
                      : 0;
                  return (
                    <TableRow key={r.attendance_date}>
                      <TableCell className="whitespace-nowrap">
                        {r.attendance_date}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.responses}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.students}
                      </TableCell>
                      <TableCell className="text-right">
                        <UnderstandingBand avg={r.avg_understood} />
                      </TableCell>
                      <TableCell>
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: BRAND_GREEN,
                          }}
                          aria-hidden
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableShell>
        </CardContent>
      </Card>

      {/* Footnote: anonymity reminder + intent. TrendingDown kept for parity icon set. */}
      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <TrendingDown className="h-3.5 w-3.5" aria-hidden />
        All figures are aggregates. Individual learner feedback is never shown.
      </p>
    </ContentLayout>
  );
}
