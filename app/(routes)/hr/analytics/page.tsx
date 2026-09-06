'use client';

/**
 * HR Analytics Dashboard — C1.
 *
 * Cross-institution metrics: headcount, attrition, department distribution,
 * leave utilization. Pure Tailwind visuals — no external chart library.
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  TrendingDown,
  RefreshCw,
  BarChart3,
  Building2,
} from 'lucide-react';
import { useHRAnalytics } from '@/hooks/hr/use-hr-analytics';
import type { AnalyticsPeriod } from '@/types/hr-analytics';

// =====================================================================================
// Summary card
// =====================================================================================

function SummaryCard({
  label,
  value,
  icon: Icon,
  subtitle,
  color = 'blue',
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  subtitle?: string;
  color?: 'blue' | 'green' | 'red' | 'amber' | 'purple';
}) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  };
  const iconColor = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
    purple: 'text-purple-600',
  };

  return (
    <div className={`rounded-lg border p-4 ${colorMap[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-80">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
          {subtitle && <p className="mt-0.5 text-xs opacity-60">{subtitle}</p>}
        </div>
        <Icon className={`h-8 w-8 ${iconColor[color]} opacity-50`} />
      </div>
    </div>
  );
}

// =====================================================================================
// Bar chart (pure Tailwind)
// =====================================================================================

function HorizontalBar({
  label,
  value,
  maxValue,
  color = 'bg-blue-500',
}: {
  label: string;
  value: number;
  maxValue: number;
  color?: string;
}) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 truncate text-sm text-gray-700">{label}</span>
      <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
        <div
          className={`h-full ${color} rounded transition-all duration-500`}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
      <span className="w-12 text-right text-sm font-medium text-gray-900">
        {value}
      </span>
    </div>
  );
}

// =====================================================================================
// Skeleton
// =====================================================================================

function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="h-4 w-24 rounded bg-gray-200" />
      <div className="mt-2 h-8 w-16 rounded bg-gray-200" />
    </div>
  );
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="h-5 flex-1 rounded bg-gray-200" />
          <div className="h-5 w-16 rounded bg-gray-200" />
          <div className="h-5 w-16 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

// =====================================================================================
// Main page
// =====================================================================================

export default function HRAnalyticsPage() {
  const [period, setPeriod] = useState<AnalyticsPeriod>('12m');
  const { data, isLoading, error, refetch, isFetching } = useHRAnalytics({
    period,
  });

  const periods: { label: string; value: AnalyticsPeriod }[] = [
    { label: '3 months', value: '3m' },
    { label: '6 months', value: '6m' },
    { label: '12 months', value: '12m' },
  ];

  return (
    <ContentLayout title="HR Analytics">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Analytics</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">HR Analytics</h1>
          <p className="text-sm text-gray-500">
            Cross-institution workforce metrics and trends
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex rounded-lg border border-gray-300 bg-white">
            {periods.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  period === p.value
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                } ${p.value === '3m' ? 'rounded-l-lg' : ''} ${
                  p.value === '12m' ? 'rounded-r-lg' : ''
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={`mr-1.5 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <p className="font-medium">Failed to load analytics</p>
          <p className="text-sm">{(error as Error).message}</p>
        </div>
      )}

      {/* Summary cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)
        ) : data ? (
          <>
            <SummaryCard
              label="Total Staff"
              value={data.summary.total_staff}
              icon={Users}
              color="blue"
            />
            <SummaryCard
              label="Active"
              value={data.summary.active_staff}
              icon={UserCheck}
              color="green"
            />
            <SummaryCard
              label="Inactive"
              value={data.summary.inactive_staff}
              icon={UserX}
              color="red"
            />
            <SummaryCard
              label="Avg Tenure"
              value={`${data.summary.avg_tenure_months} mo`}
              icon={Clock}
              color="purple"
            />
            <SummaryCard
              label="Attrition Rate"
              value={`${data.summary.overall_attrition_rate}%`}
              icon={TrendingDown}
              subtitle={`Last ${period === '3m' ? '3' : period === '6m' ? '6' : '12'} months`}
              color="amber"
            />
          </>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Headcount by Institution */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Headcount by Institution
            </h2>
          </div>
          {isLoading ? (
            <TableSkeleton />
          ) : data?.headcount_by_institution.length ? (
            <div className="space-y-2">
              {data.headcount_by_institution
                .sort((a, b) => b.total - a.total)
                .map((h) => (
                  <HorizontalBar
                    key={h.institution_id}
                    label={h.institution_name}
                    value={h.total}
                    maxValue={Math.max(
                      ...data.headcount_by_institution.map((x) => x.total)
                    )}
                    color="bg-blue-500"
                  />
                ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No data available</p>
          )}
        </div>

        {/* Department Distribution */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Department Distribution
            </h2>
          </div>
          {isLoading ? (
            <TableSkeleton />
          ) : data?.department_distribution.length ? (
            <div className="space-y-2">
              {data.department_distribution.slice(0, 15).map((d) => (
                <HorizontalBar
                  key={d.department}
                  label={d.department}
                  value={d.count}
                  maxValue={Math.max(
                    ...data.department_distribution.map((x) => x.count)
                  )}
                  color="bg-purple-500"
                />
              ))}
              {data.department_distribution.length > 15 && (
                <p className="text-xs text-gray-400 pt-1">
                  +{data.department_distribution.length - 15} more departments
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No data available</p>
          )}
        </div>

        {/* Attrition by Institution */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-red-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Attrition by Institution
            </h2>
          </div>
          {isLoading ? (
            <TableSkeleton />
          ) : data?.attrition.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-600">
                    <th className="pb-2 font-medium">Institution</th>
                    <th className="pb-2 font-medium text-right">Joined</th>
                    <th className="pb-2 font-medium text-right">Left</th>
                    <th className="pb-2 font-medium text-right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.attrition
                    .sort((a, b) => b.rate - a.rate)
                    .map((a) => (
                      <tr
                        key={a.institution_id}
                        className="border-b border-gray-100"
                      >
                        <td className="py-2 text-gray-900">
                          {a.institution_name}
                        </td>
                        <td className="py-2 text-right text-green-600 font-medium">
                          +{a.joined}
                        </td>
                        <td className="py-2 text-right text-red-600 font-medium">
                          -{a.left}
                        </td>
                        <td className="py-2 text-right">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                              a.rate > 15
                                ? 'bg-red-100 text-red-700'
                                : a.rate > 8
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {a.rate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No data available</p>
          )}
        </div>

        {/* Leave Utilization */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Leave Utilization by Institution
            </h2>
          </div>
          {isLoading ? (
            <TableSkeleton />
          ) : data?.leave_utilization_by_institution.length ? (
            <div className="space-y-3">
              {data.leave_utilization_by_institution
                .sort((a, b) => b.utilization_pct - a.utilization_pct)
                .map((l) => (
                  <div key={l.institution_id}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-700 truncate max-w-[200px]">
                        {l.institution_name}
                      </span>
                      <span className="font-medium text-gray-900">
                        {l.utilization_pct}%
                      </span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded overflow-hidden">
                      <div
                        className={`h-full rounded transition-all duration-500 ${
                          l.utilization_pct > 80
                            ? 'bg-red-500'
                            : l.utilization_pct > 50
                            ? 'bg-amber-500'
                            : 'bg-green-500'
                        }`}
                        style={{
                          width: `${Math.min(l.utilization_pct, 100)}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {l.total_used} / {l.total_allocated} days used
                    </p>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No data available</p>
          )}
        </div>
      </div>

      {/* Headcount Trend (line chart approximation) */}
      {data?.headcount_trend.length ? (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              New Hires Trend
            </h2>
          </div>
          <div className="overflow-x-auto">
            {(() => {
              // Aggregate across institutions per month
              const monthMap = new Map<string, number>();
              for (const t of data.headcount_trend) {
                monthMap.set(t.month, (monthMap.get(t.month) ?? 0) + t.count);
              }
              const months = Array.from(monthMap.entries()).sort((a, b) =>
                a[0].localeCompare(b[0])
              );
              const maxVal = Math.max(...months.map(([, v]) => v), 1);

              return (
                <div className="flex items-end gap-2 min-h-[160px]">
                  {months.map(([month, count]) => {
                    const heightPct = (count / maxVal) * 100;
                    return (
                      <div
                        key={month}
                        className="flex flex-col items-center flex-1 min-w-[40px]"
                      >
                        <span className="text-xs font-medium text-gray-700 mb-1">
                          {count}
                        </span>
                        <div
                          className="w-full bg-green-500 rounded-t transition-all duration-500"
                          style={{
                            height: `${Math.max(heightPct, 4)}%`,
                            minHeight: '4px',
                          }}
                        />
                        <span className="mt-1 text-[10px] text-gray-500 whitespace-nowrap">
                          {month.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}

      {/* Generated-at footer */}
      {data?.generated_at && (
        <p className="mt-4 text-xs text-gray-400 text-right">
          Generated at{' '}
          {new Date(data.generated_at).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      )}
    </ContentLayout>
  );
}
