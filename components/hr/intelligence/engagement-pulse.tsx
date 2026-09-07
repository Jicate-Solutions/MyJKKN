'use client';

/**
 * HR Intelligence — Tab 11: Engagement Pulse
 *
 * Surfaces employee engagement indicators: leave patterns (as proxy
 * for burnout), attendance consistency, and long-tenure retention.
 * Queries hr_leave_applications and staff for engagement proxies.
 * Full engagement surveys are a future feature.
 *
 * WHY THE BACKLOG IS SPLIT OUT AND NOT COUNTED AS ENGAGEMENT.
 * A pending request whose start_date has already passed is not a person
 * waiting on a decision — the time off was taken and no approval was ever
 * recorded against it. That is an approval-control gap, not a wellbeing
 * signal, so it is rendered in its own panel with its own wording rather
 * than folded into the amber "pending" bar, where it read as neutral.
 * Measured on production 2026-09-05: 892 pending, 885 of them already
 * started.
 *
 * WHY EXACT COUNTS RATHER THAN COUNTING THE FETCHED ROWS.
 * This tab used to derive every figure from one `.limit(500)` fetch. All
 * 1,215 live applications fall inside the three-month window, so that cap
 * truncated: the screen showed 387 pending against 892 actual, and the bar
 * percentages were computed over 500 rows instead of 1,215. Status figures
 * are now exact head-counts, which stay correct however large the table
 * grows. Rows are still fetched — but only the approved ones, which are the
 * only rows the per-employee burnout maths actually reads.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Zap,
  AlertCircle,
  TrendingUp,
  Calendar,
  Users,
  Heart,
  MessageSquare,
  BarChart3,
  ShieldAlert,
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface LeaveApplicationRow {
  id: string;
  employee_id: string;
  leave_type_id: string;
  status: string;
  start_date: string;
  end_date: string;
  hr_organization_id: string;
}

/** Local calendar date as YYYY-MM-DD. Not toISOString(), which is UTC and
 *  would misfile a request starting today as "already started" in IST. */
