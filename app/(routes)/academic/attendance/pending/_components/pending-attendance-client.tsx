'use client';

import { useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { AttendanceEscalationService } from '@/lib/services/academic/attendance-escalation-service';
import { usePendingAttendanceDateRange } from '@/hooks/academic/use-pending-attendance-date-range';
import { useTimetablesForPending } from '@/hooks/academic/use-timetables-for-pending';
import { PENDING_ATTENDANCE_EXPORT_CONFIG } from './pending-attendance-export-config';
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
  isHOD,
  isFaculty,
  userInstitutionId,
  userDepartmentId,
  userDepartmentName,
  staffId,
  canViewAllInstitutions,
}: PendingAttendanceClientProps) {
  const router = useRouter();

  // Main data + filter hook.
  // The hook owns filter state (filters/updateFilters/resetFilters) and the
  // dropdown's effectiveInstitutionId. We do NOT use the hook's own metadata for
  // the stats cards: the hook (in hooks/academic/, out of this package's scope)
  // gates institution scope on isSuperAdmin only, which would silently collapse a
  // scope='all' view_all_institutions role (e.g. 'eao') back to its own
  // institution — the BUG-004284 root cause PR #1618 fixed on the dashboard. So
  // the cards are driven by the canViewAllInstitutions-aware client-local query
  // below, keeping this fix inside app/(routes)/academic/attendance/pending/**.
  const {
    filters,
    updateFilters,
    resetFilters,
    effectiveInstitutionId,
  } = usePendingAttendanceDateRange();

  // ─── Stats-cards metadata (canViewAllInstitutions-aware) ─────────────────────
  // Mirrors the DataTable fetch's scope decision exactly: an all-institutions
  // viewer with no college selected passes userInstitutionId === undefined → the
  // service omits the institution filter and the cards reflect a COMBINED total
  // across the colleges the role may read (student_attendance RLS, migration
  // 20260624164500, scopes the rows). A scope='own' role (canViewAllInstitutions
  // === false) stays pinned to userInstitutionId and is never over-granted.
  const cardsFilters: DashboardFilters = {
    userInstitutionId: canViewAllInstitutions
      ? filters.institutionId
      : userInstitutionId,
    // page/limit are irrelevant to the metadata counts (computed over the full
    // matched set before pagination), but kept consistent with the hook defaults.
    page: 1,
    limit: filters.limit ?? 10,
    sortBy: filters.sortBy ?? 'attendance_date',
    sortDirection: filters.sortDirection ?? 'desc',
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
    staffId: isFaculty && staffId ? staffId : filters.staffId,
  };

  // Enabled when the viewer may span all colleges (no institution required) OR an
  // institution is resolvable — matching the hook's own enabled logic, just with
  // the permission-aware gate instead of isSuperAdmin.
  const cardsEnabled =
    canViewAllInstitutions || !!cardsFilters.userInstitutionId;

  const {
    data: cardsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['pending-attendance-cards', cardsFilters, canViewAllInstitutions],
    queryFn: () =>
      AttendanceDashboardService.getTodayPendingAttendance(cardsFilters),
    enabled: cardsEnabled,
    refetchInterval: 5 * 60 * 1000, // backlog view — matches the hook's cadence
  });

  const metadata = cardsData?.metadata ?? {
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
    overdueCount: 0,
    todayCount: 0,
    sectionsCount: 0,
    subjectsCount: 0,
    staffCount: 0,
  };

  // Auto-apply faculty's staffId so faculty only see their own pending periods.
  // isFaculty and staffId are stable server-derived props, so [] is intentional.
  useEffect(() => {
    if (isFaculty && staffId) {
      updateFilters({ staffId });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // NOTE: This fetchData callback calls the same service as the cards query above.
  // The cards query (canViewAllInstitutions-aware) drives the stats metadata cards;
  // this DataTable callback drives the paginated rows separately. Both apply the
  // identical scope decision, so the cards and the table always agree on which
  // colleges are in view. This is a conscious trade-off matching the dashboard
  // pattern — two fetches are intentional.
  const fetchData = useCallback(
    async (params: DataFetchParams): Promise<DataFetchResult<PendingAttendancePeriod>> => {
      const serviceFilters: DashboardFilters = {
        // BUG-004284 (mirrors PR #1618): an all-institutions viewer (super_admin
        // OR a scope='all' view_all_institutions role) with no college selected
        // passes filters.institutionId === undefined → the service omits the
        // institution filter and spans all colleges (student_attendance RLS scopes
        // the rows). A scope='own' role has canViewAllInstitutions === false, so it
        // stays pinned to userInstitutionId and is NEVER over-granted.
        userInstitutionId: canViewAllInstitutions
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
        staffId: isFaculty && staffId ? staffId : filters.staffId,
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
    [filters, canViewAllInstitutions, userInstitutionId, isFaculty, staffId]
  );

  // ─── Action handlers ──────────────────────────────────────────────────────────

  const handleMarkAttendance = useCallback(
    (period: PendingAttendancePeriod) => {
      const params = new URLSearchParams({
        timetableId: period.timetable_id,
        periodId: period.period_id,
        date: period.attendance_date,
        ...(period.section_id && { sectionId: period.section_id }),
        // Display strings — mark page reads these directly, it does not do DB lookups
        ...(period.period_name && { periodName: period.period_name }),
        ...(period.course_name && { courseName: period.course_name }),
        ...(period.start_time && { startTime: period.start_time }),
        ...(period.end_time && { endTime: period.end_time }),
      });
      router.push(`/academic/attendance/mark?${params.toString()}`);
    },
    [router]
  );

  // Escalate unmarked day-wise (session) attendance to the institution's
  // Principal & Director as an in-app notification. Period-wise periods have no
  // session escalation (yet) and report nothing to notify.
  const escalateForPeriods = useCallback(
    async (periods: PendingAttendancePeriod[]) => {
      // One escalation pass per unique (institution, date); the service handles
      // grouping and recipient lookup internally.
      const seen = new Set<string>();
      const targets = periods
        .map((p) => ({
          institutionId: p.institution_id,
          date: p.attendance_date,
        }))
        .filter((t) => {
          if (!t.institutionId) return false;
          const key = `${t.institutionId}_${t.date}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      if (targets.length === 0) {
        toast.error('No institution found for the selected pending attendance.');
        return;
      }

      try {
        const results = await Promise.all(
          targets.map((t) =>
            AttendanceEscalationService.escalatePendingSessions({
              institutionId: t.institutionId,
              date: t.date,
              ignoreCutoff: true, // manual reminder — do not wait for cutoff
            })
          )
        );
        const notified = results.reduce((sum, r) => sum + r.notified, 0);
        const sessions = results.reduce(
          (sum, r) => sum + r.escalatedSessions,
          0
        );

        if (notified > 0) {
          toast.success(
            `Notified Principal & Director about ${sessions} pending session${
              sessions === 1 ? '' : 's'
            }.`
          );
        } else {
          toast.error(
            'Nothing to escalate — either no day-wise sessions are pending or no Principal/Director is configured.'
          );
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Failed to send reminder.'
        );
      }
    },
    []
  );

  const handleSendReminder = useCallback(
    (period: PendingAttendancePeriod) => {
      void escalateForPeriods([period]);
    },
    [escalateForPeriods]
  );

  const handleBulkSendReminder = useCallback(
    (selectedRows: PendingAttendancePeriod[]) => {
      void escalateForPeriods(selectedRows);
    },
    [escalateForPeriods]
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
        canViewAllInstitutions={canViewAllInstitutions}
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
        // headers/columnMapping/columnWidths all derive from one COLUMNS list —
        // see pending-attendance-export-config.ts. `headers` MUST be the data
        // keys; declaring the labels there exported blank rows.
        exportConfig={PENDING_ATTENDANCE_EXPORT_CONFIG}
        renderToolbarContent={renderBulkToolbar}
      />
    </div>
  );
}
