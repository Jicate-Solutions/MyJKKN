'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { BosExternalExpert, BOS_EXPERT_CATEGORY_LABELS } from '@/types/bos';
import { DataTableRowActions } from './row-actions';

// Category badge colours — helps staff visually distinguish expert types
const categoryVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
  university_nominee: 'default',
  subject_expert: 'secondary',
  industry_expert: 'outline',
  alumni: 'outline',
};

const baseColumns: ColumnDef<BosExternalExpert>[] = [
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
    size: 50,
    minSize: 50,
    maxSize: 50,
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Name' />,
    size: 200,
    cell: ({ row }) => {
      const expert = row.original;
      return (
        <div>
          <div className='font-medium'>
            {expert.title ? `${expert.title} ` : ''}{expert.name}
          </div>
          {expert.designation && (
            <div className='text-xs text-muted-foreground'>{expert.designation}</div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'category',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Category' />,
    size: 160,
    cell: ({ row }) => {
      const cat = row.getValue('category') as string;
      return (
        <Badge variant={categoryVariant[cat] ?? 'secondary'}>
          {BOS_EXPERT_CATEGORY_LABELS[cat as keyof typeof BOS_EXPERT_CATEGORY_LABELS] ?? cat}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'institution_name',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Institution' />,
    size: 220,
    cell: ({ row }) => {
      const expert = row.original;
      return (
        <div>
          <div>{expert.institution_name ?? '—'}</div>
          {expert.department_name && (
            <div className='text-xs text-muted-foreground'>{expert.department_name}</div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'specialization',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Specialization' />
    ),
    size: 200,
    cell: ({ row }) => (
      <div className='max-w-[200px] truncate'>
        {row.getValue('specialization') ?? '—'}
      </div>
    ),
  },
  {
    accessorKey: 'email',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Email' />,
    size: 200,
    cell: ({ row }) => (
      <div className='text-sm'>{row.getValue('email') ?? '—'}</div>
    ),
  },
  {
    accessorKey: 'is_active',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Status' />,
    size: 90,
    cell: ({ row }) => {
      const isActive = row.getValue('is_active') as boolean;
      return (
        <Badge variant={isActive ? 'default' : 'secondary'}>
          {isActive ? 'Active' : 'Inactive'}
        </Badge>
      );
    },
  },
];

const actionsColumn: ColumnDef<BosExternalExpert> = {
  id: 'actions',
  header: 'Actions',
  cell: ({ row }) => <DataTableRowActions row={row} />,
  enableSorting: false,
  enableHiding: false,
  size: 60,
  minSize: 60,
  maxSize: 80,
};

export const getColumns = (permissions: {
  canEdit: boolean;
  canDelete: boolean;
}): ColumnDef<BosExternalExpert>[] => {
  if (!permissions.canEdit && !permissions.canDelete) return baseColumns;
  return [...baseColumns, actionsColumn];
};

export const columns: ColumnDef<BosExternalExpert>[] = [...baseColumns, actionsColumn];
