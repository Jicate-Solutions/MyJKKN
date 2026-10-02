'use client';

import { CheckCircle2, Loader2, Receipt, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { VacateBillStatus } from '@/types/hostel-vacate';

export const formatInr = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;

/** Step 1 — every hostel/mess bill (all years) with its status. */
export function BillsCard({
  bills,
  loading,
  error,
  snapshot,
  onRecheck,
  rechecking,
}: {
  bills: VacateBillStatus | null | undefined;
  loading: boolean;
  error: boolean;
  snapshot: boolean;
  /** Present only while the request is waiting on its bills (Step 1). */
  onRecheck?: () => void;
  rechecking?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <CardTitle className='text-base flex items-center gap-2'>
              <Receipt className='h-4 w-4' />
              Step 1 · Hostel &amp; Mess Bills
            </CardTitle>
            <CardDescription>
              {snapshot
                ? 'Bill position recorded when the vacate completed.'
                : 'Every hostel, mess and upgrade bill, all years. The request moves to the Principal once all are paid.'}
            </CardDescription>
          </div>
          {onRecheck && (
            <Button size='sm' variant='outline' onClick={onRecheck} disabled={rechecking}>
              {rechecking ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <RefreshCw className='mr-2 h-4 w-4' />
              )}
              Re-check
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className='space-y-3'>
        {loading ? (
          <div className='flex justify-center py-6'>
            <Loader2 className='h-5 w-5 animate-spin text-primary' />
          </div>
        ) : error || !bills ? (
          <p className='text-sm text-destructive'>Bill status could not be loaded.</p>
        ) : (
          <>
            {bills.total_outstanding > 0 ? (
              <div className='rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm'>
                <span className='font-medium text-destructive'>{formatInr(bills.total_outstanding)} outstanding</span>{' '}
                across {bills.unpaid_count} bill(s)
                {bills.overdue_amount > 0 && <> · {formatInr(bills.overdue_amount)} overdue</>}
              </div>
            ) : (
              <div className='rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900 flex items-center gap-2'>
                <CheckCircle2 className='h-4 w-4' />
                {bills.bills.length === 0 ? 'No hostel or mess bills on record.' : 'All hostel and mess bills are cleared.'}
              </div>
            )}
            {!bills.has_learner_link && (
              <p className='text-xs text-muted-foreground'>
                This resident has no learner record, so no learner bills apply.
              </p>
            )}
            {bills.bills.length > 0 && (
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bill</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead className='text-right'>Amount</TableHead>
                      <TableHead className='text-right'>Paid</TableHead>
                      <TableHead className='text-right'>Pending</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bills.bills.map((b) => (
                      <TableRow key={b.bill_id}>
                        <TableCell className='text-sm'>{b.category_name ?? b.description ?? '—'}</TableCell>
                        <TableCell className='text-xs text-muted-foreground'>{b.year_name ?? '—'}</TableCell>
                        <TableCell className='text-right text-sm'>{formatInr(b.amount)}</TableCell>
                        <TableCell className='text-right text-sm'>{formatInr(b.paid)}</TableCell>
                        <TableCell className='text-right text-sm font-medium'>{formatInr(b.pending)}</TableCell>
                        <TableCell className='text-xs text-muted-foreground'>{b.due_date ?? '—'}</TableCell>
                        <TableCell>
                          {b.pending === 0 ? (
                            <Badge variant='success'>Paid</Badge>
                          ) : b.is_overdue ? (
                            <Badge variant='destructive'>Overdue</Badge>
                          ) : (
                            <Badge variant='secondary'>Unpaid</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
