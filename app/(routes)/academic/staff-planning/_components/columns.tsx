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
      <DataTableColumnHeader column={column} title='Program & Semester' />
    ),
    cell: ({ row }) => {
      const staffPlan = row.original;
      return (
        <div>
          <div className='font-medium'>
            {staffPlan.program?.program_name || '-'}
          </div>
          <div className='text-sm text-muted-foreground'>
            {staffPlan.semester?.semester_name || '-'} •{' '}
            {staffPlan.academic_year?.academic_year_name || '-'}
          </div>
          <div className='text-xs text-muted-foreground'>
            {staffPlan.department?.department_name || '-'}
          </div>
        </div>
      );
    }
  },
  {
    accessorKey: 'course_count',
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title='Courses'
        className='text-center'
      />
    ),
    size: 50,
    minSize: 50,
    maxSize: 50,
    cell: ({ row }) => {
      const staffPlan = row.original;
      const courseCount = staffPlan.course_count || 0;
      const duplicateCount = staffPlan.duplicate_count || 1;

      return (
        <div className='text-center'>
          <div className='font-medium text-lg'>{courseCount}</div>
          <div className='text-xs text-muted-foreground'>
            {courseCount === 1 ? 'course' : 'courses'}
          </div>
          {duplicateCount > 1 && (
            <div className='text-xs text-orange-600 mt-1'>
              From {duplicateCount} plans
            </div>
          )}
        </div>
      );
    }
  },
  {
    accessorKey: 'staff_summary',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Staff Assigned' />
    ),
    cell: ({ row }) => {
      const staffPlan = row.original;
      const staffCount = staffPlan.total_staff || 0;
      const duplicateCount = staffPlan.duplicate_count || 1;

      return (
        <div>
          <div className='font-medium'>
            {staffCount} {staffCount === 1 ? 'staff member' : 'staff members'}
          </div>
          <div className='text-xs text-muted-foreground'>
            {duplicateCount > 1 ? (
              <Badge variant='secondary' className='text-xs'>
                Consolidated from {duplicateCount} plans
              </Badge>
            ) : (
              <span className='text-muted-foreground'>
                {staffCount > 0 ? 'Assigned' : 'No assignments'}
              </span>
            )}
          </div>
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
