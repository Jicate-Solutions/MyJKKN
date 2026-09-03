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
import type { ReceiptCancelRequest } from '@/lib/services/billing/receipts/receipt-cancellation-service';

/**
 * Flat projection of a request for the table.
 *
 * DataTable constrains its rows to ExportableData — scalars only — and
 * ReceiptCancelRequest carries a nested receipt_snapshot object. Flattening
 * here satisfies that honestly instead of casting it away, and it is also what
 * makes the Excel export come out with real columns rather than "[object
 * Object]". The dialog still gets the full request, looked up by id.
 */
export interface CancellationRow {
  id: string;
  request_number: string;
  receipt_number: string;
  amount: number;
  reason: string;
  requested_by_name: string;
  requested_by_role: string;
  requested_at: string;
  status: string;
  [key: string]: string | number | boolean | null | undefined;
}

export function toCancellationRow(r: ReceiptCancelRequest): CancellationRow {
  return {
    id: r.id,
    request_number: r.request_number,
    receipt_number: r.receipt_snapshot?.receipt_number ?? '',
    amount: Number(r.receipt_snapshot?.payment_amount ?? 0),
    reason: r.reason,
    requested_by_name: r.requested_by_name ?? '',
    requested_by_role: r.requested_by_role ?? '',
    requested_at: r.requested_at,
    status: r.status,
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
 * receipt and the bills it settled, none of which fit here. The request number
 * and the trailing view icon both open the detail dialog, where the decision is
 * taken with that evidence on screen.
 *
 * `enableSorting: false` on the three snapshot-derived columns is not a style
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
      accessorKey: 'receipt_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Receipt' />,
      cell: ({ row }) => row.original.receipt_number || '—',
      enableSorting: false,
      size: 150,
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Amount' />,
      cell: ({ row }) => (
        <span className='font-semibold tabular-nums'>{inr(row.original.amount)}</span>
      ),
      enableSorting: false,
      size: 120,
    },
    {
      accessorKey: 'reason',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Reason' />,
      cell: ({ row }) => (
        <span className='block max-w-[280px] truncate' title={row.original.reason}>
          {row.original.reason}
        </span>
      ),
      enableSorting: false,
      size: 280,
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
