/**
 * HR Attendance Records service — the read side of `hr_attendance_records`.
 * Created: 2026-08-09.
 * Plan: docs/superpowers/plans/2026-08-09-my-attendance-log-and-calendar.md
 *
 * Shape follows the HR module convention (static class, SupabaseClient as the
 * first argument) rather than BaseService, which no HR service extends. The two
 * guarantees BaseService would have given are enforced by hand here:
 *
 *   1. Date and staff filtering happen in SQL, never in JS. A month is at most
 *      31 rows per person, but the HR filter can target any of 864 staff and
 *      a JS-side filter after a capped fetch would silently drop people.
 *   2. Every call destructures { error } and throws. Supabase errors are plain
 *      objects, not Error instances, and an unchecked RLS denial is
 *      indistinguishable from "this person was absent all month" — which is a
 *      believable answer, and therefore the dangerous kind of silent failure.
 *
 * ACCESS: not enforced here. `hr_attendance_records_select` already permits
 * super admin, is_admin(), the row's own staff member
 * (staff.profile_id = auth.uid()), and hr.attendance.view_all /
 * hr.attendance.override holders within role_has_institution_access(). Adding
 * a second gate in TypeScript would drift from the policy, not reinforce it.
 * A caller who asks for a staff id outside their scope gets zero rows.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  AttendanceException,
  AttendancePeriodState,
  AttendanceRecord,
  MonthKey,
} from '@/types/hr-attendance';
import { monthRange } from '@/types/hr-attendance';

/**
 * Left join, never `!inner`. A Supabase `status:hr_attendance_status_types!inner(...)`
 * becomes an INNER JOIN, so a single deleted status type would drop the whole
 * attendance row with no error — the person's day would vanish rather than
 * degrade to AEYP.
 */
const RECORD_SELECT = `
  id,
  employee_id,
  work_date,
  status_type_id,
  in_at,
  out_at,
  source,
  day_calc,
  hours_worked,
  overtime_minutes,
  break_minutes,
  late_minutes,
  excused_minutes,
  device_status,
  first_half_attended,
  second_half_attended,
  institution_id,
  notes,
  status:hr_attendance_status_types ( code, label )
`;

export interface MonthQuery {
  staffId: string;
  month: MonthKey;
}

export class AttendanceRecordService {
  /**
   * Which holiday each HOLIDAY day is, keyed `yyyy-MM-dd` → title.
   *
   * The attendance row records the verdict, not the reason: all 810 HOLIDAY
   * rows carry no name (2026-09-04), so the log and calendar could only ever
   * say "Holiday". fn_hr_calendar_holiday_dates() is the ONE resolver the
   * stamping trigger and the import already use, so the name shown is by
   * construction the entry that produced the row. Every HOLIDAY row today is
   * matched by it; none come only from institution_leaves.
   *
   * Two entries on one date are joined with " / " rather than one hiding the
   * other.
   */
  static async holidayNames(
    supabase: SupabaseClient,
    { institutionId, month }: { institutionId: string; month: MonthKey },
  ): Promise<Map<string, string>> {
    const { from, to } = monthRange(month);
    const { data, error } = await supabase.rpc('fn_hr_calendar_holiday_dates', {
      p_institution_id: institutionId,
      p_from: from,
      p_to: to,
    });
    if (error) throw error;

    const byDate = new Map<string, string>();
    for (const row of (data ?? []) as Array<{ holiday_date: string; title: string | null }>) {
      // A title stored as "Milad-un-Nabi" (literal quotes) would render with
      // them; that is the calendar's data, not something to show.
      const title = (row.title ?? '').replace(/^"+|"+$/g, '').trim();
      if (!title) continue;
      const prev = byDate.get(row.holiday_date);
      byDate.set(row.holiday_date, prev ? `${prev} / ${title}` : title);
    }
    return byDate;
  }

