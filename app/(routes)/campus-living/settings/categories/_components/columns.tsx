'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type { HostelCategory } from '@/types/hostel-categories';
import { HOSTEL_CATEGORY_TYPE_LABELS, ALLOCATION_MODE_LABELS } from '@/types/hostel-categories';
import { HostelCategoryRowActions, HostelCategoryNameCell } from './row-actions';
import { useActiveHostelCategories } from '@/hooks/campus-living/use-hostel-categories';
import { useCategoryRoomSources } from '@/hooks/campus-living/use-hostel-category-room-sources';

const TYPE_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  boys: 'default',
  girls: 'secondary',
  mixed: 'outline',
};

/**
 * The extra room categories this one may seat learners in. Both queries are the
 * same cached keys the rest of this page uses, so rendering it per row costs
 * nothing extra.
 */
function RoomSourcesCell({ category }: { category: HostelCategory }) {
  const { data: sources = [] } = useCategoryRoomSources();
  const { hostelCategories } = useActiveHostelCategories();

  const names = sources
    .filter((s) => s.category_id === category.id)
    .map((s) => hostelCategories.find((c) => c.id === s.source_category_id)?.name)
    .filter((n): n is string => !!n);

  if (names.length === 0) return <span className='text-muted-foreground'>—</span>;
  return (
    <div className='flex flex-wrap gap-1'>
      {names.map((n) => (
        <Badge key={n} variant='outline' className='font-normal'>
          {n}
        </Badge>
      ))}
    </div>
  );
}

export const createColumns = (): ColumnDef<HostelCategory>[] => [
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
    cell: ({ row }) => <HostelCategoryNameCell category={row.original} />,
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => (
      <Badge variant={TYPE_VARIANT[row.original.type] ?? 'outline'}>
        {HOSTEL_CATEGORY_TYPE_LABELS[row.original.type as keyof typeof HOSTEL_CATEGORY_TYPE_LABELS] ?? row.original.type}
      </Badge>
    ),
  },
  {
    accessorKey: 'allocation_mode',
    header: 'Allocation',
    cell: ({ row }) => (
      <Badge variant={row.original.allocation_mode === 'auto' ? 'default' : 'outline'}>
        {ALLOCATION_MODE_LABELS[row.original.allocation_mode] ?? row.original.allocation_mode}
      </Badge>
    ),
  },
  {
    accessorKey: 'upgrade_threshold_pct',
    header: 'Upgrade Threshold',
    cell: ({ row }) => (
      <span className='text-sm'>
        {row.original.upgrade_threshold_pct != null
          ? `${row.original.upgrade_threshold_pct}%`
          : '—'}
      </span>
    ),
  },
  {
    accessorKey: 'upgrade_hold_days',
    header: 'Waitlist Days',
    cell: ({ row }) => (
      <span className='text-sm'>
        {row.original.upgrade_hold_days != null
          ? `${row.original.upgrade_hold_days} ${row.original.upgrade_hold_days === 1 ? 'day' : 'days'}`
          : '—'}
      </span>
    ),
  },
  {
    id: 'room_sources',
    header: 'Also Uses Rooms From',
    cell: ({ row }) => <RoomSourcesCell category={row.original} />,
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
    cell: ({ row }) => <HostelCategoryRowActions category={row.original} />,
  },
];
