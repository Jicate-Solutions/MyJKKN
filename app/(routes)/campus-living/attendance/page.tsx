'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { AlertTriangle, BarChart3, Calendar, ClipboardCheck, Loader2, UserX } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useAttendanceBreakdown } from '@/hooks/campus-living/use-attendance-analytics';
import {
  groupBy,
  groupRowsToCsv,
  toggleFilter,
  totals,
  type Dimension,
} from '@/lib/campus-living/attendance-cube';
import { BreakdownPanel } from './_components/breakdown-panel';
import { DrilldownPanel } from './_components/drilldown-panel';
import { ExportMenu, type CsvExport } from './_components/export-menu';
import { HeatmapPanel } from './_components/heatmap-panel';
import { MixCoveragePanel } from './_components/mix-coverage-panel';
import { OverallCards } from './_components/overall-cards';
import { RankingPanel } from './_components/ranking-panel';
import { ScopeBar } from './_components/scope-bar';
import { TrendPanel } from './_components/trend-panel';
import { useAttendanceScope } from './_components/use-attendance-scope';

type D = Exclude<Dimension, 'date'>;

/**
 * Hostel attendance dashboard — overall counts, then the same counts by
 * institution, department and block, with interactive analytics.
 *
 * One RPC (fn_cl_attendance_breakdown) returns a small cube; everything below is a
 * pure function over it (lib/campus-living/attendance-cube.ts), so clicking a bar
 * re-aggregates every panel instantly. Period + filter live in the URL.
 */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h2>
  );
}

function AttendanceDashboard() {
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const institutionId = profile?.institution_id ?? '';
  const scope = useAttendanceScope();
  const { range, filter } = scope;

  const { data, error } = useAttendanceBreakdown(institutionId, range.from, range.to);
  const loading = !data && !error;

  const canMark = isSuperAdmin || canAccess('campus_living.attendance', 'mark');
  const canExport = isSuperAdmin || canAccess('campus_living.attendance', 'export');

  const total = useMemo(() => (data ? totals(data, filter) : null), [data, filter]);
  const rows = useMemo(
    () => ({
      institution: data ? groupBy(data, 'institution', filter) : [],
      department: data ? groupBy(data, 'department', filter) : [],
      block: data ? groupBy(data, 'block', filter) : [],
      date: data ? groupBy(data, 'date', filter) : [],
    }),
    [data, filter],
  );

  const select = (dim: D, key: string) => {
    if (data) scope.setFilter(toggleFilter(filter, dim, key, data));
  };

  const exports: CsvExport[] = total
    ? (['institution', 'department', 'block', 'date'] as const).map((dim) => ({
        label: { institution: 'By institution', department: 'By department', block: 'By block', date: 'By day' }[dim],
        slug: `by-${dim}`,
        build: () => groupRowsToCsv(rows[dim], dim, total),
      }))
    : [];

  return (
    <ContentLayout title="Hostel Attendance" fullWidth>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Attendance' },
        ]}
      />

      <div className="mt-4 space-y-5 sm:space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Hostel Attendance</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Counts by institution, department and block — click any bar, row or box to filter everything.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:justify-end">
            {canExport && <ExportMenu exports={exports} from={range.from} to={range.to} disabled={!total} />}
            <Button variant="outline" asChild>
              <Link href="/campus-living/attendance/history">
                <Calendar className="mr-2 h-4 w-4" />
                History
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/campus-living/attendance/absentees">
                <UserX className="mr-2 h-4 w-4" />
                Absentees
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/campus-living/analytics/attendance">
                <BarChart3 className="mr-2 h-4 w-4" />
                Learner analytics
              </Link>
            </Button>
            {canMark && (
              <Button asChild>
                <Link href="/campus-living/attendance/mark">
                  <ClipboardCheck className="mr-2 h-4 w-4" />
                  Mark Attendance
                </Link>
              </Button>
            )}
          </div>
        </div>

        <ScopeBar
          today={scope.today}
          period={scope.period}
          day={scope.day}
          customFrom={scope.customFrom}
          customTo={scope.customTo}
          range={range}
          filter={filter}
          data={data}
          onPeriod={scope.setPeriod}
          onDay={scope.setDay}
          onCustom={scope.setCustom}
          onFilter={scope.setFilter}
          onClear={scope.clearFilter}
        />

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Could not load attendance</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : 'Unknown error'}. This is a failure to load, not an empty
              period.
            </AlertDescription>
          </Alert>
        ) : (
          <div className={scope.isPending ? 'space-y-5 opacity-70 transition-opacity sm:space-y-6' : 'space-y-5 sm:space-y-6'}>
            {/* Nothing marked at all is different from "everyone was absent". */}
            {total && total.marks === 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>No attendance marked for this selection</AlertTitle>
                <AlertDescription>
                  The counts below are zero because no roll call was recorded here in this period — not because
                  residents were absent.
                </AlertDescription>
              </Alert>
            )}

            <OverallCards total={total} isLoading={loading} />

            <SectionTitle>Who is where — counts by institution, department and block</SectionTitle>
            <div className="space-y-5 sm:space-y-6">
              <BreakdownPanel
                title="Institution-wise attendance"
                description="Counts and rate for each institution"
                dim="institution"
                rows={rows.institution}
                total={total}
                activeKey={filter.institutionId ?? null}
                isLoading={loading}
                onSelect={(k) => select('institution', k)}
              />
              <BreakdownPanel
                title="Department-wise attendance"
                description="Counts and rate for each department"
                dim="department"
                rows={rows.department}
                total={total}
                activeKey={filter.departmentId ?? null}
                isLoading={loading}
                onSelect={(k) => select('department', k)}
              />
            </div>

            <BreakdownPanel
              title="Block-wise attendance"
              description="Counts and rate for each hostel block"
              dim="block"
              rows={rows.block}
              total={total}
              activeKey={filter.blockId ?? null}
              isLoading={loading}
              onSelect={(k) => select('block', k)}
              rowAction={
                canMark && scope.period === 'day'
                  ? (r) => (
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/campus-living/attendance/mark?block=${r.key}&date=${scope.day}`}>
                          {r.marks > 0 ? 'Update' : 'Mark'}
                        </Link>
                      </Button>
                    )
                  : undefined
              }
            />

            <SectionTitle>Trends and patterns</SectionTitle>
            <TrendPanel data={data} filter={filter} isLoading={loading} />
            <HeatmapPanel data={data} filter={filter} isLoading={loading} onSelect={select} />
            <SectionTitle>Drill down and ranking</SectionTitle>
            <DrilldownPanel data={data} filter={filter} isLoading={loading} onPick={scope.setFilter} />
            <RankingPanel data={data} filter={filter} isLoading={loading} onSelect={select} />
            <SectionTitle>Composition and coverage</SectionTitle>
            <MixCoveragePanel data={data} filter={filter} isLoading={loading} onSelect={select} />
          </div>
        )}
      </div>
    </ContentLayout>
  );
}

export default function AttendanceDashboardPage() {
  // useSearchParams needs a Suspense boundary.
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[300px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <AttendanceDashboard />
    </Suspense>
  );
}
