'use client';

import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { OnlinePaymentButton } from '@/components/billing/online-payment-button';
import type { TransportCollectable } from '@/hooks/billing/use-transport-collectables';

function inr(n: number): string {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface TransportBillsTableProps {
  rows: TransportCollectable[];
  instName: (id: string | null) => string;
  /** Whether the user may collect (billing.transport.collect) — controls the Pay button. */
  canCollect: boolean;
}

export function TransportBillsTable({ rows, instName, canCollect }: TransportBillsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Learner</TableHead>
          <TableHead>Institution</TableHead>
          <TableHead>Route / Stop</TableHead>
          <TableHead className='text-right'>Outstanding</TableHead>
          <TableHead className='text-right'>Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || '—';
          const route = r.route_number || r.route_name || '—';
          const routeStop = r.stop_name ? `${route} · ${r.stop_name}` : route;
          const payable = (r.payable_bill_ids?.length ?? 0) > 0 && Number(r.outstanding_amount) > 0;
          return (
            <TableRow key={r.student_id}>
              <TableCell className='font-medium'>
                <div>{name}</div>
                <div className='text-muted-foreground font-mono text-xs'>{r.roll_number || '—'}</div>
              </TableCell>
              <TableCell className='text-sm'>{instName(r.institution_id)}</TableCell>
              <TableCell className='text-sm'>{routeStop}</TableCell>
              <TableCell className='text-right font-medium'>{inr(Number(r.outstanding_amount))}</TableCell>
              <TableCell className='text-right'>
                {payable ? (
                  canCollect ? (
                    <OnlinePaymentButton
                      studentId={r.student_id}
                      billIds={r.payable_bill_ids}
                      totalAmount={Number(r.outstanding_amount)}
                      size='sm'
                    />
                  ) : (
                    <span className='text-muted-foreground text-xs'>No collect permission</span>
                  )
                ) : (
                  <Badge variant='outline'>Paid</Badge>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
