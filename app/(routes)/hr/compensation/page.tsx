'use client';

/**
 * HR Compensation Analytics — C3.
 *
 * Pay-band distribution, institution salary comparison, anonymized
 * top/bottom earners. Pure Tailwind visuals.
 */

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
  DollarSign,
  BarChart3,
  Building2,
  TrendingUp,
  RefreshCw,
  Scale,
} from 'lucide-react';
import { useCompensation } from '@/hooks/hr/use-compensation';

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
  value: string;
  icon: React.ElementType;
  subtitle?: string;
  color?: 'blue' | 'green' | 'amber' | 'purple' | 'red';
}) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };
  const iconColor = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    amber: 'text-amber-600',
    purple: 'text-purple-600',
    red: 'text-red-600',
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
// Formatters
// =====================================================================================

function formatINR(n: number): string {
  if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString('en-IN');
}

function formatINRFull(n: number): string {
  return n.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });
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

// =====================================================================================
// Main page
// =====================================================================================

export default function CompensationPage() {
  const { data, isLoading, error, refetch, isFetching } = useCompensation();

  return (
    <ContentLayout title="Compensation Analytics">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Compensation</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Compensation Analytics
          </h1>
          <p className="text-sm text-gray-500">
            Pay-band analysis and institutional salary comparison
          </p>
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

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <p className="font-medium">Failed to load compensation data</p>
          <p className="text-sm">{(error as Error).message}</p>
        </div>
      )}

      {/* Summary cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
        ) : data ? (
          <>
            <SummaryCard
              label="Total Monthly Payroll"
              value={formatINR(data.total_payroll_cost)}
              icon={DollarSign}
              subtitle={formatINRFull(data.total_payroll_cost)}
              color="blue"
            />
            <SummaryCard
              label="Average Salary"
              value={formatINR(data.avg_salary)}
              icon={TrendingUp}
              subtitle={`${data.staff_count} staff`}
              color="green"
            />
            <SummaryCard
              label="Median Salary"
              value={formatINR(data.median_salary)}
              icon={BarChart3}
              color="purple"
            />
            <SummaryCard
              label="Pay Equity Ratio"
              value={`${data.pay_equity_ratio}x`}
              icon={Scale}
              subtitle="Max/Min band average"
              color={data.pay_equity_ratio > 5 ? 'red' : 'amber'}
            />
          </>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Pay Band Distribution */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Pay Band Distribution
            </h2>
          </div>
          {isLoading ? (
            <div className="animate-pulse space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-8 rounded bg-gray-200" />
              ))}
            </div>
          ) : data?.pay_bands.length ? (
            <div className="space-y-3">
              {(() => {
                const maxCount = Math.max(
                  ...data.pay_bands.map((b) => b.count),
                  1
                );
                const colors = [
                  'bg-blue-400',
                  'bg-blue-500',
                  'bg-blue-600',
                  'bg-blue-700',
                  'bg-blue-800',
                ];
                return data.pay_bands.map((b, i) => {
                  const pct = (b.count / maxCount) * 100;
                  return (
                    <div key={b.band}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700">
                          {b.band}
                        </span>
                        <span className="text-gray-500">
                          {b.count} staff | Avg {formatINR(b.avg_gross)}
                        </span>
                      </div>
                      <div className="h-6 bg-gray-100 rounded overflow-hidden">
                        <div
                          className={`h-full ${colors[i]} rounded transition-all duration-500`}
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      {b.count > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Range: {formatINRFull(b.min)} - {formatINRFull(b.max)}
                        </p>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              No payslip data available for this period
            </p>
          )}
        </div>

        {/* Institution Comparison */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Average Salary by Institution
            </h2>
          </div>
          {isLoading ? (
            <div className="animate-pulse space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-6 rounded bg-gray-200" />
              ))}
            </div>
          ) : data?.institution_comparison.length ? (
            <div className="space-y-2">
              {(() => {
                const maxAvg = Math.max(
                  ...data.institution_comparison.map((ic) => ic.avg_gross),
                  1
                );
                return data.institution_comparison.map((ic) => {
                  const pct = (ic.avg_gross / maxAvg) * 100;
                  return (
                    <div key={ic.institution_id}>
                      <div className="flex items-center gap-3">
                        <span className="w-40 truncate text-sm text-gray-700">
                          {ic.institution_name}
                        </span>
                        <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded transition-all duration-500"
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                        </div>
                        <span className="w-16 text-right text-sm font-medium text-gray-900">
                          {formatINR(ic.avg_gross)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 ml-[172px]">
                        {ic.staff_count} staff | Total{' '}
                        {formatINR(ic.total_payroll)}
                      </p>
                    </div>
                  );
                });
              })()}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No data available</p>
          )}
        </div>

        {/* Top Earners (anonymized) */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Top 10 Earners (by role)
            </h2>
          </div>
          {isLoading ? (
            <div className="animate-pulse space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-5 rounded bg-gray-200" />
              ))}
            </div>
          ) : data?.top_earners.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-600">
                    <th className="pb-2 font-medium w-8">#</th>
                    <th className="pb-2 font-medium">Role</th>
                    <th className="pb-2 font-medium">Department</th>
                    <th className="pb-2 font-medium text-right">Gross</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_earners.map((e) => (
                    <tr
                      key={e.rank}
                      className="border-b border-gray-100"
                    >
                      <td className="py-1.5 text-gray-400">{e.rank}</td>
                      <td className="py-1.5 text-gray-900">{e.role}</td>
                      <td className="py-1.5 text-gray-600">{e.department}</td>
                      <td className="py-1.5 text-right font-medium text-gray-900">
                        {formatINRFull(e.gross_salary)}
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

        {/* Bottom Earners (anonymized) */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <Scale className="h-5 w-5 text-red-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Bottom 10 Earners (by role)
            </h2>
          </div>
          {isLoading ? (
            <div className="animate-pulse space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-5 rounded bg-gray-200" />
              ))}
            </div>
          ) : data?.bottom_earners.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-600">
                    <th className="pb-2 font-medium w-8">#</th>
                    <th className="pb-2 font-medium">Role</th>
                    <th className="pb-2 font-medium">Department</th>
                    <th className="pb-2 font-medium text-right">Gross</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bottom_earners.map((e) => (
                    <tr
                      key={e.rank}
                      className="border-b border-gray-100"
                    >
                      <td className="py-1.5 text-gray-400">{e.rank}</td>
                      <td className="py-1.5 text-gray-900">{e.role}</td>
                      <td className="py-1.5 text-gray-600">{e.department}</td>
                      <td className="py-1.5 text-right font-medium text-gray-900">
                        {formatINRFull(e.gross_salary)}
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
      </div>

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
