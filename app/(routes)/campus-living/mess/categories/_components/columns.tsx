'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type { MessCategory } from '@/types/mess-categories';
import { MESS_CATEGORY_TYPE_LABELS } from '@/types/mess-categories';
import { MessCategoryRowActions } from './row-actions';

const TYPE_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  boys: 'default',
  girls: 'secondary',
  mixed: 'outline',
};

export const createColumns = (): ColumnDef<MessCategory>[] => [
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
    header: 'Category Name',
    cell: ({ row }) => (
      <span className='font-medium'>{row.original.name}</span>
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
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => (
      <Badge variant={TYPE_VARIANT[row.original.type] ?? 'outline'}>
        {MESS_CATEGORY_TYPE_LABELS[row.original.type] ?? row.original.type}
      </Badge>
    ),
  },
  {
    accessorKey: 'sort_order',
    header: 'Order',
    cell: ({ row }) => (
      <span className='text-muted-foreground'>{row.original.sort_order}</span>
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
    cell: ({ row }) => <MessCategoryRowActions category={row.original} />,
  },
];
