// app/(routes)/resource-management/analytics-dashboard/_components/resource-utilization-chart.tsx
'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import type { ResourceAnalytics } from '@/types/analytics';

interface ResourceUtilizationChartProps {
  data: ResourceAnalytics | undefined;
  isLoading: boolean;
}

export function ResourceUtilizationChart({
  data,
  isLoading
}: ResourceUtilizationChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className='h-6 w-48' />
          <Skeleton className='h-4 w-64 mt-2' />
        </CardHeader>
        <CardContent>
          <Skeleton className='h-[300px] w-full' />
        </CardContent>
      </Card>
    );
  }

  const chartData =
    data?.by_category.slice(0, 10).map((cat) => ({
      name: cat.category_name,
      resources: cat.resource_count,
      reservations: cat.total_reservations,
      utilization: cat.utilization_rate
    })) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resource Utilization by Category</CardTitle>
        <CardDescription>
          Resource count and reservation trends across categories
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width='100%' height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray='3 3' className='stroke-muted' />
            <XAxis
              dataKey='name'
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor='end'
              height={80}
            />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px'
              }}
            />
            <Legend />
            <Bar
              dataKey='resources'
              fill='hsl(var(--primary))'
              name='Resources'
            />
            <Bar
              dataKey='reservations'
              fill='hsl(var(--chart-2))'
              name='Reservations'
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
