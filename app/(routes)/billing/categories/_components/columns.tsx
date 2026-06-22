'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import type { BillingCategory, BillingCategoryFrequency } from '@/types/billing';
import { billingKindLabel } from './billing-category-form';
import { CategoryRowActions } from './category-row-actions';

const frequencyLabel: Record<BillingCategoryFrequency, string> = {
  'one-time': 'One-time',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly'
};

const formatAmount = (amount: number | null) =>
  amount === null
    ? '—'
    : new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2
      }).format(amount);

interface GetColumnsOptions {
  // Bubbled up so a row delete can trigger a table refetch.
  onChanged: () => void;
}

export const getColumns = ({
  onChanged
}: GetColumnsOptions): ColumnDef<BillingCategory>[] => [
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
    accessorKey: 'category_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Category Name' />
    ),
    cell: ({ row }) => {
      const category = row.original;
      return (
        <div className='flex flex-col'>
          <span className='font-medium'>{category.category_name}</span>
          {category.description && (
            <span className='text-xs text-muted-foreground line-clamp-1'>
              {category.description}
            </span>
          )}
        </div>
      );
    }
  },
  {
    accessorKey: 'kind',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Fee Head' />
    ),
    cell: ({ row }) => (
      <Badge variant='secondary'>{billingKindLabel(row.original.kind)}</Badge>
    )
  },
  {
    accessorKey: 'frequency',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Frequency' />
    ),
    cell: ({ row }) => (
      <Badge variant='outline'>{frequencyLabel[row.original.frequency]}</Badge>
    )
  },
  {
    accessorKey: 'amount',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Default Amount' />
    ),
    cell: ({ row }) => formatAmount(row.original.amount)
  },
  {
    accessorKey: 'is_active',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    cell: ({ row }) => (
      <Badge variant={row.original.is_active ? 'default' : 'secondary'}>
        {row.original.is_active ? 'Active' : 'Inactive'}
      </Badge>
    )
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created' />
    ),
    cell: ({ row }) => new Date(row.original.created_at).toLocaleDateString()
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => (
      <CategoryRowActions category={row.original} onChanged={onChanged} />
    )
  }
];
