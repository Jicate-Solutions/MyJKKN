'use client';

// ============================================================================
// ABCD Distribution Component
// Pie chart visualization for category distribution
// ============================================================================

import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ABCDDistribution as ABCDDistributionType, ABCD_CATEGORY_CONFIG } from '@/types/okr';

interface ABCDDistributionProps {
  data: ABCDDistributionType[];
  isLoading?: boolean;
  title?: string;
  description?: string;
}

// Colors for pie chart
const COLORS = {
  A: '#059669', // Emerald-600
  B: '#2563eb', // Blue-600
  C: '#d97706', // Amber-600
  D: '#dc2626'  // Red-600
};

export function ABCDDistribution({
  data,
  isLoading,
  title = 'ABCD Distribution',
  description = 'Key Results by Process vs. Result Category'
}: ABCDDistributionProps) {
  const chartData = useMemo(() => {
    // Ensure all categories are present
    const categories = ['A', 'B', 'C', 'D'] as const;
    const dataMap = new Map(data.map(d => [d.category, d]));

    return categories.map(cat => ({
      name: cat,
      label: ABCD_CATEGORY_CONFIG[cat].label,
      value: dataMap.get(cat)?.count || 0,
      percentage: dataMap.get(cat)?.percentage || 0,
      color: COLORS[cat]
    }));
  }, [data]);

  const total = useMemo(
    () => chartData.reduce((sum, item) => sum + item.value, 0),
    [chartData]
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border">
          <p className="font-semibold" style={{ color: data.color }}>
            Category {data.name}: {data.label}
          </p>
          <p className="text-sm">
            Count: <span className="font-medium">{data.value}</span>
          </p>
          <p className="text-sm">
            Percentage: <span className="font-medium">{data.percentage}%</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {ABCD_CATEGORY_CONFIG[data.name as keyof typeof ABCD_CATEGORY_CONFIG]?.action}
          </p>
        </div>
      );
    }
    return null;
  };

  // Custom legend
  const renderLegend = (props: any) => {
    const { payload } = props;
    return (
      <div className="flex flex-wrap justify-center gap-3 mt-4">
        {payload.map((entry: any, index: number) => (
          <div key={`legend-${index}`} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-sm">
              {entry.value} ({chartData[index]?.value || 0})
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-lg font-medium">No Data Yet</p>
              <p className="text-sm">Rate key results to see the distribution</p>
            </div>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percentage }) =>
                    percentage > 5 ? `${name}: ${percentage}%` : ''
                  }
                  labelLine={false}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color}
                      stroke="white"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend content={renderLegend} />
              </PieChart>
            </ResponsiveContainer>

            {/* Center text */}
            <div className="text-center -mt-32 mb-20 relative z-10 pointer-events-none">
              <div className="text-3xl font-bold">{total}</div>
              <div className="text-sm text-muted-foreground">Total Rated</div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              {chartData.map((item) => (
                <div
                  key={item.name}
                  className="p-2 rounded-lg text-center"
                  style={{ backgroundColor: `${item.color}10` }}
                >
                  <div
                    className="text-xl font-bold"
                    style={{ color: item.color }}
                  >
                    {item.value}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.name}: {item.label}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Simple bar version for smaller spaces
export function ABCDDistributionBar({ data, isLoading }: { data: ABCDDistributionType[]; isLoading?: boolean }) {
  const chartData = useMemo(() => {
    const categories = ['A', 'B', 'C', 'D'] as const;
    const dataMap = new Map(data.map(d => [d.category, d]));
    return categories.map(cat => ({
      name: cat,
      value: dataMap.get(cat)?.count || 0,
      percentage: dataMap.get(cat)?.percentage || 0,
      color: COLORS[cat]
    }));
  }, [data]);

  const maxValue = Math.max(...chartData.map(d => d.value), 1);

  if (isLoading) {
    return <Skeleton className="h-20" />;
  }

  return (
    <div className="space-y-2">
      {chartData.map((item) => (
        <div key={item.name} className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ backgroundColor: item.color }}
          >
            {item.name}
          </div>
          <div className="flex-1">
            <div
              className="h-4 rounded transition-all duration-500"
              style={{
                width: `${(item.value / maxValue) * 100}%`,
                backgroundColor: item.color,
                minWidth: item.value > 0 ? '8px' : '0'
              }}
            />
          </div>
          <div className="text-sm font-medium w-8 text-right">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export default ABCDDistribution;
