'use client';

import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatINRCompact, num } from './_utils';
import type { BillingDailyActivityRow } from '@/types/billing-analytics';

interface DayGroup {
  date: string;
  rows: BillingDailyActivityRow[];
  bills: number;
  billed: number;
  students: number;
  receipts: number;
  collected: number;
}

function formatDay(iso: string): string {
  // iso is 'YYYY-MM-DD' (IST date from the RPC). Parse as local midnight so the
  // displayed day never drifts by a timezone.
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Collapse the flat (date × institution) rows into per-day groups, summing the
 * institution rows into a day total. The RPC already returns rows date-desc
 * then institution-asc, and Map preserves insertion order, so groups stay in
 * the right order without re-sorting.
 */
function groupByDay(rows: BillingDailyActivityRow[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const r of rows) {
    let g = map.get(r.activity_date);
    if (!g) {
      g = {
        date: r.activity_date,
        rows: [],
        bills: 0,
        billed: 0,
        students: 0,
        receipts: 0,
        collected: 0,
      };
      map.set(r.activity_date, g);
    }
    g.rows.push(r);
    g.bills += num(r.bills_created);
    g.billed += num(r.amount_billed);
    g.students += num(r.students_billed);
    g.receipts += num(r.receipts_created);
    g.collected += num(r.amount_collected);
  }
  return Array.from(map.values());
}

export function DailyActivityBreakdown({
  data,
  loading,
}: {
  data?: BillingDailyActivityRow[];
  loading: boolean;
}) {
  const groups = useMemo(() => groupByDay(data ?? []), [data]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (date: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  if (loading && !data) {
    return <Skeleton className='h-64 w-full' />;
  }

  if (groups.length === 0) {
    return (
      <p className='text-muted-foreground py-12 text-center text-sm'>
        No billing activity in the selected range.
      </p>
    );
  }

  return (
    <div className='max-h-[460px] overflow-auto'>
      <table className='w-full text-sm'>
        <thead className='bg-background sticky top-0 z-10'>
          <tr className='text-muted-foreground border-b text-left text-xs'>
            <th className='py-2 pr-2 font-medium'>Day / Institution</th>
            <th className='px-2 py-2 text-right font-medium'>Bills</th>
            <th className='px-2 py-2 text-right font-medium'>Billed</th>
            <th className='px-2 py-2 text-right font-medium'>Students</th>
            <th className='px-2 py-2 text-right font-medium'>Receipts</th>
            <th className='px-2 py-2 text-right font-medium'>Collected</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const isOpen = expanded.has(g.date);
            return (
              <Fragment key={g.date}>
                <tr
                  className='hover:bg-muted/40 cursor-pointer border-b font-medium'
                  onClick={() => toggle(g.date)}
                >
                  <td className='py-2 pr-2'>
                    <div className='flex items-center gap-1'>
                      {isOpen ? (
                        <ChevronDown className='h-4 w-4 shrink-0' />
                      ) : (
                        <ChevronRight className='h-4 w-4 shrink-0' />
                      )}
                      <span>{formatDay(g.date)}</span>
                      <span className='text-muted-foreground ml-1 text-xs font-normal'>
                        ({g.rows.length}{' '}
                        {g.rows.length === 1 ? 'institution' : 'institutions'})
                      </span>
                    </div>
                  </td>
                  <td className='px-2 py-2 text-right'>
                    {g.bills.toLocaleString('en-IN')}
                  </td>
                  <td
                    className='px-2 py-2 text-right'
                    title={formatCurrency(g.billed)}
                  >
                    {formatINRCompact(g.billed)}
                  </td>
                  <td className='px-2 py-2 text-right'>
                    {g.students.toLocaleString('en-IN')}
                  </td>
                  <td className='px-2 py-2 text-right'>
                    {g.receipts.toLocaleString('en-IN')}
                  </td>
                  <td
                    className='px-2 py-2 text-right font-semibold text-green-700'
                    title={formatCurrency(g.collected)}
                  >
                    {formatINRCompact(g.collected)}
                  </td>
                </tr>
                {isOpen &&
                  g.rows.map((r) => (
                    <tr
                      key={`${g.date}:${r.institution_id}`}
                      className='bg-muted/20 border-b text-xs'
                    >
                      <td className='text-muted-foreground py-1.5 pr-2 pl-7'>
                        {r.institution_name}
                      </td>
                      <td className='px-2 py-1.5 text-right'>
                        {num(r.bills_created).toLocaleString('en-IN')}
                      </td>
                      <td
                        className='px-2 py-1.5 text-right'
                        title={formatCurrency(num(r.amount_billed))}
                      >
                        {formatINRCompact(r.amount_billed)}
                      </td>
                      <td className='px-2 py-1.5 text-right'>
                        {num(r.students_billed).toLocaleString('en-IN')}
                      </td>
                      <td className='px-2 py-1.5 text-right'>
                        {num(r.receipts_created).toLocaleString('en-IN')}
                      </td>
                      <td
                        className='px-2 py-1.5 text-right text-green-700'
                        title={formatCurrency(num(r.amount_collected))}
                      >
                        {formatINRCompact(r.amount_collected)}
                      </td>
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
