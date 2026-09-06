'use client';

import { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  ReceiptIndianRupee,
  FileText,
  CreditCard,
  Tag,
  Layers,
  BadgeIndianRupee,
  User
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import type { BillingActivityLog } from '@/types/billing-activity';
import {
  BILLING_ACTION_LABELS,
  BILLING_ACTION_COLORS,
  BILLING_RESOURCE_LABELS,
  BILLING_RESOURCE_COLORS
} from '@/types/billing-activity';

const resourceIcons: Record<string, React.ReactNode> = {
  bill: <BadgeIndianRupee className='h-3.5 w-3.5' />,
  receipt: <ReceiptIndianRupee className='h-3.5 w-3.5' />,
  invoice: <FileText className='h-3.5 w-3.5' />,
  discount: <Tag className='h-3.5 w-3.5' />,
  refund: <CreditCard className='h-3.5 w-3.5' />,
  category: <Layers className='h-3.5 w-3.5' />
};

export const columns: ColumnDef<BillingActivityLog>[] = [
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Time' />
    ),
    size: 160,
    minSize: 140,
    maxSize: 200,
    cell: ({ row }) => {
      const date = row.getValue('created_at') as string;
      if (!date) return 'N/A';
      const d = new Date(date);
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className='text-sm text-muted-foreground cursor-default'>
                {formatDistanceToNow(d, { addSuffix: true })}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {format(d, 'dd MMM yyyy, hh:mm:ss a')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
  },
  {
    accessorKey: 'profiles',
    id: 'user',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='User' />
    ),
    size: 200,
    minSize: 160,
    maxSize: 250,
    cell: ({ row }) => {
      const log = row.original;
      const profile = log.profiles;
      return (
        <div className='flex items-center gap-2'>
          <div className='h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0'>
            <User className='h-3.5 w-3.5 text-primary' />
          </div>
          <div className='min-w-0'>
            <div className='font-medium text-sm truncate'>
              {profile?.full_name || 'System'}
            </div>
            <div className='text-xs text-muted-foreground truncate'>
              {profile?.role || ''}
            </div>
          </div>
        </div>
      );
    },
    enableSorting: false
  },
  {
    accessorKey: 'action_type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Action' />
    ),
    size: 130,
    minSize: 110,
    maxSize: 160,
    cell: ({ row }) => {
      const action = row.getValue('action_type') as string;
      const label = BILLING_ACTION_LABELS[action] || action;
      const colorClass = BILLING_ACTION_COLORS[action] || 'bg-gray-100 text-gray-800';
      return (
        <Badge variant='outline' className={`${colorClass} border-0 text-xs font-medium`}>
          {label}
        </Badge>
      );
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id))
  },
  {
    accessorKey: 'resource_type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Resource' />
    ),
    size: 130,
    minSize: 110,
    maxSize: 160,
    cell: ({ row }) => {
      const resource = row.getValue('resource_type') as string;
      if (!resource) return null;
      const label = BILLING_RESOURCE_LABELS[resource] || resource;
      const colorClass = BILLING_RESOURCE_COLORS[resource] || 'bg-gray-100 text-gray-800';
      const icon = resourceIcons[resource];
      return (
        <Badge variant='outline' className={`${colorClass} border-0 text-xs font-medium gap-1`}>
          {icon}
          {label}
        </Badge>
      );
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id))
  },
  {
    accessorKey: 'description',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Description' />
    ),
    size: 350,
    minSize: 250,
    maxSize: 500,
    cell: ({ row }) => {
      const desc = row.getValue('description') as string;
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className='text-sm truncate max-w-[400px] cursor-default'>
                {desc}
              </p>
            </TooltipTrigger>
            <TooltipContent side='bottom' className='max-w-sm'>
              <p className='text-sm'>{desc}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
    enableSorting: false
  },
  {
    accessorKey: 'institutions',
    id: 'institution',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Institution' />
    ),
    size: 180,
    minSize: 140,
    maxSize: 220,
    cell: ({ row }) => {
      const log = row.original;
      const inst = log.institutions;
      return (
        <span className='text-sm text-muted-foreground truncate'>
          {(inst as any)?.name || '—'}
        </span>
      );
    },
    enableSorting: false
  }
];
