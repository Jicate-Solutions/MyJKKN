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
      const periodId = row.original.period_id; // Get period_id for consistent navigation

      const handleCourseClick = () => {
        // Navigate to the attendance report details page with specific period_id
        // This ensures the details page shows the exact same data as the reports row
        const detailsUrl = `/academic/attendance/reports/${reportId}${
          periodId ? `?period_id=${encodeURIComponent(periodId)}` : ''
        }`;
        window.open(detailsUrl, '_blank');
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
      const markedBy = row.original.marked_by;

      // Updated: 2025-09-05 - Enhanced conflict detection and display consistency
      // Use assigned faculty if available, otherwise fall back to original logic
      const displayName =
        assignedFaculty ||
        (originalFacultyName && originalFacultyName !== 'Unknown Faculty'
          ? originalFacultyName
          : 'Unknown Faculty');

      // For table display: show primary faculty + staff count
      let primaryFacultyName = displayName;
      let additionalStaffCount = 0;
      let isMarkedByDifferent = false;

      if (assignedFacultyList && assignedFacultyList.length > 0) {
        // Find primary faculty or use first one
        const primaryFaculty =
          assignedFacultyList.find((f) => f.isPrimary) ||
          assignedFacultyList[0];
        primaryFacultyName = primaryFaculty.name;
        additionalStaffCount = assignedFacultyList.length - 1;

        // Check if marked_by is different from any assigned faculty
        const markedByName = (typeof markedBy === 'object' && markedBy !== null)
          ? ((markedBy as any).full_name || (markedBy as any).email || '').toUpperCase().trim()
          : (markedBy as string || '').toUpperCase().trim();

        isMarkedByDifferent = !assignedFacultyList.some(faculty => 
          (faculty.name || '').toUpperCase().trim() === markedByName
        );
      } else {
        // Fallback: compare with displayName
        const markedByName = (typeof markedBy === 'object' && markedBy !== null)
          ? ((markedBy as any).full_name || (markedBy as any).email || '').toUpperCase().trim()
          : (markedBy as string || '').toUpperCase().trim();
        
        isMarkedByDifferent = displayName.toUpperCase().trim() !== markedByName && markedByName !== '';
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
          {isMarkedByDifferent && (
            <Badge variant='outline' className='text-xs border-amber-300 text-amber-700 bg-amber-50'>
              ⚠️ Different marker
            </Badge>
          )}
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
      <DataTableColumnHeader column={column} title='Marked By' />
    ),
    cell: ({ row }) => {
      const markedAt = row.getValue('marked_at') as string;
      const markedBy = row.original.marked_by;
      const assignedFacultyList = row.original.assigned_faculty_list;
      const assignedFaculty = row.original.assigned_faculty;

      // Updated: 2025-09-05 - Enhanced marked by display with conflict detection
      const markedByName = (typeof markedBy === 'object' && markedBy !== null)
        ? ((markedBy as any).full_name || (markedBy as any).email || 'Unknown')
        : (markedBy as string || 'Unknown');

      // Check if marked by someone different from assigned faculty
      let isConflict = false;
      if (assignedFacultyList && assignedFacultyList.length > 0) {
        isConflict = !assignedFacultyList.some(faculty => 
          (faculty.name || '').toUpperCase().trim() === markedByName.toUpperCase().trim()
        );
      } else if (assignedFaculty) {
        isConflict = assignedFaculty.toUpperCase().trim() !== markedByName.toUpperCase().trim();
      }

      return (
        <div>
          <div className='text-sm font-medium'>
            {format(new Date(markedAt), 'dd MMM, hh:mm a')}
          </div>
          <div className={`text-xs ${isConflict ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
            by {markedByName}
            {isConflict && (
              <span className='ml-1 text-amber-500'>⚠️</span>
            )}
          </div>
        </div>
      );
    }
  },
  {
    id: 'actions',
    cell: ({ row }) => <AttendanceReportRowActions report={row.original} />
  }
];
