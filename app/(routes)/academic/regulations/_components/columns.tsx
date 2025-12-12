'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Regulation } from '@/types/academics';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { DataTableRowActions } from './row-actions';

// Base columns without actions
const baseColumns: ColumnDef<Regulation>[] = [
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
    accessorKey: 'regulation_code',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Regulation Code' />
    ),
    size: 150,
    minSize: 150,
    maxSize: 200,
    cell: ({ row }) => {
      const regulation = row.original;
      return (
        <div className='font-medium'>
          {regulation.regulation_code}
        </div>
      );
    }
  },
  {
    accessorKey: 'regulation_year',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Regulation Year' />
    ),
    size: 120,
    minSize: 100,
    maxSize: 150,
    cell: ({ row }) => {
      const year = row.getValue('regulation_year') as string;
      return <div>{year}</div>;
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
  {
    accessorKey: 'institution.name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Institution' />
    ),
    size: 200,
    minSize: 200,
    maxSize: 250,
    cell: ({ row }) => {
      const regulation = row.original;
      return regulation.institution?.name || '-';
    }
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created At' />
    ),
    cell: ({ row }) => {
      const date = row.getValue('created_at') as string;
      return date ? format(new Date(date), 'MMM dd, yyyy') : '-';
    }
  }
];

// Actions column definition
const actionsColumn: ColumnDef<Regulation> = {
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
export const getColumns = (permissions: { canEdit: boolean; canDelete: boolean }): ColumnDef<Regulation>[] => {
  const { canEdit, canDelete } = permissions;

  // If user has no edit or delete permissions, don't show actions column
  if (!canEdit && !canDelete) {
    return baseColumns;
  }

  // If user has at least one permission, show actions column
  return [...baseColumns, actionsColumn];
};

// Backward compatibility - export default columns with actions
export const columns: ColumnDef<Regulation>[] = [...baseColumns, actionsColumn];
