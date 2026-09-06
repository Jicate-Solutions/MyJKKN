'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type { Amenity } from '@/types/amenities';
import { AmenityRowActions } from './row-actions';

export const createColumns = (): ColumnDef<Amenity>[] => [
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
    header: 'Name',
    cell: ({ row }) => (
      <span className='font-medium'>{row.original.name}</span>
    ),
  },
  {
    accessorKey: 'code',
    header: 'Code',
    cell: ({ row }) => (
      <span className='font-mono text-xs text-muted-foreground'>
        {row.original.code}
      </span>
    ),
  },
  {
    accessorKey: 'scope',
    header: 'Scope',
    cell: ({ row }) => (
      <Badge variant='secondary' className='capitalize'>
        {row.original.scope}
      </Badge>
    ),
  },
  {
    accessorKey: 'icon',
    header: 'Icon',
    cell: ({ row }) => (
      <span className='text-muted-foreground text-sm'>
        {row.original.icon || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'sort_order',
    header: 'Sort',
    cell: ({ row }) => (
      <span className='text-muted-foreground'>{row.original.sort_order}</span>
    ),
  },
  {
    accessorKey: 'is_active',
    header: 'Active',
    cell: ({ row }) => (
      <Badge variant={row.original.is_active ? 'default' : 'outline'}>
        {row.original.is_active ? 'Active' : 'Inactive'}
      </Badge>
    ),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => <AmenityRowActions amenity={row.original} />,
  },
];
