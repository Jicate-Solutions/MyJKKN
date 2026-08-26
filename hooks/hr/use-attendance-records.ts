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
  monthRange,
  type ApprovedRequestRange,
  type AttendanceDay,
  type AttendanceMonthSummary,
  type MonthKey,
} from '@/types/hr-attendance';

const KEY = 'hr-attendance-records';
const EXCEPTIONS_KEY = 'hr-attendance-exceptions';
const MONTHS_KEY = 'hr-attendance-months';
const TIME_OFF_KEY = 'hr-attendance-time-off';

/** Raw records for one staff member in one month. */
export function useAttendanceMonth(staffId: string | null, month: MonthKey) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY, staffId, month],
    queryFn: () => AttendanceRecordService.listMonth(supabase, { staffId: staffId!, month }),
    enabled: Boolean(staffId),
  });
}

/**
 * APPROVED time-off overlapping the month, for the log's Time off column.
 *
 * Overlap, not "starts in the month": a leave running 29 Jul – 2 Aug belongs on
 * the August rows too, and filtering on start_date alone would drop it. The
 * applications REST route only filters start_date, so this queries PostgREST
 * directly — RLS gives the caller their own rows and an approver the ones they
 * may see, which is the same scope the rest of this page already uses.
 */
export function useApprovedTimeOff(staffId: string | null, month: MonthKey) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [TIME_OFF_KEY, staffId, month],
    queryFn: async (): Promise<ApprovedRequestRange[]> => {
      const { from, to } = monthRange(month);
      const { data, error } = await supabase
        .from('hr_leave_applications')
        .select('id, start_date, end_date, start_time, end_time, hr_leave_types:leave_type_id ( leave_type_name, leave_type_code, request_category )')
        .eq('employee_id', staffId!)
        .eq('status', 'approved')
        .lte('start_date', to)
        .gte('end_date', from)
        .order('start_date');
      if (error) throw error;

      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
        const embedded = r.hr_leave_types as
          | { leave_type_name?: string; leave_type_code?: string; request_category?: string }
          | Array<{ leave_type_name?: string; leave_type_code?: string; request_category?: string }>
          | null;
        const t = Array.isArray(embedded) ? embedded[0] : embedded;
        return {
          id: r.id as string,
          start_date: r.start_date as string,
          end_date: r.end_date as string,
          start_time: (r.start_time as string | null) ?? null,
          end_time: (r.end_time as string | null) ?? null,
          leave_type_name: t?.leave_type_name ?? 'Time off',
          leave_type_code: t?.leave_type_code ?? null,
          // A LEFT join, so an unreadable type degrades to 'leave' rather than
          // dropping the row — the day would otherwise show nothing at all.
          request_category: (t?.request_category ?? 'leave') as ApprovedRequestRange['request_category'],
        };
      });
    },
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
  const timeOff = useApprovedTimeOff(staffId, month);

  const logDays = useMemo(
    () =>
      buildAttendanceDays({
        month,
        records: records.data ?? [],
        exceptions: exceptions.data ?? [],
        requests: timeOff.data ?? [],
      }).reverse(),
    [month, records.data, exceptions.data, timeOff.data],
  );

  const weeks = useMemo(
    () =>
      chunkIntoWeeks(
        buildAttendanceDays({
          month,
          records: records.data ?? [],
          exceptions: exceptions.data ?? [],
          requests: timeOff.data ?? [],
          padWeeks: true,
        }),
      ),
    [month, records.data, exceptions.data, timeOff.data],
  );

  const summary = useMemo(() => summariseDays(logDays), [logDays]);

  return {
    logDays,
    weeks,
    summary,
    isLoading: records.isLoading || exceptions.isLoading || timeOff.isLoading,
    isFetching: records.isFetching || exceptions.isFetching,
    error: (records.error ?? exceptions.error) as Error | null,
    isEmptyMonth: !records.isLoading && (records.data?.length ?? 0) === 0,
    refresh: () => {
      qc.invalidateQueries({ queryKey: [KEY, staffId, month] });
      qc.invalidateQueries({ queryKey: [EXCEPTIONS_KEY, staffId, month] });
      qc.invalidateQueries({ queryKey: [TIME_OFF_KEY, staffId, month] });
    },
  };
}
