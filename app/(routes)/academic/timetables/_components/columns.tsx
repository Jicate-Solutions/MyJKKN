'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Timetable } from '@/types/academics';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { DataTableRowActions } from './row-actions';
import Link from 'next/link';

export const columns: ColumnDef<Timetable>[] = [
  {
    id: 'select',
    enableResizing: false,
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
    accessorKey: 'timetable_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Timetable Name' />
    ),
    cell: ({ row }) => {
      const timetable = row.original;
      return (
        <Link href={`/academic/timetables/${timetable.id}`}>
          <div className='font-medium hover:text-primary hover:underline'>
            {timetable.timetable_name}
          </div>
        </Link>
      );
    }
  },
  {
    accessorKey: 'academic_year.academic_year_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Academic Year' />
    ),
    cell: ({ row }) => {
      const timetable = row.original;
      return timetable.academic_year?.academic_year_name || '-';
    }
  },
  {
    accessorKey: 'program.program_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Program' />
    ),
    cell: ({ row }) => {
      const timetable = row.original;
      return timetable.program?.program_name || '-';
    }
  },
  {
    accessorKey: 'department.department_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Department' />
    ),
    cell: ({ row }) => {
      const timetable = row.original;
      return timetable.department?.department_name || '-';
    }
  },
  {
    accessorKey: 'semester',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Semester' />
    ),
    cell: ({ row }) => {
      const timetable = row.original;
      return `${timetable.semester}${
        timetable.section ? ` / ${timetable.section}` : ''
      }`;
    }
  },
  {
    accessorKey: 'is_template',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Type' />
    ),
    cell: ({ row }) => {
      const isTemplate = row.getValue('is_template') as boolean;
      const timetable = row.original;
      return (
        <div className='flex flex-col gap-1'>
          <Badge variant={isTemplate ? 'secondary' : 'default'}>
            {isTemplate ? 'Template' : 'Regular'}
          </Badge>
          {isTemplate && timetable.template_name && (
            <span className='text-xs text-muted-foreground'>
              {timetable.template_name}
            </span>
          )}
          {isTemplate && timetable.usage_count && timetable.usage_count > 0 && (
            <span className='text-xs text-green-600'>
              Used {timetable.usage_count} times
            </span>
          )}
        </div>
      );
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
        <Badge
          variant={isActive ? 'default' : 'secondary'}
          className={
            isActive
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-gray-50 text-gray-700 border-gray-200'
          }
        >
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
    cell: ({ row }) => {
      const timetable = row.original;
      return timetable.institution?.name || '-';
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
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => <DataTableRowActions row={row} />,
    enableSorting: false,
    enableHiding: false,
    size: 60,
    minSize: 60,
    maxSize: 80
  }
];
