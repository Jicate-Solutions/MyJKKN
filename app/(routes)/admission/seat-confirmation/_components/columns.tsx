'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import type { AdmissionPaymentRow } from '@/lib/services/admission/seat-confirmation-service';
import { DataTableRowActions } from './row-actions';

export const PAYMENT_STATUSES = [
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
  { value: 'refund_pending', label: 'Refund Pending' },
  { value: 'refunded', label: 'Refunded' },
];

export function getPaymentCandidateName(payment: AdmissionPaymentRow): string {
  const lead = payment.application?.admission_lead;
  if (lead?.full_name) return lead.full_name;
  const formData = payment.application?.form_data as Record<string, unknown> | null;
  const personal = formData?.personal as Record<string, unknown> | undefined;
  if (personal?.name) return String(personal.name);
  return payment.receipt_number || 'Unknown';
}

export function getStatusBadge(status: string) {
  switch (status) {
    case 'paid':
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200">
          Paid
        </Badge>
      );
    case 'pending':
      return (
        <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
          Pending
        </Badge>
      );
    case 'failed':
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200">
          Failed
        </Badge>
      );
    case 'refund_pending':
      return (
        <Badge className="bg-orange-100 text-orange-700 border-orange-200">
          Refund Pending
        </Badge>
      );
    case 'refunded':
      return (
        <Badge className="bg-gray-100 text-gray-700 border-gray-200">
          Refunded
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export const columns: ColumnDef<AdmissionPaymentRow>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value: boolean) =>
          table.toggleAllPageRowsSelected(!!value)
        }
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    maxSize: 50,
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: 'candidate',
    accessorFn: (row) => getPaymentCandidateName(row),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Candidate" />
    ),
    cell: ({ row }) => {
      const payment = row.original;
      const name = getPaymentCandidateName(payment);
      const appNumber =
        payment.application?.application_number || payment.id.slice(0, 8);
      const phone = payment.application?.admission_lead?.phone;
      return (
        <div className="flex flex-col">
          <span className="font-medium">{name}</span>
          <span className="text-xs text-muted-foreground">
            {appNumber}
            {phone ? ` · ${phone}` : ''}
          </span>
        </div>
      );
    },
    size: 240,
    minSize: 180,
  },
  {
    accessorKey: 'payment_type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    cell: ({ row }) => {
      const type = (row.getValue('payment_type') as string) || '';
      return (
        <Badge variant="outline" className="capitalize">
          {type.replace(/_/g, ' ')}
        </Badge>
      );
    },
    size: 150,
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => getStatusBadge(row.getValue('status') as string),
    size: 140,
  },
  {
    accessorKey: 'amount',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Amount" />
    ),
    cell: ({ row }) => {
      const amount = row.getValue('amount') as number;
      return (
        <span className="font-medium">₹{amount.toLocaleString()}</span>
      );
    },
    size: 120,
  },
  {
    accessorKey: 'payment_method',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Method" />
    ),
    cell: ({ row }) => {
      const method = (row.getValue('payment_method') as string | null) || '-';
      return (
        <span className="text-sm capitalize">
          {method.replace(/_/g, ' ')}
        </span>
      );
    },
    size: 130,
  },
  {
    accessorKey: 'paid_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Paid At" />
    ),
    cell: ({ row }) => {
      const paidAt = row.getValue('paid_at') as string | null;
      return paidAt ? (
        <span className="text-sm">
          {format(new Date(paidAt), 'MMM dd, yyyy')}
        </span>
      ) : (
        <span className="text-muted-foreground">-</span>
      );
    },
    size: 130,
  },
  {
    accessorKey: 'receipt_number',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Receipt" />
    ),
    cell: ({ row }) => {
      const receipt = row.getValue('receipt_number') as string | null;
      return receipt ? (
        <Badge variant="outline">{receipt}</Badge>
      ) : (
        <span className="text-muted-foreground">-</span>
      );
    },
    size: 140,
  },
  {
    id: 'actions',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Actions" />
    ),
    cell: ({ row }) => <DataTableRowActions row={row} />,
    size: 80,
    enableSorting: false,
    enableHiding: false,
  },
];
