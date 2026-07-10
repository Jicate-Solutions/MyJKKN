'use client';

// Feedback Confirmation tab for the Attendance Dashboard.
//
// VISIBILITY-ONLY, READ-ONLY. This is a MERGE-BY-REUSE of the existing
// all-college post-class-feedback breakdown that already lives at
// /academic/session-feedback/admin. It does NOT re-implement that page:
//   • the data layer is the SAME hooks (useAdminCollegeSummary /
//     useAdminFacultySummary / useAdminTrend / useFacilitatorFeedbackCoverage
//     from hooks/use-session-feedback) — no new RPCs;
//   • the SCF loop cards (LoopActivityCard / FacilitatorStrengthsCard /
//     LearnerTrajectoryCard / StrugglingNotesSentCard) are IMPORTED from the
//     session-feedback module, not copied;
//   • the headline is the SAME <ConfirmationSplitCards/> already shown on the
//     Statistics tab.
// Only the small page-local presentational helpers (coverageColor /
// TableShell) are re-declared here — they are not exported by the source page,
// and this file may not edit anything under session-feedback/**.
//
// Date range: last 30 days ending at the dashboard's selected date (mirrors the
// admin page's subDays/format window, but anchored to the dashboard date).

import { useMemo } from 'react';
import {
  AlertTriangle,
  Building2,
  Users,
  BarChart3,
  TrendingDown,
  Gauge,
} from 'lucide-react';
import { BeatLoader } from 'react-spinners';
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
import {
  useAdminCollegeSummary,
  useAdminFacultySummary,
  useAdminTrend,
  useFacilitatorFeedbackCoverage,
} from '@/hooks/use-session-feedback';
import { usePermissions } from '@/hooks/use-permissions';
import { LoopActivityCard } from '@/app/(routes)/academic/session-feedback/_components/loop-activity-card';
import { FacilitatorStrengthsCard } from '@/app/(routes)/academic/session-feedback/_components/facilitator-strengths-card';
import { LearnerTrajectoryCard } from '@/app/(routes)/academic/session-feedback/_components/learner-trajectory-card';
import { StrugglingNotesSentCard } from '@/app/(routes)/academic/session-feedback/_components/struggling-notes-sent-card';
import { UnderstandingBand } from '@/components/session-feedback/understanding-band';
import type {
  AdminCollegeSummaryRow,
  AdminFacultySummaryRow,
  AdminTrendRow,
  FacilitatorCoverageRow,
} from '@/types/session-feedback';
import { ConfirmationSplitCards } from './confirmation-split-cards';
import type { DashboardFilterState } from './dashboard-filters';

const BRAND_GREEN = '#0b6d41';

/** Every figure on this tab — the confirmation cards, the Totals tiles and the
 *  college tables — covers exactly this many days, inclusive of both ends. It is
 *  passed to ConfirmationSplitCards AND used to compute from/to, so the cards and
 *  the tables can never again describe different spans. */
const WINDOW_DAYS = 30;


/** Color a coverage %: red 0–24, amber 25–59, green 60+. */
function coverageColor(pct: number): string {
  if (pct < 25) return 'text-red-600';
  if (pct < 60) return 'text-amber-600';
  return 'text-green-600';
}

