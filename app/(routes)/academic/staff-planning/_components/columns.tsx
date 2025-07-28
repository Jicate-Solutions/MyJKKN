'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { StaffPlan } from '@/types/staff-planning';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { DataTableRowActions } from './row-actions';

export const columns: ColumnDef<StaffPlan>[] = [
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
    accessorKey: 'institution.name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Institution' />
    ),
    cell: ({ row }) => {
      const staffPlan = row.original;
      return (
        <Link
          href={`/academic/staff-planning/${staffPlan.id}`}
          className='font-medium hover:text-primary hover:underline'
        >
          {staffPlan.institution?.name || '-'}
        </Link>
      );
    },
    size: 200,
    minSize: 200,
    maxSize: 250
  },
  {
    accessorKey: 'program.program_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Program' />
    ),
    cell: ({ row }) => {
      const staffPlan = row.original;
      return (
        <div>
          <div className='font-medium'>
            {staffPlan.program?.program_name || '-'}
          </div>
          <div className='text-sm text-muted-foreground'>
            {staffPlan.department?.department_name || '-'}
          </div>
        </div>
      );
    }
  },
  {
    accessorKey: 'semester.semester_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Semester' />
    ),
    cell: ({ row }) => {
      const staffPlan = row.original;
      return staffPlan.semester?.semester_name || '-';
    }
  },
  {
    accessorKey: 'academic_year.academic_year_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Academic Year' />
    ),
    cell: ({ row }) => {
      const staffPlan = row.original;
      return staffPlan.academic_year?.academic_year_name || '-';
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
