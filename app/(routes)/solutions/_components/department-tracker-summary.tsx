'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Building2,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import {
  useDepartmentSummary,
  useDepartmentLeaderboard,
  useSolutionDepartments,
  useQuarterlyTrend,
} from '@/hooks/use-department-tracker';

// ============================================
// HELPERS
// ============================================

function getCurrentQuarter(): string {
  const now = new Date();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${quarter}`;
}

function generateQuarterOptions(count: number = 6): { label: string; value: string }[] {
  const now = new Date();
  const currentQ = Math.ceil((now.getMonth() + 1) / 3);
  const currentYear = now.getFullYear();
  const options: { label: string; value: string }[] = [];

  for (let i = 0; i < count; i++) {
    let q = currentQ - i;
    let y = currentYear;
    while (q <= 0) {
      q += 4;
      y--;
    }
    const value = `${y}-Q${q}`;
    options.push({ label: value, value });
  }

  return options;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCompactCurrency(amount: number): string {
  if (amount >= 10000000) return `${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
  return String(amount);
}

const statusColor: Record<string, string> = {
  active: 'bg-emerald-500',
  at_risk: 'bg-amber-500',
  dormant: 'bg-red-500',
  pending_approval: 'bg-gray-400',
};

const statusBorder: Record<string, string> = {
  active: 'border-emerald-500/30',
  at_risk: 'border-amber-500/30',
  dormant: 'border-red-500/30',
  pending_approval: 'border-gray-400/30',
};

// ============================================
// SUB-COMPONENTS
// ============================================

function StatusCountCards({ summary, loading }: {
  summary: { active: number; at_risk: number; dormant: number } | null;
  loading: boolean;
}) {
  const cards = [
    {
      label: 'Active',
      count: summary?.active ?? 0,
      icon: CheckCircle2,
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
      border: 'border-emerald-200 dark:border-emerald-800',
      text: 'text-emerald-700 dark:text-emerald-400',
      iconColor: 'text-emerald-600',
      href: '/solutions/departments?status=active',
    },
    {
      label: 'At Risk',
      count: summary?.at_risk ?? 0,
      icon: AlertTriangle,
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      border: 'border-amber-200 dark:border-amber-800',
      text: 'text-amber-700 dark:text-amber-400',
      iconColor: 'text-amber-600',
      href: '/solutions/departments?status=at_risk',
    },
    {
      label: 'Dormant',
      count: summary?.dormant ?? 0,
      icon: XCircle,
      bg: 'bg-red-50 dark:bg-red-950/30',
      border: 'border-red-200 dark:border-red-800',
      text: 'text-red-700 dark:text-red-400',
      iconColor: 'text-red-600',
      href: '/solutions/departments?status=dormant',
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Link key={card.label} href={card.href}>
            <div
              className={`rounded-lg border p-3 ${card.bg} ${card.border} hover:shadow-md transition-shadow cursor-pointer`}
            >
              <div className="flex items-center justify-between">
                <Icon className={`h-4 w-4 ${card.iconColor}`} />
                {loading ? (
                  <Skeleton className="h-7 w-10" />
                ) : (
                  <span className={`text-2xl font-bold ${card.text}`}>
                    {card.count}
                  </span>
                )}
              </div>
              <p className={`text-xs font-medium mt-1 ${card.text}`}>
                {card.label}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function RevenueLeaderboard({ loading, quarter }: { loading: boolean; quarter?: string }) {
  const { leaderboard, loading: lbLoading } = useDepartmentLeaderboard(5, quarter);
  const isLoading = loading || lbLoading;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium">
          Revenue Leaderboard
        </CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/solutions/departments" className="text-xs">
            View All
            <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))
        ) : leaderboard.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No revenue data yet
          </p>
        ) : (
          leaderboard.map((item, idx) => (
            <Link
              key={item.department_id}
              href={`/solutions/departments?highlight=${item.department_id}`}
              className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors group"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                  {item.department_name}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {item.institution_name}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold">
                  {formatCurrency(item.revenue)}
                </p>
                {item.growth_rate !== null && (
                  <Badge
                    variant="secondary"
                    className={`text-[10px] px-1.5 py-0 ${
                      item.growth_rate >= 0
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                    }`}
                  >
                    {item.growth_rate >= 0 ? (
                      <TrendingUp className="h-2.5 w-2.5 mr-0.5 inline" />
                    ) : (
                      <TrendingDown className="h-2.5 w-2.5 mr-0.5 inline" />
                    )}
                    {Math.abs(item.growth_rate).toFixed(0)}%
                  </Badge>
                )}
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function HealthGrid({ loading }: { loading: boolean }) {
  const { departments, loading: deptLoading } = useSolutionDepartments();
  const isLoading = loading || deptLoading;

  // Group departments by institution
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; departments: typeof departments }>();
    departments.forEach((dept) => {
      const instId = dept.institution_id;
      const instName = dept.institution?.name || 'Unknown';
      if (!map.has(instId)) {
        map.set(instId, { name: instName, departments: [] });
      }
      map.get(instId)!.departments.push(dept);
    });
    // Sort groups by name
    return Array.from(map.entries()).sort((a, b) =>
      a[1].name.localeCompare(b[1].name)
    );
  }, [departments]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            Department Health Grid
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-3 w-24 mb-1.5" />
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <Skeleton key={j} className="h-5 w-5 rounded" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium">
          Department Health Grid
        </CardTitle>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />
            Active
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" />
            At Risk
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" />
            Dormant
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No departments tracked yet
          </p>
        ) : (
          <TooltipProvider delayDuration={100}>
            <div className="space-y-3">
              {grouped.map(([instId, group]) => (
                <div key={instId}>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                    {group.name}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {group.departments.map((dept) => (
                      <Tooltip key={dept.id}>
                        <TooltipTrigger asChild>
                          <Link href={`/solutions/departments/${dept.id}`}>
                            <div
                              className={`h-5 w-5 rounded cursor-pointer border ${statusColor[dept.status]} ${statusBorder[dept.status]} opacity-90 hover:opacity-100 hover:scale-110 transition-all`}
                            />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <p className="font-medium">
                            {dept.department?.department_name || 'Unknown'}
                          </p>
                          <p className="text-[10px] capitalize">
                            {dept.status.replace('_', ' ')}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}

function TrendChart({ loading }: { loading: boolean }) {
  const { trend, loading: trendLoading } = useQuarterlyTrend(4);
  const isLoading = loading || trendLoading;

  // Format chart data
  const chartData = useMemo(
    () =>
      trend.map((t) => ({
        quarter: t.quarter,
        revenue: t.revenue,
        activeDepts: t.active_count,
      })),
    [trend]
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Quarterly Trend</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No trend data available
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="quarter"
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
              />
              <YAxis
                yAxisId="revenue"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatCompactCurrency(v)}
                className="text-muted-foreground"
              />
              <YAxis
                yAxisId="count"
                orientation="right"
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
                allowDecimals={false}
              />
              <RechartsTooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: '1px solid hsl(var(--border))',
                  background: 'hsl(var(--card))',
                  color: 'hsl(var(--card-foreground))',
                }}
                formatter={(value: number, name: string) => {
                  if (name === 'revenue') return [formatCurrency(value), 'Revenue'];
                  return [value, 'Active Depts'];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                formatter={(value: string) =>
                  value === 'revenue' ? 'Revenue' : 'Active Depts'
                }
              />
              <Line
                yAxisId="revenue"
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                yAxisId="count"
                type="monotone"
                dataKey="activeDepts"
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="4 2"
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function DepartmentTrackerSummary() {
  const { summary, loading: summaryLoading } = useDepartmentSummary();

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Department Tracker</h2>
          {!summaryLoading && summary && (
            <Badge variant="secondary" className="text-xs">
              {summary.total} departments
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/solutions/departments">
            <Building2 className="mr-2 h-3.5 w-3.5" />
            All Departments
          </Link>
        </Button>
      </div>

      {/* Status Cards */}
      <StatusCountCards summary={summary} loading={summaryLoading} />

      {/* Two-column layout: Leaderboard + Health Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <RevenueLeaderboard loading={summaryLoading} />
        <HealthGrid loading={summaryLoading} />
      </div>

      {/* Trend Chart */}
      <TrendChart loading={summaryLoading} />
    </div>
  );
}
