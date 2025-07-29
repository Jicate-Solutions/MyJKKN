'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { DataTableRowActions } from './row-actions';
import { Course } from '@/types/organizations';
import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { DataTableColumnHeader } from '@/components/data-table/column-header';

export const columns: ColumnDef<Course>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
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
    accessorKey: 'course_code',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Course Code' />
    ),
    cell: ({ row }) => {
      const course = row.original;
      return (
        <Link
          href={`/organizations/courses/${course.id}`}
          className='flex items-center hover:text-primary font-medium'
        >
          <BookOpen className='mr-2 h-4 w-4' />
          {course.course_code}
        </Link>
      );
    },
    size: 120
  },
  {
    accessorKey: 'course_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Course Name' />
    ),
    cell: ({ row }) => {
      return (
        <span className='font-medium max-w-[300px] truncate'>
          {row.getValue('course_name')}
        </span>
      );
    },
    size: 300
  },
  {
    id: 'institution',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Institution' />
    ),
    cell: ({ row }) => {
      const course = row.original;
      return (
        <span className='text-sm max-w-[200px] truncate'>
          {course.institution?.name || 'N/A'}
        </span>
      );
    },
    enableSorting: false,
    size: 200
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