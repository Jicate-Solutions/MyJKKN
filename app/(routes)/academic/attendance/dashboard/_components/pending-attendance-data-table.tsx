'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ColumnDef, SortingState, OnChangeFn } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Bell, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePendingAttendance } from '@/hooks/academic/use-attendance-dashboard';
import { PendingAttendanceFilters } from './pending-attendance-filters';
import { createColumns } from './pending-attendance-columns';
import type {
  PendingAttendancePeriod,
  DashboardFilters
} from '@/types/attendance-dashboard';
import { SimpleDataTable } from './simple-data-table';

interface PendingAttendanceDataTableProps {
  userInstitutionId?: string;
  canViewAllInstitutions: boolean;
}

export function PendingAttendanceDataTable({
  userInstitutionId,
  canViewAllInstitutions
}: PendingAttendanceDataTableProps) {
  const router = useRouter();

  // State for filters and pagination
  const [filters, setFilters] = useState<
    Omit<DashboardFilters, 'userInstitutionId'>
  >({
    page: 1,
    limit: 10,
    sortBy: 'period_name',
    sortDirection: 'asc',
    search: '',
    departmentId: undefined,
    semesterId: undefined,
    sectionId: undefined
  });

  const [sorting, setSorting] = useState<SortingState>([
    {
      id: 'period_name',
      desc: false
    }
  ]);

  // Fetch pending attendance data
  const { pendingPeriods, metadata, isLoading, error, refetch } =
    usePendingAttendance({
      userInstitutionId,
      ...filters
    });

  // Handle sorting changes
  const handleSortingChange = useCallback<OnChangeFn<SortingState>>((updaterOrValue) => {
    const newSorting = typeof updaterOrValue === 'function' 
      ? updaterOrValue(sorting) 
      : updaterOrValue;
    
    setSorting(newSorting);

    if (newSorting.length > 0) {
      const sort = newSorting[0];
      setFilters((prev) => ({
        ...prev,
        sortBy: sort.id,
        sortDirection: sort.desc ? 'desc' : 'asc',
        page: 1 // Reset to first page
      }));
    }
  }, [sorting]);

  // Handle page changes
  const handlePageChange = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  // Handle filters change
  const handleFiltersChange = useCallback((newFilters: any) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
      page: 1 // Reset to first page when filters change
    }));
  }, []);

  // Reset all filters
  const resetFilters = useCallback(() => {
    setFilters({
      page: 1,
      limit: 10,
      sortBy: 'period_name',
      sortDirection: 'asc',
      search: '',
      departmentId: undefined,
      semesterId: undefined,
      sectionId: undefined
    });
    setSorting([{ id: 'period_name', desc: false }]);
  }, []);

  // Handle sending reminder
  const handleSendReminder = useCallback((period: PendingAttendancePeriod) => {
    // TODO: Implement reminder functionality
    toast.success(
      `Reminder sent for ${period.period_name} - ${period.course_name}`
    );
  }, []);

  // Handle mark attendance navigation
  const handleMarkAttendance = useCallback(
    (period: PendingAttendancePeriod) => {
      try {
        // Navigate to attendance marking page with pre-filled data
        const params = new URLSearchParams({
          timetableId: period.timetable_id,
          sectionId: period.section_id,
          periodId: period.period_id,
          date: new Date().toISOString().split('T')[0],
          periodName: period.period_name,
          courseName: period.course_name,
          startTime: period.start_time,
          endTime: period.end_time
        });

        router.push(`/academic/attendance/mark?${params.toString()}`);
        toast.success(
          `Navigating to mark attendance for ${period.period_name}`
        );
      } catch (error) {
        console.error('Error navigating to mark attendance:', error);
        toast.error('Failed to navigate to attendance marking page');
      }
    },
    [router]
  );

  // Create columns with action handlers
  const columns: ColumnDef<PendingAttendancePeriod>[] = createColumns(
    canViewAllInstitutions,
    handleSendReminder,
    handleMarkAttendance
  );

  // Show error state
  if (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Failed to load pending attendance data';

    return (
      <Alert variant='destructive'>
        <AlertCircle className='h-4 w-4' />
        <AlertDescription>
          <div className='flex items-center justify-between'>
            <div>
              <p className='font-medium'>
                Failed to load pending attendance data
              </p>
              {errorMessage !== 'Failed to load pending attendance data' && (
                <p className='text-sm mt-1 opacity-90'>{errorMessage}</p>
              )}
            </div>
            <Button variant='outline' size='sm' onClick={() => refetch()}>
              <RefreshCw className='h-4 w-4 mr-2' />
              Retry
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className='space-y-4'>
      {/* Filters */}
      <PendingAttendanceFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onReset={resetFilters}
      />

      {/* Summary Info */}
      <div className='flex items-center justify-between'>
        <div className='text-sm text-muted-foreground'>
          {isLoading
            ? 'Loading pending periods...'
            : metadata.total === 0
            ? '🎉 Great! No pending attendance periods for today'
            : `${metadata.total} pending period${
                metadata.total !== 1 ? 's' : ''
              } found`}
        </div>

        {metadata.total > 0 && (
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => refetch()}
              disabled={isLoading}
              className='gap-2'
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
              />
              Refresh
            </Button>

            {/* TODO: Bulk actions */}
            <Button
              variant='outline'
              size='sm'
              disabled={metadata.total === 0}
              className='gap-2'
              onClick={() => toast.info('Bulk reminder feature coming soon!')}
            >
              <Bell className='h-4 w-4' />
              Send All Reminders
            </Button>
          </div>
        )}
      </div>

      {/* Data Table */}
      <SimpleDataTable
        columns={columns}
        data={pendingPeriods}
        sorting={sorting}
        onSortingChange={handleSortingChange}
        loading={isLoading}
        pagination={{
          page: metadata.page,
          pageSize: metadata.limit,
          totalCount: metadata.total,
          totalPages: metadata.totalPages,
          onPageChange: handlePageChange
        }}
        emptyState={{
          title: 'No pending periods',
          description: 'All scheduled periods for today have been marked! 🎉',
          icon: 'calendar-check'
        }}
      />
    </div>
  );
}
