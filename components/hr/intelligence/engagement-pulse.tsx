'use client';

/**
 * HR Intelligence — Tab 11: Engagement Pulse
 *
 * Surfaces employee engagement indicators: leave patterns (as proxy
 * for burnout), attendance consistency, and long-tenure retention.
 * Queries hr_leave_applications and staff for engagement proxies.
 * Full engagement surveys are a future feature.
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

function useEngagementProxies() {
  return useQuery({
    queryKey: ['hr-intelligence', 'engagement-pulse'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();

      // Fetch recent leave applications as engagement proxy
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      const { data: leaves, error: leaveErr } = await supabase
        .from('hr_leave_applications')
        .select('id, employee_id, leave_type_id, status, start_date, end_date, hr_organization_id')
        .gte('start_date', threeMonthsAgo.toISOString().split('T')[0])
        .order('start_date', { ascending: false })
        .limit(500);

      if (leaveErr) throw leaveErr;

      // Fetch active staff count
      const { count: staffCount, error: staffErr } = await supabase
        .from('staff')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);

      if (staffErr) throw staffErr;

      return {
        leaves: (leaves ?? []) as LeaveApplicationRow[],
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

    const { leaves, activeStaffCount } = data;
    const approvedLeaves = leaves.filter((l) => l.status === 'approved');
    const pendingLeaves = leaves.filter((l) => l.status === 'pending');
    const rejectedLeaves = leaves.filter((l) => l.status === 'rejected');

    // Unique employees who took leave in last 3 months
    const uniqueLeaveEmployees = new Set(approvedLeaves.map((l) => l.employee_id)).size;
    const leaveUtilizationRate = (uniqueLeaveEmployees / activeStaffCount) * 100;

    // Leave frequency per employee (high frequency = potential burnout signal)
    const employeeLeaveCounts: Record<string, number> = {};
    for (const l of approvedLeaves) {
      employeeLeaveCounts[l.employee_id] = (employeeLeaveCounts[l.employee_id] ?? 0) + 1;
    }
    const frequentLeaveTakers = Object.values(employeeLeaveCounts).filter((c) => c >= 3).length;

    return {
      activeStaffCount,
      totalLeaves: leaves.length,
      approvedCount: approvedLeaves.length,
      pendingCount: pendingLeaves.length,
      rejectedCount: rejectedLeaves.length,
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
            <p className="text-xs text-muted-foreground mt-1">Awaiting approval</p>
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
          <CardDescription>Leave status distribution as an engagement proxy</CardDescription>
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
