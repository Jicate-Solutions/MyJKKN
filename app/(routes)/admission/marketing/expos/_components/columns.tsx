'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { MapPin, Calendar, Users, IndianRupee, UserCheck } from 'lucide-react';
import type { ExpoEvent } from '@/types/admission';
import { DataTableRowActions } from './row-actions';
import { format } from 'date-fns';

export function getStatusBadgeClass(status: string): string {
  const classes: Record<string, string> = {
    planned: 'bg-blue-100 text-blue-800',
    confirmed: 'bg-indigo-100 text-indigo-800',
    in_progress: 'bg-green-100 text-green-800',
    completed: 'bg-gray-100 text-gray-800',
    cancelled: 'bg-red-100 text-red-800',
  };
  return classes[status] || 'bg-gray-100 text-gray-800';
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    planned: 'Planned',
    confirmed: 'Confirmed',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return labels[status] || status;
}

export const columns: ColumnDef<ExpoEvent>[] = [
  // Select checkbox
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value: boolean) => table.toggleAllPageRowsSelected(!!value)}
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
  // Event Name + Organizer
  {
    accessorKey: 'event_name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Event" />,
    cell: ({ row }) => {
      const expo = row.original;
      return (
        <div className="min-w-[180px]">
          <div className="font-medium">{expo.event_name}</div>
          {expo.organizer_name && (
            <div className="text-xs text-muted-foreground">{expo.organizer_name}</div>
          )}
        </div>
      );
    },
  },
  // Location (City + Venue)
  {
    accessorKey: 'city',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Location" />,
    cell: ({ row }) => {
      const expo = row.original;
      return (
        <div className="flex items-center gap-1 text-sm">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{expo.city}</span>
          {expo.venue_name && (
            <span className="text-xs text-muted-foreground">({expo.venue_name})</span>
          )}
        </div>
      );
    },
  },
  // Dates
  {
    accessorKey: 'start_date',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Dates" />,
    cell: ({ row }) => {
      const expo = row.original;
      return (
        <div className="flex items-center gap-1 text-sm">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span>
            {format(new Date(expo.start_date), 'dd MMM')} - {format(new Date(expo.end_date), 'dd MMM yyyy')}
          </span>
        </div>
      );
    },
  },
  // Status Badge
  {
    accessorKey: 'event_status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => {
      const status = row.getValue('event_status') as string;
      return <Badge className={getStatusBadgeClass(status)}>{getStatusLabel(status)}</Badge>;
    },
  },
  // Team Count
  {
    accessorKey: 'total_team_members',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Team" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{row.getValue('total_team_members') ?? 0}</span>
      </div>
    ),
  },
  // Leads Collected
  {
    accessorKey: 'total_leads_collected',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Leads" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-semibold text-green-600">{row.getValue('total_leads_collected') ?? 0}</span>
      </div>
    ),
  },
  // Total Expenses
  {
    accessorKey: 'total_expenses',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Expenses" />,
    cell: ({ row }) => {
      const amount = (row.getValue('total_expenses') as number) ?? 0;
      return (
        <div className="flex items-center gap-0.5">
          <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium">{amount.toLocaleString('en-IN')}</span>
        </div>
      );
    },
  },
  // Row Actions
  {
    id: 'actions',
    cell: ({ row }) => <DataTableRowActions row={row} />,
    enableSorting: false,
    enableHiding: false,
    size: 48,
  },
];
