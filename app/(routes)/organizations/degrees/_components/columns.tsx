'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { DataTableRowActions } from './row-actions';
import { Degree } from '@/types/organizations';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export const columns: ColumnDef<Degree>[] = [
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
    enableHiding: false
  },
  {
    accessorKey: 'degree_id',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Degree ID' />
    )
  },
  {
    accessorKey: 'degree_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Degree Name' />
    ),
    cell: ({ row }) => {
      const degree = row.original;
      return (
        <Link
          href={`/organizations/degrees/${degree.id}`}
          className='font-medium text-primary hover:underline'
        >
          {degree.degree_name}
        </Link>
      );
    }
  },
  {
    accessorKey: 'degree_type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Type' />
    ),
    cell: ({ row }) => {
      const type = row.getValue('degree_type') as string;
      return (
        <Badge variant={type === 'ug' ? 'default' : 'secondary'}>
          {type?.toUpperCase()}
        </Badge>
      );
    }
  },
  {
    accessorKey: 'institution',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Institution' />
    ),
    cell: ({ row }) => {
      const degree = row.original;
      return degree.institution?.name || 'N/A';
    }
  },
  {
    accessorKey: 'is_active',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
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
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created At' />
    ),
    cell: ({ row }) => {
      const date = new Date(row.getValue('created_at'));
      return date.toLocaleDateString();
    }
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <DataTableRowActions
        row={row}
        onEdit={(id) => {
          // Navigation will be handled in the DataTableRowActions component
        }}
        onDelete={(id) => {
          // Deletion will be handled in the DataTableRowActions component
        }}
      />
    )
  }
];
