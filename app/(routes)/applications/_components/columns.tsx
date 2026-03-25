'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Application } from '@/types/applications';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { DataTableRowActions } from './row-actions';
import { Shield, LogIn } from 'lucide-react';
import Link from 'next/link';

// Base columns without actions
const baseColumns: ColumnDef<Application>[] = [
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
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Name' />
    ),
    size: 200,
    minSize: 150,
    maxSize: 300,
    cell: ({ row }) => {
      const app = row.original;
      return (
        <div className='flex items-center gap-2 font-medium'>
          <Link
            href={`/applications/${app.id}`}
            className='hover:text-primary hover:underline'
          >
            {app.name}
          </Link>
          {app.uses_parent_auth && (
            <span title='Uses MyJKKN Auth'>
              <Shield className='h-3 w-3 text-primary' />
            </span>
          )}
        </div>
      );
    }
  },
  {
    accessorKey: 'category.name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Category' />
    ),
    size: 150,
    minSize: 120,
    maxSize: 200,
    cell: ({ row }) => {
      const app = row.original;
      return app.category?.name || 'Uncategorized';
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
    accessorKey: 'auth_method',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Authentication' />
    ),
    size: 150,
    minSize: 120,
    maxSize: 180,
    cell: ({ row }) => {
      const app = row.original;
      if (app.uses_parent_auth) {
        return (
          <Badge variant='outline' className='gap-1'>
            <Shield className='h-3 w-3' />
            MyJKKN Auth
          </Badge>
        );
      }
      const authMethod = row.getValue('auth_method') as string;
      return (
        <Badge variant='secondary' className='gap-1'>
          <LogIn className='h-3 w-3' />
          {authMethod === 'sso'
            ? 'SSO'
            : authMethod === 'none'
            ? 'None'
            : 'Separate'}
        </Badge>
      );
    }
  },
  {
    accessorKey: 'integration_type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Integration' />
    ),
    size: 120,
    minSize: 100,
    maxSize: 150,
    cell: ({ row }) => {
      const integrationType = row.getValue('integration_type') as string;
      return (
        <span className='capitalize'>{integrationType.replace('_', ' ')}</span>
      );
    }
  },
  {
    accessorKey: 'supported_platforms',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Platform' />
    ),
    size: 100,
    minSize: 80,
    maxSize: 120,
    cell: ({ row }) => {
      const platform = row.getValue('supported_platforms') as string;
      return <span className='capitalize'>{platform}</span>;
    }
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created At' />
    ),
    size: 120,
    minSize: 100,
    maxSize: 150,
    cell: ({ row }) => {
      const date = row.getValue('created_at') as string;
      return date ? format(new Date(date), 'MMM dd, yyyy') : '-';
    }
  }
];

// Actions column definition
const actionsColumn: ColumnDef<Application> = {
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
export const getColumns = (permissions: {
  canEdit: boolean;
  canDelete: boolean;
}): ColumnDef<Application>[] => {
  const { canEdit, canDelete } = permissions;

  // If user has no edit or delete permissions, don't show actions column
  if (!canEdit && !canDelete) {
    return baseColumns;
  }

  // If user has at least one permission, show actions column
  return [...baseColumns, actionsColumn];
};

// Backward compatibility - export default columns with actions
export const columns: ColumnDef<Application>[] = [
  ...baseColumns,
  actionsColumn
];
