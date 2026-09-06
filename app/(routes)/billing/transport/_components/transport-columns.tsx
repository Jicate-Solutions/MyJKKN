'use client';

import Link from 'next/link';
import { ReceiptIndianRupee } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TransportPayOnlineButton } from './transport-pay-online-button';
import type { PermissionColumnDef } from '@/components/ui/data-table';
import {
  PERSON_TYPE_LABEL,
  type TransportCollectable,
} from '@/hooks/billing/use-transport-collectables';

const RETURN_TO = '/billing/transport';

function inr(n: number): string {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Transport-bill payment status for a learner, derived from billed vs outstanding.
export function paymentStatus(billed: number, outstanding: number): { label: string; className: string } {
  if (billed <= 0) return { label: '—', className: 'text-muted-foreground' };
  if (outstanding <= 0) return { label: 'Paid', className: 'bg-green-100 text-green-800 border-green-200' };
  if (outstanding < billed) return { label: 'Partial', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' };
  return { label: 'Unpaid', className: 'bg-orange-100 text-orange-800 border-orange-200' };
}

interface ColumnOpts {
  instName: (id: string | null) => string;
  canCollect: boolean;
  canReceipt: boolean;
}

const paidOf = (r: TransportCollectable) =>
  Math.max(0, (Number(r.total_billed) || 0) - (Number(r.outstanding_amount) || 0));

export function getTransportColumns({ instName, canCollect, canReceipt }: ColumnOpts): PermissionColumnDef<TransportCollectable>[] {
  return [
    {
      // Id deliberately UNCHANGED ('learner', not 'person'). Column ids key the
      // persisted visibility state, any saved sorting, and the permission map —
      // renaming one silently stops all of those resolving after deploy, with no
      // error. Only the header text changes: this list has always carried Senior
      // Learners too, it just never said so.
      id: 'learner',
      header: 'Name',
      accessorFn: (r) => [r.first_name, r.last_name].filter(Boolean).join(' '),
      cell: ({ row }) => {
        const r = row.original;
        const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || '—';
        // The billing schedule page is keyed by learners_profiles.id. A Senior
        // Learner's id is a staff.id, so linking there resolves to nothing —
        // which is what this cell did for all 35 of them before person_type
        // existed to tell them apart. Their name is plain text instead.
        //
        // Tested for the NON-learner token, never for 'learner'. The two are not
        // symmetric: `=== 'learner'` treats anything unexpected — a React Query
        // cache served before the new RPC lands, an environment where the
        // migration has not run, a future third population — as a Senior Learner,
        // which would strip the billing link from all 1,266 learner rows at once
        // and surface no error at all. Failing the other way costs one dead link
        // on 35 rows, which is where this started.
        const isLearner = r.person_type !== 'staff';
        const href = `/billing/schedule/students/${r.student_id}?returnTo=${encodeURIComponent(RETURN_TO)}`;
        return (
          <div>
            {isLearner ? (
              <Link href={href} className='font-medium underline-offset-2 hover:text-primary hover:underline'>
                {name}
              </Link>
            ) : (
              <span className='font-medium'>{name}</span>
            )}
            <div className='text-muted-foreground font-mono text-xs'>{r.roll_number || '—'}</div>
          </div>
        );
      },
    },
    {
      id: 'person_type',
      header: 'Type',
      // Falls back to the Learner label, never to the raw database token: an
      // unrecognised value printing 'staff' on screen would leak the column
      // vocabulary into the UI and read as a third, nonexistent category.
      accessorFn: (r) => PERSON_TYPE_LABEL[r.person_type] ?? PERSON_TYPE_LABEL.learner,
      cell: ({ row }) => {
        const r = row.original;
        const isSenior = r.person_type === 'staff';
        return (
          <Badge
            variant='outline'
            className={`whitespace-nowrap text-xs ${
              isSenior
                ? 'border-purple-200 bg-purple-50 text-purple-800'
                : 'border-blue-200 bg-blue-50 text-blue-800'
            }`}
          >
            {PERSON_TYPE_LABEL[r.person_type] ?? PERSON_TYPE_LABEL.learner}
          </Badge>
        );
      },
    },
    {
      id: 'institution',
      header: 'Institution',
      accessorFn: (r) => instName(r.institution_id),
      cell: ({ row }) => <span className='text-sm'>{instName(row.original.institution_id)}</span>,
    },
    {
      id: 'route',
      header: 'Route / Stop',
      accessorFn: (r) => r.route_number || r.route_name || '',
      cell: ({ row }) => {
        const r = row.original;
        const route = r.route_number || r.route_name || '—';
        return <span className='text-sm'>{r.stop_name ? `${route} · ${r.stop_name}` : route}</span>;
      },
    },
    {
      id: 'billed',
      header: 'Billed',
      accessorKey: 'total_billed',
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className='text-right'>
            <div className='font-medium'>{inr(Number(r.total_billed))}</div>
            <div className='text-muted-foreground text-xs'>{r.bill_count} bill{r.bill_count === 1 ? '' : 's'}</div>
          </div>
        );
      },
    },
    {
      id: 'paid',
      header: 'Paid',
      accessorFn: paidOf,
      cell: ({ row }) => <div className='text-right text-green-600'>{inr(paidOf(row.original))}</div>,
    },
    {
      id: 'outstanding',
      header: 'Outstanding',
      accessorKey: 'outstanding_amount',
      cell: ({ row }) => (
        <div className='text-right font-medium text-orange-600'>{inr(Number(row.original.outstanding_amount))}</div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessorFn: (r) => paymentStatus(Number(r.total_billed) || 0, Number(r.outstanding_amount) || 0).label,
      cell: ({ row }) => {
        const s = paymentStatus(Number(row.original.total_billed) || 0, Number(row.original.outstanding_amount) || 0);
        return <Badge variant='outline' className={`text-xs ${s.className}`}>{s.label}</Badge>;
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const r = row.original;
        const outstanding = Number(r.outstanding_amount) || 0;
        const payable = (r.payable_bill_ids?.length ?? 0) > 0 && outstanding > 0;
        const receiptHref = `/billing/receipts/new?bill_ids=${(r.payable_bill_ids ?? []).join(',')}&student_id=${r.student_id}&returnTo=${encodeURIComponent(RETURN_TO)}`;
        return (
          <div className='flex items-center justify-end gap-1'>
            {payable && (
              <>
                {canCollect && (
                  <TransportPayOnlineButton
                    studentId={r.student_id}
                    billIds={r.payable_bill_ids}
                    size='sm'
                  />
                )}
                {canReceipt && (
                  <Button asChild variant='outline' size='sm' className='h-8 gap-1 px-2 text-xs'>
                    <Link href={receiptHref}><ReceiptIndianRupee className='h-3.5 w-3.5' /> Receipt</Link>
                  </Button>
                )}
              </>
            )}
          </div>
        );
      },
    },
  ];
}
