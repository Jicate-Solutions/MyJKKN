'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { format, formatDistanceToNow } from 'date-fns';
import type { NotificationWithStats } from '@/types/notification';
import {
  AlertTriangle,
  ArrowUp,
  ChevronUp,
  Minus,
  Users,
  Eye
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { RowActions } from './row-actions';

export interface ColumnsContext {
  onEdit: (notification: NotificationWithStats) => void;
  onReuse: (notification: NotificationWithStats) => void;
}

const priorityConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any }
> = {
  urgent: {
    label: 'Urgent',
    variant: 'destructive',
    icon: AlertTriangle
  },
  high: {
    label: 'High',
    variant: 'destructive',
    icon: ArrowUp
  },
  normal: {
    label: 'Normal',
    variant: 'secondary',
    icon: Minus
  },
  low: {
    label: 'Low',
    variant: 'outline',
    icon: ChevronUp
  }
};

const categoryConfig: Record<string, { label: string; className: string }> = {
  general: { label: 'General', className: 'bg-slate-100 text-slate-700' },
  reservation: {
    label: 'Reservation',
    className: 'bg-blue-100 text-blue-700'
  },
  approval: { label: 'Approval', className: 'bg-amber-100 text-amber-700' },
  maintenance: {
    label: 'Maintenance',
    className: 'bg-orange-100 text-orange-700'
  },
  resource: { label: 'Resource', className: 'bg-green-100 text-green-700' },
  system: { label: 'System', className: 'bg-purple-100 text-purple-700' }
};

export const getColumns = (
  context: ColumnsContext
): ColumnDef<NotificationWithStats>[] => [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label='Select all'
      />
    ),
    size: 40,
    minSize: 40,
    maxSize: 40,
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
    accessorKey: 'title',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Title' />
    ),
    size: 250,
    minSize: 180,
    cell: ({ row }) => {
      const title = row.getValue('title') as string;
      return (
        <div className='font-medium truncate max-w-[250px]' title={title}>
          {title}
        </div>
      );
    }
  },
  {
    accessorKey: 'body',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Message' />
    ),
    size: 300,
    minSize: 200,
    cell: ({ row }) => {
      const body = row.getValue('body') as string;
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className='text-sm text-muted-foreground truncate max-w-[300px]'>
                {body}
              </div>
            </TooltipTrigger>
            <TooltipContent side='bottom' className='max-w-sm'>
              <p className='text-sm'>{body}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
  },
  {
    accessorKey: 'priority',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Priority' />
    ),
    size: 110,
    minSize: 100,
    cell: ({ row }) => {
      const priority = row.getValue('priority') as string;
      const config = priorityConfig[priority] || priorityConfig.normal;
      const Icon = config.icon;
      return (
        <Badge variant={config.variant} className='gap-1'>
          <Icon className='h-3 w-3' />
          {config.label}
        </Badge>
      );
    }
  },
  {
    accessorKey: 'category',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Category' />
    ),
    size: 120,
    minSize: 100,
    cell: ({ row }) => {
      const category = row.getValue('category') as string;
      const config = categoryConfig[category] || categoryConfig.general;
      return (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
        >
          {config.label}
        </span>
      );
    }
  },
  {
    accessorKey: 'sent_to_count',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Sent To' />
    ),
    size: 100,
    minSize: 80,
    cell: ({ row }) => {
      const count = row.getValue('sent_to_count') as number;
      return (
        <div className='flex items-center gap-1.5'>
          <Users className='h-3.5 w-3.5 text-muted-foreground' />
          <span className='font-medium'>{count}</span>
        </div>
      );
    }
  },
  {
    accessorKey: 'read_by_count',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Read By' />
    ),
    size: 100,
    minSize: 80,
    cell: ({ row }) => {
      const readBy = row.getValue('read_by_count') as number;
      const sentTo = row.original.sent_to_count;
      const percentage = sentTo > 0 ? Math.round((readBy / sentTo) * 100) : 0;
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className='flex items-center gap-1.5'>
                <Eye className='h-3.5 w-3.5 text-muted-foreground' />
                <span className='font-medium'>{readBy}</span>
                <span className='text-xs text-muted-foreground'>
                  ({percentage}%)
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {readBy} of {sentTo} recipients read this notification
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Sent At' />
    ),
    size: 150,
    minSize: 120,
    cell: ({ row }) => {
      const date = row.getValue('created_at') as string;
      if (!date) return 'N/A';
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className='text-sm text-muted-foreground'>
                {formatDistanceToNow(new Date(date), { addSuffix: true })}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {format(new Date(date), 'PPpp')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => (
      <RowActions
        row={row}
        onEdit={context.onEdit}
        onReuse={context.onReuse}
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 60,
    minSize: 60,
    maxSize: 80
  }
];
