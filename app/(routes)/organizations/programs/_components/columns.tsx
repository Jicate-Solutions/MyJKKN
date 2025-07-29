'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { DataTableRowActions } from './row-actions';
import { Program } from '@/types/organizations';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export const columns: ColumnDef<Program>[] = [
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
    accessorKey: 'program_id',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Program ID' />
    ),
    cell: ({ row }) => {
      const program = row.original;
      return <div className='font-medium '>{program.program_id}</div>;
    },
    size: 120,
    minSize: 100,
    maxSize: 150
  },
  {
    accessorKey: 'program_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Program Name' />
    ),
    cell: ({ row }) => {
      const program = row.original;
      return (
        <Link
          href={`/organizations/programs/${program.id}`}
          className='font-medium hover:text-primary hover:underline'
        >
          {program.program_name}
        </Link>
      );
    },
    size: 250,
    minSize: 200,
    maxSize: 350
  },
  {
    accessorKey: 'degree',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Degree' />
    ),
    cell: ({ row }) => {
      const program = row.original;
      return program.degree?.degree_name || 'N/A';
    },
    size: 180,
    minSize: 150,
    maxSize: 250
  },
  {
    accessorKey: 'department',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Department' />
    ),
    cell: ({ row }) => {
      const program = row.original;
      return program.department?.department_name || 'N/A';
    },
    size: 200,
    minSize: 150,
    maxSize: 300
  },
  {
    accessorKey: 'institution',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Institution' />
    ),
    cell: ({ row }) => {
      const program = row.original;
      return program.institution?.name || 'N/A';
    },
    size: 200,
    minSize: 150,
    maxSize: 300
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
    },
    size: 100,
    minSize: 80,
    maxSize: 120
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created At' />
    ),
    cell: ({ row }) => {
      const date = new Date(row.getValue('created_at'));
      return date.toLocaleDateString();
    },
    size: 120,
    minSize: 100,
    maxSize: 150
  },
  {
    id: 'actions',
    header: 'Actions',
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
    ),
    enableSorting: false,
    enableHiding: false,
    size: 60,
    minSize: 60,
    maxSize: 80
  }
];