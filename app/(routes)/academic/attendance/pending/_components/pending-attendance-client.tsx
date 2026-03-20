'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Bell } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  type DataFetchParams,
  type DataFetchResult,
} from '@/components/data-table/data-table';
import { createColumns } from '@/app/(routes)/academic/attendance/dashboard/_components/pending-attendance-columns';
import { AttendanceDashboardService } from '@/lib/services/academic/attendance-dashboard-service';
import { usePendingAttendanceDateRange } from '@/hooks/academic/use-pending-attendance-date-range';
import { useTimetablesForPending } from '@/hooks/academic/use-timetables-for-pending';
import { PendingStatsCards } from './pending-stats-cards';
import { PendingDateRangeWarningBanner } from './pending-date-range-warning-banner';
import { PendingDateRangeFilters } from './pending-date-range-filters';
import type { PendingAttendancePeriod, DashboardFilters } from '@/types/attendance-dashboard';

// ─── Props ─────────────────────────────────────────────────────────────────────

interface PendingAttendanceClientProps {
  isSuperAdmin: boolean;
  isHOD: boolean;
  isFaculty: boolean;
  userInstitutionId?: string;
  userDepartmentId?: string;
  userDepartmentName?: string;
  staffId?: string;
  canViewAllInstitutions: boolean;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function PendingAttendanceClient({
  isSuperAdmin,
  isHOD,
  isFaculty,
  userInstitutionId,
  userDepartmentId,
  userDepartmentName,
  staffId,
  canViewAllInstitutions,
}: PendingAttendanceClientProps) {
  const router = useRouter();

  // Main data + filter hook
  const {
    metadata,
    isLoading,
    error,
    filters,
    updateFilters,
    resetFilters,
    effectiveInstitutionId,
  } = usePendingAttendanceDateRange();

  // Timetable options for filter dropdown
  const { timetables } = useTimetablesForPending({
    institutionId: effectiveInstitutionId,
    academicYearId: filters.academicYearId,
    departmentId: filters.departmentId,
    semesterId: filters.semesterId,
    isFaculty,
    staffId,
  });

  // ─── fetchDataFn ─────────────────────────────────────────────────────────────

  // NOTE: This fetchData callback calls the same service as usePendingAttendanceDateRange.
  // The hook drives the stats metadata cards; the DataTable drives paginated rows separately.
  // This is a conscious trade-off matching the dashboard pattern — two fetches are intentional.
  const fetchData = useCallback(
    async (params: DataFetchParams): Promise<DataFetchResult<PendingAttendancePeriod>> => {
      const serviceFilters: DashboardFilters = {
        userInstitutionId: isSuperAdmin
          ? filters.institutionId
          : userInstitutionId,
        page: params.page,
        limit: params.limit,
        sortBy: params.sort_by || 'attendance_date',
        sortDirection: (params.sort_order as 'asc' | 'desc') || 'desc',
        search: params.search || '',
        startDate: filters.startDate,
        endDate: filters.endDate,
        institutionId: filters.institutionId,
        academicYearId: filters.academicYearId,
        degreeId: filters.degreeId,
        departmentId: filters.departmentId,
        programId: filters.programId,
        semesterId: filters.semesterId,
        sectionId: filters.sectionId,
        timetableId: filters.timetableId,
        staffId: filters.staffId,
      };

      const result =
        await AttendanceDashboardService.getTodayPendingAttendance(
          serviceFilters
        );

      return {
        success: true,
        data: result.data || [],
        pagination: {
          page: result.metadata.page,
          limit: result.metadata.limit,
          total_pages: result.metadata.totalPages,
          total_items: result.metadata.total,
        },
      };
    },
    [filters, isSuperAdmin, userInstitutionId]
  );

  // ─── Action handlers ──────────────────────────────────────────────────────────

  const handleMarkAttendance = useCallback(
    (period: PendingAttendancePeriod) => {
      const params = new URLSearchParams({
        periodId: period.period_id,
        timetableId: period.timetable_id,
        date: period.attendance_date,
        ...(period.section_id && { sectionId: period.section_id }),
        ...(period.course_id && { courseId: period.course_id }),
      });
      router.push(`/academic/attendance/mark?${params.toString()}`);
    },
    [router]
  );

  const handleSendReminder = useCallback(
    (_period: PendingAttendancePeriod) => {
      toast.error('Reminder feature coming soon');
    },
    []
  );

  const handleBulkSendReminder = useCallback(
    (_selectedRows: PendingAttendancePeriod[]) => {
      toast.error('Reminder feature coming soon');
    },
    []
  );

  // ─── Columns ──────────────────────────────────────────────────────────────────

  // Stable getter passed to DataTable — avoids re-creating column defs on every render.
  // useCallback (not useMemo) is correct here: DataTable expects a function, not a value.
  const getColumns = useCallback(
    () =>
      createColumns(
        canViewAllInstitutions,
        handleSendReminder,
        handleMarkAttendance
      ),
    [canViewAllInstitutions, handleSendReminder, handleMarkAttendance]
  );

  // ─── Bulk toolbar ─────────────────────────────────────────────────────────────

  const renderBulkToolbar = useCallback(
    (props: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      selectedRows: any[];
      allSelectedIds: (string | number)[];
      totalSelectedCount: number;
      resetSelection: () => void;
    }) => {
      const typedRows = props.selectedRows as PendingAttendancePeriod[];
      if (isFaculty || typedRows.length === 0) return null;
      return (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              handleBulkSendReminder(typedRows);
              props.resetSelection();
            }}
          >
            <Bell className="h-4 w-4" />
            Send Reminders ({typedRows.length})
          </Button>
        </div>
      );
    },
    [isFaculty, handleBulkSendReminder]
  );

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <PendingStatsCards
        metadata={metadata}
        isLoading={isLoading}
        isFaculty={isFaculty}
        startDate={filters.startDate}
        endDate={filters.endDate}
      />

      {/* Error state */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load pending attendance</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {/* Date range warning */}
      {filters.startDate && filters.endDate && (
        <PendingDateRangeWarningBanner
          startDate={filters.startDate}
          endDate={filters.endDate}
        />
      )}

      {/* Filters */}
      <PendingDateRangeFilters
        filters={filters}
        onFiltersChange={updateFilters}
        onReset={resetFilters}
        isSuperAdmin={isSuperAdmin}
        isHOD={isHOD}
        isFaculty={isFaculty}
        userInstitutionId={userInstitutionId}
        userDepartmentId={userDepartmentId}
        userDepartmentName={userDepartmentName}
        timetables={timetables}
      />

      {/* Data Table */}
      <DataTable
        key={JSON.stringify(filters)}
        fetchDataFn={fetchData}
        getColumns={getColumns}
        idField="period_id"
        config={{
          enableColumnResizing: false,
          enableUrlState: false,
          enableDateFilter: false,
          enableExport: true,
          enableRowSelection: true,
          enableSearch: true,
          enableColumnFilters: false,
          enableColumnVisibility: true,
          columnResizingTableId: 'pending-attendance-page-table',
        }}
        exportConfig={{
          entityName: 'pending-attendance-periods',
          columnMapping: {
            attendance_date: 'Date',
            period_name: 'Period',
            course_name: 'Course',
            institution_name: 'Institution',
            degree_name: 'Degree',
            department_name: 'Department',
            program_name: 'Program',
            semester_name: 'Semester',
            section_name: 'Section',
            academic_year_name: 'Academic Year',
            primary_staff_name: 'Primary Staff',
          },
          columnWidths: [
            { wch: 15 },
            { wch: 15 },
            { wch: 20 },
            { wch: 15 },
            { wch: 15 },
            { wch: 20 },
            { wch: 20 },
            { wch: 15 },
            { wch: 12 },
            { wch: 15 },
            { wch: 20 },
          ],
          headers: [
            'Date',
            'Period',
            'Course',
            'Institution',
            'Degree',
            'Department',
            'Program',
            'Semester',
            'Section',
            'Academic Year',
            'Primary Staff',
          ],
        }}
        renderToolbarContent={renderBulkToolbar}
      />
    </div>
  );
}
