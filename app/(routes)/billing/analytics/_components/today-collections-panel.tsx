'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { IndianRupee, Radio, ChevronRight } from 'lucide-react';
import { formatCurrency, formatINRCompact, num, drilldown } from './_utils';
import type { BillingTodayCollections } from '@/types/billing-analytics';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

/** Local YYYY-MM-DD for "today" — matches presetRange('today') in _utils. */
function todayIso(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

export function TodayCollectionsPanel({
  data,
  loading,
  institutionId,
}: {
  data?: BillingTodayCollections;
  loading: boolean;
  /** Active institution filter, carried into the receipt-list links. */
  institutionId?: string;
}) {
  const today = todayIso();
  const todayScope = { institutionId, date_from: today, date_to: today };

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
            <Link
              href={drilldown.receipts(todayScope)}
              className='group block rounded-md -m-1 p-1 transition-colors hover:bg-muted/60'
              aria-label="View today's receipts"
            >
              <p className='text-3xl font-bold text-green-700 group-hover:underline'>
                {formatCurrency(num(data?.today_total), { showDecimals: false })}
              </p>
              <p className='text-muted-foreground text-xs'>
                {num(data?.today_count)} receipt
                {num(data?.today_count) === 1 ? '' : 's'} today
              </p>
            </Link>

            {data && data.by_mode.length > 0 && (
              <div className='flex flex-wrap gap-2'>
                {data.by_mode.map((m) => (
                  <Link
                    key={m.payment_mode}
                    href={drilldown.receipts(todayScope, {
                      payment_mode: m.payment_mode,
                    })}
                    aria-label={`View today's ${m.payment_mode} receipts`}
                  >
                    <Badge
                      variant='secondary'
                      className='cursor-pointer font-normal transition-colors hover:bg-primary/15'
                    >
                      {m.payment_mode}: {formatINRCompact(m.amount)} ({m.count})
                    </Badge>
                  </Link>
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
                    <li key={r.id}>
                      <Link
                        href={drilldown.receipt(r.id)}
                        className='group -mx-1 flex items-center justify-between gap-2 rounded-md px-1 py-2 text-sm transition-colors hover:bg-muted/60'
                        aria-label={`Open receipt ${r.receipt_number}`}
                      >
                        <div className='min-w-0'>
                          <p className='truncate font-medium'>
                            {r.payer_name || '—'}
                          </p>
                          <p className='text-muted-foreground truncate text-xs'>
                            {r.receipt_number} · {r.institution_name}
                          </p>
                        </div>
                        <div className='flex shrink-0 items-center gap-1 text-right'>
                          <div>
                            <p className='font-semibold'>
                              {formatCurrency(num(r.payment_amount), {
                                showDecimals: false,
                              })}
                            </p>
                            <p className='text-muted-foreground text-xs'>
                              {timeAgo(r.created_at)}
                            </p>
                          </div>
                          <ChevronRight className='text-muted-foreground h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100' />
                        </div>
                      </Link>
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
