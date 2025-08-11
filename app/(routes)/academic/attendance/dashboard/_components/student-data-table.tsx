'use client';

import { DataTable } from '@/components/data-table/data-table';
import { studentColumns, type StudentAttendanceData } from './student-columns';
import { Button } from '@/components/ui/button';
import { Download, Filter, Mail, FileText } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useStudentAttendanceStats,
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

interface StudentDataTableProps {
  filters: AnalyticsFilters;
  enabled: boolean;
}

export function StudentDataTable({ filters, enabled }: StudentDataTableProps) {
  const {
    canAccess,
    isSuperAdmin,
    userProfile,
    isLoading: permissionsLoading
  } = usePermissions();

  const [statusFilter, setStatusFilter] = useState<string>('all');

  const {
    data: studentStats,
    isLoading: dataLoading,
    error
  } = useStudentAttendanceStats(filters, enabled);

  const isReady = !permissionsLoading && !!userProfile && enabled;

  const canExportData =
    isSuperAdmin || canAccess('academic.attendance', 'export');
  const canSendNotifications =
    isSuperAdmin || canAccess('academic.attendance', 'notify');
  const canGenerateReports =
    isSuperAdmin || canAccess('academic.attendance', 'report');

  const processedData = useMemo(() => {
    if (!studentStats) return [];

    let filtered = [...studentStats];

    if (statusFilter !== 'all') {
      filtered = filtered.filter((student) => {
        const percentage = student.attendance_percentage;
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

    return filtered;
  }, [studentStats, statusFilter]);

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
          await AttendanceAnalyticsService.getStudentAttendanceStats(
            dateFilters
          );
        dataToProcess = newData || [];
      }

      const searchLower = params.search?.toLowerCase() || '';

      const filteredData = dataToProcess.filter((student) => {
        if (!searchLower) return true;
        return (
          student.student_name.toLowerCase().includes(searchLower) ||
          student.student_roll_number.toLowerCase().includes(searchLower)
        );
      });

      const sortedData = [...filteredData];
      if (params.sort_by) {
        sortedData.sort((a, b) => {
          const aValue = a[params.sort_by as keyof StudentAttendanceData];
          const bValue = b[params.sort_by as keyof StudentAttendanceData];

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
      console.error('Error fetching student attendance data:', error);
      throw error;
    }
  };

  const handleBulkNotification = async (
    selectedRows: StudentAttendanceData[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;

    const confirmed = window.confirm(
      `Send attendance notification to ${selectedRows.length} student${
        selectedRows.length > 1 ? 's' : ''
      }?`
    );

    if (!confirmed) return;

    try {
      console.log('Sending notifications to:', selectedRows);
      resetSelection();
    } catch (error) {
      console.error('Error sending notifications:', error);
    }
  };

  const handleBulkReport = async (
    selectedRows: StudentAttendanceData[],
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
            Status:
          </span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className='h-8 w-full sm:w-32'>
              <SelectValue placeholder='All Status' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All</SelectItem>
              <SelectItem value='excellent'>
                <Badge className='bg-green-100 text-green-800'>Excellent</Badge>
              </SelectItem>
              <SelectItem value='good'>
                <Badge className='bg-yellow-100 text-yellow-800'>Good</Badge>
              </SelectItem>
              <SelectItem value='average'>
                <Badge className='bg-orange-100 text-orange-800'>Average</Badge>
              </SelectItem>
              <SelectItem value='poor'>
                <Badge className='bg-red-100 text-red-800'>Poor</Badge>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Second row - Bulk actions (only show if items selected) */}
      {props.selectedRows.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          {canSendNotifications && (
            <Button
              onClick={() =>
                handleBulkNotification(
                  props.selectedRows as StudentAttendanceData[],
                  props.resetSelection
                )
              }
              variant='outline'
              size='sm'
              className='h-8 flex-1 sm:flex-initial'
            >
              <Mail className='mr-1 h-4 w-4' />
              <span className='hidden sm:inline'>Send Notification</span>
              <span className='sm:hidden'>Notify</span>
              <span className='ml-1'>({props.selectedRows.length})</span>
            </Button>
          )}

          {canGenerateReports && (
            <Button
              onClick={() =>
                handleBulkReport(
                  props.selectedRows as StudentAttendanceData[],
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
        <p>Error loading student data. Please try again.</p>
      </div>
    );
  }

  // Don't show empty state if filters are being used, let DataTable handle it
  if (!studentStats || studentStats.length === 0) {
    // Only show empty state if there's no data at all (not due to filtering)
    if (!statusFilter || statusFilter === 'all') {
      return (
        <div className='flex items-center justify-center h-64 text-muted-foreground'>
          <p>No student attendance data found for the selected filters.</p>
        </div>
      );
    }
  }

  return (
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => studentColumns as any}
      exportConfig={{
        entityName: 'student_attendance',
        columnMapping: {
          student_name: 'Student Name',
          student_roll_number: 'Roll Number',
          total_periods: 'Total Periods',
          present_periods: 'Present',
          absent_periods: 'Absent',
          attendance_percentage: 'Attendance %'
        },
        columnWidths: [
          { wch: 25 }, // Student Name
          { wch: 15 }, // Roll Number
          { wch: 15 }, // Total Periods
          { wch: 10 }, // Present
          { wch: 10 }, // Absent
          { wch: 15 } // Attendance %
        ],
        headers: [
          'Student Name',
          'Roll Number',
          'Total Periods',
          'Present',
          'Absent',
          'Attendance %'
        ]
      }}
      idField='student_id'
      config={{
        enableUrlState: true,
        enableDateFilter: true,
        enableExport: false,
        enableRowSelection: true,
        enableSearch: true,
        enableColumnFilters: true,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        columnResizingTableId: 'student-attendance-table'
      }}
      renderToolbarContent={renderCustomToolbar}
    />
  );
}
