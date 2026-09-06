'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type { HostelYear } from '@/types/hostel-years';
import { HostelYearRowActions } from './row-actions';

export const createColumns = (): ColumnDef<HostelYear>[] => [
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
        className='translate-y-[2px]'
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label='Select row'
        className='translate-y-[2px]'
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'name',
    header: 'Year',
    cell: ({ row }) => (
      <div className='flex items-center gap-2'>
        <span className='font-medium'>{row.original.name}</span>
        {row.original.is_current ? (
          <Badge variant='default'>Current</Badge>
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: 'start_date',
    header: 'Start Date',
    cell: ({ row }) => (
      <span className='text-muted-foreground'>{row.original.start_date}</span>
    ),
  },
  {
    accessorKey: 'end_date',
    header: 'End Date',
    cell: ({ row }) => (
      <span className='text-muted-foreground'>{row.original.end_date}</span>
    ),
  },
  {
    accessorKey: 'description',
    header: 'Description',
    cell: ({ row }) => (
      <span className='text-muted-foreground text-sm line-clamp-1'>
        {row.original.description || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'is_active',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={row.original.is_active ? 'default' : 'outline'}>
        {row.original.is_active ? 'Active' : 'Inactive'}
      </Badge>
    ),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => <HostelYearRowActions hostelYear={row.original} />,
  },
];
