'use client';

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  formatCurrency,
  formatINRCompact,
  num,
  drilldown,
  type DrilldownScope,
} from './_utils';
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

/** A figure inside an expandable row — must not also toggle the row. */
function CellLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className='rounded px-1 underline-offset-2 hover:underline'
    >
      {children}
    </Link>
  );
}

export function DailyActivityBreakdown({
  data,
  loading,
  scope,
}: {
  data?: BillingDailyActivityRow[];
  loading: boolean;
  /** Active institution filter, carried into every drill-down link. */
  scope: DrilldownScope;
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

  // Receipts carry a date filter, so they open exactly that day. The bill and
  // learner lists have no created-on filter, so they open scoped to the
  // institution only.
  const dayReceipts = (date: string, institutionId = scope.institutionId) =>
    drilldown.receipts({ institutionId, date_from: date, date_to: date });
  const bills = (institutionId = scope.institutionId) =>
    drilldown.bills({ institutionId });
  const students = (institutionId = scope.institutionId) =>
    drilldown.students({ institutionId });

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
                    <CellLink href={bills()}>
                      {g.bills.toLocaleString('en-IN')}
                    </CellLink>
                  </td>
                  <td
                    className='px-2 py-2 text-right'
                    title={formatCurrency(g.billed)}
                  >
                    <CellLink href={bills()}>
                      {formatINRCompact(g.billed)}
                    </CellLink>
                  </td>
                  <td className='px-2 py-2 text-right'>
                    <CellLink href={students()}>
                      {g.students.toLocaleString('en-IN')}
                    </CellLink>
                  </td>
                  <td className='px-2 py-2 text-right'>
                    <CellLink href={dayReceipts(g.date)}>
                      {g.receipts.toLocaleString('en-IN')}
                    </CellLink>
                  </td>
                  <td
                    className='px-2 py-2 text-right font-semibold text-green-700'
                    title={formatCurrency(g.collected)}
                  >
                    <CellLink href={dayReceipts(g.date)}>
                      {formatINRCompact(g.collected)}
                    </CellLink>
                  </td>
                </tr>
                {isOpen &&
                  g.rows.map((r) => (
                    <tr
                      key={`${g.date}:${r.institution_id}`}
                      className='bg-muted/20 border-b text-xs'
                    >
                      <td className='text-muted-foreground py-1.5 pr-2 pl-7'>
                        <CellLink href={dayReceipts(g.date, r.institution_id)}>
                          {r.institution_name}
                        </CellLink>
                      </td>
                      <td className='px-2 py-1.5 text-right'>
                        <CellLink href={bills(r.institution_id)}>
                          {num(r.bills_created).toLocaleString('en-IN')}
                        </CellLink>
                      </td>
                      <td
                        className='px-2 py-1.5 text-right'
                        title={formatCurrency(num(r.amount_billed))}
                      >
                        <CellLink href={bills(r.institution_id)}>
                          {formatINRCompact(r.amount_billed)}
                        </CellLink>
                      </td>
                      <td className='px-2 py-1.5 text-right'>
                        <CellLink href={students(r.institution_id)}>
                          {num(r.students_billed).toLocaleString('en-IN')}
                        </CellLink>
                      </td>
                      <td className='px-2 py-1.5 text-right'>
                        <CellLink href={dayReceipts(g.date, r.institution_id)}>
                          {num(r.receipts_created).toLocaleString('en-IN')}
                        </CellLink>
                      </td>
                      <td
                        className='px-2 py-1.5 text-right text-green-700'
                        title={formatCurrency(num(r.amount_collected))}
                      >
                        <CellLink href={dayReceipts(g.date, r.institution_id)}>
                          {formatINRCompact(r.amount_collected)}
                        </CellLink>
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
