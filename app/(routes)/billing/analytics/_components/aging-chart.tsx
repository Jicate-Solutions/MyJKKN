'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { AGING_LABELS, formatINRCompact, num } from './_utils';
import type { BillingAgingBucketRow } from '@/types/billing-analytics';

const ORDER = ['not_due', '0-30', '31-60', '61-90', '90+'] as const;
// Deepening red as overdue ages; "not due" stays neutral blue.
const COLORS: Record<string, string> = {
  not_due: '#3b82f6',
  '0-30': '#f59e0b',
  '31-60': '#f97316',
  '61-90': '#ef4444',
  '90+': '#b91c1c',
};

export function AgingChart({
  data,
  loading,
}: {
  data?: BillingAgingBucketRow[];
  loading: boolean;
}) {
  const byBucket = new Map((data ?? []).map((d) => [d.bucket, d]));
  const rows = ORDER.map((b) => ({
    bucket: b,
    label: AGING_LABELS[b],
    balance: num(byBucket.get(b)?.balance),
    bill_count: num(byBucket.get(b)?.bill_count),
  }));
  const hasData = rows.some((r) => r.balance > 0);

  return (
    <Card className='h-full'>
      <CardHeader className='pb-2'>
        <CardTitle className='text-base'>Outstanding by Age</CardTitle>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <Skeleton className='h-[260px] w-full' />
        ) : !hasData ? (
          <p className='text-muted-foreground py-20 text-center text-sm'>
            No outstanding balances.
          </p>
        ) : (
          <ResponsiveContainer width='100%' height={260}>
            <BarChart data={rows} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray='3 3' vertical={false} />
              <XAxis dataKey='label' tick={{ fontSize: 11 }} />
              <YAxis
                width={62}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatINRCompact(v)}
              />
              <Tooltip
                formatter={(value: number, _n, p: any) => [
                  `${formatINRCompact(value)} · ${num(p?.payload?.bill_count).toLocaleString('en-IN')} bills`,
                  'Outstanding',
                ]}
              />
              <Bar dataKey='balance' radius={[3, 3, 0, 0]} maxBarSize={56}>
                {rows.map((r) => (
                  <Cell key={r.bucket} fill={COLORS[r.bucket]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
