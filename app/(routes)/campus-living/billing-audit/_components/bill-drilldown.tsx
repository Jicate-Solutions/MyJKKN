'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BILL_CLASS_LABELS, type BillingAuditRow } from '@/types/campus-living-billing-audit';
import { BillStatusBadge, BandStatusBadge, FindingBadges } from './badges';
import { formatDate, formatInr } from './format';

/**
 * The per-learner drill-down. The bills arrive on the row itself (the RPC
 * aggregates them as jsonb), so opening this costs no request — which also
 * means it can never disagree with the totals in the row it sits on.
 */
export function BillDrilldown({ row }: { row: BillingAuditRow }) {
  const [open, setOpen] = useState(false);
  const count = row.bills.length;

  return (
    <>
      <Button
        type='button'
        variant='outline'
        size='sm'
        className='h-7 px-2 text-xs'
        onClick={() => setOpen(true)}
        disabled={count === 0}
        title={count === 0 ? 'No hostel-kind bills in the target year' : 'View bills'}
      >
        <Receipt className='mr-1 h-3.5 w-3.5' />
        {count === 0 ? 'No bills' : `${count} bill${count === 1 ? '' : 's'}`}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* DialogContent has no max-height of its own; a learner with many
            instalments would otherwise push the close button off-screen. */}
        <DialogContent className='max-w-4xl max-h-[85vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>{row.full_name}</DialogTitle>
            <DialogDescription>
              {[row.roll_number ?? row.register_number, row.institution_name, row.program_name]
                .filter(Boolean)
                .join(' · ')}
            </DialogDescription>
          </DialogHeader>

          <div className='grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4'>
            <Fact label='Bed'>
              {row.is_allocated
                ? [row.block_name, row.room_number, row.bed_number].filter(Boolean).join(' / ')
                : 'Not allocated'}
            </Fact>
            <Fact label='Billed category'>{row.tagged_category_name ?? '—'}</Fact>
            <Fact label='Bed category'>{row.seated_category_name ?? '—'}</Fact>
            <Fact label='Mess'>{row.mess_category_name ?? '—'}</Fact>
            <Fact label='Band fee (academic)'>{formatInr(row.band_fee)}</Fact>
            <Fact label='Entitled'>
              <span className='inline-flex items-center gap-2'>
                {row.entitled_category_name ?? '—'}
                <BandStatusBadge status={row.band_status} />
              </span>
            </Fact>
            <Fact label='Structure: room / mess'>
              {formatInr(row.expected_room_fee)} / {formatInr(row.expected_mess_fee)}
            </Fact>
            <Fact label='Expected upgrade'>{formatInr(row.expected_upgrade_fee)}</Fact>
          </div>

          <div className='mt-2'>
            <FindingBadges findings={row.findings} />
          </div>

          <div className='overflow-x-auto rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Bill</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead className='text-right'>Amount</TableHead>
                  <TableHead className='text-right'>Paid</TableHead>
                  <TableHead className='text-right'>Pending</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {row.bills.map((b) => (
                  <TableRow key={b.bill_id} className={cn(b.is_overdue && 'bg-red-50/60 dark:bg-red-950/20')}>
                    <TableCell>
                      <Badge variant='secondary' className='font-normal'>
                        {BILL_CLASS_LABELS[b.class] ?? b.class}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className='font-medium'>{b.category_name}</div>
                      {b.description && (
                        <div className='max-w-[260px] truncate text-xs text-muted-foreground' title={b.description}>
                          {b.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className='text-xs text-muted-foreground'>{b.year_name ?? '—'}</TableCell>
                    <TableCell className='text-right tabular-nums'>{formatInr(b.amount)}</TableCell>
                    <TableCell className='text-right tabular-nums text-emerald-700 dark:text-emerald-400'>
                      {formatInr(b.paid)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>{formatInr(b.pending)}</TableCell>
                    <TableCell>
                      <BillStatusBadge status={b.status} />
                    </TableCell>
                    <TableCell className={cn('whitespace-nowrap', b.is_overdue && 'font-medium text-red-700 dark:text-red-400')}>
                      {formatDate(b.due_date)}
                      {b.is_overdue && <span className='ml-1 text-xs'>(overdue)</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className='flex flex-wrap justify-end gap-x-6 text-sm'>
            <span>
              Billed <strong className='tabular-nums'>{formatInr(row.total_billed)}</strong>
            </span>
            <span className='text-emerald-700 dark:text-emerald-400'>
              Paid <strong className='tabular-nums'>{formatInr(row.total_paid)}</strong>
            </span>
            <span className='text-amber-700 dark:text-amber-400'>
              Outstanding <strong className='tabular-nums'>{formatInr(row.total_outstanding)}</strong>
            </span>
            <span className='text-red-700 dark:text-red-400'>
              Overdue <strong className='tabular-nums'>{formatInr(row.overdue_amount)}</strong>
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className='text-[11px] uppercase tracking-wide text-muted-foreground'>{label}</div>
      <div className='font-medium'>{children}</div>
    </div>
  );
}
