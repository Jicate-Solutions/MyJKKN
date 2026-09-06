'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { IndianRupee, Radio } from 'lucide-react';
import { formatCurrency, formatINRCompact, num } from './_utils';
import type { BillingTodayCollections } from '@/types/billing-analytics';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export function TodayCollectionsPanel({
  data,
  loading,
}: {
  data?: BillingTodayCollections;
  loading: boolean;
}) {
  return (
    <Card className='h-full'>
      <CardHeader className='pb-3'>
        <CardTitle className='flex items-center justify-between text-base'>
          <span className='flex items-center gap-2'>
            <IndianRupee className='h-4 w-4 text-green-600' />
            Today&apos;s Collections
          </span>
          <span className='flex items-center gap-1 text-xs font-normal text-green-600'>
            <Radio className='h-3 w-3 animate-pulse' />
            Live
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {loading && !data ? (
          <Skeleton className='h-24 w-full' />
        ) : (
          <>
            <div>
              <p className='text-3xl font-bold text-green-700'>
                {formatCurrency(num(data?.today_total), { showDecimals: false })}
              </p>
              <p className='text-muted-foreground text-xs'>
                {num(data?.today_count)} receipt
                {num(data?.today_count) === 1 ? '' : 's'} today
              </p>
            </div>

            {data && data.by_mode.length > 0 && (
              <div className='flex flex-wrap gap-2'>
                {data.by_mode.map((m) => (
                  <Badge key={m.payment_mode} variant='secondary' className='font-normal'>
                    {m.payment_mode}: {formatINRCompact(m.amount)} ({m.count})
                  </Badge>
                ))}
              </div>
            )}

            <div>
              <p className='text-muted-foreground mb-2 text-xs font-medium uppercase'>
                Recent
              </p>
              {data && data.recent.length > 0 ? (
                <ul className='divide-y'>
                  {data.recent.map((r) => (
                    <li
                      key={r.id}
                      className='flex items-center justify-between gap-2 py-2 text-sm'
                    >
                      <div className='min-w-0'>
                        <p className='truncate font-medium'>{r.payer_name || '—'}</p>
                        <p className='text-muted-foreground truncate text-xs'>
                          {r.receipt_number} · {r.institution_name}
                        </p>
                      </div>
                      <div className='shrink-0 text-right'>
                        <p className='font-semibold'>
                          {formatCurrency(num(r.payment_amount), { showDecimals: false })}
                        </p>
                        <p className='text-muted-foreground text-xs'>
                          {timeAgo(r.created_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className='text-muted-foreground py-4 text-center text-sm'>
                  No collections recorded today yet.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