/** Shared loading / access-denied / empty wrapper — mirrors the admin page so
 *  the access-denied block (no silent redirect, CLAUDE.md #27) is consistent. */
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
    // A permission denial and a query failure are NOT the same thing. The RPCs
    // raise '<fn>: not authorized' when the caller lacks the permission; anything
    // else (statement timeout, network, SQL error) is a FAILURE. Labelling every
    // error "you don't have access" hid a 10.5s timeout as a permissions problem
    // for months — the panel looked forbidden when it was merely slow.
    const message = error instanceof Error ? error.message : '';
    const denied = /not authorized/i.test(message);
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <AlertTriangle
          className={`h-10 w-10 ${denied ? 'text-amber-500' : 'text-red-500'}`}
        />
        <p className="max-w-md text-sm font-medium text-foreground">
          {denied
            ? 'You don’t have permission to view this panel — contact your administrator.'
            : 'Couldn’t load this panel. This does not affect the attendance figures above.'}
        </p>
        {message ? (
          <p className="max-w-md text-xs text-muted-foreground">{message}</p>
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

interface FeedbackConfirmationTabProps {
  userInstitutionId?: string;
  canViewAllInstitutions: boolean;
  selectedDate?: Date;
  filters?: DashboardFilterState;
  refreshTrigger?: number;
}

export function FeedbackConfirmationTab({
  userInstitutionId,
  canViewAllInstitutions,
  selectedDate,
  filters,
  refreshTrigger = 0,
}: FeedbackConfirmationTabProps) {
  // Last 30 days ending at the dashboard's selected date. Depend on the date's
  // time value so a stable Date reference doesn't recompute each render, but a
  // real date change does.
  const anchorMs = selectedDate ? selectedDate.getTime() : null;
  const { from, to } = useMemo(() => {
    const end = anchorMs != null ? new Date(anchorMs) : new Date();
    return {
      // subDays(end, WINDOW_DAYS - 1): a span of WINDOW_DAYS days INCLUSIVE of
      // both ends, matching useConfirmationSplit's own arithmetic. Using
      // subDays(end, 30) here would cover 31 days, so the tables would count one
      // extra day of responses that the cards above them never saw — a miniature
      // of the very "39,456 vs 55,774" discrepancy this change exists to kill.
      from: format(subDays(end, WINDOW_DAYS - 1), 'yyyy-MM-dd'),
      to: format(end, 'yyyy-MM-dd'),
    };
  }, [anchorMs]);

  // The college chosen in the shared dashboard filter bar. `undefined` = every
  // college the caller is allowed to see (the RPCs already enforce that scope).
  const selectedInstitutionId = filters?.institutionId;

  // The learner-level panels are gated on a narrower permission than the
  // college-level ones, so a HoD is legitimately refused. Rather than show them
  // two red boxes forever, we don't render those cards at all for callers who
  // cannot read them.
  // canAccess(module, action) joins them as `${module}.${action}`, giving the key
  // the DB functions check. It returns false while permissions load — the safe
  // direction: the restricted cards stay hidden rather than flashing in and out.
  const { canAccess } = usePermissions();
  const canSeeLearnerDetail = canAccess(
    'academic.session_feedback',
    'learner_detail.view',
  );

  const college = useAdminCollegeSummary(from, to);
  const faculty = useAdminFacultySummary(from, to);
  // Trend + loop activity return no institution column, so they cannot be
  // narrowed client-side — the RPCs take the college as an argument instead.
  const trend = useAdminTrend(from, to, selectedInstitutionId);
  // Coverage is narrowed SERVER-side too (Director bug 2026-07-10: Pharmacy
  // facilitators rendered under a Dental filter, plus a 267% coverage row from
  // the RPC's covered-count fan-out). The client-side filter below stays as
  // belt-and-braces.
  const coverage = useFacilitatorFeedbackCoverage(from, to, selectedInstitutionId);

  // The remaining panels DO carry institution_id per row, so narrowing them here
  // is a filter, never a widening — the server already decided what you may see.
  // Memoized: these arrays feed the useMemo roll-ups below, and a fresh array
  // identity on every render would defeat them.
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

  // Coverage headline: how many facilitators have collected ANY feedback, and
  // what fraction of all taught sessions are covered (the adoption gap).
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
    let weighted = 0;
    for (const r of collegeRows) {
      responses += r.responses;
      students += r.students;
      lowSessions += r.low_sessions;
      if (r.avg_understood != null) weighted += r.avg_understood * r.responses;
    }
    const avg = responses > 0 ? weighted / responses : null;
    return {
      colleges: collegeRows.length,
      responses,
      students,
      lowSessions,
      avg,
    };
  }, [collegeRows]);

  // Max responses-per-day, for scaling the inline trend bars.
  const maxTrendResponses = useMemo(
    () => trendRows.reduce((m, r) => Math.max(m, r.responses), 0),
    [trendRows],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Feedback Confirmation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Post-class feedback breakdown across all colleges in scope — the same
          view as the{' '}
          <span className="font-medium text-foreground">
            All-College Feedback
          </span>{' '}
          dashboard, surfaced here beside attendance. Showing {from} to {to}.
        </p>
      </div>

      {/* Headline: the SAME feedback-confirmation split shown on the Statistics
          tab (imported component, not re-implemented). Hidden when the policy
          gate_mode = 'off'. */}
      <ConfirmationSplitCards
        userInstitutionId={userInstitutionId}
        canViewAllInstitutions={canViewAllInstitutions}
        selectedDate={selectedDate}
        filters={filters}
        refreshTrigger={refreshTrigger}
        // Not the 14-day default: these cards must cover the SAME window as the
        // tables below. Previously the cards said "last 14 days" and the Responses
        // tile beneath was a 30-day figure, which read as a data discrepancy.
        // Driven by the same constant that computes from/to — never a literal.
        windowDays={WINDOW_DAYS}
      />

      {/* Headline strip. LABEL THE WINDOW: these are 30-day figures sitting
          directly beneath the confirmation cards. An unlabelled "Responses"
          tile is exactly what made 39,456 look like it contradicted 55,774 —
          the same rows, counted over two different spans. */}
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-lg font-semibold">Totals</h3>
        <span className="text-xs text-muted-foreground">
          last {WINDOW_DAYS} days ·{' '}
          {selectedInstitutionId
            ? 'selected college'
            : 'all colleges in scope'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          </CardContent>
        </Card>
      </div>

      {/* College Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" style={{ color: BRAND_GREEN }} />
            College Summary
          </CardTitle>
          <CardDescription>
            Submission and understanding picture per college — how many sessions
            collected feedback, how many learners responded, and how many
            sessions breached the low-understanding threshold (&ge; 3 responses,
            avg &lt; 3).
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
                        <span className="text-muted-foreground tabular-nums">
                          0
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableShell>
        </CardContent>
      </Card>

      {/* Feedback Coverage by Learning Facilitator — who is DRIVING the loop vs
          not. The most actionable "who hasn't collected" view; denominator =
          sessions actually taught (attendance marked). */}
      <Card>
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
                . {coverageTotals.covered} of {coverageTotals.taught} taught
                sessions covered ({coverageTotals.pct}%). Coverage = sessions
                with at least one learner response &divide; sessions actually
                taught (attendance marked).
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
                        <span className="italic text-muted-foreground">
                          Unknown
                        </span>
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

      {/* SCF self-improving-loop intelligence cards — imported from the
          session-feedback module (bodies not copied). Share the dashboard
          window. */}
      <LoopActivityCard
        from={from}
        to={to}
        institutionId={selectedInstitutionId}
      />
      <FacilitatorStrengthsCard
        from={from}
        to={to}
        institutionId={selectedInstitutionId}
      />
      {/* Learner-level panels: a narrower permission than the college-level ones
          (HoDs are deliberately excluded). Hidden rather than rendered as an
          error, so a HoD sees a complete page, not two permission warnings. */}
      {canSeeLearnerDetail ? (
        <>
          <LearnerTrajectoryCard
            from={from}
            to={to}
            institutionId={selectedInstitutionId}
          />
          <StrugglingNotesSentCard
            from={from}
            to={to}
            institutionId={selectedInstitutionId}
          />
        </>
      ) : null}

      {/* Faculty Summary */}
      <Card>
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
                  <TableRow
                    key={`${r.institution_id}-${r.faculty_email ?? 'na'}-${i}`}
                  >
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
                        <span className="text-muted-foreground tabular-nums">
                          0
                        </span>
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
            Average understanding per day across all colleges in scope. Bar
            length reflects the number of responses that day.
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
                      ? Math.max(
                          4,
                          Math.round((r.responses / maxTrendResponses) * 100),
                        )
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

      {/* Footnote: anonymity reminder + intent. */}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <TrendingDown className="h-3.5 w-3.5" aria-hidden />
        All figures are aggregates. Individual learner feedback is never shown.
      </p>
    </div>
  );
}
