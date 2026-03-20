'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';
import type { EducationConsultant } from '@/types/education-consultants';
import { DataTableRowActions } from './row-actions';

// ─── Helpers ────────────────────────────────────────────────────────────────

export function getStatusBadgeClass(status: string): string {
  return status === 'active'
    ? 'bg-green-100 text-green-800'
    : 'bg-gray-100 text-gray-800';
}

export function getPerformanceBadgeClass(rating: number | null): string {
  if (!rating || rating >= 4) return 'bg-green-100 text-green-800';
  if (rating >= 3) return 'bg-blue-100 text-blue-800';
  if (rating >= 2) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

export function getPerformanceLabel(rating: number | null): string {
  if (!rating) return 'N/A';
  if (rating >= 4) return 'Excellent';
  if (rating >= 3) return 'Good';
  if (rating >= 2) return 'Average';
  return 'Poor';
}

// ─── Column Definitions ─────────────────────────────────────────────────────

export const columns: ColumnDef<EducationConsultant>[] = [
  // Select
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

  // Name / Contact
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Publisher" />
    ),
    cell: ({ row }) => {
      const publisher = row.original as EducationConsultant & { website?: string };
      return (
        <div className="min-w-[160px]">
          <div className="flex items-center gap-1 font-medium">
            {publisher.name}
            {publisher.website && (
              <a
                href={publisher.website}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
              </a>
            )}
          </div>
          {publisher.contact_person && (
            <div className="text-xs text-muted-foreground">
              {publisher.contact_person}
            </div>
          )}
        </div>
      );
    },
  },

  // Email
  {
    accessorKey: 'email',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email" />
    ),
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.getValue('email') || '—'}
      </span>
    ),
  },

  // Status
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = (row.getValue('status') as string) || 'inactive';
      return (
        <Badge className={getStatusBadgeClass(status)}>
          {status}
        </Badge>
      );
    },
  },

  // Performance
  {
    accessorKey: 'performance_rating',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Performance" />
    ),
    cell: ({ row }) => {
      const rating = row.getValue('performance_rating') as number | null;
      return (
        <Badge className={getPerformanceBadgeClass(rating)}>
          {getPerformanceLabel(rating)}
        </Badge>
      );
    },
  },

  // Total Leads
  {
    accessorKey: 'total_leads_referred',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Total Leads" />
    ),
    cell: ({ row }) => (
      <span className="font-medium">
        {(row.getValue('total_leads_referred') as number) ?? 0}
      </span>
    ),
  },

  // Conversions
  {
    accessorKey: 'total_conversions',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Conversions" />
    ),
    cell: ({ row }) => (
      <span>{(row.getValue('total_conversions') as number) ?? 0}</span>
    ),
  },

  // Conversion Rate
  {
    accessorKey: 'conversion_rate',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Conv. Rate" />
    ),
    cell: ({ row }) => {
      const rate = (row.getValue('conversion_rate') as number) ?? 0;
      return <span>{rate.toFixed(1)}%</span>;
    },
  },

  // Pending Commission
  {
    accessorKey: 'pending_commission',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Pending Comm." />
    ),
    cell: ({ row }) => {
      const amount = (row.getValue('pending_commission') as number) ?? 0;
      return (
        <span className="font-semibold text-yellow-600">
          ₹{amount.toLocaleString()}
        </span>
      );
    },
  },

  // Total Earned
  {
    accessorKey: 'total_commission_earned',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Total Earned" />
    ),
    cell: ({ row }) => {
      const amount = (row.getValue('total_commission_earned') as number) ?? 0;
      return <span>₹{amount.toLocaleString()}</span>;
    },
  },

  // Row actions
  {
    id: 'actions',
    cell: ({ row }) => <DataTableRowActions row={row} />,
    enableSorting: false,
    enableHiding: false,
    size: 48,
  },
];
