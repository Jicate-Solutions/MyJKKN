// app/(routes)/resource-management/analytics-dashboard/_components/institution-comparison-chart.tsx
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
import { Building2 } from 'lucide-react';

interface InstitutionComparisonChartProps {
  data: ResourceAnalytics | undefined;
  isLoading: boolean;
  canViewAll: boolean;
}

export function InstitutionComparisonChart({
  data,
  isLoading,
  canViewAll
}: InstitutionComparisonChartProps) {
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

  // Only show for super admin
  if (!canViewAll) {
    return null;
  }

  const chartData =
    data?.by_institution.slice(0, 10).map((inst) => ({
      name:
        inst.institution_name.length > 15
          ? inst.institution_name.substring(0, 15) + '...'
          : inst.institution_name,
      resources: inst.resource_count,
      reservations: inst.total_reservations,
      utilization: inst.utilization_rate
    })) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Building2 className='h-5 w-5' />
          Institution Comparison
        </CardTitle>
        <CardDescription>
          Resource usage across different institutions (Super Admin View)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width='100%' height={300}>
          <BarChart data={chartData} layout='horizontal'>
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
