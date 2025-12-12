'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Batch } from '@/types/academics';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { DataTableRowActions } from './row-actions';

// Base columns without actions
const baseColumns: ColumnDef<Batch>[] = [
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
    accessorKey: 'batch_code',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Batch Code' />
    ),
    size: 120,
    minSize: 100,
    maxSize: 150,
    cell: ({ row }) => {
      const batch = row.original;
      return (
        <div className='font-medium'>
          {batch.batch_code}
        </div>
      );
    }
  },
  {
    accessorKey: 'batch_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Batch Name' />
    ),
    size: 200,
    minSize: 150,
    maxSize: 300,
    cell: ({ row }) => {
      const name = row.getValue('batch_name') as string;
      return <div>{name}</div>;
    }
  },
  {
    accessorKey: 'batch_year',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Batch Year' />
    ),
    size: 120,
    minSize: 100,
    maxSize: 150,
    cell: ({ row }) => {
      const year = row.getValue('batch_year') as string;
      return <div>{year}</div>;
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
      const batch = row.original;
      return batch.institution?.name || '-';
    }
  },
  {
    accessorKey: 'start_date',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Start Date' />
    ),
    size: 120,
    minSize: 100,
    maxSize: 150,
    cell: ({ row }) => {
      const date = row.getValue('start_date') as string;
      return date ? format(new Date(date), 'MMM dd, yyyy') : '-';
    }
  },
  {
    accessorKey: 'end_date',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='End Date' />
    ),
    size: 120,
    minSize: 100,
    maxSize: 150,
    cell: ({ row }) => {
      const date = row.getValue('end_date') as string;
      return date ? format(new Date(date), 'MMM dd, yyyy') : '-';
    }
  },
  {
    accessorKey: 'is_active',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    size: 100,
    minSize: 80,
    maxSize: 120,
    cell: ({ row }) => {
      const isActive = row.getValue('is_active') as boolean;
      return (
        <Badge variant={isActive ? 'default' : 'secondary'}>
          {isActive ? 'Active' : 'Inactive'}
        </Badge>
      );
    }
  },
  
];

// Actions column definition
const actionsColumn: ColumnDef<Batch> = {
  id: 'actions',
  header: 'Actions',
  cell: ({ row }) => <DataTableRowActions row={row} />,
  enableSorting: false,
  enableHiding: false,
  size: 60,
  minSize: 60,
  maxSize: 80
};

// Function to get columns based on permissions
export const getColumns = (permissions: { canEdit: boolean; canDelete: boolean }): ColumnDef<Batch>[] => {
  const { canEdit, canDelete } = permissions;

  // If user has no edit or delete permissions, don't show actions column
  if (!canEdit && !canDelete) {
    return baseColumns;
  }

  // If user has at least one permission, show actions column
  return [...baseColumns, actionsColumn];
};

// Backward compatibility - export default columns with actions
export const columns: ColumnDef<Batch>[] = [...baseColumns, actionsColumn];
