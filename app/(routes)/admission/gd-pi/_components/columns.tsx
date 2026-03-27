'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Calendar, Users, UserCheck, Award } from 'lucide-react';
import { format } from 'date-fns';
import type { GDPISession } from '@/types/admission';
import { GDPIRowActions } from './row-actions';

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  scheduled: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const TYPE_LABEL: Record<string, string> = {
  gd: 'Group Discussion',
  pi: 'Personal Interview',
  gd_pi: 'GD + PI',
};

export function getGDPIColumns(onRefresh?: () => void): ColumnDef<GDPISession>[] {
  return [
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
    {
      accessorKey: 'session_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Session" />,
      cell: ({ row }) => {
        const session = row.original;
        return (
          <div className="min-w-[180px]">
            <div className="font-medium">{session.session_name}</div>
            <div className="text-xs text-muted-foreground">
              {TYPE_LABEL[session.session_type] || session.session_type}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'scheduled_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => {
        const session = row.original;
        return (
          <div className="flex items-center gap-1.5 text-sm">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{format(new Date(session.scheduled_date), 'MMM d, yyyy')}</span>
            {session.start_time && (
              <span className="text-muted-foreground">
                {session.start_time.slice(0, 5)}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'venue',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Venue" />,
      cell: ({ row }) => (
        <div className="text-sm max-w-[150px] truncate">
          {row.original.venue || '—'}
        </div>
      ),
    },
    {
      id: 'candidates',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Candidates" />,
      cell: ({ row }) => {
        const session = row.original;
        return (
          <div className="flex items-center gap-1.5 text-sm">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{session.candidates_count || 0}</span>
            <span className="text-muted-foreground">/ {session.max_candidates}</span>
          </div>
        );
      },
    },
    {
      id: 'evaluators',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Evaluators" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 text-sm">
          <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{row.original.evaluators_count || 0}</span>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const status = row.original.status;
        return (
          <Badge variant="outline" className={STATUS_BADGE[status] || ''}>
            {STATUS_LABEL[status] || status}
          </Badge>
        );
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => <GDPIRowActions session={row.original} onRefresh={onRefresh} />,
      size: 50,
    },
  ];
}
