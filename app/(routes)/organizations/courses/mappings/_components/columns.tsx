'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import type { CheckedState } from '@radix-ui/react-checkbox';
import { Badge } from '@/components/ui/badge';
import { DataTableRowActions } from './row-actions';
import { CourseMapping } from '@/types/organizations';
import { FileText } from 'lucide-react';
import Link from 'next/link';
import { DataTableColumnHeader } from '@/components/data-table/column-header';

export const columns: ColumnDef<CourseMapping>[] = [
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
    size: 40
  },
  {
    id: 'course_code',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Course Code' />
    ),
    cell: ({ row }) => {
      const mapping = row.original;
      return (
        <Link
          href={`/organizations/courses/mappings/${mapping.id}`}
          className='flex items-center hover:text-primary font-medium'
        >
          <FileText className='mr-2 h-4 w-4' />
          {mapping.course?.course_code}
        </Link>
      );
    },
    size: 120
  },
  {
    id: 'course_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Course Name' />
    ),
    cell: ({ row }) => {
      const mapping = row.original;
      return (
        <span className='font-medium max-w-[250px] truncate'>
          {mapping.course?.course_name}
        </span>
      );
    },
    size: 250
  },
  {
    id: 'institution',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Institution' />
    ),
    cell: ({ row }) => {
      const mapping = row.original;
      return (
        <span className='text-sm max-w-[180px] truncate'>
          {mapping.institution?.name || 'N/A'}
        </span>
      );
    },
    enableSorting: false,
    size: 180
  },
  {
    id: 'department',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Department' />
    ),
    cell: ({ row }) => {
      const mapping = row.original;
      return (
        <span className='text-sm max-w-[150px] truncate'>
          {mapping.department?.department_name || 'N/A'}
        </span>
      );
    },
    enableSorting: false,
    size: 150
  },
  {
    id: 'program',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Program' />
    ),
    cell: ({ row }) => {
      const mapping = row.original;
      return (
        <span className='text-sm max-w-[150px] truncate'>
          {mapping.program?.program_name || 'N/A'}
        </span>
      );
    },
    enableSorting: false,
    size: 150
  },
  {
    id: 'semester',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Semester' />
    ),
    cell: ({ row }) => {
      const mapping = row.original;
      return (
        <span className='text-sm'>
          {mapping.semester?.semester_name || 'N/A'}
        </span>
      );
    },
    enableSorting: false,
    size: 100
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
    filterFn: (row, id, value) => {
      const isActive = row.getValue(id) as boolean;
      if (value === 'active') return isActive;
      if (value === 'inactive') return !isActive;
      return true;
    },
    size: 100
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created At' />
    ),
    cell: ({ row }) => {
      const date = new Date(row.getValue('created_at'));
      return (
        <span className='text-sm text-muted-foreground'>
          {date.toLocaleDateString()}
        </span>
      );
    },
    size: 120
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => <DataTableRowActions row={row} />,
    enableSorting: false,
    enableHiding: false,
    size: 60
  }
];
