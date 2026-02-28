// hooks/academic/use-leave-calendar.ts
// React hook for leave calendar functionality
// Migrated to React Query: 2026-02-28
//
// Pattern: useQuery for all calendar data (read-only, no mutations)

import { useQuery } from '@tanstack/react-query';
import { LeaveCalendarService } from '@/lib/services/academic/leave-calendar-service';
import { LeaveAttendanceIntegration } from '@/lib/services/academic/leave-attendance-integration';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type {
  CalendarLeave,
  MonthlyCalendarData,
  LeaveCalendarFilters,
  LeaveBlockInfo
} from '@/types/leaves';

// ─── Query keys ──────────────────────────────────────────────────────────────

export const LEAVE_CALENDAR_KEYS = {
  all: ['leave-calendar'] as const,
  monthly: (
    institutionId: string,
    year: number,
    month: number,
    departmentId?: string,
    semesterId?: string,
    sectionId?: string
  ) =>
    [
      'leave-calendar',
      'monthly',
      institutionId,
      year,
      month,
      departmentId,
      semesterId,
      sectionId,
    ] as const,
  monthlyLeaves: (institutionId: string, year: number, month: number) =>
    ['leave-calendar', 'monthly-leaves', institutionId, year, month] as const,
  workingDays: (
    institutionId: string,
    startDate: string,
    endDate: string,
    departmentId?: string,
    semesterId?: string,
    sectionId?: string
  ) =>
    [
      'leave-calendar',
      'working-days',
      institutionId,
      startDate,
      endDate,
      departmentId,
      semesterId,
      sectionId,
    ] as const,
  dateCheck: (
    institutionId: string,
    date: string,
    departmentId?: string,
    semesterId?: string,
    sectionId?: string
  ) =>
    [
      'leave-calendar',
      'date-check',
      institutionId,
      date,
      departmentId,
      semesterId,
      sectionId,
    ] as const,
  leaveDatesInRange: (
    institutionId: string,
    startDate: string,
    endDate: string
  ) =>
    [
      'leave-calendar',
      'leave-dates-range',
      institutionId,
      startDate,
      endDate,
    ] as const,
  monthlySummary: (institutionId: string, year: number, month: number) =>
    ['leave-calendar', 'monthly-summary', institutionId, year, month] as const,
  blockedDates: (
    institutionId: string,
    startDate: string,
    endDate: string,
    departmentId?: string,
    semesterId?: string,
    sectionId?: string
  ) =>
    [
      'leave-calendar',
      'blocked-dates',
      institutionId,
      startDate,
      endDate,
      departmentId,
      semesterId,
      sectionId,
    ] as const,
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Hook for monthly calendar view
 */
export function useLeaveCalendar(
  institutionId: string | null,
  year: number,
  month: number,
  departmentId?: string,
  semesterId?: string,
  sectionId?: string
) {
  const query = useQuery<MonthlyCalendarData>({
    queryKey: institutionId
      ? LEAVE_CALENDAR_KEYS.monthly(
          institutionId,
          year,
          month,
          departmentId,
          semesterId,
          sectionId
        )
      : LEAVE_CALENDAR_KEYS.all,
    queryFn: () => {
      const filters: LeaveCalendarFilters = {
        institution_id: institutionId!,
        year,
        month,
        department_id: departmentId,
        semester_id: semesterId,
        section_id: sectionId,
      };
      return LeaveCalendarService.getMonthlyCalendarData(filters);
    },
    enabled: !!institutionId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });

  return {
    calendarData: query.data ?? null,
    loading: query.isPending,
    error: query.error ? String(query.error) : null,
    refetch: query.refetch,
  };
}

/**
 * Hook for leaves in a specific month (simple list)
 */
export function useMonthlyLeaves(
  institutionId: string | null,
  year: number,
  month: number
) {
  const query = useQuery<CalendarLeave[]>({
    queryKey: institutionId
      ? LEAVE_CALENDAR_KEYS.monthlyLeaves(institutionId, year, month)
      : LEAVE_CALENDAR_KEYS.all,
    queryFn: () =>
      LeaveCalendarService.getLeavesForMonth({
        institution_id: institutionId!,
        year,
        month,
      }),
    enabled: !!institutionId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });

  return {
    leaves: query.data ?? [],
    loading: query.isPending,
    error: query.error ? String(query.error) : null,
    refetch: query.refetch,
  };
}

/**
 * Hook for working days calculation
 */
export function useWorkingDays(
  institutionId: string | null,
  startDate: string | null,
  endDate: string | null,
  departmentId?: string,
  semesterId?: string,
  sectionId?: string
) {
  const enabled = !!institutionId && !!startDate && !!endDate;

  const query = useQuery<{
    total_days: number;
    working_days: number;
    leave_days: number;
    weekend_days: number;
  }>({
    queryKey:
      enabled
        ? LEAVE_CALENDAR_KEYS.workingDays(
            institutionId!,
            startDate!,
            endDate!,
            departmentId,
            semesterId,
            sectionId
          )
        : LEAVE_CALENDAR_KEYS.all,
    queryFn: () =>
      LeaveCalendarService.getWorkingDays(
        institutionId!,
        startDate!,
        endDate!,
        departmentId,
        semesterId,
        sectionId
      ),
    enabled,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });

  return {
    workingDaysData: query.data ?? null,
    loading: query.isPending,
    error: query.error ? String(query.error) : null,
    refetch: query.refetch,
  };
}

/**
 * Hook for checking if a date is blocked by leave
 */
export function useDateLeaveCheck(
  institutionId: string | null,
  date: string | null,
  departmentId?: string,
  semesterId?: string,
  sectionId?: string
) {
  const enabled = !!institutionId && !!date;

  const query = useQuery<{
    allowed: boolean;
    leave?: LeaveBlockInfo;
  }>({
    queryKey:
      enabled
        ? LEAVE_CALENDAR_KEYS.dateCheck(
            institutionId!,
            date!,
            departmentId,
            semesterId,
            sectionId
          )
        : LEAVE_CALENDAR_KEYS.all,
    queryFn: () =>
      LeaveAttendanceIntegration.canMarkAttendance({
        institution_id: institutionId!,
        date: date!,
        department_id: departmentId,
        semester_id: semesterId,
        section_id: sectionId,
      }),
    enabled,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });

  return {
    leaveInfo: query.data?.leave ?? null,
    isBlocked: query.data ? !query.data.allowed : false,
    loading: query.isPending,
    recheck: query.refetch,
  };
}

/**
 * Hook for getting leave dates in a range (for calendar highlighting)
 */
export function useLeaveDatesInRange(
  institutionId: string | null,
  startDate: string | null,
  endDate: string | null
) {
  const enabled = !!institutionId && !!startDate && !!endDate;

  const query = useQuery<{ date: string; color: string; status: string }[]>({
    queryKey:
      enabled
        ? LEAVE_CALENDAR_KEYS.leaveDatesInRange(
            institutionId!,
            startDate!,
            endDate!
          )
        : LEAVE_CALENDAR_KEYS.all,
    queryFn: () =>
      LeaveCalendarService.getLeaveDatesInRange(
        institutionId!,
        startDate!,
        endDate!
      ),
    enabled,
    ...QUERY_CONFIG.STABLE_DATA,
  });

  return {
    leaveDates: query.data ?? [],
    loading: query.isPending,
    error: query.error ? String(query.error) : null,
    refetch: query.refetch,
  };
}

/**
 * Hook for monthly leave summary (dashboard widget)
 */
export function useMonthlyLeaveSummary(
  institutionId: string | null,
  year: number,
  month: number
) {
  const query = useQuery<{
    total_leaves: number;
    approved_count: number;
    pending_count: number;
    by_type: { leave_type_name: string; count: number; color_code: string }[];
  }>({
    queryKey: institutionId
      ? LEAVE_CALENDAR_KEYS.monthlySummary(institutionId, year, month)
      : LEAVE_CALENDAR_KEYS.all,
    queryFn: () =>
      LeaveCalendarService.getMonthlyLeaveSummary(
        institutionId!,
        year,
        month
      ),
    enabled: !!institutionId,
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });

  return {
    summary: query.data ?? null,
    loading: query.isPending,
    error: query.error ? String(query.error) : null,
    refetch: query.refetch,
  };
}

/**
 * Hook for getting blocked dates (for attendance UI)
 */
export function useBlockedDates(
  institutionId: string | null,
  startDate: string | null,
  endDate: string | null,
  departmentId?: string,
  semesterId?: string,
  sectionId?: string
) {
  const enabled = !!institutionId && !!startDate && !!endDate;

  const query = useQuery<string[]>({
    queryKey:
      enabled
        ? LEAVE_CALENDAR_KEYS.blockedDates(
            institutionId!,
            startDate!,
            endDate!,
            departmentId,
            semesterId,
            sectionId
          )
        : LEAVE_CALENDAR_KEYS.all,
    queryFn: () =>
      LeaveAttendanceIntegration.getBlockedDatesInRange(
        institutionId!,
        startDate!,
        endDate!,
        departmentId,
        semesterId,
        sectionId
      ),
    enabled,
    ...QUERY_CONFIG.STABLE_DATA,
  });

  return {
    blockedDates: query.data ?? [],
    loading: query.isPending,
    error: query.error ? String(query.error) : null,
    refetch: query.refetch,
  };
}
