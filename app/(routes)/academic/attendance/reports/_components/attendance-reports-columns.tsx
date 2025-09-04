'use client';

import { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AttendanceReportRecord } from '@/lib/services/academic/attendance-analytics-service';
import { AttendanceReportRowActions } from './attendance-report-row-actions';
import { formatTimeRange } from '@/utils/time-format';

const getAttendanceBadge = (percentage: number) => {
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

export const attendanceReportColumns: ColumnDef<AttendanceReportRecord>[] = [
  // Note: The selection column is automatically added by DataTable when onBulkAction is provided
  {
    accessorKey: 'attendance_date',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Date' />
    ),
    cell: ({ row }) => {
      const date = row.getValue('attendance_date') as string;
      return (
        <div className='font-medium'>
          {format(new Date(date), 'dd MMM yyyy')}
        </div>
      );
    }
  },
  {
    accessorKey: 'course_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Course' />
    ),
    cell: ({ row }) => {
      const courseName = row.getValue('course_name') as string;
      const courseCode = row.original.course_code;
      const reportId = row.original.id;

      const handleCourseClick = () => {
        // Navigate to the attendance report details page
        window.open(`/academic/attendance/reports/${reportId}`, '_blank');
      };

      return (
        <div>
          <div
            className='font-medium text-primary hover:text-primary-hover cursor-pointer hover:underline transition-colors duration-200'
            onClick={handleCourseClick}
            title='Click to view attendance report details'
          >
            {courseName}
          </div>
          {courseCode && courseCode !== 'N/A' && courseCode.trim() !== '' && (
            <div className='text-sm text-muted-foreground'>
              <Badge variant='outline' className='text-xs'>
                {courseCode}
              </Badge>
            </div>
          )}
        </div>
      );
    }
  },
  {
    accessorKey: 'period_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Period' />
    ),
    cell: ({ row }) => {
      const periodName = row.getValue('period_name') as string;
      const startTime = row.original.start_time;
      const endTime = row.original.end_time;
      return (
        <div>
          <div className='font-medium'>{periodName}</div>
          <div className='text-sm text-muted-foreground'>
            {formatTimeRange(startTime, endTime)}
          </div>
        </div>
      );
    }
  },
  {
    accessorKey: 'section_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Section' />
    ),
    cell: ({ row }) => {
      const sectionName = row.getValue('section_name') as string;
      const semesterName = row.original.semester_name;
      const programName = row.original.program_name;
      return (
        <div>
          <div className='text-xs text-muted-foreground'>{programName}</div>
          <div className='text-sm text-muted-foreground'>{semesterName}</div>
          <div className='font-medium'>{sectionName}</div>
        </div>
      );
    }
  },
  {
    accessorKey: 'faculty_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Assigned Faculty' />
    ),
    cell: ({ row }) => {
      const assignedFaculty = row.original.assigned_faculty;
      const assignedFacultyList = row.original.assigned_faculty_list;
      const originalFacultyName = row.getValue('faculty_name') as string;

      // Use assigned faculty if available, otherwise fall back to original logic
      const displayName =
        assignedFaculty ||
        (originalFacultyName && originalFacultyName !== 'Unknown Faculty'
          ? originalFacultyName
          : 'Unknown Faculty');

      // For table display: show primary faculty + staff count
      let primaryFacultyName = displayName;
      let additionalStaffCount = 0;

      if (assignedFacultyList && assignedFacultyList.length > 0) {
        // Find primary faculty or use first one
        const primaryFaculty =
          assignedFacultyList.find((f) => f.isPrimary) ||
          assignedFacultyList[0];
        primaryFacultyName = primaryFaculty.name;
        additionalStaffCount = assignedFacultyList.length - 1;
      }

      return (
        <div className='space-y-1'>
          <div className='font-medium'>
            {primaryFacultyName}
            {additionalStaffCount > 0 && (
              <span className='ml-1 text-xs text-muted-foreground'>
                +{additionalStaffCount} staff
              </span>
            )}
          </div>
        </div>
      );
    }
  },
  {
    id: 'attendance_stats',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Attendance' />
    ),
    cell: ({ row }) => {
      const present = row.original.present_count;
      const total = row.original.total_students;
      const percentage = row.original.attendance_percentage;

      return (
        <div className='space-y-1'>
          <div className='flex items-center justify-between'>
            <span className='text-sm font-medium'>
              {present}/{total}
            </span>
            <span className='text-sm text-muted-foreground'>{percentage}%</span>
          </div>
          <Progress value={percentage} className='h-2' />
          <div className='flex justify-center'>
            {getAttendanceBadge(percentage)}
          </div>
        </div>
      );
    },
    sortingFn: (rowA, rowB) => {
      const percentageA = rowA.original.attendance_percentage;
      const percentageB = rowB.original.attendance_percentage;
      return percentageA - percentageB;
    }
  },

  {
    accessorKey: 'marked_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Marked At' />
    ),
    cell: ({ row }) => {
      const markedAt = row.getValue('marked_at') as string;
      const markedBy = row.original.marked_by;
      return (
        <div>
          <div className='text-sm font-medium'>
            {format(new Date(markedAt), 'dd MMM, hh:mm a')}
          </div>
          <div className='text-xs text-muted-foreground'>by {markedBy}</div>
        </div>
      );
    }
  },
  {
    id: 'actions',
    cell: ({ row }) => <AttendanceReportRowActions report={row.original} />
  }
];
