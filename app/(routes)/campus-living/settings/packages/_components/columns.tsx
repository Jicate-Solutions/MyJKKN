'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type { AdmissionPackage } from '@/types/admission-packages';
import { PackageRowActions } from './row-actions';

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export const createColumns = (): ColumnDef<AdmissionPackage>[] => [
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
    header: 'Package',
    cell: ({ row }) => <span className='font-medium'>{row.original.name}</span>,
  },
  {
    accessorKey: 'total_price_inr',
    header: 'Price',
    cell: ({ row }) => (
      <span className='tabular-nums'>{inr(row.original.total_price_inr)}</span>
    ),
  },
  {
    accessorKey: 'room_category_name',
    header: 'Room (Classic)',
    cell: ({ row }) => (
      <span className='text-muted-foreground text-sm'>
        {row.original.room_category_name || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'hostel_year_name',
    header: 'Hostel Year',
    cell: ({ row }) => (
      <span className='text-muted-foreground text-sm'>
        {row.original.hostel_year_name || 'All years'}
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
    cell: ({ row }) => <PackageRowActions pkg={row.original} />,
  },
];
