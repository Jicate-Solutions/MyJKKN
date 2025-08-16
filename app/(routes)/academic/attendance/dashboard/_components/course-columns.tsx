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
  // Handle invalid numbers (NaN, null, undefined)
  const safePercentage =
    isNaN(percentage) || percentage == null ? 0 : Number(percentage);

  if (safePercentage >= 90)
    return <Badge className='bg-green-100 text-green-800'>Excellent</Badge>;
  if (safePercentage >= 75)
    return <Badge className='bg-yellow-100 text-yellow-800'>Good</Badge>;
  if (safePercentage >= 50)
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
      // Handle invalid numbers (NaN, null, undefined)
      const safePercentage =
        isNaN(percentage) || percentage == null ? 0 : Number(percentage);
      const displayPercentage = safePercentage.toFixed(1);

      return (
        <div className='flex flex-col items-center space-y-1'>
          <span className='text-sm font-semibold'>{displayPercentage}%</span>
          <Progress value={safePercentage} className='w-16 h-2' />
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
      // Handle invalid numbers (NaN, null, undefined)
      const safeAvgAttendance =
        isNaN(avgAttendance) || avgAttendance == null
          ? 0
          : Number(avgAttendance);
      const displayAvgAttendance = safeAvgAttendance.toFixed(1);

      return (
        <div className='flex flex-col items-center space-y-1'>
          <span className='text-sm font-semibold'>{displayAvgAttendance}%</span>
          <Progress value={safeAvgAttendance} className='w-16 h-2' />
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
      const safePercentage =
        isNaN(percentage) || percentage == null ? 0 : Number(percentage);

      if (value === 'excellent') return safePercentage >= 90;
      if (value === 'good') return safePercentage >= 75 && safePercentage < 90;
      if (value === 'average')
        return safePercentage >= 50 && safePercentage < 75;
      if (value === 'poor') return safePercentage < 50;
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
