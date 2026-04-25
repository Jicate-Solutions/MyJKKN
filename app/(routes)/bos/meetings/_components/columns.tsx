'use client';

import { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import {
  BosMeeting,
  BosMeetingStatus,
  BOS_MEETING_STATUS_LABELS,
  BOS_MEETING_TYPE_LABELS,
} from '@/types/bos';
import { DataTableRowActions } from './row-actions';

// Status badge colour map
const STATUS_VARIANT: Record<BosMeetingStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  principal_approved: 'outline',
  noticed: 'outline',
  expert_invited: 'outline',
  completed: 'default',
  minutes_drafted: 'default',
  minutes_approved: 'default',
  ratified: 'default',
};

interface GetColumnsOptions {
  canEdit: boolean;
  canDelete: boolean;
}

export function getColumns({ canEdit, canDelete }: GetColumnsOptions): ColumnDef<BosMeeting>[] {
  return [
    {
      accessorKey: 'meeting_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title='No.' />,
      cell: ({ row }) => {
        const m = row.original;
        return (
          <span className='font-mono text-xs font-medium'>
            #{m.meeting_number}/{m.academic_year}
          </span>
        );
      },
      size: 80,
    },
    {
      accessorKey: 'board',
      header: 'Board',
      cell: ({ row }) => {
        const board = row.original.board as any;
        return board ? (
          <div>
            <p className='text-sm font-medium'>{board.board_name}</p>
            <p className='text-xs text-muted-foreground'>{board.board_code}</p>
          </div>
        ) : '—';
      },
    },
    {
      accessorKey: 'meeting_type',
      header: 'Type',
      cell: ({ row }) => (
        <Badge variant='outline' className='text-xs'>
          {BOS_MEETING_TYPE_LABELS[row.original.meeting_type]}
        </Badge>
      ),
      size: 100,
    },
    {
      accessorKey: 'scheduled_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Date' />,
      cell: ({ row }) => {
        const d = row.original.scheduled_date;
        return d ? (
          <div>
            <p className='text-sm'>{format(new Date(d), 'dd MMM yyyy')}</p>
            {row.original.scheduled_time && (
              <p className='text-xs text-muted-foreground'>{row.original.scheduled_time}</p>
            )}
          </div>
        ) : (
          <span className='text-muted-foreground text-xs'>TBD</span>
        );
      },
      size: 120,
    },
    {
      accessorKey: 'venue',
      header: 'Venue',
      cell: ({ row }) => (
        <span className='text-sm text-muted-foreground'>{row.original.venue || '—'}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status]}>
          {BOS_MEETING_STATUS_LABELS[row.original.status]}
        </Badge>
      ),
      size: 140,
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DataTableRowActions row={row} canEdit={canEdit} canDelete={canDelete} />
      ),
      size: 48,
    },
  ];
}
