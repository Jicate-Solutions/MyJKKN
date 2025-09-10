'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';
import { DataTableRowActions } from './row-actions';
import Link from 'next/link';
import type { AttendanceReport } from '@/lib/services/academic/attendance-report-service';

export const columns: ColumnDef<AttendanceReport>[] = [
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
    accessorKey: 'attendance_date',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Date' />
    ),
    size: 130,
    minSize: 130,
    maxSize: 130,
    cell: ({ row }) => {
      const report = row.original;
      return (
        <div className='font-medium hover:text-primary hover:underline'>
          <Link href={`/academic/attendance/reports/${report.id}`}>
            {format(new Date(report.attendance_date), 'MMM dd, yyyy')}
          </Link>
        </div>
      );
    }
  },
  {
    accessorKey: 'institution_degree',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Institution & Degree' />
    ),
    size: 200,
    minSize: 200,
    maxSize: 200,
    cell: ({ row }) => {
      const report = row.original;
      return (
        <div className='space-y-1'>
          <div className='text-sm font-medium text-gray-900 dark:text-white'>
            {report.institution_name || 'Unknown Institution'}
          </div>
          <div className='text-xs text-muted-foreground'>
            {report.degree_name || 'Unknown Degree'}
          </div>
        </div>
      );
    }
  },
  {
    accessorKey: 'department_semester_section',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Dept, Semester & Section' />
    ),
    size: 220,
    minSize: 220,
    maxSize: 220,
    cell: ({ row }) => {
      const report = row.original;
      return (
        <div className='space-y-1'>
          <div className='text-sm font-medium text-gray-900 dark:text-white'>
            {report.department_name || 'Unknown Department'}
          </div>
          <div className='text-xs text-muted-foreground flex items-center gap-2'>
            <span>{report.semester_name || 'Unknown Semester'}</span>
            <span>•</span>
            <span>Section {report.section_name || 'Unknown'}</span>
          </div>
        </div>
      );
    }
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Academic Year' />
    ),
    size: 130,
    minSize: 130,
    maxSize: 130,
    cell: ({ row }) => {
      const report = row.original;
      // Extract year from created_at as a fallback since academic_year_name is not available
      const year = new Date(report.created_at).getFullYear();
      return (
        <div className='text-sm font-medium'>
          <Badge
            variant='outline'
            className='bg-blue-50 text-blue-700 border-blue-200'
          >
            {`${year}-${year + 1}`}
          </Badge>
        </div>
      );
    }
  },
  {
    accessorKey: 'average_attendance',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Attendance' />
    ),
    size: 120,
    minSize: 120,
    maxSize: 120,
    cell: ({ row }) => {
      const report = row.original;
      const percentage = report.average_attendance;
      const getAttendanceColor = (percentage: number) => {
        if (percentage >= 85) return 'text-green-600';
        if (percentage >= 75) return 'text-yellow-600';
        return 'text-red-600';
      };

      return (
        <div className='space-y-2'>
          <div
            className={`text-sm font-medium ${getAttendanceColor(percentage)}`}
          >
            {percentage.toFixed(1)}%
          </div>
          <Progress value={percentage} className='h-2' />
        </div>
      );
    }
  },
  {
    accessorKey: 'periods_count',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Periods' />
    ),
    size: 100,
    minSize: 100,
    maxSize: 100,
    cell: ({ row }) => {
      const report = row.original;
      const periodsCount = report.periods_count || 0;
      return (
        <div className='text-center'>
          <Badge
            variant='outline'
            className='bg-purple-50 text-purple-700 border-purple-200 font-semibold'
          >
            {periodsCount} Period{periodsCount !== 1 ? 's' : ''}
          </Badge>
        </div>
      );
    }
  },
  {
    id: 'actions',
    header: 'Actions',
    size: 80,
    minSize: 80,
    maxSize: 80,
    cell: ({ row }) => <DataTableRowActions row={row} />,
    enableSorting: false,
    enableHiding: false
  }
];
