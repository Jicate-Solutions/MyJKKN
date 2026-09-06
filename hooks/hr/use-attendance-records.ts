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
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { AttendanceRecordService } from '@/lib/services/hr/attendance-record-service';
import {
  buildAttendanceDays,
  chunkIntoWeeks,
  summariseDays,
  monthRange,
  type TimeOffRange,
  type AttendanceDay,
  type AttendanceMonthSummary,
  type AttendancePeriodState,
  type MonthKey,
} from '@/types/hr-attendance';

const KEY = 'hr-attendance-records';
const EXCEPTIONS_KEY = 'hr-attendance-exceptions';
const MONTHS_KEY = 'hr-attendance-months';
const TIME_OFF_KEY = 'hr-attendance-time-off';
const PERIOD_KEY = 'hr-attendance-period';
const HOLIDAYS_KEY = 'hr-attendance-holidays';

/**
 * Invalidate everything the My Attendance log and calendar read.
 *
 * ANY MUTATION THAT CHANGES A DAY MUST CALL THIS. The QueryClient runs with
 * staleTime 5 min and refetchOnWindowFocus false (providers/query-client-
 * provider.tsx), so a cached month is NOT refetched on a tab switch or a
 * revisit — without an explicit invalidation an approved regularization or
 * leave sits invisible for five minutes and looks like it did nothing.
 *
 * Keyed by prefix only: the mutation knows neither the staff id nor the month
 * the viewer happens to have open, and React Query matches partial keys.
 */
export function invalidateAttendanceViews(qc: QueryClient) {
  for (const key of [KEY, EXCEPTIONS_KEY, MONTHS_KEY, TIME_OFF_KEY, PERIOD_KEY, HOLIDAYS_KEY]) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}

/**
 * Holiday names for the month, keyed by date, so a HOLIDAY day can say WHICH
 * holiday. Keyed on the institution, not the staff member: the calendar scopes
 * holidays per institution and every staff member there shares them.
 */
export function useHolidayNames(institutionId: string | null, month: MonthKey) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [HOLIDAYS_KEY, institutionId, month],
    queryFn: () =>
      AttendanceRecordService.holidayNames(supabase, { institutionId: institutionId!, month }),
    enabled: Boolean(institutionId),
  });
}

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
export function useTimeOffCoverage(staffId: string | null, month: MonthKey) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [TIME_OFF_KEY, staffId, month],
    queryFn: async (): Promise<TimeOffRange[]> => {
      const { from, to } = monthRange(month);
      const { data, error } = await supabase
        .from('hr_leave_applications')
        .select('id, status, start_date, end_date, start_time, end_time, hr_leave_types:leave_type_id ( leave_type_name, leave_type_code, request_category )')
        .eq('employee_id', staffId!)
        // UNDECIDED REQUESTS ARE FETCHED TOO (2026-09-02). This was
        // .eq('status', 'approved'), which is why a day could read ABSENT with a
        // leave request already filed against it and show no trace of it --
        // 695 records across ~200 staff. The STATUS is still only restamped on
        // approval; this only makes the pending claim visible beside it.
        //
        // 'escalated' is included because it is a request part-way up an
        // approval ladder: undecided, and exactly the state nobody could see.
        .in('status', ['approved', 'pending', 'escalated'])
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
          request_category: (t?.request_category ?? 'leave') as TimeOffRange['request_category'],
          decision: r.status === 'approved' ? 'approved' : 'awaiting',
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

/**
 * Whether HR has closed this month for the staff member's institution.
 *
 * The institution comes from the month's own records rather than a staff
 * lookup: hr_attendance_records already carries institution_id, and reading
 * `staff` client-side returns null under staff_select_scope_aware for anyone
 * without staff.view — which is most of the people looking at their own
 * attendance.
 */
export function useAttendancePeriod(institutionId: string | null, month: MonthKey) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [PERIOD_KEY, institutionId, month],
    queryFn: () =>
      AttendanceRecordService.getPeriod(supabase, { institutionId: institutionId!, month }),
    enabled: Boolean(institutionId),
  });
}

/**
 * Months this institution has closed, as a Set of `yyyy-MM`.
 *
 * Consumed by the apply forms to refuse a date before anything is uploaded or
 * submitted. Cached for 5 minutes like everything else, and invalidated by
 * invalidateAttendanceViews() when a month is closed or reopened, so a form
 * left open across a close picks the change up.
 *
 * Returns an EMPTY set when the caller cannot read hr_attendance_periods
 * (its policy wants hr.attendance.view_self or the period permissions). That
 * degrades to today's behaviour — the database still refuses the request —
 * rather than blocking a form on a read the user is not entitled to make.
 */
