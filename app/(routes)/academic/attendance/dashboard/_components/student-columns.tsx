'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { StudentRowActions } from './student-row-actions';

export interface StudentAttendanceData {
  student_id: string;
  student_name: string;
  student_roll_number: string;
  total_periods: number;
  present_periods: number;
  absent_periods: number;
  attendance_percentage: number;
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

export const studentColumns: ColumnDef<StudentAttendanceData>[] = [
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
    accessorKey: 'student_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Student Name' />
    ),
    cell: ({ row }) => {
      return (
        <div className='font-medium hover:text-primary hover:underline'>
          {row.getValue('student_name')}
        </div>
      );
    }
  },
  {
    accessorKey: 'student_roll_number',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Roll Number' />
    ),
    cell: ({ row }) => {
      return (
        <div className='text-sm'>{row.getValue('student_roll_number')}</div>
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
    accessorKey: 'present_periods',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Present' />
    ),
    cell: ({ row }) => {
      return (
        <div className='text-center text-green-600 font-medium'>
          {row.getValue('present_periods')}
        </div>
      );
    }
  },
  {
    accessorKey: 'absent_periods',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Absent' />
    ),
    cell: ({ row }) => {
      return (
        <div className='text-center text-red-600 font-medium'>
          {row.getValue('absent_periods')}
        </div>
      );
    }
  },
  {
    accessorKey: 'attendance_percentage',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Attendance %' />
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
    cell: ({ row }) => <StudentRowActions row={row} />,
    enableSorting: false,
    enableHiding: false,
    size: 60,
    minSize: 60,
    maxSize: 80
  }
];
