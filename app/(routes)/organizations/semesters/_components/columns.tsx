'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { DataTableRowActions } from './row-actions';
import { Semester } from '@/types/organizations';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export const columns: ColumnDef<Semester>[] = [
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
    accessorKey: 'semester_code',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Semester Code' />
    ),
    cell: ({ row }) => {
      const semester = row.original;
      return <div className='font-medium '>{semester.semester_code}</div>;
    },
    size: 120,
    minSize: 100,
    maxSize: 150
  },
  {
    accessorKey: 'semester_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Semester Name' />
    ),
    cell: ({ row }) => {
      const semester = row.original;
      return (
        <Link
          href={`/organizations/semesters/${semester.id}`}
          className='font-medium hover:text-primary hover:underline'
        >
          {semester.semester_name}
        </Link>
      );
    },
    size: 200,
    minSize: 150,
    maxSize: 300
  },
  {
    accessorKey: 'semester_type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Type' />
    ),
    cell: ({ row }) => {
      const type = row.getValue('semester_type') as string;
      return (
        <Badge variant='outline' className='capitalize'>
          {type}
        </Badge>
      );
    },
    size: 100,
    minSize: 80,
    maxSize: 120
  },
  {
    accessorKey: 'program',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Program' />
    ),
    cell: ({ row }) => {
      const semester = row.original;
      return semester.program?.program_name || 'N/A';
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