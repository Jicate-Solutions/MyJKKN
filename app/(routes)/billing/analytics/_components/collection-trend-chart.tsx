'use client';

import { useRouter } from 'next/navigation';
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
import {
  formatINRCompact,
  num,
  drilldown,
  periodRange,
  type DrilldownScope,
} from './_utils';
import type { BillingCollectionTrendPoint } from '@/types/billing-analytics';

export function CollectionTrendChart({
  data,
  loading,
  scope,
}: {
  data?: BillingCollectionTrendPoint[];
  loading: boolean;
  /** Active institution + date window, carried into the drill-down. */
  scope: DrilldownScope;
}) {
  const router = useRouter();
  const chartData = (data ?? []).map((d) => ({
    period: d.period,
    billed: num(d.billed),
    collected: num(d.collected),
  }));

  // Clicking anywhere on a period column opens that period's receipts.
  const openPeriod = (period?: string) => {
    if (!period) return;
    router.push(
      drilldown.receipts({
        institutionId: scope.institutionId,
        ...periodRange(period, scope),
      })
    );
  };

  return (
    <Card className='h-full'>
      <CardHeader className='pb-2'>
        <CardTitle className='text-base'>Billed vs Collected</CardTitle>
        {chartData.length > 0 && (
          <p className='text-muted-foreground text-xs'>
            Click a period to see its receipts.
          </p>
        )}
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
              onClick={(state: any) => openPeriod(state?.activeLabel)}
              style={{ cursor: 'pointer' }}
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
                activeDot={{ r: 5, cursor: 'pointer' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
