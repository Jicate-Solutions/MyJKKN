'use client';

/**
 * A list of salary revision requests, for the asker's screen and the
 * principal's check list. Each row opens the single-request view.
 */

import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { changeText, toAmount } from '@/lib/hr/salary-revision';
import type { SalaryRevisionListRow } from '@/hooks/hr/use-salary-revisions';
import { RevisionFlags, StatusBadge, SuggestionBeside, rupees } from './revision-bits';

export function RevisionTable({
  rows,
  emptyMessage,
  showAsker = true,
}: {
  rows: SalaryRevisionListRow[];
  emptyMessage: string;
  showAsker?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className='rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground'>
        {emptyMessage}
      </p>
    );
  }
  return (
    <div className='overflow-x-auto rounded-md border border-border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Team member</TableHead>
            <TableHead className='text-right'>Pay now</TableHead>
            <TableHead className='text-right'>Asked for</TableHead>
            <TableHead className='text-right'>Suggested</TableHead>
            {showAsker && <TableHead>Asked by</TableHead>}
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const finalPay = toAmount(r.final_monthly_gross);
            return (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/hr/salary-revisions/${r.id}`} className='font-medium underline-offset-2 hover:underline'>
                    {r.person_name}
                  </Link>
                  <div className='text-xs text-muted-foreground'>
                    {[r.designation, r.department_name, r.institution_name].filter(Boolean).join(' · ')}
                  </div>
                  <div className='mt-1'><RevisionFlags row={r} /></div>
                </TableCell>
                <TableCell className='text-right tabular-nums'>{rupees(r.current_monthly_gross)}</TableCell>
                <TableCell className='text-right tabular-nums'>
                  {rupees(r.asked_monthly_gross)}
                  <div className='text-xs text-muted-foreground'>
                    {changeText(toAmount(r.current_monthly_gross), toAmount(r.asked_monthly_gross))}
                  </div>
                  {finalPay !== null && finalPay !== toAmount(r.asked_monthly_gross) && (
                    <div className='text-xs font-medium'>Director&apos;s figure: {rupees(finalPay)}</div>
                  )}
                </TableCell>
                <TableCell className='text-right'><SuggestionBeside suggestion={r.suggestion} /></TableCell>
                {showAsker && (
                  <TableCell className='text-sm'>{r.is_self ? 'Themselves' : r.asked_by_name}</TableCell>
                )}
                <TableCell><StatusBadge status={r.status} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
