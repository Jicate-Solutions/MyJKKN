'use client';

// ============================================================================
// OKR Analytics Widgets
// Embeddable dashboard widgets for use in other pages
// ============================================================================

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from 'recharts';
import {
  Target,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import {
  useOKRAnalyticsSummary,
  useOKRProgressTrend,
  useOKRDepartmentComparison,
  useOKRProjections,
} from '@/hooks/okr';
import { format } from 'date-fns';
import Link from 'next/link';

// Colors
const JKKN_GREEN = '#0b6d41';
const STATUS_COLORS = {
  on_track: '#10b981',
  at_risk: '#f59e0b',
  behind: '#ef4444',
};

// ============================================================================
// Mini Progress Trend Widget
// Small sparkline chart showing recent progress
// ============================================================================
interface MiniTrendWidgetProps {
  institutionId: string | undefined;
  departmentId?: string;
  className?: string;
  weeks?: number;
}

export function MiniTrendWidget({
  institutionId,
  departmentId,
  className,
  weeks = 8,
}: MiniTrendWidgetProps) {
  const { data: trendData, isLoading } = useOKRProgressTrend(institutionId, departmentId, weeks);

  if (isLoading) {
    return <Skeleton className={cn('h-16 w-full', className)} />;
  }

  if (!trendData || trendData.length === 0) {
    return null;
  }

  const currentProgress = trendData[trendData.length - 1]?.progress ?? 0;
  const previousProgress = trendData[trendData.length - 2]?.progress ?? 0;
  const trend = currentProgress > previousProgress ? 'up' : currentProgress < previousProgress ? 'down' : 'stable';

  return (
    <Card className={cn('', className)}>
      <CardContent className="pt-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold" style={{ color: JKKN_GREEN }}>
              {currentProgress}%
            </span>
            {trend === 'up' && <TrendingUp className="h-4 w-4 text-emerald-500" />}
            {trend === 'down' && <TrendingDown className="h-4 w-4 text-red-500" />}
          </div>
          <span className="text-xs text-muted-foreground">Avg Progress</span>
        </div>
        <ResponsiveContainer width="100%" height={40}>
          <LineChart data={trendData}>
            <Line
              type="monotone"
              dataKey="progress"
              stroke={JKKN_GREEN}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Summary Stats Widget
// Quick overview of key OKR metrics
// ============================================================================
interface SummaryStatsWidgetProps {
  institutionId: string | undefined;
  departmentId?: string;
  className?: string;
  compact?: boolean;
}

export function SummaryStatsWidget({
  institutionId,
  departmentId,
  className,
  compact = false,
}: SummaryStatsWidgetProps) {
  const { data: summary, isLoading } = useOKRAnalyticsSummary(institutionId, departmentId);

  if (isLoading) {
    return <Skeleton className={cn('h-24 w-full', className)} />;
  }

  if (!summary) {
    return null;
  }

  if (compact) {
    return (
      <div className={cn('flex items-center gap-4', className)}>
        <div className="flex items-center gap-1">
          <Target className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{summary.total_objectives}</span>
        </div>
        <div className="flex items-center gap-1">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span className="font-medium">{summary.milestones_achieved_this_week}</span>
        </div>
        <div className="flex items-center gap-1">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="font-medium">{summary.at_risk_objectives}</span>
        </div>
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">OKR Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold">{summary.total_objectives}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-600">{summary.milestones_achieved_this_week}</p>
            <p className="text-xs text-muted-foreground">Milestones</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-amber-600">{summary.at_risk_objectives}</p>
            <p className="text-xs text-muted-foreground">At Risk</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{summary.check_in_compliance_rate}%</p>
            <p className="text-xs text-muted-foreground">Compliance</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Department Comparison Widget
// Horizontal bar chart comparing departments
// ============================================================================
interface DepartmentComparisonWidgetProps {
  institutionId: string | undefined;
  className?: string;
  maxDepartments?: number;
}

export function DepartmentComparisonWidget({
  institutionId,
  className,
  maxDepartments = 5,
}: DepartmentComparisonWidgetProps) {
  const { data: departmentData, isLoading } = useOKRDepartmentComparison(institutionId);

  if (isLoading) {
    return <Skeleton className={cn('h-48 w-full', className)} />;
  }

  if (!departmentData || departmentData.length === 0) {
    return null;
  }

  const topDepartments = departmentData.slice(0, maxDepartments);

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Department Progress</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={topDepartments.length * 40}>
          <BarChart data={topDepartments} layout="vertical">
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis
              type="category"
              dataKey="department_name"
              width={80}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
              formatter={(value) => [`${value ?? 0}%`, 'Progress']}
            />
            <Bar dataKey="avg_progress" radius={[0, 4, 4, 0]}>
              {topDepartments.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    entry.avg_progress >= 70
                      ? STATUS_COLORS.on_track
                      : entry.avg_progress >= 50
                      ? STATUS_COLORS.at_risk
                      : STATUS_COLORS.behind
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <Link
          href="/okr/analytics"
          className="text-xs text-primary hover:underline block text-right mt-2"
        >
          View all departments →
        </Link>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// At Risk Alert Widget
// Shows top at-risk OKRs that need attention
// ============================================================================
interface AtRiskAlertWidgetProps {
  institutionId: string | undefined;
  departmentId?: string;
  className?: string;
  maxItems?: number;
}

export function AtRiskAlertWidget({
  institutionId,
  departmentId,
  className,
  maxItems = 3,
}: AtRiskAlertWidgetProps) {
  const { data: projections, isLoading } = useOKRProjections(institutionId, departmentId);

  if (isLoading) {
    return <Skeleton className={cn('h-32 w-full', className)} />;
  }

  const atRiskOKRs = projections?.filter((p) => p.status !== 'on_track').slice(0, maxItems) || [];

  if (atRiskOKRs.length === 0) {
    return (
      <Card className={cn('border-emerald-200 bg-emerald-50/50', className)}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <div>
              <p className="font-medium">All OKRs On Track</p>
              <p className="text-sm text-muted-foreground">No immediate attention needed</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('border-amber-200', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-600">
          <AlertTriangle className="h-4 w-4" />
          Needs Attention ({atRiskOKRs.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {atRiskOKRs.map((okr) => (
            <div
              key={okr.objective_id}
              className="flex items-center justify-between p-2 rounded bg-amber-50"
            >
              <span className="text-sm truncate max-w-[180px]">{okr.title}</span>
              <Badge variant="secondary" className="text-xs">
                {okr.current_progress}%
              </Badge>
            </div>
          ))}
        </div>
        <Link
          href="/okr/analytics?tab=projections"
          className="text-xs text-primary hover:underline block text-right mt-2"
        >
          View all projections →
        </Link>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Compliance Rate Widget
// Shows check-in compliance rate with visual indicator
// ============================================================================
interface ComplianceRateWidgetProps {
  institutionId: string | undefined;
  departmentId?: string;
  className?: string;
}

export function ComplianceRateWidget({
  institutionId,
  departmentId,
  className,
}: ComplianceRateWidgetProps) {
  const { data: summary, isLoading } = useOKRAnalyticsSummary(institutionId, departmentId);

  if (isLoading) {
    return <Skeleton className={cn('h-20 w-full', className)} />;
  }

  const rate = summary?.check_in_compliance_rate ?? 0;
  const blockedCount = summary?.blocked_users_count ?? 0;

  return (
    <Card className={className}>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Check-in Compliance</span>
          </div>
          <span
            className={cn(
              'text-lg font-bold',
              rate >= 90 ? 'text-emerald-600' : rate >= 70 ? 'text-amber-600' : 'text-red-600'
            )}
          >
            {rate}%
          </span>
        </div>
        <Progress
          value={rate}
          className={cn(
            'h-2',
            rate >= 90 ? '[&>div]:bg-emerald-500' : rate >= 70 ? '[&>div]:bg-amber-500' : '[&>div]:bg-red-500'
          )}
        />
        {blockedCount > 0 && (
          <p className="text-xs text-amber-600 mt-2">
            {blockedCount} user{blockedCount !== 1 ? 's' : ''} blocked
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Quick Actions Widget
// Mini widget with link to analytics dashboard
// ============================================================================
export function AnalyticsQuickLink({ className }: { className?: string }) {
  return (
    <Link href="/okr/analytics">
      <Card className={cn('hover:border-primary transition-colors cursor-pointer', className)}>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full" style={{ backgroundColor: JKKN_GREEN }}>
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-medium text-sm">View Analytics</p>
              <p className="text-xs text-muted-foreground">Detailed dashboards & reports</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
