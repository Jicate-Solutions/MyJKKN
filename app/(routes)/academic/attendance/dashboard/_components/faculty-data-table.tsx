'use client';

import { DataTable } from '@/components/data-table/data-table';
import { facultyColumns, type FacultyAttendanceData } from './faculty-columns';
import { Button } from '@/components/ui/button';
import { Download, Mail, FileText, AlertCircle } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useFacultyAttendanceStats,
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

interface FacultyDataTableProps {
  filters: AnalyticsFilters;
  enabled: boolean;
}

export function FacultyDataTable({ filters, enabled }: FacultyDataTableProps) {
  const {
    canAccess,
    isSuperAdmin,
    userProfile,
    isLoading: permissionsLoading
  } = usePermissions();

  const [statusFilter, setStatusFilter] = useState<string>('all');

  const {
    data: facultyStats,
    isLoading: dataLoading,
    error
  } = useFacultyAttendanceStats(filters, enabled);

  const isReady = !permissionsLoading && !!userProfile && enabled;

  const canExportData =
    isSuperAdmin || canAccess('academic.attendance', 'export');
  const canSendReminders =
    isSuperAdmin || canAccess('academic.attendance', 'notify');
  const canGenerateReports =
    isSuperAdmin || canAccess('academic.attendance', 'report');

  const processedData = useMemo(() => {
    if (!facultyStats) return [];

    let filtered = [...facultyStats];

    if (statusFilter !== 'all') {
      filtered = filtered.filter((faculty) => {
        const percentage = faculty.attendance_percentage;
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
  }, [facultyStats, statusFilter]);

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
          await AttendanceAnalyticsService.getFacultyAttendanceStats(
            dateFilters
          );
        dataToProcess = newData || [];
      }

      const searchLower = params.search?.toLowerCase() || '';

      const filteredData = dataToProcess.filter((faculty) => {
        if (!searchLower) return true;
        return (
          faculty.staff_name.toLowerCase().includes(searchLower) ||
          faculty.staff_designation.toLowerCase().includes(searchLower)
        );
      });

      const sortedData = [...filteredData];
      if (params.sort_by) {
        sortedData.sort((a, b) => {
          const aValue = a[params.sort_by as keyof FacultyAttendanceData];
          const bValue = b[params.sort_by as keyof FacultyAttendanceData];

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
      console.error('Error fetching faculty attendance data:', error);
      throw error;
    }
  };

  const handleBulkReminder = async (
    selectedRows: FacultyAttendanceData[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;

    const lowPerformers = selectedRows.filter(
      (f) => f.attendance_percentage < 75
    );
    const message =
      lowPerformers.length > 0
        ? `Send reminder to ${selectedRows.length} faculty member(s)? ${lowPerformers.length} have attendance below 75%.`
        : `Send reminder to ${selectedRows.length} faculty member(s)?`;

    const confirmed = window.confirm(message);

    if (!confirmed) return;

    try {
      console.log('Sending reminders to:', selectedRows);
      resetSelection();
    } catch (error) {
      console.error('Error sending reminders:', error);
    }
  };

  const handleBulkReport = async (
    selectedRows: FacultyAttendanceData[],
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

        {/* Alert for low performers */}
        {props.selectedRows.length > 0 &&
          props.selectedRows.some(
            (row: FacultyAttendanceData) => row.attendance_percentage < 50
          ) && (
            <div className='flex items-center gap-1 text-amber-600 text-xs sm:text-sm'>
              <AlertCircle className='h-3 w-3 sm:h-4 sm:w-4' />
              <span className='hidden sm:inline'>
                Some faculty need immediate attention
              </span>
              <span className='sm:hidden'>Needs attention</span>
            </div>
          )}
      </div>

      {/* Second row - Bulk actions (only show if items selected) */}
      {props.selectedRows.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          {canSendReminders && (
            <Button
              onClick={() =>
                handleBulkReminder(
                  props.selectedRows as FacultyAttendanceData[],
                  props.resetSelection
                )
              }
              variant='outline'
              size='sm'
              className='h-8 flex-1 sm:flex-initial'
            >
              <Mail className='mr-1 h-4 w-4' />
              <span className='hidden sm:inline'>Send Reminder</span>
              <span className='sm:hidden'>Remind</span>
              <span className='ml-1'>({props.selectedRows.length})</span>
            </Button>
          )}

          {canGenerateReports && (
            <Button
              onClick={() =>
                handleBulkReport(
                  props.selectedRows as FacultyAttendanceData[],
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
        <p>Error loading faculty data. Please try again.</p>
      </div>
    );
  }

  // Don't show empty state if filters are being used, let DataTable handle it
  if (!facultyStats || facultyStats.length === 0) {
    // Only show empty state if there's no data at all (not due to filtering)
    if (!statusFilter || statusFilter === 'all') {
      return (
        <div className='flex items-center justify-center h-64 text-muted-foreground'>
          <p>No faculty attendance data found for the selected filters.</p>
        </div>
      );
    }
  }

  return (
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => facultyColumns as any}
      exportConfig={{
        entityName: 'faculty_attendance',
        columnMapping: {
          staff_name: 'Faculty Name',
          staff_designation: 'Designation',
          total_periods: 'Total Periods',
          attendance_taken: 'Taken',
          attendance_not_taken: 'Not Taken',
          attendance_percentage: 'Completion %'
        },
        columnWidths: [
          { wch: 25 }, // Faculty Name
          { wch: 20 }, // Designation
          { wch: 15 }, // Total Periods
          { wch: 10 }, // Taken
          { wch: 10 }, // Not Taken
          { wch: 15 } // Completion %
        ],
        headers: [
          'Faculty Name',
          'Designation',
          'Total Periods',
          'Taken',
          'Not Taken',
          'Completion %'
        ]
      }}
      idField='staff_id'
      config={{
        enableUrlState: true,
        enableDateFilter: true,
        enableExport: false,
        enableRowSelection: true,
        enableSearch: true,
        enableColumnFilters: true,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        columnResizingTableId: 'faculty-attendance-table'
      }}
      renderToolbarContent={renderCustomToolbar}
    />
  );
}