  /** Every record for one staff member in one calendar month. */
  static async listMonth(
    supabase: SupabaseClient,
    { staffId, month }: MonthQuery,
  ): Promise<AttendanceRecord[]> {
    const { from, to } = monthRange(month);

    const { data, error } = await supabase
      .from('hr_attendance_records')
      .select(RECORD_SELECT)
      .eq('employee_id', staffId)
      .gte('work_date', from)
      .lte('work_date', to)
      .order('work_date', { ascending: false });

    if (error) throw error;

    // PostgREST types a to-one embed as an array in some client versions and an
    // object in others depending on how it infers the relationship. Normalise
    // once here so no component has to know which.
    return ((data ?? []) as unknown[]).map((row) => {
      const r = row as Record<string, unknown>;
      const embedded = r.status;
      const status = Array.isArray(embedded) ? (embedded[0] ?? null) : (embedded ?? null);
      return { ...r, status } as AttendanceRecord;
    });
  }

  /**
   * Open exceptions for the same window. These explain an AEYP day — the
   * importer saw the day and declined to judge it, which is a different state
   * from "no import has covered this month".
   */
  static async listOpenExceptions(
    supabase: SupabaseClient,
    { staffId, month }: MonthQuery,
  ): Promise<AttendanceException[]> {
    const { from, to } = monthRange(month);

    const { data, error } = await supabase
      .from('hr_attendance_exceptions')
      .select('id, exception_date, exception_type, raw_payload')
      .eq('employee_id', staffId)
      .eq('resolution_status', 'open')
      .gte('exception_date', from)
      .lte('exception_date', to)
      .order('exception_date', { ascending: false });

    if (error) throw error;

    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      exception_date: row.exception_date as string,
      exception_type: row.exception_type as string,
      reason: ((row.raw_payload as Record<string, unknown> | null)?.reason as string) ?? null,
    }));
  }

  /**
   * The month-close state for one institution, or null when HR has never
   * opened that month.
   *
   * Readable by ordinary staff: hr_attendance_periods_select grants
   * hr.attendance.view_self (76 roles) alongside the period-admin permission,
   * so a staff member can see that their own month is finalised.
   */
  static async getPeriod(
    supabase: SupabaseClient,
    { institutionId, month }: { institutionId: string; month: MonthKey },
  ): Promise<AttendancePeriodState | null> {
    const [year, mon] = month.split('-');

    const { data, error } = await supabase
      .from('hr_attendance_periods')
      .select('id, status, locked_at, reopened_at')
      .eq('institution_id', institutionId)
      .eq('period_year', Number(year))
      .eq('period_month', Number(mon))
      .maybeSingle();

    if (error) throw error;
    return (data ?? null) as AttendancePeriodState | null;
  }

  /**
   * The months this institution has CLOSED, as `yyyy-MM` keys.
   *
   * Drives the apply forms: a request touching one of these is refused by
   * trg_hla_block_locked_period / trg_hcoc_block_locked_period, and finding
   * that out at Submit — after a document upload — is a rotten way to learn it.
   * The forms use this to refuse the date up front, with the same reason.
   */
  static async listClosedMonths(
    supabase: SupabaseClient,
    institutionId: string,
  ): Promise<MonthKey[]> {
    const { data, error } = await supabase
      .from('hr_attendance_periods')
      .select('period_year, period_month')
      .eq('institution_id', institutionId)
      .eq('status', 'locked');

    if (error) throw error;

    return ((data ?? []) as Array<{ period_year: number; period_month: number }>).map(
      (r) => `${r.period_year}-${String(r.period_month).padStart(2, '0')}` as MonthKey,
    );
  }

  /**
   * Which months actually hold data for this person, newest first.
   *
   * Only July 2026 exists today and only for the 41 staff the biometric import
   * matched, so a month picker that silently lands on an empty month reads as a
   * broken page. The picker uses this to say "no data for this month — try
   * July 2026" instead.
   */
  static async listMonthsWithData(
    supabase: SupabaseClient,
    staffId: string,
  ): Promise<MonthKey[]> {
    const { data, error } = await supabase
      .from('hr_attendance_records')
      .select('work_date')
      .eq('employee_id', staffId)
      .order('work_date', { ascending: false })
      .limit(1000);

    if (error) throw error;

    const months = new Set<string>();
    for (const row of (data ?? []) as Array<{ work_date: string }>) {
      months.add(row.work_date.slice(0, 7));
    }
    return [...months].sort().reverse();
  }
}
