'use client';

// Column definitions for the advanced rooms DataTable
// (components/ui/data-table.tsx). Sortable headers on the numeric/identifier
// columns; occupancy + derived_status come zipped in from
// v_hostel_room_occupancy via getRoomsByBlockWithOccupancy.

import type { Column, ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, Users } from 'lucide-react';
import type { HostelRoomWithBedsAndOccupancy } from '@/lib/services/campus-living/hostel-room-service';
import { RoomRowActions } from './room-row-actions';

const FLOOR_LABELS = ['Ground Floor', '1st Floor', '2nd Floor', '3rd Floor'];

const statusConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' }
> = {
  available: { label: 'Available', variant: 'success' },
  partially_occupied: { label: 'Partial', variant: 'default' },
  full: { label: 'Full', variant: 'secondary' },
  maintenance: { label: 'Maintenance', variant: 'destructive' },
  reserved: { label: 'Reserved', variant: 'outline' },
  closed: { label: 'Closed', variant: 'outline' },
  unknown: { label: 'Unknown', variant: 'outline' },
};

const inr = (v: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(v ?? 0);

function SortHeader({
  column,
  label,
}: {
  column: Column<HostelRoomWithBedsAndOccupancy, unknown>;
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      className="-ml-3 h-8 px-2"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
    >
      {label}
      <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
    </Button>
  );
}

export function createRoomColumns({
  blockId,
  blockType,
}: {
  blockId: string;
  blockType?: string;
}): ColumnDef<HostelRoomWithBedsAndOccupancy>[] {
  return [
    {
      accessorKey: 'room_number',
      header: ({ column }) => <SortHeader column={column} label="Room No." />,
      cell: ({ row }) => (
        <span className="font-medium">{row.original.room_number}</span>
      ),
    },
    {
      accessorKey: 'floor',
      header: ({ column }) => <SortHeader column={column} label="Floor" />,
      cell: ({ row }) =>
        FLOOR_LABELS[row.original.floor] ?? `Floor ${row.original.floor}`,
    },
    {
      accessorKey: 'room_type',
      header: 'Type',
      cell: ({ row }) => <span className="capitalize">{row.original.room_type}</span>,
    },
    {
      accessorKey: 'ac_status',
      header: 'AC',
      cell: ({ row }) => (
        <Badge variant="outline" className="capitalize text-xs">
          {row.original.ac_status.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      id: 'category',
      header: 'Category',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.hostel_categories?.name ?? (
          <span className="text-muted-foreground">&mdash;</span>
        ),
    },
    {
      id: 'occupancy',
      header: 'Occupancy',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span>
            {row.original.active_residents}/{row.original.capacity}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'derived_status',
      header: 'Status',
      cell: ({ row }) => {
        const cfg =
          statusConfig[row.original.derived_status] ?? {
            label: row.original.derived_status,
            variant: 'outline' as const,
          };
        return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
      },
    },
    {
      accessorKey: 'has_attached_bathroom',
      header: 'Bathroom',
      cell: ({ row }) => (row.original.has_attached_bathroom ? 'Yes' : 'No'),
    },
    {
      accessorKey: 'annual_fee',
      header: ({ column }) => (
        <div className="text-right">
          <SortHeader column={column} label="Annual Fee" />
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right">{inr(row.original.annual_fee)}</div>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableHiding: false,
      cell: ({ row }) => (
        <div className="text-right">
          <RoomRowActions
            room={row.original}
            blockId={blockId}
            blockType={blockType}
          />
        </div>
      ),
    },
  ];
}
