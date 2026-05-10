'use client';

/**
 * Employee Distribution Donut (T3.5).
 *
 * Reads /api/hr/dashboard/employee-distribution. Renders a recharts donut
 * with a center label showing total count + a legend listing each category
 * with its absolute count and percentage.
 *
 * Top 5 categories are discrete slices; remainder folded into 'Others'
 * (server-side rollup).
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, PieChart as PieIcon } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useEmployeeDistribution } from '@/hooks/hr/use-hr-dashboard';
import type { EmployeeDistributionSlice } from '@/types/hr-dashboard';

// =====================================================================================
// Custom tooltip (recharts shape — `any` is the documented payload shape)
// =====================================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DonutTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const slice = payload[0]?.payload as EmployeeDistributionSlice & { percentage: number };
  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-md p-2 text-xs">
      <p className="font-medium" style={{ color: slice.color }}>
        {slice.category_name}
      </p>
      <p className="text-gray-700">
        {slice.count.toLocaleString('en-IN')} staff ({slice.percentage.toFixed(1)}%)
      </p>
    </div>
  );
}

// =====================================================================================
// Component
// =====================================================================================

export function EmployeeDistributionDonut() {
  const { data, isLoading, isError, error } = useEmployeeDistribution();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <PieIcon className="h-4 w-4 text-muted-foreground" />
            Employee Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="border-red-200 bg-red-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-red-700">
            <AlertCircle className="h-4 w-4" />
            Employee Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-red-700">Could not load distribution data.</p>
          <p className="text-[10px] text-red-600/80 font-mono break-all mt-1">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.slices.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <PieIcon className="h-4 w-4 text-muted-foreground" />
            Employee Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No active staff in your scope yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  const slicesWithPct = data.slices.map((s) => ({
    ...s,
    percentage: data.total === 0 ? 0 : (s.count / data.total) * 100,
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <PieIcon className="h-4 w-4 text-muted-foreground" />
            Employee Distribution
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {data.total.toLocaleString('en-IN')} active
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slicesWithPct}
                dataKey="count"
                nameKey="category_name"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                stroke="#fff"
                strokeWidth={2}
              >
                {slicesWithPct.map((slice) => (
                  <Cell key={slice.category_name} fill={slice.color} />
                ))}
              </Pie>
              <Tooltip content={<DonutTooltip />} />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11 }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Center label — absolutely positioned over the donut hole */}
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center -translate-y-3">
            <span className="text-2xl font-bold tabular-nums">
              {data.total.toLocaleString('en-IN')}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Total
            </span>
          </div>
        </div>
        {data.rolled_up_count > 0 && (
          <p className="text-[11px] text-muted-foreground text-center mt-2">
            'Others' rolls up {data.rolled_up_count.toLocaleString('en-IN')} staff across
            categories beyond the top 5.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
