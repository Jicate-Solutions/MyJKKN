// app/(routes)/resource-management/analytics-dashboard/_components/reservation-status-chart.tsx
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
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip
} from 'recharts';
import type { ReservationAnalytics } from '@/types/analytics';

interface ReservationStatusChartProps {
  data: ReservationAnalytics | undefined;
  isLoading: boolean;
}

const COLORS = {
  completed: 'hsl(var(--chart-1))',
  pending: 'hsl(var(--chart-2))',
  cancelled: 'hsl(var(--chart-3))',
  confirmed: 'hsl(var(--chart-4))',
  no_show: 'hsl(var(--chart-5))'
};

export function ReservationStatusChart({
  data,
  isLoading
}: ReservationStatusChartProps) {
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
    data?.by_status.map((stat) => ({
      name: stat.status.charAt(0).toUpperCase() + stat.status.slice(1),
      value: stat.count,
      percentage: stat.percentage.toFixed(1)
    })) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reservation Status Distribution</CardTitle>
        <CardDescription>Breakdown of reservations by status</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width='100%' height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx='50%'
              cy='50%'
              labelLine={false}
              label={({ name, percentage }) => `${name}: ${percentage}%`}
              outerRadius={80}
              fill='#8884d8'
              dataKey='value'
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    COLORS[entry.name.toLowerCase() as keyof typeof COLORS] ||
                    COLORS.completed
                  }
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px'
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
