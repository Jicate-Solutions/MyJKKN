'use client';

// Column definitions for the "Granted & decided" eligibility DataTable.
// Split out of page.tsx when the hand-rolled <table> became the shared DataTable
// (sorting, column visibility, export and paging come with it).

import { format } from 'date-fns';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { LEAVE_ELIGIBILITY_STATUS_LABELS } from '@/types/hr-leave-types';
import { STATUS_TONE, fmtDateOnly, type EligibilityTableRow } from './eligibility-status';

export interface EligibilityColumnActions {
  /** Opens the in-app document viewer on this row's proof. */
  onViewDocs: (row: EligibilityTableRow) => void;
  /** Asks the page to open its withdraw confirmation. */
  onWithdraw: (row: EligibilityTableRow) => void;
}

const muted = (text: string) => <span className="text-muted-foreground">{text}</span>;

/** A timestamptz as a local date. Date-only columns go through fmtDateOnly instead. */
function fmtTimestamp(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : format(d, 'dd MMM yyyy');
}

export function getEligibilityColumns(
  actions: EligibilityColumnActions
): ColumnDef<EligibilityTableRow>[] {
  return [
    {
      accessorKey: 'staff_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Team member" />,
      size: 220,
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="block truncate font-medium">{row.original.staff_name ?? '—'}</span>
          {row.original.staff_code && (
            <span className="block truncate font-mono text-xs text-muted-foreground">
              {row.original.staff_code}
            </span>
          )}
        </div>
      ),
    },
    {
      // The NAME, resolved by the wrapper — hr_organization_id is a uuid.
      accessorKey: 'institution_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Institution" />,
      size: 220,
      cell: ({ row }) =>
        row.original.institution_name ? (
          <span className="block truncate text-sm" title={row.original.institution_name}>
            {row.original.institution_name}
          </span>
        ) : (
          muted('—')
        ),
    },
    {
      accessorKey: 'leave_type_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Leave type" />,
      size: 150,
      cell: ({ row }) => <span className="truncate">{row.original.leave_type_name?.trim() ?? '—'}</span>,
    },
    {
      accessorKey: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      size: 170,
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className={STATUS_TONE[row.original.status]} variant="secondary">
            {LEAVE_ELIGIBILITY_STATUS_LABELS[row.original.status]}
          </Badge>
          {row.original.granted_directly && (
            <span className="text-xs text-muted-foreground">granted by HR</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Requested" />,
      size: 120,
      cell: ({ row }) => fmtTimestamp(row.original.created_at) ?? muted('—'),
    },
    {
      accessorKey: 'decided_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Decided" />,
      size: 120,
      cell: ({ row }) => fmtTimestamp(row.original.decided_at) ?? muted('—'),
    },
    {
      accessorKey: 'entitled_days',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Days" />,
      size: 100,
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.entitled_days ?? muted('type default')}
        </span>
      ),
    },
    {
      accessorKey: 'valid_until',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Valid until" />,
      size: 120,
      cell: ({ row }) => fmtDateOnly(row.original.valid_until) ?? muted('no expiry'),
    },
    {
      id: 'documents',
      header: 'Document',
      size: 110,
      enableSorting: false,
      cell: ({ row }) => {
        const n = row.original.documents.length;
        // A direct HR grant carries no document by design; a request always
        // carries at least one.
        return n > 0 ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={(e) => {
              e.stopPropagation();
              actions.onViewDocs(row.original);
            }}
          >
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            View{n > 1 ? ` (${n})` : ''}
          </Button>
        ) : (
          muted('—')
        );
      },
    },
    {
      id: 'actions',
      header: '',
      size: 110,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) =>
        row.original.status === 'approved' ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              actions.onWithdraw(row.original);
            }}
          >
            Withdraw
          </Button>
        ) : null,
    },
  ];
}
