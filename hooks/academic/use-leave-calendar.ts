// hooks/academic/use-leave-calendar.ts
// React hook for leave calendar functionality
// Created: 2025-12-16
//
// Pattern: useState, useCallback

import { useState, useCallback, useEffect } from 'react';
import { LeaveCalendarService } from '@/lib/services/academic/leave-calendar-service';
import { LeaveAttendanceIntegration } from '@/lib/services/academic/leave-attendance-integration';
import type {
  CalendarLeave,
  MonthlyCalendarData,
  LeaveCalendarFilters,
  LeaveBlockInfo
} from '@/types/leaves';

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
  const [calendarData, setCalendarData] = useState<MonthlyCalendarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCalendarData = useCallback(async () => {
    if (!institutionId) {
      setCalendarData(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const filters: LeaveCalendarFilters = {
        institution_id: institutionId,
        year,
        month,
        department_id: departmentId,
        semester_id: semesterId,
        section_id: sectionId
      };

      const result = await LeaveCalendarService.getMonthlyCalendarData(filters);
      setCalendarData(result);
    } catch (err) {
      console.error('Error fetching calendar data:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [institutionId, year, month, departmentId, semesterId, sectionId]);

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  return {
    calendarData,
    loading,
    error,
    refetch: fetchCalendarData
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
  const [leaves, setLeaves] = useState<CalendarLeave[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaves = useCallback(async () => {
    if (!institutionId) {
      setLeaves([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await LeaveCalendarService.getLeavesForMonth({
        institution_id: institutionId,
        year,
        month
      });
      setLeaves(result);
    } catch (err) {
      console.error('Error fetching monthly leaves:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [institutionId, year, month]);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  return {
    leaves,
    loading,
    error,
    refetch: fetchLeaves
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
  const [workingDaysData, setWorkingDaysData] = useState<{
    total_days: number;
    working_days: number;
    leave_days: number;
    weekend_days: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkingDays = useCallback(async () => {
    if (!institutionId || !startDate || !endDate) {
      setWorkingDaysData(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await LeaveCalendarService.getWorkingDays(
        institutionId,
        startDate,
        endDate,
        departmentId,
        semesterId,
        sectionId
      );
      setWorkingDaysData(result);
    } catch (err) {
      console.error('Error calculating working days:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [institutionId, startDate, endDate, departmentId, semesterId, sectionId]);

  useEffect(() => {
    fetchWorkingDays();
  }, [fetchWorkingDays]);

  return {
    workingDaysData,
    loading,
    error,
    refetch: fetchWorkingDays
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
  const [leaveInfo, setLeaveInfo] = useState<LeaveBlockInfo | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(false);

  const checkDate = useCallback(async () => {
    if (!institutionId || !date) {
      setLeaveInfo(null);
      setIsBlocked(false);
      return;
    }

    try {
      setLoading(true);

      const result = await LeaveAttendanceIntegration.canMarkAttendance({
        institution_id: institutionId,
        date,
        department_id: departmentId,
        semester_id: semesterId,
        section_id: sectionId
      });

      setIsBlocked(!result.allowed);
      setLeaveInfo(result.leave || null);
    } catch (err) {
      console.error('Error checking date:', err);
      setLeaveInfo(null);
      setIsBlocked(false);
    } finally {
      setLoading(false);
    }
  }, [institutionId, date, departmentId, semesterId, sectionId]);

  useEffect(() => {
    checkDate();
  }, [checkDate]);

  return {
    leaveInfo,
    isBlocked,
    loading,
    recheck: checkDate
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
  const [leaveDates, setLeaveDates] = useState<
    { date: string; color: string; status: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaveDates = useCallback(async () => {
    if (!institutionId || !startDate || !endDate) {
      setLeaveDates([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await LeaveCalendarService.getLeaveDatesInRange(
        institutionId,
        startDate,
        endDate
      );
      setLeaveDates(result);
    } catch (err) {
      console.error('Error fetching leave dates:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [institutionId, startDate, endDate]);

  useEffect(() => {
    fetchLeaveDates();
  }, [fetchLeaveDates]);

  return {
    leaveDates,
    loading,
    error,
    refetch: fetchLeaveDates
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
  const [summary, setSummary] = useState<{
    total_leaves: number;
    approved_count: number;
    pending_count: number;
    by_type: { leave_type_name: string; count: number; color_code: string }[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!institutionId) {
      setSummary(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await LeaveCalendarService.getMonthlyLeaveSummary(
        institutionId,
        year,
        month
      );
      setSummary(result);
    } catch (err) {
      console.error('Error fetching monthly summary:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [institutionId, year, month]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return {
    summary,
    loading,
    error,
    refetch: fetchSummary
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
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBlockedDates = useCallback(async () => {
    if (!institutionId || !startDate || !endDate) {
      setBlockedDates([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await LeaveAttendanceIntegration.getBlockedDatesInRange(
        institutionId,
        startDate,
        endDate,
        departmentId,
        semesterId,
        sectionId
      );
      setBlockedDates(result);
    } catch (err) {
      console.error('Error fetching blocked dates:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [institutionId, startDate, endDate, departmentId, semesterId, sectionId]);

  useEffect(() => {
    fetchBlockedDates();
  }, [fetchBlockedDates]);

  return {
    blockedDates,
    loading,
    error,
    refetch: fetchBlockedDates
  };
}
