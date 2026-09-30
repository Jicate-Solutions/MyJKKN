'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { BILL_CANCEL_REASON_LABELS } from '@/types/billing-bill-cancellation';
import type { BillCancelRequest } from '@/types/billing-bill-cancel-request';

/**
 * Flat projection of a request for the table.
 *
 * DataTable constrains its rows to ExportableData — scalars only — and
 * BillCancelRequest carries a nested bill_snapshot object. Flattening here
 * satisfies that honestly instead of casting it away, and it is also what
 * makes the Excel export come out with real columns rather than "[object
 * Object]". The dialog still gets the full request, looked up by id.
 */
export interface CancellationRow {
  id: string;
  request_number: string;
  bill_description: string;
  category_name: string;
  amount: number;
  reason_label: string;
  requested_by_name: string;
  requested_by_role: string;
  requested_at: string;
  status: string;
  decided_by_name: string;
  decided_at: string;
  [key: string]: string | number | boolean | null | undefined;
}

export function toCancellationRow(r: BillCancelRequest): CancellationRow {
  return {
    id: r.id,
    request_number: r.request_number,
    bill_description: r.bill_snapshot?.bill_description ?? '',
    category_name: r.bill_snapshot?.category_name ?? '',
    amount: Number(r.amount ?? 0),
    reason_label: BILL_CANCEL_REASON_LABELS[r.reason_code] ?? r.reason_code,
    requested_by_name: r.requested_by_name ?? '',
    requested_by_role: r.requested_by_role ?? '',
    requested_at: r.requested_at,
    status: r.status,
    decided_by_name: r.decided_by_name ?? '',
    decided_at: r.decided_at ?? '',
  };
}

const inr = (v: number | null | undefined) =>
  v == null || v === 0 ? '—' : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function statusVariant(status: string) {
  if (status === 'approved') return 'default' as const;
  if (status === 'declined' || status === 'failed') return 'destructive' as const;
  return 'secondary' as const;
}

/**
 * Columns for the cancellation queue.
 *
 * No approve/decline buttons in the row: a decision needs the learner, the
 * bill and its full history, none of which fit here. The request number and
 * the trailing view icon both open the detail dialog, where the decision is
 * taken with that evidence on screen.
 *
 * `enableSorting: false` on the snapshot-derived columns is not a style
 * choice — sorting is server-side, and those values live inside a JSONB blob
 * that the paged query has no ORDER BY for.
 */
export function getCancellationColumns(
  onView: (id: string) => void
): ColumnDef<CancellationRow>[] {
  return [
    {
      accessorKey: 'request_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Request' />,
      cell: ({ row }) => (
        <Button
          variant='link'
          className='h-auto justify-start p-0 font-medium'
          onClick={() => onView(row.original.id)}
        >
          {row.original.request_number}
        </Button>
      ),
      size: 150,
    },
    {
      accessorKey: 'bill_description',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Bill' />,
      cell: ({ row }) => (
        <div className='min-w-0'>
          <p className='truncate' title={row.original.bill_description}>
            {row.original.bill_description || '—'}
          </p>
          {row.original.category_name && (
            <p className='text-muted-foreground truncate text-xs'>
              {row.original.category_name}
            </p>
          )}
        </div>
      ),
      enableSorting: false,
      size: 220,
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Amount' />,
      cell: ({ row }) => (
        <span className='font-semibold tabular-nums'>{inr(row.original.amount)}</span>
      ),
      size: 120,
    },
    {
      accessorKey: 'reason_label',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Reason' />,
      cell: ({ row }) => (
        <span className='block max-w-[200px] truncate' title={row.original.reason_label}>
          {row.original.reason_label}
        </span>
      ),
      enableSorting: false,
      size: 200,
    },
    {
      accessorKey: 'requested_by_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Raised by' />,
      cell: ({ row }) => (
        <div className='min-w-0'>
          <p className='truncate'>{row.original.requested_by_name || '—'}</p>
          {row.original.requested_by_role && (
            <p className='text-muted-foreground truncate text-xs'>
              {row.original.requested_by_role}
            </p>
          )}
        </div>
      ),
      size: 180,
    },
    {
      accessorKey: 'requested_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Raised' />,
      cell: ({ row }) => format(new Date(row.original.requested_at), 'dd MMM yyyy'),
      size: 130,
    },
    {
      accessorKey: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Status' />,
      cell: ({ row }) => (
        <Badge variant={statusVariant(row.original.status)}>
          {row.original.status.replace(/_/g, ' ')}
        </Badge>
      ),
      size: 140,
    },
    {
      accessorKey: 'decided_by_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Decided by' />,
      cell: ({ row }) =>
        row.original.decided_by_name ? (
          <div className='min-w-0'>
            <p className='truncate'>{row.original.decided_by_name}</p>
            {row.original.decided_at && (
              <p className='text-muted-foreground truncate text-xs'>
                {format(new Date(row.original.decided_at), 'dd MMM yyyy')}
              </p>
            )}
          </div>
        ) : (
          '—'
        ),
      size: 160,
    },
    {
      id: 'actions',
      header: () => <span className='sr-only'>Actions</span>,
      cell: ({ row }) => (
        <div className='flex justify-end'>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant='ghost'
                  size='sm'
                  className='h-8 w-8 p-0'
                  onClick={() => onView(row.original.id)}
                  // Icon-only, so the accessible name has to come from here —
                  // naming the request keeps a screen-reader row list usable.
                  aria-label={`View ${row.original.request_number}`}
                >
                  <Eye className='h-4 w-4' />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>View details</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      size: 70,
    },
  ];
}
