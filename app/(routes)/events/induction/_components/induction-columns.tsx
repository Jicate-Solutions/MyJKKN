'use client';

// Induction list — column definitions for the DataTable.
//
// Replaces the card grid that used to live in page.tsx.
//
// COLUMN WIDTHS GO IN `meta.className`, NOT `size`. This DataTable renders
// <TableHead>/<TableCell> with `columnDef.meta.className` and nothing else — it
// never reads column.getSize(), so a `size: 280` is silently ignored and every
// column ends up auto-width. The meta className lands on BOTH the header and the
// cell, so one entry sizes the pair. Percentages for the two text columns that
// should absorb slack, fixed px for the three that shouldn't.
//
// The <table> is `table-layout: auto` inside an overflow-auto wrapper, so a
// width is a hint the browser can overrule for long content — hence the explicit
// max-w on the two truncating columns. NOT the usual `max-w-0` truncation trick:
// this className goes on the <th> as well as the <td>, and a zero-max header
// collapses its sort button.
//
// NO COORDINATORS COLUMN. It was here briefly; it made the table wide without
// earning the space, since a coordinator is something you filter BY far more
// often than something you read down a list. The data is still loaded — the
// advanced Filters panel and the search box both match on it (see
// induction-filters-panel.tsx), and each induction's console remains the place
// coordinators are appointed and read in full.
//
// No bespoke selection column either: the DataTable injects one automatically
// once the page passes onBulkAction and the viewer clears the bulk-action
// permission gate.

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Building2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { inductionStatusLabel, INDUCTION_ACTIVE_STATUS } from '@/types/events';
import type { EventStatus } from '@/types/events';
import type { InductionListRow } from '@/lib/services/induction/induction-service';
import type { EventEditViewer } from '../../_components/event-display';
import { InductionRowActions } from './induction-row-actions';

export interface InductionColumnOptions {
  /** Who is looking — decides which rows offer Edit. */
  viewer: EventEditViewer;
  onEdit: (induction: InductionListRow) => void;
  onStatusChange: (id: string, status: EventStatus) => void;
  onDelete: (id: string) => void;
  /** Id of the row whose delete is in flight, so only that row shows a spinner. */
  deletingId: string | null;
  /** Id of the row whose status write is in flight, same reason. */
  statusUpdatingId: string | null;
}

/** Tolerant date render — a few legacy rows hold unparseable date strings. */
const renderDate = (value: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : format(d, 'd MMM yyyy');
};

export const getInductionColumns = (
  options: InductionColumnOptions
): ColumnDef<InductionListRow>[] => [
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Induction" />,
    meta: { className: 'w-[34%] min-w-[200px] max-w-[380px]' },
    cell: ({ row }) => (
      <Link
        href={`/events/induction/${row.original.id}`}
        className="block truncate font-medium hover:underline"
        title={row.original.name}
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    id: 'institution_name',
    accessorFn: (row) => row.institution_name ?? '',
    header: ({ column }) => <DataTableColumnHeader column={column} title="College" />,
    meta: { className: 'w-[26%] min-w-[170px] max-w-[300px]' },
    cell: ({ row }) => (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{row.original.institution_name ?? 'Unknown college'}</span>
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    meta: { className: 'w-[120px]' },
    cell: ({ row }) => {
      const status = row.original.status ?? 'draft';
      // inductionStatusLabel, not generalEventStatusLabel: that one collapses
      // every non-draft value to "Active", which would report a legacy
      // `archived` or `cancelled` induction as running. Only 'live' is tinted —
      // a legacy status is neither Draft nor running, and should not borrow the
      // colour of either.
      return (
        <Badge variant={status === INDUCTION_ACTIVE_STATUS ? 'default' : 'secondary'}>
          {inductionStatusLabel(status)}
        </Badge>
      );
    },
  },
  {
    id: 'dates',
    accessorFn: (row) => row.start_date ?? '',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Dates" />,
    meta: { className: 'w-[200px]' },
    cell: ({ row }) => {
      const start = renderDate(row.original.start_date);
      const end = renderDate(row.original.end_date);
      if (!start) return <span className="text-muted-foreground">—</span>;
      // A one-day induction stores the same date twice; printing "8 Aug – 8 Aug"
      // reads as a bug rather than a range.
      return (
        <span className="whitespace-nowrap text-sm">
          {end && end !== start ? `${start} – ${end}` : start}
        </span>
      );
    },
  },
  {
    id: 'actions',
    header: () => <span className="block text-right font-medium">Actions</span>,
    meta: { className: 'w-[90px]' },
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <InductionRowActions
          induction={row.original}
          viewer={options.viewer}
          onEdit={options.onEdit}
          onStatusChange={options.onStatusChange}
          onDelete={options.onDelete}
          isDeleting={options.deletingId === row.original.id}
          isUpdatingStatus={options.statusUpdatingId === row.original.id}
        />
      </div>
    ),
  },
];
