'use client';

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useAttendanceDashboardAnalytics } from '@/hooks/campus-living/use-attendance-analytics';
import { AttendanceScopeBar, periodToRange } from './_components/scope-bar';
import { CoveragePanel } from './_components/coverage-panel';
import { KpiCards } from './_components/kpi-cards';
import { AttendanceTrendChart } from './_components/trend-chart';
import { BlockBreakdown } from './_components/block-breakdown';
import { WeekdayChart } from './_components/weekday-chart';
import { AtRiskTable } from './_components/at-risk-table';

/**
 * Hostel attendance analytics.
 *
 * Replaces the previous placeholder (a single trend line, four cards and three
 * dashed boxes under a PreviewBanner). Aggregation now happens in Postgres via
 * fn_cl_attendance_dashboard / fn_cl_attendance_learners rather than by pulling
 * every raw row into the browser.
 *
 * Two deliberate omissions carried over from the research:
 *   - No check-in-time histogram and no curfew panel. check_in_time,
 *     late_minutes and is_curfew_violation are empty on every production row,
 *     so those panels could only ever have displayed zeros as if they were
 *     findings.
 *   - Coverage leads the page. Every rate here is over MARKED learners, and a
 *     third of residents have never been marked, so the denominator has to be
 *     visible or the headline number quietly misrepresents the group.
 *
 * Page is thin on purpose (bed-economics pattern): scope state plus section
 * composition, each section owning its own loading and error state.
 */
export default function AttendanceAnalyticsPage() {
  const { profile } = useAuth();
  const { isLoading: permsLoading } = usePermissions();
  const institutionId = profile?.institution_id ?? '';

  const [period, setPeriod] = useState('30d');
  const [blockId, setBlockId] = useState('all');
  const preset = useMemo(() => periodToRange(period), [period]);
  const [customFrom, setCustomFrom] = useState(preset.from);
  const [customTo, setCustomTo] = useState(preset.to);

  const { from, to } = period === 'custom' ? { from: customFrom, to: customTo } : preset;
  // 'all' is a UI sentinel, never a filter value — passing it through would
  // reach Postgres as a uuid parameter and match zero rows.
  const blockArg = blockId === 'all' ? null : blockId;

  const { data, isLoading, error } = useAttendanceDashboardAnalytics(
    institutionId,
    from,
    to,
    blockArg,
  );

  // The queries stay disabled until the viewer's scope resolves, and a disabled
  // query reports isLoading:false — so gate on permsLoading too (BUG-005831).
  const loading = isLoading || permsLoading;

  return (
    <ContentLayout title="Attendance Analytics">
      <div className="space-y-6">
        <AttendanceScopeBar
          institutionId={institutionId}
          period={period}
          onPeriodChange={setPeriod}
          from={customFrom}
          to={customTo}
          onFromChange={setCustomFrom}
          onToChange={setCustomTo}
          blockId={blockId}
          onBlockChange={setBlockId}
        />

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not load attendance analytics</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : permsLoading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <CoveragePanel
              coverage={data?.coverage ?? []}
              coverageVisible={data?.coverage_visible ?? false}
              isLoading={loading}
            />

            <KpiCards kpis={data?.kpis} isLoading={loading} />

            <AttendanceTrendChart trend={data?.trend ?? []} isLoading={loading} />

            <div className="grid gap-6 lg:grid-cols-2">
              <BlockBreakdown rows={data?.by_block ?? []} isLoading={loading} />
              <WeekdayChart rows={data?.weekday ?? []} isLoading={loading} />
            </div>

            <AtRiskTable
              institutionId={institutionId}
              from={from}
              to={to}
              blockId={blockArg}
            />
          </>
        )}
      </div>
    </ContentLayout>
  );
}
