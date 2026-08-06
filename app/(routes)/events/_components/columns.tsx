'use client';

// Events Hub — column definitions for the all-events advanced DataTable.
// Replaces the card list that used to live in general-events-section.tsx, and
// widens the scope from general-only to EVERY `events` row, so the hub is the
// one place that answers "what events exist?".
//
// No row-selection column: the events permission catalog has no `events.delete`
// key (see lib/constants/permissions.ts), so there is no bulk action to select
// rows FOR. Adding selection here would only promise something the toolbar
// can't deliver.

import type { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { NaacCriteriaChips } from '@/components/events/shared/naac-criteria-field';
import type { Event, EventStatus } from '@/types/events';
import {
  eventDateValue,
  eventStatusLabel,
  eventVenueValue,
  formatEventType,
  isEventOpen,
  isGeneralEvent,
} from './event-display';
import { EventsRowActions } from './row-actions';

export interface EventColumnOptions {
  onOpen: (event: Event) => void;
  onEdit: (event: Event) => void;
  onStatusChange: (id: string, status: EventStatus) => void;
}

/** Tolerant date render — legacy rows hold a few unparseable date strings. */
const renderDate = (value: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'd MMM yyyy');
};

export const getColumns = (options: EventColumnOptions): ColumnDef<Event>[] => [
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Event" />,
    size: 260,
    cell: ({ row }) => (
      <button
        type="button"
        className="block max-w-full truncate text-left font-medium hover:underline"
        onClick={() => options.onOpen(row.original)}
        title="Open this event"
      >
        {row.getValue('name')}
      </button>
    ),
  },
  {
    accessorKey: 'event_type',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
    size: 150,
    cell: ({ row }) => (
      <Badge variant="secondary" className="text-[10px] font-normal">
        {formatEventType(row.original.event_type as string)}
      </Badge>
    ),
  },
  {
    id: 'date',
    accessorFn: (row) => eventDateValue(row) ?? '',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    size: 120,
    cell: ({ row }) => (
      <span className="text-sm">{renderDate(eventDateValue(row.original))}</span>
    ),
  },
  {
    id: 'venue',
    accessorFn: (row) => eventVenueValue(row),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Venue" />,
    size: 180,
    enableSorting: false,
    cell: ({ row }) => (
      <span className="block max-w-[170px] truncate text-sm text-muted-foreground">
        {eventVenueValue(row.original) || '—'}
      </span>
    ),
  },
  {
    id: 'naac',
    accessorFn: (row) => (row.naac_criteria ?? []).join(', '),
    header: ({ column }) => <DataTableColumnHeader column={column} title="NAAC Evidence" />,
    size: 190,
    enableSorting: false,
    cell: ({ row }) => {
      const codes = row.original.naac_criteria ?? [];
      return codes.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          <NaacCriteriaChips codes={codes} />
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">Not tagged</span>
      );
    },
  },
  {
    accessorKey: 'status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    size: 110,
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={`text-[10px] font-semibold ${
          isEventOpen(row.original)
            ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400'
            : ''
        }`}
      >
        {eventStatusLabel(row.original)}
      </Badge>
    ),
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
      <EventsRowActions
        event={row.original}
        canManageHere={isGeneralEvent(row.original)}
        onOpen={options.onOpen}
        onEdit={options.onEdit}
        onStatusChange={options.onStatusChange}
      />
    ),
  },
];
