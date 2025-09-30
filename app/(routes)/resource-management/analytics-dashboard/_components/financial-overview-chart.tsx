// app/(routes)/resource-management/analytics-dashboard/_components/financial-overview-chart.tsx
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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';
import type { FinancialAnalytics } from '@/types/analytics';

interface FinancialOverviewChartProps {
  data: FinancialAnalytics | undefined;
  isLoading: boolean;
}

export function FinancialOverviewChart({
  data,
  isLoading
}: FinancialOverviewChartProps) {
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

  // Mock trend data (in production, this would come from the API)
  const chartData = Array.from({ length: 12 }, (_, i) => {
    const month = new Date();
    month.setMonth(month.getMonth() - (11 - i));
    return {
      month: month.toLocaleDateString('en-US', { month: 'short' }),
      revenue: Math.floor(Math.random() * 100000) + 50000,
      expenses: Math.floor(Math.random() * 50000) + 20000,
      profit: 0
    };
  }).map((item) => ({
    ...item,
    profit: item.revenue - item.expenses
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Financial Overview</CardTitle>
        <CardDescription>
          Revenue, expenses, and profit trends over time
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width='100%' height={300}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id='colorRevenue' x1='0' y1='0' x2='0' y2='1'>
                <stop
                  offset='5%'
                  stopColor='hsl(var(--chart-1))'
                  stopOpacity={0.8}
                />
                <stop
                  offset='95%'
                  stopColor='hsl(var(--chart-1))'
                  stopOpacity={0}
                />
              </linearGradient>
              <linearGradient id='colorExpenses' x1='0' y1='0' x2='0' y2='1'>
                <stop
                  offset='5%'
                  stopColor='hsl(var(--chart-2))'
                  stopOpacity={0.8}
                />
                <stop
                  offset='95%'
                  stopColor='hsl(var(--chart-2))'
                  stopOpacity={0}
                />
              </linearGradient>
              <linearGradient id='colorProfit' x1='0' y1='0' x2='0' y2='1'>
                <stop
                  offset='5%'
                  stopColor='hsl(var(--chart-3))'
                  stopOpacity={0.8}
                />
                <stop
                  offset='95%'
                  stopColor='hsl(var(--chart-3))'
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray='3 3' className='stroke-muted' />
            <XAxis dataKey='month' tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px'
              }}
              formatter={(value: number) => `₹${value.toLocaleString()}`}
            />
            <Legend />
            <Area
              type='monotone'
              dataKey='revenue'
              stroke='hsl(var(--chart-1))'
              fillOpacity={1}
              fill='url(#colorRevenue)'
              name='Revenue'
            />
            <Area
              type='monotone'
              dataKey='expenses'
              stroke='hsl(var(--chart-2))'
              fillOpacity={1}
              fill='url(#colorExpenses)'
              name='Expenses'
            />
            <Area
              type='monotone'
              dataKey='profit'
              stroke='hsl(var(--chart-3))'
              fillOpacity={1}
              fill='url(#colorProfit)'
              name='Profit'
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
