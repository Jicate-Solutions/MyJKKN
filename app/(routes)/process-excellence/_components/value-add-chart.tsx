/**
 * Value-Add Chart Component
 *
 * Pie chart showing value-add vs non-value-add time distribution
 */

'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProcessMetrics } from '@/hooks/process-excellence';
import type { ProcessCategory } from '@/types/process-excellence';
import { PieChart, TrendingUp, TrendingDown } from 'lucide-react';

interface ValueAddChartProps {
  institutionId: string;
  category?: ProcessCategory;
}

export function ValueAddChart({ institutionId, category }: ValueAddChartProps) {
  const { data: metricsData, isLoading } = useProcessMetrics({
    institution_id: institutionId,
    category
  });

  const chartData = useMemo(() => {
    if (!metricsData || metricsData.length === 0) {
      return {
        valueAdd: 0,
        nonValueAdd: 0,
        percentage: 0,
        totalProcesses: 0
      };
    }

    // Calculate weighted average across all processes
    const totalInstances = metricsData.reduce(
      (sum, metric) => sum + metric.completed_instances,
      0
    );

    const weightedValueAdd = metricsData.reduce(
      (sum, metric) => sum + metric.value_add_ratio * metric.completed_instances,
      0
    );

    const avgValueAddRatio = totalInstances > 0 ? weightedValueAdd / totalInstances : 0;
    const nonValueAddRatio = 100 - avgValueAddRatio;

    return {
      valueAdd: avgValueAddRatio,
      nonValueAdd: nonValueAddRatio,
      percentage: avgValueAddRatio,
      totalProcesses: metricsData.length
    };
  }, [metricsData]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!metricsData || metricsData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Value-Add Analysis</CardTitle>
          <CardDescription>Distribution of value-adding vs non-value-adding activities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <PieChart className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No process data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Value-Add Analysis</CardTitle>
        <CardDescription>
          Percentage of time spent on value-adding activities vs non-value-adding activities
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3 p-4 border rounded-lg">
              <div className="p-2 rounded-full bg-primary/10">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Value-Add Time</p>
                <p className="text-2xl font-bold">{chartData.valueAdd.toFixed(1)}%</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 border rounded-lg">
              <div className="p-2 rounded-full bg-orange-500/10">
                <TrendingDown className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Non-Value-Add Time</p>
                <p className="text-2xl font-bold">{chartData.nonValueAdd.toFixed(1)}%</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 border rounded-lg">
              <div className="p-2 rounded-full bg-blue-500/10">
                <PieChart className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Processes Analyzed</p>
                <p className="text-2xl font-bold">{chartData.totalProcesses}</p>
              </div>
            </div>
          </div>

          {/* Visual Chart (Simple Bar Representation) */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Time Distribution</h4>
            <div className="relative h-16 bg-muted rounded-lg overflow-hidden">
              <div
                className="absolute top-0 left-0 h-full bg-primary flex items-center justify-center text-primary-foreground font-medium transition-all"
                style={{ width: `${chartData.valueAdd}%` }}
              >
                {chartData.valueAdd > 15 && `${chartData.valueAdd.toFixed(1)}% Value-Add`}
              </div>
              <div
                className="absolute top-0 h-full bg-orange-500 flex items-center justify-center text-white font-medium transition-all"
                style={{
                  left: `${chartData.valueAdd}%`,
                  width: `${chartData.nonValueAdd}%`
                }}
              >
                {chartData.nonValueAdd > 15 && `${chartData.nonValueAdd.toFixed(1)}% Non-Value-Add`}
              </div>
            </div>
          </div>

          {/* Process Breakdown */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">By Process</h4>
            <div className="space-y-2">
              {metricsData.map((metric) => (
                <div
                  key={metric.process_id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{metric.process_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {metric.completed_instances} instances completed
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-lg font-bold text-primary">
                        {metric.value_add_ratio.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">Value-add</p>
                    </div>
                    {metric.value_add_ratio >= 60 ? (
                      <TrendingUp className="h-5 w-5 text-green-500" />
                    ) : metric.value_add_ratio >= 40 ? (
                      <TrendingUp className="h-5 w-5 text-yellow-500" />
                    ) : (
                      <TrendingDown className="h-5 w-5 text-red-500" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Interpretation */}
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>Interpretation:</strong>{' '}
              {chartData.percentage >= 60
                ? 'Excellent value-add ratio. Most time is spent on activities that directly benefit customers.'
                : chartData.percentage >= 40
                ? 'Good value-add ratio, but there is room for improvement by reducing non-value-adding activities.'
                : 'Low value-add ratio. Consider identifying and eliminating non-value-adding steps in your processes.'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