export function useClosedAttendanceMonths(institutionId: string | null | undefined) {
  const supabase = createClientSupabaseClient();
  const { data } = useQuery({
    queryKey: [PERIOD_KEY, 'closed', institutionId],
    queryFn: () => AttendanceRecordService.listClosedMonths(supabase, institutionId!),
    enabled: Boolean(institutionId),
  });
  return useMemo(() => new Set(data ?? []), [data]);
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

/**
 * What the page is entitled to SAY about the month close — `period` alone
 * cannot carry it.
 *
 * A bare null conflates three different facts, and the page rendered nothing
 * for all three, so a month HR has never closed looked identical to a month
 * still loading:
 *
 *   'unresolved'  Nothing is imported for this month, so no institution could
 *                 be resolved and the period query never ran. Nothing is known
 *                 about the close — saying "not closed" here would be a claim
 *                 the page cannot support.
 *   'unknown'     The read has not completed, or failed. Same silence.
 *   'not_created' The read SUCCEEDED and found no row. A period row is only
 *                 ever written by fn_hr_lock_attendance_period, so this means
 *                 exactly one thing: this month has never been closed.
 *   'open'        A row exists and is not locked.
 *   'closed'      Locked. The day counts are frozen.
 */
export type AttendancePeriodResolution =
  | 'unresolved'
  | 'unknown'
  | 'not_created'
  | 'open'
  | 'closed';

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
  /** Null until the month has a record to resolve an institution from. */
  period: AttendancePeriodState | null;
  /** Which of those nulls this is. Read this, not `period`, to render state. */
  periodResolution: AttendancePeriodResolution;
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
  const timeOff = useTimeOffCoverage(staffId, month);

  // Any record of the month answers "which institution's close applies here";
  // they are all the same person's.
  const institutionId = useMemo(
    () => records.data?.find((r) => r.institution_id)?.institution_id ?? null,
    [records.data],
  );
  const period = useAttendancePeriod(institutionId, month);
  // Decorative, so it is NOT part of isLoading: the month renders as soon as the
  // records land and the holiday names fill in when they arrive.
  const holidays = useHolidayNames(institutionId, month);

  const logDays = useMemo(
    () =>
      buildAttendanceDays({
        month,
        records: records.data ?? [],
        exceptions: exceptions.data ?? [],
        requests: timeOff.data ?? [],
        holidays: holidays.data,
      }).reverse(),
    [month, records.data, exceptions.data, timeOff.data, holidays.data],
  );

  const weeks = useMemo(
    () =>
      chunkIntoWeeks(
        buildAttendanceDays({
          month,
          records: records.data ?? [],
          exceptions: exceptions.data ?? [],
          requests: timeOff.data ?? [],
          holidays: holidays.data,
          padWeeks: true,
        }),
      ),
    [month, records.data, exceptions.data, timeOff.data, holidays.data],
  );

  const summary = useMemo(() => summariseDays(logDays), [logDays]);

  // ORDER MATTERS. The period query is `enabled: Boolean(institutionId)`, and a
  // disabled query in React Query reports isPending forever — so the absence of
  // an institution has to be tested BEFORE anything about the query's state.
  const periodResolution: AttendancePeriodResolution = !institutionId
    ? 'unresolved'
    : !period.isSuccess
      ? 'unknown'
      : !period.data
        ? 'not_created'
        : period.data.status === 'locked'
          ? 'closed'
          : 'open';

  return {
    logDays,
    weeks,
    summary,
    isLoading: records.isLoading || exceptions.isLoading || timeOff.isLoading,
    isFetching: records.isFetching || exceptions.isFetching,
    error: (records.error ?? exceptions.error) as Error | null,
    isEmptyMonth: !records.isLoading && (records.data?.length ?? 0) === 0,
    period: period.data ?? null,
    periodResolution,
    refresh: () => {
      qc.invalidateQueries({ queryKey: [KEY, staffId, month] });
      qc.invalidateQueries({ queryKey: [EXCEPTIONS_KEY, staffId, month] });
      qc.invalidateQueries({ queryKey: [TIME_OFF_KEY, staffId, month] });
      qc.invalidateQueries({ queryKey: [PERIOD_KEY, institutionId, month] });
      qc.invalidateQueries({ queryKey: [HOLIDAYS_KEY, institutionId, month] });
    },
  };
}
