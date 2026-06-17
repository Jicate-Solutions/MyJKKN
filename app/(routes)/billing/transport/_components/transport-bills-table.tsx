'use client';

import Link from 'next/link';
import { Receipt, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { OnlinePaymentButton } from '@/components/billing/online-payment-button';
import type { TransportCollectable } from '@/hooks/billing/use-transport-collectables';

const RETURN_TO = '/billing/transport';

function inr(n: number): string {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface TransportBillsTableProps {
  rows: TransportCollectable[];
  instName: (id: string | null) => string;
  /** billing.transport.collect — controls online Pay. */
  canCollect: boolean;
  /** billing.receipts.create — controls the manual Receipt link. */
  canReceipt: boolean;
}

export function TransportBillsTable({ rows, instName, canCollect, canReceipt }: TransportBillsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Learner</TableHead>
          <TableHead>Institution</TableHead>
          <TableHead>Route / Stop</TableHead>
          <TableHead className='text-right'>Outstanding</TableHead>
          <TableHead className='text-right'>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || '—';
          const route = r.route_number || r.route_name || '—';
          const routeStop = r.stop_name ? `${route} · ${r.stop_name}` : route;
          const payable = (r.payable_bill_ids?.length ?? 0) > 0 && Number(r.outstanding_amount) > 0;
          // Full normal-billing page for this learner (Pay Online + per-bill Generate Receipt /
          // Discount / Refund, Receipts & History tabs). returnTo brings them back here.
          const studentHref = `/billing/schedule/students/${r.student_id}?returnTo=${encodeURIComponent(RETURN_TO)}`;
          // Manual (offline) receipt for the transport bills only.
          const receiptHref = `/billing/receipts/new?bill_ids=${(r.payable_bill_ids ?? []).join(',')}&student_id=${r.student_id}&returnTo=${encodeURIComponent(RETURN_TO)}`;
          return (
            <TableRow key={r.student_id}>
              <TableCell className='font-medium'>
                <Link href={studentHref} className='underline-offset-2 hover:text-primary hover:underline'>
                  {name}
                </Link>
                <div className='text-muted-foreground font-mono text-xs'>{r.roll_number || '—'}</div>
              </TableCell>
              <TableCell className='text-sm'>{instName(r.institution_id)}</TableCell>
              <TableCell className='text-sm'>{routeStop}</TableCell>
              <TableCell className='text-right font-medium'>{inr(Number(r.outstanding_amount))}</TableCell>
              <TableCell className='text-right'>
                <div className='flex items-center justify-end gap-1'>
                  {payable ? (
                    <>
                      {canCollect && (
                        <OnlinePaymentButton
                          studentId={r.student_id}
                          billIds={r.payable_bill_ids}
                          totalAmount={Number(r.outstanding_amount)}
                          size='sm'
                        />
                      )}
                      {canReceipt && (
                        <Button asChild variant='outline' size='sm' className='h-8 gap-1 px-2 text-xs'>
                          <Link href={receiptHref}><Receipt className='h-3.5 w-3.5' /> Receipt</Link>
                        </Button>
                      )}
                    </>
                  ) : (
                    <Badge variant='outline'>Paid</Badge>
                  )}
                  {/* Full billing page for this learner (all the normal-billing functions). */}
                  <Button asChild variant='ghost' size='sm' className='h-8 gap-1 px-2 text-xs'>
                    <Link href={studentHref}><ExternalLink className='h-3.5 w-3.5' /> Open</Link>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
