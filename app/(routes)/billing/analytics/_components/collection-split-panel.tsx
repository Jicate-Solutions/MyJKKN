'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { formatINRCompact, formatCurrency, num } from './_utils';
import type { BillingCollectionSplit } from '@/types/billing-analytics';

// Blue / amber / slate. Chosen over the usual green-red pairing because blue↔amber
// stays separable under deutan and protan colour-vision deficiency, where green↔red
// collapses (the same reasoning behind the my-bills chart palette).
const COLORS = {
  management: '#2a78d6',
  government: '#d97706',
  unallocated: '#94a3b8',
} as const;

type BucketKey = keyof typeof COLORS;

const BUCKETS: { key: BucketKey; label: string; hint: string }[] = [
  {
    key: 'management',
    label: 'Management',
    hint: 'Institution revenue.',
  },
  {
    key: 'government',
    label: 'Government',
    hint: 'Collected on behalf of a government body — passes through, not revenue.',
  },
  {
    key: 'unallocated',
    label: 'Unallocated',
    hint: 'Receipts with no line items linking them to a bill, so they cannot be attributed to a category.',
  },
];

export function CollectionSplitPanel({
  data,
  loading,
}: {
  data?: BillingCollectionSplit;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <Card>
        <CardHeader className='pb-2'>
          <CardTitle className='text-base'>Collection by Ownership</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className='h-[220px] w-full' />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const rows = BUCKETS.map((b) => ({
    ...b,
    gross: num(data[`${b.key}_collected` as keyof BillingCollectionSplit]),
    refunds: num(data[`${b.key}_refunds` as keyof BillingCollectionSplit]),
    net: num(data[`${b.key}_net` as keyof BillingCollectionSplit]),
  }));

  const total = num(data.total_collected);
  const hasData = total > 0;
  const unallocated = num(data.unallocated_collected);
  const unallocatedShare = total > 0 ? (unallocated / total) * 100 : 0;

  // One stacked row — the point is the proportion, not a per-category comparison.
  const chartRow = [
    {
      name: 'Collected',
      management: rows[0].gross,
      government: rows[1].gross,
      unallocated: rows[2].gross,
    },
  ];

  const billedMgmt = num(data.management_billed);
  const billedGovt = num(data.government_billed);
  const outMgmt = num(data.management_outstanding);
  const outGovt = num(data.government_outstanding);

  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-base'>Collection by Ownership</CardTitle>
        <p className='text-muted-foreground text-xs'>
          Cash traced through receipt line items to each bill&apos;s category.
        </p>
      </CardHeader>
      <CardContent className='space-y-4'>
        {!hasData ? (
          <p className='text-muted-foreground py-16 text-center text-sm'>
            No collections in this range.
          </p>
        ) : (
          <>
            <ResponsiveContainer width='100%' height={110}>
              <BarChart
                data={chartRow}
                layout='vertical'
                margin={{ left: 4, right: 8, top: 4, bottom: 0 }}
                barCategoryGap='25%'
              >
                <XAxis
                  type='number'
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => formatINRCompact(v)}
                />
                <YAxis type='category' dataKey='name' hide />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    formatCurrency(value),
                    BUCKETS.find((b) => b.key === name)?.label ?? name,
                  ]}
                />
                <Legend
                  formatter={(value: string) =>
                    BUCKETS.find((b) => b.key === value)?.label ?? value
                  }
                  wrapperStyle={{ fontSize: 11 }}
                />
                {BUCKETS.map((b, i) => (
                  <Bar
                    key={b.key}
                    dataKey={b.key}
                    stackId='collected'
                    fill={COLORS[b.key]}
                    maxBarSize={38}
                    radius={
                      i === BUCKETS.length - 1 ? [0, 3, 3, 0] : [0, 0, 0, 0]
                    }
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>

            <div className='overflow-x-auto'>
              <table className='w-full min-w-[420px] text-sm'>
                <thead>
                  <tr className='text-muted-foreground border-b text-xs'>
                    <th className='py-1.5 text-left font-medium'>Bucket</th>
                    <th className='py-1.5 text-right font-medium'>Collected</th>
                    <th className='py-1.5 text-right font-medium'>Refunds</th>
                    <th className='py-1.5 text-right font-medium'>Net</th>
                    <th className='py-1.5 text-right font-medium'>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className='border-b last:border-0'>
                      <td className='py-1.5'>
                        <span className='flex items-center gap-2'>
                          <span
                            className='inline-block h-2.5 w-2.5 shrink-0 rounded-sm'
                            style={{ backgroundColor: COLORS[r.key] }}
                          />
                          <span title={r.hint}>{r.label}</span>
                        </span>
                      </td>
                      <td className='py-1.5 text-right tabular-nums'>
                        {formatCurrency(r.gross)}
                      </td>
                      <td className='text-muted-foreground py-1.5 text-right tabular-nums'>
                        {r.refunds > 0 ? `− ${formatCurrency(r.refunds)}` : '—'}
                      </td>
                      <td className='py-1.5 text-right font-medium tabular-nums'>
                        {formatCurrency(r.net)}
                      </td>
                      <td className='text-muted-foreground py-1.5 text-right tabular-nums'>
                        {total > 0 ? `${((r.gross / total) * 100).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Accrual view — off the bill, which is categorised almost everywhere,
            so it answers the ownership question the sparse cash trail cannot. */}
        <div className='grid grid-cols-2 gap-4 border-t pt-3'>
          <div>
            <p className='text-muted-foreground text-xs font-medium'>
              Billed — Management
            </p>
            <p className='text-lg font-semibold' title={formatCurrency(billedMgmt)}>
              {formatINRCompact(billedMgmt)}
            </p>
            <p className='text-muted-foreground text-xs'>
              {formatINRCompact(outMgmt)} outstanding
            </p>
          </div>
          <div>
            <p className='text-muted-foreground text-xs font-medium'>
              Billed — Government
            </p>
            <p className='text-lg font-semibold' title={formatCurrency(billedGovt)}>
              {formatINRCompact(billedGovt)}
            </p>
            <p className='text-muted-foreground text-xs'>
              {formatINRCompact(outGovt)} outstanding
            </p>
          </div>
        </div>

        {unallocatedShare >= 1 && (
          <p className='text-muted-foreground flex items-start gap-1.5 text-xs'>
            <Info className='mt-0.5 h-3.5 w-3.5 shrink-0' />
            <span>
              {unallocatedShare.toFixed(0)}% of collected cash sits in{' '}
              <strong>Unallocated</strong> — those receipts carry no line items
              linking them to a bill, so they cannot be attributed to Management
              or Government. Link them to bills to sharpen this split.
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
