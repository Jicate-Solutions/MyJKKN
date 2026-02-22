'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Mail, Phone } from 'lucide-react';
import type { OfferLetterRow } from '@/lib/services/admission/offer-letter-service';

export const RESPONSE_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'expired', label: 'Expired' },
];

export function getResponseBadgeClass(response: string | null): string {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    accepted: 'bg-green-100 text-green-800',
    declined: 'bg-red-100 text-red-800',
    expired: 'bg-gray-100 text-gray-800',
  };
  return colors[response || 'pending'] || 'bg-gray-100 text-gray-800';
}

export const columns: ColumnDef<OfferLetterRow>[] = [
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
    enableSorting: false,
    enableHiding: false,
    size: 40,
  },

  {
    accessorKey: 'letter_number',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Letter Number" />
    ),
    cell: ({ row }) => {
      const num = row.getValue('letter_number') as string | null;
      return (
        <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
          {num ?? row.original.id.slice(0, 12)}
        </code>
      );
    },
    size: 180,
  },

  {
    id: 'applicant',
    accessorFn: (row) =>
      row.application?.admission_lead?.full_name ?? 'Unknown',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Applicant" />
    ),
    cell: ({ row }) => {
      const lead = row.original.application?.admission_lead;
      const name = lead?.full_name ?? 'Unknown';
      const email = lead?.email;
      const phone = lead?.phone;
      return (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{name}</span>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {email}
              </span>
            )}
            {phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {phone}
              </span>
            )}
          </div>
        </div>
      );
    },
    size: 260,
  },

  {
    accessorKey: 'program_offered',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Program" />
    ),
    cell: ({ row }) => {
      const program = row.getValue('program_offered') as string | null;
      return (
        <span className="text-sm text-muted-foreground">{program ?? '—'}</span>
      );
    },
    size: 160,
  },

  {
    accessorKey: 'response',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const response = row.getValue('response') as string | null;
      return (
        <Badge className={getResponseBadgeClass(response)}>
          {response ?? 'pending'}
        </Badge>
      );
    },
    size: 120,
  },

  {
    accessorKey: 'sent_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Sent At" />
    ),
    cell: ({ row }) => {
      const date = row.getValue('sent_at') as string | null;
      return (
        <span className="text-sm text-muted-foreground">
          {date ? format(new Date(date), 'MMM dd, yyyy') : '—'}
        </span>
      );
    },
    size: 130,
  },

  {
    accessorKey: 'valid_until',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Valid Until" />
    ),
    cell: ({ row }) => {
      const date = row.getValue('valid_until') as string | null;
      if (!date) return <span className="text-sm text-muted-foreground">—</span>;
      const isExpired = new Date(date) < new Date();
      return (
        <span
          className={`text-sm ${isExpired ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}
        >
          {format(new Date(date), 'MMM dd, yyyy')}
        </span>
      );
    },
    size: 130,
  },

  {
    accessorKey: 'admission_type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Admission Type" />
    ),
    cell: ({ row }) => {
      const type = row.getValue('admission_type') as string | null;
      return (
        <span className="text-sm text-muted-foreground">{type ?? '—'}</span>
      );
    },
    size: 130,
  },
];
