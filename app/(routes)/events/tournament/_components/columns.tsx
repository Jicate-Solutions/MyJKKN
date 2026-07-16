'use client';

// Sports Tournaments — advanced DataTable column definitions.
// Row actions (View / Edit / Change Status / Delete) are permission-gated by
// the caller:
//   view   → sports.tournaments.view (page access already implies it)
//   edit / change status → sports.tournaments.edit
//   delete → sports.tournaments.manage (no dedicated .delete key in the catalog)
// Status has no column of its own — the current status renders as a small badge
// under the (clickable) name, and transitions live in the actions dropdown.

import type { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Building2, Globe } from 'lucide-react';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import type { Event, EventStatus } from '@/types/events';
import { DataTableRowActions } from './row-actions';
import { tournamentStatusBadge } from './status-config';

export interface TournamentColumnOptions {
  canEdit: boolean;
  canDelete: boolean;
  onView: (event: Event) => void;
  onEdit: (event: Event) => void;
  onDeleted: () => void;
  onStatusChange: (id: string, status: EventStatus) => void;
}

export const getColumns = (options: TournamentColumnOptions): ColumnDef<Event>[] => {
  const columns: ColumnDef<Event>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      size: 50,
      minSize: 50,
      maxSize: 50,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tournament" />,
      size: 260,
      cell: ({ row }) => (
        <button
          type="button"
          className="block max-w-full truncate text-left font-medium hover:underline"
          onClick={() => options.onView(row.original)}
          title="Open tournament details"
        >
          {row.getValue('name')}
        </button>
      ),
    },
    {
      accessorKey: 'start_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Start" />,
      size: 110,
      cell: ({ row }) => {
        const v = row.getValue('start_date') as string | null;
        return (
          <span className="text-sm">{v ? format(new Date(v), 'd MMM yyyy') : '—'}</span>
        );
      },
    },
    {
      accessorKey: 'end_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="End" />,
      size: 110,
      cell: ({ row }) => {
        const v = row.getValue('end_date') as string | null;
        return (
          <span className="text-sm">{v ? format(new Date(v), 'd MMM yyyy') : '—'}</span>
        );
      },
    },
    {
      id: 'venue',
      accessorFn: (row) => row.venue || row.venue_text || '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Venue" />,
      size: 180,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="block max-w-[170px] truncate text-sm text-muted-foreground">
          {row.original.venue || row.original.venue_text || '—'}
        </span>
      ),
    },
    {
      accessorKey: 'scope',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Scope" />,
      size: 120,
      cell: ({ row }) =>
        row.getValue('scope') === 'all_jkkn' ? (
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Globe className="h-3 w-3" /> All JKKN
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Building2 className="h-3 w-3" /> Institution
          </Badge>
        ),
    },
    {
      accessorKey: 'year',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Year" />,
      size: 80,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.getValue('year') ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      size: 110,
      cell: ({ row }) => {
        const status = tournamentStatusBadge(row.original.status);
        return (
          <Badge
            variant="outline"
            className={`${status.bg} ${status.color} border-0 text-[10px] font-semibold`}
          >
            {status.label}
          </Badge>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      size: 60,
      minSize: 60,
      maxSize: 80,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <DataTableRowActions
          row={row}
          canEdit={options.canEdit}
          canDelete={options.canDelete}
          onView={options.onView}
          onEdit={options.onEdit}
          onDeleted={options.onDeleted}
          onStatusChange={options.onStatusChange}
        />
      ),
    },
  ];

  return columns;
};
