'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { DataTableRowActions } from './row-actions';
import type {
  MaintenanceLog,
  MaintenanceType,
  MaintenanceStatus,
  MaintenancePriority
} from '@/types/maintenance';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { format } from 'date-fns';

const getStatusBadge = (status: MaintenanceStatus) => {
  const variants = {
    scheduled: {
      variant: 'outline' as const,
      label: 'Scheduled',
      className: 'border-blue-500 text-blue-700'
    },
    in_progress: {
      variant: 'default' as const,
      label: 'In Progress',
      className: 'bg-yellow-500'
    },
    completed: {
      variant: 'default' as const,
      label: 'Completed',
      className: 'bg-green-500'
    },
    cancelled: {
      variant: 'secondary' as const,
      label: 'Cancelled',
      className: ''
    },
    overdue: {
      variant: 'destructive' as const,
      label: 'Overdue',
      className: ''
    }
  };
  const config = variants[status] || variants.scheduled;
  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
};

const getTypeBadge = (type: MaintenanceType) => {
  const colors = {
    preventive: 'bg-blue-100 text-blue-800',
    corrective: 'bg-orange-100 text-orange-800',
    predictive: 'bg-purple-100 text-purple-800',
    emergency: 'bg-red-100 text-red-800'
  };
  return (
    <Badge variant='outline' className={colors[type]}>
      {type.charAt(0).toUpperCase() + type.slice(1)}
    </Badge>
  );
};

const getPriorityBadge = (priority: MaintenancePriority) => {
  const configs = {
    1: { label: 'Low', className: 'bg-gray-100 text-gray-800' },
    2: { label: 'Normal', className: 'bg-blue-100 text-blue-800' },
    3: { label: 'High', className: 'bg-orange-100 text-orange-800' },
    4: { label: 'Critical', className: 'bg-red-100 text-red-800' }
  };
  const config = configs[priority] || configs[2];
  return (
    <Badge variant='outline' className={config.className}>
      {config.label}
    </Badge>
  );
};

export const columns: ColumnDef<MaintenanceLog>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
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
    enableHiding: false,
    size: 40,
    minSize: 40,
    maxSize: 40
  },
  {
    accessorKey: 'title',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Title' />
    ),
    cell: ({ row }) => {
      const log = row.original;
      return (
        <Link
          href={`/resource-management/maintenance/${log.id}`}
          className='font-medium hover:text-primary hover:underline max-w-[300px] truncate block'
        >
          {log.title}
        </Link>
      );
    },
    size: 250,
    minSize: 200,
    maxSize: 400
  },
  {
    accessorKey: 'resource',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Resource' />
    ),
    cell: ({ row }) => {
      const log = row.original;
      return (
        <div className='max-w-[200px] truncate'>
          {log.resource?.name || 'N/A'}
        </div>
      );
    },
    size: 200,
    minSize: 150,
    maxSize: 300
  },

  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    cell: ({ row }) => {
      const log = row.original;
      const now = new Date();
      const scheduledDate = new Date(log.scheduled_date);
      const isOverdue =
        scheduledDate < now &&
        (log.status === 'scheduled' || log.status === 'in_progress');

      return (
        <div className='flex flex-col gap-1'>
          {getStatusBadge(log.status)}
          {isOverdue && (
            <Badge variant='destructive' className='text-xs'>
              Overdue
            </Badge>
          )}
        </div>
      );
    },
    size: 120,
    minSize: 110,
    maxSize: 150
  },
  {
    accessorKey: 'scheduled_date',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Scheduled Date' />
    ),
    cell: ({ row }) => {
      const date = row.getValue('scheduled_date') as string;
      return (
        <div className='text-sm'>{format(new Date(date), 'MMM dd, yyyy')}</div>
      );
    },
    size: 140,
    minSize: 130,
    maxSize: 170
  },
  {
    accessorKey: 'assigned_to',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Assigned To' />
    ),
    cell: ({ row }) => {
      const log = row.original;
      return (
        <div className='text-sm max-w-[150px] truncate'>
          {log.assigned_to?.full_name || 'Unassigned'}
        </div>
      );
    },
    size: 150,
    minSize: 130,
    maxSize: 200
  },
  {
    accessorKey: 'cost',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Cost' />
    ),
    cell: ({ row }) => {
      const cost = row.getValue('cost') as number | null;
      if (cost === null || cost === undefined)
        return <span className='text-muted-foreground'>—</span>;
      return (
        <div className='text-sm font-medium'>₹{cost.toLocaleString()}</div>
      );
    },
    size: 120,
    minSize: 100,
    maxSize: 150
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => <DataTableRowActions row={row} />,
    enableSorting: false,
    enableHiding: false,
    size: 80,
    minSize: 80,
    maxSize: 100
  }
];
