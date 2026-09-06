'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { formatINRCompact, num } from './_utils';
import type { BillingCollectionTrendPoint } from '@/types/billing-analytics';

export function CollectionTrendChart({
  data,
  loading,
}: {
  data?: BillingCollectionTrendPoint[];
  loading: boolean;
}) {
  const chartData = (data ?? []).map((d) => ({
    period: d.period,
    billed: num(d.billed),
    collected: num(d.collected),
  }));

  return (
    <Card className='h-full'>
      <CardHeader className='pb-2'>
        <CardTitle className='text-base'>Billed vs Collected</CardTitle>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <Skeleton className='h-[300px] w-full' />
        ) : chartData.length === 0 ? (
          <p className='text-muted-foreground py-24 text-center text-sm'>
            No activity in the selected range.
          </p>
        ) : (
          <ResponsiveContainer width='100%' height={300}>
            <ComposedChart
              data={chartData}
              margin={{ left: 4, right: 8, top: 8, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray='3 3' vertical={false} />
              <XAxis dataKey='period' tick={{ fontSize: 11 }} minTickGap={20} />
              <YAxis
                width={62}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatINRCompact(v)}
              />
              <Tooltip
                formatter={(value: number) => formatINRCompact(value)}
                labelClassName='font-medium'
              />
              <Legend />
              <Bar
                dataKey='billed'
                name='Billed'
                fill='#93c5fd'
                radius={[3, 3, 0, 0]}
                maxBarSize={36}
              />
              <Line
                dataKey='collected'
                name='Collected'
                stroke='#16a34a'
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
