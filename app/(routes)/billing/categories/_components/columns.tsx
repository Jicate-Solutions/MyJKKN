'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import type { BillingCategory, BillingCategoryFrequency } from '@/types/billing';
import { billingKindLabel, collectionTypeLabel } from './billing-category-form';
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
    accessorKey: 'collection_type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Collection' />
    ),
    cell: ({ row }) => {
      const isGovernment = row.original.collection_type === 'government';
      return (
        <Badge
          variant={isGovernment ? 'outline' : 'secondary'}
          className={
            isGovernment
              ? 'border-amber-500 text-amber-700 dark:text-amber-400'
              : undefined
          }
        >
          {collectionTypeLabel(row.original.collection_type)}
        </Badge>
      );
    }
  },
  {
    accessorKey: 'visible_to_learners',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Learner Portal' />
    ),
    cell: ({ row }) =>
      row.original.visible_to_learners ? (
        <Badge variant='secondary'>Visible</Badge>
      ) : (
        <Badge
          variant='outline'
          className='border-muted-foreground/40 text-muted-foreground'
          title='Learners never see this fee in My Bills — Accounts still bill and collect it.'
        >
          Hidden
        </Badge>
      )
  },
  {
    accessorKey: 'once_per_learner',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Duplicate Guard' />
    ),
    // Only the restricted state gets a badge. Most categories are unrestricted,
    // so badging both would add noise to every row for no signal.
    cell: ({ row }) =>
      row.original.once_per_learner ? (
        <Badge
          variant='outline'
          className='border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
          title='A learner can hold only one live bill in this category. Enforced in the database across every billing route.'
        >
          Once per learner
        </Badge>
      ) : (
        <span className='text-muted-foreground text-sm'>—</span>
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
