'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import {
  CATEGORY_LABELS,
  CHART_COLORS,
  formatINRCompact,
  num,
} from './_utils';
import type { BillingCategoryAnalytics } from '@/types/billing-analytics';

export function CategoryBreakdownChart({
  data,
  loading,
}: {
  data?: BillingCategoryAnalytics[];
  loading: boolean;
}) {
  // Rows arrive grouped by (kind × collection_type), so one kind can appear
  // twice when some of its categories are government-collected. The row id must
  // therefore include collection_type — `kind` alone duplicates React keys.
  const slices = (data ?? [])
    .map((d) => ({
      id: `${d.kind}-${d.collection_type}`,
      kind: d.kind,
      isGovernment: d.collection_type === 'government',
      label: CATEGORY_LABELS[d.kind] ?? d.kind,
      value: num(d.total_outstanding),
      bills: num(d.bill_count),
    }))
    .filter((s) => s.value > 0);

  const total = slices.reduce((s, x) => s + x.value, 0);

  return (
    <Card className='h-full'>
      <CardHeader className='pb-2'>
        <CardTitle className='text-base'>Pending Fees by Category</CardTitle>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <Skeleton className='h-[260px] w-full' />
        ) : slices.length === 0 ? (
          <p className='text-muted-foreground py-20 text-center text-sm'>
            Nothing pending.
          </p>
        ) : (
          <div className='flex flex-col items-center gap-4 sm:flex-row'>
            <ResponsiveContainer width='100%' height={220} className='max-w-[240px]'>
              <PieChart>
                <Pie
                  data={slices}
                  dataKey='value'
                  nameKey='label'
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {slices.map((s, i) => (
                    <Cell key={s.id} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatINRCompact(value)} />
              </PieChart>
            </ResponsiveContainer>

            <ul className='w-full space-y-1.5 text-sm'>
              {slices.map((s, i) => (
                <li key={s.id} className='flex items-center justify-between gap-2'>
                  <span className='flex min-w-0 items-center gap-2'>
                    <span
                      className='h-2.5 w-2.5 shrink-0 rounded-full'
                      style={{
                        backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                      }}
                    />
                    <span className='truncate'>{s.label}</span>
                    {s.isGovernment && (
                      <span
                        className='shrink-0 rounded border border-amber-500 px-1 text-[10px] leading-4 text-amber-700 dark:text-amber-400'
                        title='Collected on behalf of a government body — not management revenue.'
                      >
                        Govt
                      </span>
                    )}
                  </span>
                  <span className='shrink-0 font-medium'>
                    {formatINRCompact(s.value)}
                    <span className='text-muted-foreground ml-1 text-xs'>
                      {total > 0 ? Math.round((s.value / total) * 100) : 0}%
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
