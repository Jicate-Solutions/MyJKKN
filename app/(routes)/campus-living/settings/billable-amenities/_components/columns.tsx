'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type {
  BillableAmenity,
  FeeCalculationType,
} from '@/types/billable-amenities';
import { BillableAmenityRowActions } from './row-actions';

const FEE_TYPE_LABEL: Record<FeeCalculationType, string> = {
  ac_per_room_active_share: 'AC (per-room active share)',
  per_resident_flat: 'Flat (per resident)',
  per_room_flat: 'Flat (per room)',
};

export const createColumns = (): ColumnDef<BillableAmenity>[] => [
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
    accessorKey: 'fee_calculation_type',
    header: 'Fee Type',
    cell: ({ row }) => (
      <span className='text-sm'>
        {FEE_TYPE_LABEL[row.original.fee_calculation_type] ??
          row.original.fee_calculation_type}
      </span>
    ),
  },
  {
    accessorKey: 'commitment_months',
    header: 'Commit (mo)',
    cell: ({ row }) => (
      <span className='text-muted-foreground'>
        {row.original.commitment_months}
      </span>
    ),
  },
  {
    accessorKey: 'late_joiner_min_months',
    header: 'Late-joiner Min',
    cell: ({ row }) => (
      <span className='text-muted-foreground'>
        {row.original.late_joiner_min_months}
      </span>
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
    cell: ({ row }) => (
      <BillableAmenityRowActions billableAmenity={row.original} />
    ),
  },
];
