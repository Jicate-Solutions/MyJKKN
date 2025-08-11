'use client';

import { DataTable } from '@/components/data-table/data-table';
import { courseColumns, type CourseAttendanceData } from './course-columns';
import { Button } from '@/components/ui/button';
import { Download, FileText, TrendingUp, AlertCircle } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCourseAttendanceStats,
  type AnalyticsFilters
} from '@/hooks/academic/use-attendance-analytics';
import { AttendanceAnalyticsService } from '@/lib/services/academic/attendance-analytics-service';
import { useMemo, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface CourseDataTableProps {
  filters: AnalyticsFilters;
  enabled: boolean;
}

export function CourseDataTable({ filters, enabled }: CourseDataTableProps) {
  const {
    canAccess,
    isSuperAdmin,
    userProfile,
    isLoading: permissionsLoading
  } = usePermissions();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [attendanceFilter, setAttendanceFilter] = useState<string>('all');

  const {
    data: courseStats,
    isLoading: dataLoading,
    error
  } = useCourseAttendanceStats(filters, enabled);

  const isReady = !permissionsLoading && !!userProfile && enabled;

  const canExportData =
    isSuperAdmin || canAccess('academic.attendance', 'export');
  const canGenerateReports =
    isSuperAdmin || canAccess('academic.attendance', 'report');

  const processedData = useMemo(() => {
    if (!courseStats) return [];

    let filtered = [...courseStats];

    if (statusFilter !== 'all') {
      filtered = filtered.filter((course) => {
        const percentage = course.attendance_percentage;
        switch (statusFilter) {
          case 'excellent':
            return percentage >= 90;
          case 'good':
            return percentage >= 75 && percentage < 90;
          case 'average':
            return percentage >= 50 && percentage < 75;
          case 'poor':
            return percentage < 50;
          default:
            return true;
        }
      });
    }

    if (attendanceFilter !== 'all') {
      filtered = filtered.filter((course) => {
        const avgAttendance = course.avg_student_attendance;
        switch (attendanceFilter) {
          case 'high':
            return avgAttendance >= 80;
          case 'medium':
            return avgAttendance >= 60 && avgAttendance < 80;
          case 'low':
            return avgAttendance < 60;
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [courseStats, statusFilter, attendanceFilter]);

  const fetchData = async (params: {
    page: number;
    limit: number;
    search: string;
    from_date: string;
    to_date: string;
    sort_by: string;
    sort_order: string;
  }) => {
    try {
      // If date filters are provided, refetch data with new date range
      let dataToProcess = processedData;

      if (params.from_date && params.to_date) {
        const dateFilters = {
          ...filters,
          start_date: params.from_date,
          end_date: params.to_date
        };

        // Refetch data with new date range
        const newData =
          await AttendanceAnalyticsService.getCourseAttendanceStats(
            dateFilters
          );
        dataToProcess = newData || [];
      }

      const searchLower = params.search?.toLowerCase() || '';

      const filteredData = dataToProcess.filter((course) => {
        if (!searchLower) return true;
        return (
          course.course_name.toLowerCase().includes(searchLower) ||
          course.course_code.toLowerCase().includes(searchLower)
        );
      });

      const sortedData = [...filteredData];
      if (params.sort_by) {
        sortedData.sort((a, b) => {
          const aValue = a[params.sort_by as keyof CourseAttendanceData];
          const bValue = b[params.sort_by as keyof CourseAttendanceData];

          if (typeof aValue === 'number' && typeof bValue === 'number') {
            return params.sort_order === 'asc'
              ? aValue - bValue
              : bValue - aValue;
          }

          const aStr = String(aValue || '');
          const bStr = String(bValue || '');
          return params.sort_order === 'asc'
            ? aStr.localeCompare(bStr)
            : bStr.localeCompare(aStr);
        });
      }

      const startIndex = (params.page - 1) * params.limit;
      const endIndex = startIndex + params.limit;
      const paginatedData = sortedData.slice(startIndex, endIndex);

      return {
        success: true,
        data: paginatedData,
        pagination: {
          page: params.page,
          limit: params.limit,
          total_pages: Math.ceil(sortedData.length / params.limit),
          total_items: sortedData.length
        }
      };
    } catch (error) {
      console.error('Error fetching course attendance data:', error);
      throw error;
    }
  };

  const handleBulkReport = async (
    selectedRows: CourseAttendanceData[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;

    try {
      console.log('Generating reports for:', selectedRows);
      resetSelection();
    } catch (error) {
      console.error('Error generating reports:', error);
    }
  };

  const calculateSummaryStats = useMemo(() => {
    if (!processedData || processedData.length === 0) {
      return { avgCompletion: 0, avgStudentAttendance: 0, criticalCourses: 0 };
    }

    const avgCompletion = Math.round(
      processedData.reduce((acc, c) => acc + c.attendance_percentage, 0) /
        processedData.length
    );
    const avgStudentAttendance = Math.round(
      processedData.reduce((acc, c) => acc + c.avg_student_attendance, 0) /
        processedData.length
    );
    const criticalCourses = processedData.filter(
      (c) => c.avg_student_attendance < 60
    ).length;

    return { avgCompletion, avgStudentAttendance, criticalCourses };
  }, [processedData]);

  const renderCustomToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className='w-full space-y-2'>
      {/* First row - Filters */}
      <div className='flex flex-col sm:flex-row gap-2'>
        <div className='flex items-center gap-2 flex-1'>
          <span className='text-sm text-muted-foreground hidden sm:inline'>
            Completion:
          </span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className='h-8 w-full sm:w-32'>
              <SelectValue placeholder='All Status' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All</SelectItem>
              <SelectItem value='excellent'>
                <Badge className='bg-green-100 text-green-800'>90-100%</Badge>
              </SelectItem>
              <SelectItem value='good'>
                <Badge className='bg-yellow-100 text-yellow-800'>75-89%</Badge>
              </SelectItem>
              <SelectItem value='average'>
                <Badge className='bg-orange-100 text-orange-800'>50-74%</Badge>
              </SelectItem>
              <SelectItem value='poor'>
                <Badge className='bg-red-100 text-red-800'>0-49%</Badge>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className='flex items-center gap-2 flex-1'>
          <span className='text-sm text-muted-foreground hidden sm:inline'>
            Student Avg:
          </span>
          <Select value={attendanceFilter} onValueChange={setAttendanceFilter}>
            <SelectTrigger className='h-8 w-full sm:w-32'>
              <SelectValue placeholder='All Levels' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All</SelectItem>
              <SelectItem value='high'>
                <Badge className='bg-green-100 text-green-800'>
                  High (80%+)
                </Badge>
              </SelectItem>
              <SelectItem value='medium'>
                <Badge className='bg-yellow-100 text-yellow-800'>
                  Medium (60-79%)
                </Badge>
              </SelectItem>
              <SelectItem value='low'>
                <Badge className='bg-red-100 text-red-800'>Low (&lt;60%)</Badge>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Second row - Bulk actions (only show if items selected) */}
      {props.selectedRows.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          {canGenerateReports && (
            <Button
              onClick={() =>
                handleBulkReport(
                  props.selectedRows as CourseAttendanceData[],
                  props.resetSelection
                )
              }
              variant='outline'
              size='sm'
              className='h-8 flex-1 sm:flex-initial'
            >
              <FileText className='mr-1 h-4 w-4' />
              <span className='hidden sm:inline'>Generate Report</span>
              <span className='sm:hidden'>Report</span>
              <span className='ml-1'>({props.selectedRows.length})</span>
            </Button>
          )}

          {canExportData && (
            <Button
              variant='outline'
              size='sm'
              className='h-8 flex-1 sm:flex-initial'
            >
              <Download className='mr-1 h-4 w-4' />
              <span className='hidden sm:inline'>Export Selected</span>
              <span className='sm:hidden'>Export</span>
              <span className='ml-1'>({props.selectedRows.length})</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );

  if (!enabled) {
    return null;
  }

  if (!isReady || dataLoading) {
    return (
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <Skeleton className='h-8 w-40' />
          <Skeleton className='h-8 w-32' />
        </div>
        <div className='space-y-3'>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className='h-12 w-full' />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex items-center justify-center h-64 text-muted-foreground'>
        <p>Error loading course data. Please try again.</p>
      </div>
    );
  }

  // Don't show empty state if filters are being used, let DataTable handle it
  if (!courseStats || courseStats.length === 0) {
    // Only show empty state if there's no data at all (not due to filtering)
    if (
      !statusFilter ||
      (statusFilter === 'all' &&
        (!attendanceFilter || attendanceFilter === 'all'))
    ) {
      return (
        <div className='flex items-center justify-center h-64 text-muted-foreground'>
          <p>No course attendance data found for the selected filters.</p>
        </div>
      );
    }
  }

  return (
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => courseColumns as any}
      exportConfig={{
        entityName: 'course_attendance',
        columnMapping: {
          course_code: 'Course Code',
          course_name: 'Course Name',
          total_periods: 'Total Periods',
          attendance_taken: 'Taken',
          attendance_not_taken: 'Not Taken',
          attendance_percentage: 'Completion %',
          avg_student_attendance: 'Avg Student %'
        },
        columnWidths: [
          { wch: 15 }, // Course Code
          { wch: 30 }, // Course Name
          { wch: 15 }, // Total Periods
          { wch: 10 }, // Taken
          { wch: 10 }, // Not Taken
          { wch: 15 }, // Completion %
          { wch: 15 } // Avg Student %
        ],
        headers: [
          'Course Code',
          'Course Name',
          'Total Periods',
          'Taken',
          'Not Taken',
          'Completion %',
          'Avg Student %'
        ]
      }}
      idField='course_id'
      config={{
        enableUrlState: true,
        enableDateFilter: true,
        enableExport: false,
        enableRowSelection: true,
        enableSearch: true,
        enableColumnFilters: true,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        columnResizingTableId: 'course-attendance-table'
      }}
      renderToolbarContent={renderCustomToolbar}
    />
  );
}
