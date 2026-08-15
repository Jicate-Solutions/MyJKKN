'use client';

/**
 * HR Attendance Records — React Query hooks for the My Attendance surface.
 * Created: 2026-08-09.
 * Plan: docs/superpowers/plans/2026-08-09-my-attendance-log-and-calendar.md
 *
 * Query keys are a module-local const, matching hooks/hr/use-shift-timings.ts
 * and hooks/hr/use-hr-leave-types.ts. lib/query/query-keys.ts has no `hr`
 * section and no HR importer, so a group added there would be dead code.
 */

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { AttendanceRecordService } from '@/lib/services/hr/attendance-record-service';
import {
  buildAttendanceDays,
  chunkIntoWeeks,
  summariseDays,
  type AttendanceDay,
  type AttendanceMonthSummary,
  type MonthKey,
} from '@/types/hr-attendance';

const KEY = 'hr-attendance-records';
const EXCEPTIONS_KEY = 'hr-attendance-exceptions';
const MONTHS_KEY = 'hr-attendance-months';

/** Raw records for one staff member in one month. */
export function useAttendanceMonth(staffId: string | null, month: MonthKey) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, staffId, month],
    queryFn: () => AttendanceRecordService.listMonth(supabase, { staffId: staffId!, month }),
    enabled: Boolean(staffId),
  });
}

/** Open exceptions for the same window — the reason behind an AEYP day. */
export function useAttendanceExceptions(staffId: string | null, month: MonthKey) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [EXCEPTIONS_KEY, staffId, month],
    queryFn: () =>
      AttendanceRecordService.listOpenExceptions(supabase, { staffId: staffId!, month }),
    enabled: Boolean(staffId),
  });
}

/** Which months hold data at all, so an empty month can say why. */
export function useAttendanceMonthsWithData(staffId: string | null) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [MONTHS_KEY, staffId],
    queryFn: () => AttendanceRecordService.listMonthsWithData(supabase, staffId!),
    enabled: Boolean(staffId),
    staleTime: 5 * 60 * 1000,
  });
}

export interface AttendanceMonthView {
  /** Every day of the month, newest first — for the log. */
  logDays: AttendanceDay[];
  /** Padded Monday→Sunday weeks — for the calendar grid. */
  weeks: AttendanceDay[][];
  summary: AttendanceMonthSummary;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  /** True once loading finished and the month genuinely holds no record. */
  isEmptyMonth: boolean;
  refresh: () => void;
}

/**
 * The one hook both tabs consume. Fetches records + exceptions for the month
 * and derives every shape the UI needs, so the log and the calendar can never
 * disagree about what a given day was.
 */
export function useAttendanceMonthView(
  staffId: string | null,
  month: MonthKey,
): AttendanceMonthView {
  const qc = useQueryClient();
  const records = useAttendanceMonth(staffId, month);
  const exceptions = useAttendanceExceptions(staffId, month);

  const logDays = useMemo(
    () =>
      buildAttendanceDays({
        month,
        records: records.data ?? [],
        exceptions: exceptions.data ?? [],
      }).reverse(),
    [month, records.data, exceptions.data],
  );

  const weeks = useMemo(
    () =>
      chunkIntoWeeks(
        buildAttendanceDays({
          month,
          records: records.data ?? [],
          exceptions: exceptions.data ?? [],
          padWeeks: true,
        }),
      ),
    [month, records.data, exceptions.data],
  );

  const summary = useMemo(() => summariseDays(logDays), [logDays]);

  return {
    logDays,
    weeks,
    summary,
    isLoading: records.isLoading || exceptions.isLoading,
    isFetching: records.isFetching || exceptions.isFetching,
    error: (records.error ?? exceptions.error) as Error | null,
    isEmptyMonth: !records.isLoading && (records.data?.length ?? 0) === 0,
    refresh: () => {
      qc.invalidateQueries({ queryKey: [KEY, staffId, month] });
      qc.invalidateQueries({ queryKey: [EXCEPTIONS_KEY, staffId, month] });
    },
  };
}
