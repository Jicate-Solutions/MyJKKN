'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Period } from '@/types/academics';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { DataTableRowActions } from './row-actions';
import Link from 'next/link';

export const columns: ColumnDef<Period>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label='Select all'
      />
    ),
    size: 50,
    minSize: 50,
    maxSize: 50,
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
    accessorKey: 'period_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Period Name' />
    ),
    size: 150,
    minSize: 150,
    maxSize: 150,
    cell: ({ row }) => {
      const period = row.original;
      return (
        <div className='font-medium hover:text-primary hover:underline'>
          <Link href={`/academic/periods/${period.id}/edit`}>
            {period.period_name}
          </Link>
        </div>
      );
    }
  },
  {
    accessorKey: 'start_time',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Start Time' />
    ),
    size: 50,
    minSize: 50,
    maxSize: 50,
    cell: ({ row }) => {
      const startTime = row.getValue('start_time') as string;
      return startTime
        ? format(new Date(`1970-01-01T${startTime}`), 'h:mm a')
        : '-';
    }
  },
  {
    accessorKey: 'end_time',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='End Time' />
    ),
    size: 50,
    minSize: 50,
    maxSize: 50,
    cell: ({ row }) => {
      const endTime = row.getValue('end_time') as string;
      return endTime
        ? format(new Date(`1970-01-01T${endTime}`), 'h:mm a')
        : '-';
    }
  },
  {
    accessorKey: 'is_break',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Type' />
    ),
    size: 50,
    minSize: 50,
    maxSize: 50,
    cell: ({ row }) => {
      const isBreak = row.getValue('is_break') as boolean;
      return (
        <Badge variant={isBreak ? 'secondary' : 'default'}>
          {isBreak ? 'Break' : 'Period'}
        </Badge>
      );
    }
  },
  {
    accessorKey: 'institution.name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Institution' />
    ),
    size: 200,
    minSize: 200,
    maxSize: 250,
    cell: ({ row }) => {
      const period = row.original;
      return period.institution?.name || '-';
    }
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created At' />
    ),
    cell: ({ row }) => {
      const date = row.getValue('created_at') as string;
      return date ? format(new Date(date), 'MMM dd, yyyy') : '-';
    }
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => <DataTableRowActions row={row} />,
    enableSorting: false,
    enableHiding: false,
    size: 60,
    minSize: 60,
    maxSize: 80
  }
];
