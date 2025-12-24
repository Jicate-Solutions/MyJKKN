'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import type { InstitutionLeave } from '@/types/leaves';
import { LeaveRowActions } from './row-actions';

export const columns: ColumnDef<InstitutionLeave>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected()
            ? true
            : table.getIsSomePageRowsSelected()
            ? 'indeterminate'
            : false
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label='Select all'
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label='Select row'
      />
    ),
    enableSorting: false,
    enableHiding: false
  },
  {
    accessorKey: 'leave_name',
    header: 'Leave Name',
    cell: ({ row }) => {
      const leave = row.original;
      return (
        <div className='flex items-center gap-2'>
          <span
            className='w-2 h-2 rounded-full'
            style={{ backgroundColor: leave.leave_type?.color_code || '#6B7280' }}
          />
          <span className='font-medium'>{leave.leave_name}</span>
        </div>
      );
    }
  },
  {
    accessorKey: 'leave_type',
    header: 'Type',
    cell: ({ row }) => {
      const leaveType = row.original.leave_type;
      return leaveType ? (
        <Badge
          variant='outline'
          style={{
            borderColor: leaveType.color_code,
            color: leaveType.color_code
          }}
        >
          {leaveType.leave_type_name}
        </Badge>
      ) : (
        '-'
      );
    }
  },
  {
    accessorKey: 'date_range',
    header: 'Date Range',
    cell: ({ row }) => {
      const leave = row.original;
      const startDate = new Date(leave.start_date);
      const endDate = new Date(leave.end_date);
      const isSameDay = leave.start_date === leave.end_date;

      return (
        <div className='text-sm'>
          {isSameDay
            ? format(startDate, 'MMM d, yyyy')
            : `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`}
        </div>
      );
    }
  },
  {
    accessorKey: 'scope_level',
    header: 'Scope',
    cell: ({ row }) => {
      const scope = row.original.scope_level;
      return (
        <Badge variant='secondary' className='capitalize'>
          {scope}
        </Badge>
      );
    }
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.original.status;
      const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
        approved: 'default',
        pending: 'secondary',
        rejected: 'destructive',
        cancelled: 'outline'
      };
      return (
        <Badge variant={variantMap[status] || 'outline'} className='capitalize'>
          {status}
        </Badge>
      );
    }
  },
  {
    accessorKey: 'requested_by_profile',
    header: 'Requested By',
    cell: ({ row }) => {
      const profile = row.original.requested_by_profile;
      return profile?.full_name || '-';
    }
  },
  {
    accessorKey: 'created_at',
    header: 'Created',
    cell: ({ row }) => {
      return format(new Date(row.original.created_at), 'MMM d, yyyy');
    }
  },
  {
    id: 'actions',
    cell: ({ row }) => <LeaveRowActions leave={row.original} />
  }
];
