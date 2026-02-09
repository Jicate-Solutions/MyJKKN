'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  useSolutionDepartment,
  useDepartmentStatusHistory,
  useDepartmentTargets,
} from '@/hooks/use-department-tracker';
import { DepartmentTrackerService, type DepartmentSolution } from '@/lib/services/solutions/department-tracker-service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import { ArrowLeft, Calendar, TrendingUp, DollarSign, Target, Activity, Users, Building } from 'lucide-react';
import type { DepartmentStatus, DepartmentStatusHistory } from '@/hooks/use-department-tracker';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);

function getStatusBadge(status: DepartmentStatus) {
  switch (status) {
    case 'active':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-200 border-0">Active</Badge>;
    case 'at_risk':
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 border-0">At Risk</Badge>;
    case 'dormant':
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-200 border-0">Dormant</Badge>;
    case 'pending_approval':
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 border-0">Pending</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getStatusDotColor(status: string) {
  switch (status) {
    case 'active': return 'bg-green-500';
    case 'at_risk': return 'bg-amber-500';
    case 'dormant': return 'bg-red-500';
    case 'pending_approval': return 'bg-blue-500';
    default: return 'bg-gray-400';
  }
}

function getDaysSinceLastRevenue(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function getQuarterDateRange(quarter: string): { start: string; end: string } {
  const [yearStr, qStr] = quarter.split('-Q');
  const year = Number(yearStr);
  const q = Number(qStr);
  const start = new Date(year, (q - 1) * 3, 1).toISOString();
  const end = new Date(year, q * 3, 0, 23, 59, 59).toISOString();
  return { start, end };
}

function getCurrentQuarter(): string {
  const now = new Date();
  return `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
}

function getMonthDateRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
  return { start, end };
}

function getYearDateRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1).toISOString();
  const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59).toISOString();
  return { start, end };
}

interface DepartmentDetailClientProps {
  id: string;
}

export function DepartmentDetailClient({ id }: DepartmentDetailClientProps) {
  const router = useRouter();
  const { department, loading: deptLoading, error: deptError } = useSolutionDepartment(id);
  const { history, loading: historyLoading } = useDepartmentStatusHistory(department?.id ?? null);
  const { targets, loading: targetsLoading } = useDepartmentTargets(department?.id ?? null);

  // Revenue states
  const [monthRevenue, setMonthRevenue] = useState<number | null>(null);
  const [quarterRevenue, setQuarterRevenue] = useState<number | null>(null);
  const [yearRevenue, setYearRevenue] = useState<number | null>(null);
  const [allTimeRevenue, setAllTimeRevenue] = useState<number | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(true);

  // Solutions pipeline
  const [solutions, setSolutions] = useState<DepartmentSolution[]>([]);
  const [solutionsLoading, setSolutionsLoading] = useState(true);

  // Quarterly revenue trend
  const [quarterlyData, setQuarterlyData] = useState<{ quarter: string; revenue: number }[]>([]);
  const [quarterlyLoading, setQuarterlyLoading] = useState(true);

  // Peer comparison
  const [peerData, setPeerData] = useState<{
    rank: number;
    totalDepartments: number;
    percentile: number;
    growthRate: number | null;
  } | null>(null);
  const [peerLoading, setPeerLoading] = useState(true);

  // Load revenue data once we have the department
  useEffect(() => {
    if (!department?.department_id) return;

    const loadRevenue = async () => {
      setRevenueLoading(true);
      try {
        const deptId = department.department_id;

        const monthRange = getMonthDateRange();
        const quarterRange = getQuarterDateRange(getCurrentQuarter());
        const yearRange = getYearDateRange();

        const [month, quarter, year, allTime] = await Promise.all([
          DepartmentTrackerService.getDepartmentRevenue(deptId, monthRange.start, monthRange.end),
          DepartmentTrackerService.getDepartmentRevenue(deptId, quarterRange.start, quarterRange.end),
          DepartmentTrackerService.getDepartmentRevenue(deptId, yearRange.start, yearRange.end),
          DepartmentTrackerService.getDepartmentRevenue(deptId),
        ]);

        setMonthRevenue(month);
        setQuarterRevenue(quarter);
        setYearRevenue(year);
        setAllTimeRevenue(allTime);
      } catch (err) {
        console.error('[solutions/department-detail] Failed to load revenue:', err);
        setMonthRevenue(0);
        setQuarterRevenue(0);
        setYearRevenue(0);
        setAllTimeRevenue(0);
      } finally {
        setRevenueLoading(false);
      }
    };

    loadRevenue();
  }, [department?.department_id]);

  // Load solutions pipeline
  useEffect(() => {
    if (!department?.department_id) return;

    const loadSolutions = async () => {
      setSolutionsLoading(true);
      try {
        const data = await DepartmentTrackerService.getDepartmentSolutions(department.department_id);
        setSolutions(data);
      } catch (err) {
        console.error('[solutions/department-detail] Failed to load solutions:', err);
        setSolutions([]);
      } finally {
        setSolutionsLoading(false);
      }
    };

    loadSolutions();
  }, [department?.department_id]);

  // Loading state
  if (deptLoading) {
    return (
      <div className="space-y-6 mt-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  // Error state
  if (deptError || !department) {
    return (
      <div className="mt-4">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-destructive">
              {deptError || 'Department not found.'}
            </p>
            <button
              onClick={() => router.push('/solutions/departments')}
              className="mt-4 text-sm text-primary hover:underline"
            >
              Back to Departments
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const daysSinceRevenue = getDaysSinceLastRevenue(department.last_revenue_at);
  const currentQuarter = getCurrentQuarter();
  const currentTarget = targets.find((t) => t.quarter === currentQuarter);
  const targetAmount = currentTarget?.target_revenue ?? 0;
  const achievementPct = targetAmount > 0 && quarterRevenue !== null ? (quarterRevenue / targetAmount) * 100 : 0;

  return (
    <div className="space-y-6 mt-4">
      {/* Back button + Header */}
      <div>
        <button
          onClick={() => router.push('/solutions/departments')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Departments
        </button>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">
            {department.department?.department_name || 'Unknown Department'}
          </h1>
          {getStatusBadge(department.status)}
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
          <span>{department.institution?.name || 'Unknown Institution'}</span>
          {department.department?.department_code && (
            <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
              {department.department.department_code}
            </span>
          )}
          {daysSinceRevenue !== null && (
            <span className={`flex items-center gap-1 ${daysSinceRevenue > 60 ? 'text-red-600' : daysSinceRevenue > 30 ? 'text-amber-600' : 'text-green-600'}`}>
              <Calendar className="h-3.5 w-3.5" />
              {daysSinceRevenue === 0 ? 'Revenue today' : `${daysSinceRevenue} days since last revenue`}
            </span>
          )}
          {daysSinceRevenue === null && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              No revenue recorded
            </span>
          )}
        </div>
      </div>

      {/* Revenue Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <RevenueCard
          title="This Month"
          amount={monthRevenue}
          loading={revenueLoading}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        />
        <RevenueCard
          title="This Quarter"
          amount={quarterRevenue}
          loading={revenueLoading}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
        />
        <RevenueCard
          title="This Year"
          amount={yearRevenue}
          loading={revenueLoading}
          icon={<Target className="h-4 w-4 text-muted-foreground" />}
        />
        <RevenueCard
          title="All Time"
          amount={allTimeRevenue}
          loading={revenueLoading}
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      {/* Target Progress */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quarterly Target Progress ({currentQuarter})</CardTitle>
        </CardHeader>
        <CardContent>
          {targetsLoading || revenueLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-2 w-full" />
            </div>
          ) : targetAmount > 0 ? (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {formatCurrency(quarterRevenue ?? 0)} of {formatCurrency(targetAmount)}
                </span>
                <span className={`font-medium ${achievementPct >= 100 ? 'text-green-600' : achievementPct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                  {achievementPct.toFixed(1)}%
                </span>
              </div>
              <Progress
                value={Math.min(achievementPct, 100)}
                className="h-3"
                indicatorClassName={
                  achievementPct >= 100 ? 'bg-green-500' : achievementPct >= 50 ? 'bg-amber-500' : 'bg-red-500'
                }
              />
              {currentTarget?.notes && (
                <p className="text-xs text-muted-foreground mt-1">Note: {currentTarget.notes}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No target set for this quarter.</p>
          )}
        </CardContent>
      </Card>

      {/* Solutions Pipeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Active Solutions Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {solutionsLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : solutions.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No active solutions for this department.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Solution</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>Target</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {solutions.map((sol) => (
                    <TableRow key={sol.id}>
                      <TableCell className="font-medium">
                        <div>
                          <div>{sol.title}</div>
                          {sol.solution_code && (
                            <div className="text-xs text-muted-foreground font-mono">{sol.solution_code}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{sol.client?.name || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">
                          {(sol.status || '').replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm capitalize">{(sol.solution_type || '').replace(/_/g, ' ')}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {sol.final_price ? formatCurrency(Number(sol.final_price)) : '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {sol.start_date ? new Date(sol.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {sol.target_date ? new Date(sol.target_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status History Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Status History</CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-4 w-4 rounded-full flex-shrink-0" />
                  <div className="space-y-1 flex-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No status changes recorded.</p>
          ) : (
            <StatusTimeline history={history} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Sub-components ----

function RevenueCard({
  title,
  amount,
  loading,
  icon,
}: {
  title: string;
  amount: number | null;
  loading: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">{title}</span>
          {icon}
        </div>
        {loading ? (
          <Skeleton className="h-7 w-28" />
        ) : (
          <p className="text-2xl font-bold">{formatCurrency(amount ?? 0)}</p>
        )}
      </CardContent>
    </Card>
  );
}

function StatusTimeline({ history }: { history: DepartmentStatusHistory[] }) {
  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border" />

      <div className="space-y-5">
        {history.map((entry) => (
          <div key={entry.id} className="flex gap-3 relative">
            {/* Dot */}
            <div className={`mt-1 h-4 w-4 rounded-full flex-shrink-0 border-2 border-background z-10 ${getStatusDotColor(entry.new_status)}`} />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {entry.previous_status && (
                  <>
                    <span className="capitalize text-muted-foreground">
                      {entry.previous_status.replace(/_/g, ' ')}
                    </span>
                    <span className="text-muted-foreground">&rarr;</span>
                  </>
                )}
                <span className="font-medium capitalize">
                  {entry.new_status.replace(/_/g, ' ')}
                </span>
              </div>

              {entry.reason && (
                <p className="text-xs text-muted-foreground mt-0.5">{entry.reason}</p>
              )}

              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(entry.changed_at).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