function localISODate(d: Date): string {
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

const APPROVED_SAMPLE_LIMIT = 1000;

function useEngagementProxies() {
  return useQuery({
    queryKey: ['hr-intelligence', 'engagement-pulse'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();

      const today = localISODate(new Date());
      const threeMonthsAgoDate = new Date();
      threeMonthsAgoDate.setMonth(threeMonthsAgoDate.getMonth() - 3);
      const windowStart = localISODate(threeMonthsAgoDate);

      // Exact head-counts. These are the figures people quote, so they must not
      // depend on how many rows a page-limited fetch happened to return.
      const baseCount = () =>
        supabase
          .from('hr_leave_applications')
          .select('id', { count: 'exact', head: true })
          .gte('start_date', windowStart);

      const [totalRes, pendingRes, approvedRes, rejectedRes, backlogRes] = await Promise.all([
        baseCount(),
        baseCount().eq('status', 'pending'),
        baseCount().eq('status', 'approved'),
        baseCount().eq('status', 'rejected'),
        // Already started, still awaiting a decision — the control gap.
        baseCount().eq('status', 'pending').lt('start_date', today),
      ]);

      for (const res of [totalRes, pendingRes, approvedRes, rejectedRes, backlogRes]) {
        if (res.error) throw res.error;
      }

      // Only approved rows are read per-employee (leave utilization + burnout
      // frequency), so only approved rows are fetched.
      const { data: approvedLeaves, error: leaveErr } = await supabase
        .from('hr_leave_applications')
        .select('id, employee_id, leave_type_id, status, start_date, end_date, hr_organization_id')
        .eq('status', 'approved')
        .gte('start_date', windowStart)
        .order('start_date', { ascending: false })
        .limit(APPROVED_SAMPLE_LIMIT);

      if (leaveErr) throw leaveErr;

      // Fetch active staff count
      const { count: staffCount, error: staffErr } = await supabase
        .from('staff')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);

      if (staffErr) throw staffErr;

      const approvedRows = (approvedLeaves ?? []) as LeaveApplicationRow[];

      return {
        approvedRows,
        approvedSampleTruncated: approvedRows.length >= APPROVED_SAMPLE_LIMIT,
        totalCount: totalRes.count ?? 0,
        pendingCount: pendingRes.count ?? 0,
        approvedCount: approvedRes.count ?? 0,
        rejectedCount: rejectedRes.count ?? 0,
        backlogCount: backlogRes.count ?? 0,
        activeStaffCount: staffCount ?? 0,
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function EngagementPulseTab() {
  const { data, isLoading, isError } = useEngagementProxies();

  const metrics = useMemo(() => {
    if (!data || data.activeStaffCount === 0) return null;

    const { approvedRows, activeStaffCount } = data;

    // Unique employees who took leave in last 3 months
    const uniqueLeaveEmployees = new Set(approvedRows.map((l) => l.employee_id)).size;
    const leaveUtilizationRate = (uniqueLeaveEmployees / activeStaffCount) * 100;

    // Leave frequency per employee (high frequency = potential burnout signal)
    const employeeLeaveCounts: Record<string, number> = {};
    for (const l of approvedRows) {
      employeeLeaveCounts[l.employee_id] = (employeeLeaveCounts[l.employee_id] ?? 0) + 1;
    }
    const frequentLeaveTakers = Object.values(employeeLeaveCounts).filter((c) => c >= 3).length;

    // Pending requests split by whether the time off has already been taken.
    const awaitingNotYetStarted = Math.max(0, data.pendingCount - data.backlogCount);

    return {
      activeStaffCount,
      totalLeaves: data.totalCount,
      approvedCount: data.approvedCount,
      pendingCount: data.pendingCount,
      rejectedCount: data.rejectedCount,
      backlogCount: data.backlogCount,
      awaitingNotYetStarted,
      approvedSampleTruncated: data.approvedSampleTruncated,
      uniqueLeaveEmployees,
      leaveUtilizationRate,
      frequentLeaveTakers,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-20" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Failed to load engagement data.
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Engagement Pulse
          </CardTitle>
          <CardDescription>
            Employee engagement indicators derived from leave patterns, attendance, and retention signals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
            <Heart className="h-12 w-12 mb-4 text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-muted-foreground">No Engagement Data Yet</p>
            <p className="text-xs mt-1 text-muted-foreground opacity-75 max-w-md text-center">
              Once staff records and leave applications are available, this tab will show
              engagement proxies including leave utilization, burnout risk indicators, and retention signals.
            </p>
            <Badge variant="outline" className="mt-4 text-xs">
              Requires: Active staff + leave application data
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Approval control gap — deliberately outside the engagement stat row.
          Time off that was taken with no approval recorded is a control
          finding, not a wellbeing signal. */}
      {metrics.backlogCount > 0 && (
        <Card className="border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-700 dark:text-amber-400" />
              Taken Without Approval
            </CardTitle>
            <CardDescription>
              Approval control gap — not an engagement measure.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-3xl font-bold text-amber-700 dark:text-amber-400">
                {metrics.backlogCount}
              </span>
              <span className="text-sm text-muted-foreground">
                time-off requests from team members started before today and are still awaiting a decision.
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              The time off has already been taken; no approval is on record against it.
              {metrics.awaitingNotYetStarted > 0 && (
                <>
                  {' '}A further {metrics.awaitingNotYetStarted} request
                  {metrics.awaitingNotYetStarted === 1 ? '' : 's'} start
                  {metrics.awaitingNotYetStarted === 1 ? 's' : ''} in the future and
                  {metrics.awaitingNotYetStarted === 1 ? ' is' : ' are'} genuinely awaiting approval.
                </>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Active Staff
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.activeStaffCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Currently active employees</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Leave Utilization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.leaveUtilizationRate.toFixed(0)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.uniqueLeaveEmployees} of {metrics.activeStaffCount} took leave (3 mo)
              {metrics.approvedSampleTruncated && ' — capped, read as a minimum'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              Pending Applications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{metrics.pendingCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.backlogCount} already taken, {metrics.awaitingNotYetStarted} not yet started
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-red-500" />
              Burnout Risk
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{metrics.frequentLeaveTakers}</div>
            <p className="text-xs text-muted-foreground mt-1">Staff with 3+ leaves in 3 months</p>
          </CardContent>
        </Card>
      </div>

      {/* Leave pattern summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Leave Application Summary (Last 3 Months)
          </CardTitle>
          <CardDescription>
            Status distribution across all {metrics.totalLeaves} requests in the window. Pending is a
            processing state, not an engagement measure — see the approval control gap above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { label: 'Approved', count: metrics.approvedCount, color: 'bg-green-500' },
              { label: 'Pending', count: metrics.pendingCount, color: 'bg-amber-500' },
              { label: 'Rejected', count: metrics.rejectedCount, color: 'bg-red-500' },
            ].map(({ label, count, color }) => {
              const pct = metrics.totalLeaves > 0 ? (count / metrics.totalLeaves) * 100 : 0;
              return (
                <div key={label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{label}</span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{count} applications</span>
                      <span className="font-medium text-foreground">{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${color} transition-all duration-300`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Future features */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Planned Engagement Features
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { title: 'Pulse Surveys', desc: 'Quick weekly sentiment checks via push notifications' },
              { title: 'eNPS Tracking', desc: 'Employee Net Promoter Score over time' },
              { title: 'Exit Interview Analysis', desc: 'Sentiment trends from departing staff' },
            ].map((feature) => (
              <div key={feature.title} className="p-3 border rounded-lg bg-muted/30">
                <p className="text-sm font-medium">{feature.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{feature.desc}</p>
                <Badge variant="outline" className="mt-2 text-[10px]">Planned</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
