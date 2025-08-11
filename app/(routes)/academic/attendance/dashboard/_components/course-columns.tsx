'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CourseRowActions } from './course-row-actions';

export interface CourseAttendanceData {
  course_id: string;
  course_name: string;
  course_code: string;
  total_periods: number;
  attendance_taken: number;
  attendance_not_taken: number;
  attendance_percentage: number;
  avg_student_attendance: number;
}

const getStatusBadge = (percentage: number) => {
  if (percentage >= 90)
    return <Badge className='bg-green-100 text-green-800'>Excellent</Badge>;
  if (percentage >= 75)
    return <Badge className='bg-yellow-100 text-yellow-800'>Good</Badge>;
  if (percentage >= 50)
    return <Badge className='bg-orange-100 text-orange-800'>Average</Badge>;
  return <Badge className='bg-red-100 text-red-800'>Poor</Badge>;
};

export const courseColumns: ColumnDef<CourseAttendanceData>[] = [
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
    accessorKey: 'course_code',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Course Code' />
    ),
    cell: ({ row }) => {
      return (
        <div className='font-medium'>
          <Badge variant='outline'>{row.getValue('course_code')}</Badge>
        </div>
      );
    }
  },
  {
    accessorKey: 'course_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Course Name' />
    ),
    cell: ({ row }) => {
      return (
        <div className='font-medium hover:text-primary hover:underline'>
          {row.getValue('course_name')}
        </div>
      );
    }
  },
  {
    accessorKey: 'total_periods',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Total Periods' />
    ),
    cell: ({ row }) => {
      return (
        <div className='text-center font-medium'>
          {row.getValue('total_periods')}
        </div>
      );
    }
  },
  {
    accessorKey: 'attendance_taken',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Taken' />
    ),
    cell: ({ row }) => {
      return (
        <div className='text-center text-green-600 font-medium'>
          {row.getValue('attendance_taken')}
        </div>
      );
    }
  },
  {
    accessorKey: 'attendance_not_taken',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Not Taken' />
    ),
    cell: ({ row }) => {
      return (
        <div className='text-center text-red-600 font-medium'>
          {row.getValue('attendance_not_taken')}
        </div>
      );
    }
  },
  {
    accessorKey: 'attendance_percentage',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Completion %' />
    ),
    cell: ({ row }) => {
      const percentage = row.getValue('attendance_percentage') as number;
      return (
        <div className='flex flex-col items-center space-y-1'>
          <span className='text-sm font-semibold'>{percentage}%</span>
          <Progress value={percentage} className='w-16 h-2' />
        </div>
      );
    }
  },
  {
    accessorKey: 'avg_student_attendance',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Avg Student %' />
    ),
    cell: ({ row }) => {
      const avgAttendance = row.getValue('avg_student_attendance') as number;
      return (
        <div className='flex flex-col items-center space-y-1'>
          <span className='text-sm font-semibold'>{avgAttendance}%</span>
          <Progress value={avgAttendance} className='w-16 h-2' />
        </div>
      );
    }
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    cell: ({ row }) => {
      const percentage = row.original.attendance_percentage;
      return <div className='text-center'>{getStatusBadge(percentage)}</div>;
    },
    filterFn: (row, id, value) => {
      const percentage = row.original.attendance_percentage;
      if (value === 'excellent') return percentage >= 90;
      if (value === 'good') return percentage >= 75 && percentage < 90;
      if (value === 'average') return percentage >= 50 && percentage < 75;
      if (value === 'poor') return percentage < 50;
      return true;
    }
  },

  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => <CourseRowActions row={row} />,
    enableSorting: false,
    enableHiding: false,
    size: 60,
    minSize: 60,
    maxSize: 80
  }
];
