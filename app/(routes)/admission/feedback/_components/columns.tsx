'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import type { FeedbackCandidate } from '@/lib/services/admission/feedback-service';
import { FeedbackRowActions } from './row-actions';

// ─── Status helpers ────────────────────────────────────────────────────────

export function getStatusBadge(status: string) {
  switch (status) {
    case 'declined_offer':
    case 'declined':
      return (
        <Badge className="bg-orange-100 text-orange-700 border-orange-200">
          Declined Offer
        </Badge>
      );
    case 'expired_offer':
    case 'expired':
      return (
        <Badge className="bg-gray-100 text-gray-700 border-gray-200">
          Offer Expired
        </Badge>
      );
    case 'not_shortlisted':
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200">
          Not Shortlisted
        </Badge>
      );
    case 'withdrew':
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200">
          Withdrew
        </Badge>
      );
    case 'lost':
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200">Lost</Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// ─── Column definitions ────────────────────────────────────────────────────

export const columns: ColumnDef<FeedbackCandidate>[] = [
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
    accessorKey: 'full_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Candidate" />
    ),
    cell: ({ row }) => {
      const candidate = row.original;
      return (
        <div className="flex items-center gap-2">
          <div
            className={`p-1.5 rounded-full ${
              candidate.lost_reason ? 'bg-green-100' : 'bg-gray-100'
            }`}
          >
            {candidate.lost_reason ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <Clock className="h-3.5 w-3.5 text-gray-400" />
            )}
          </div>
          <div>
            <p className="font-medium">{candidate.full_name || 'Unknown'}</p>
            <p className="text-xs text-muted-foreground">{candidate.email}</p>
          </div>
        </div>
      );
    },
    minSize: 200,
  },
  {
    accessorKey: 'interested_programs',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Program" />
    ),
    cell: ({ row }) => {
      const programs = row.original.interested_programs;
      const label = Array.isArray(programs)
        ? programs.join(', ')
        : (programs || '—');
      return <span className="text-sm">{label || '—'}</span>;
    },
    enableSorting: false,
    minSize: 160,
  },
  {
    accessorKey: 'funnel_stage',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => getStatusBadge(row.original.funnel_stage || 'lost'),
    minSize: 140,
  },
  {
    accessorKey: 'lost_reason',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Reason" />
    ),
    cell: ({ row }) => {
      const reason = row.original.lost_reason;
      if (!reason) {
        return <span className="text-muted-foreground text-sm">—</span>;
      }
      return (
        <Badge variant="outline" className="text-xs max-w-[180px] truncate">
          {reason}
        </Badge>
      );
    },
    minSize: 160,
  },
  {
    accessorKey: 'lost_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Date" />
    ),
    cell: ({ row }) => {
      const date = row.original.lost_at || row.original.created_at;
      if (!date) return <span className="text-muted-foreground text-sm">—</span>;
      return (
        <span className="text-sm text-muted-foreground">
          {format(new Date(date), 'MMM dd, yyyy')}
        </span>
      );
    },
    minSize: 120,
  },
  {
    id: 'responded',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Responded" />
    ),
    cell: ({ row }) => {
      const responded = !!row.original.lost_reason;
      return responded ? (
        <Badge className="bg-green-100 text-green-700 border-green-200">
          Yes
        </Badge>
      ) : (
        <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
          Pending
        </Badge>
      );
    },
    enableSorting: false,
    minSize: 100,
  },
  {
    id: 'actions',
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => <FeedbackRowActions row={row} />,
    maxSize: 60,
    enableSorting: false,
    enableHiding: false,
  },
];
