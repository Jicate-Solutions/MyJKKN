/**
 * Attendance Month Close Service (2026-08-22)
 *
 * Substrate: 20260822010000_hr_attendance_periods_and_summaries.sql
 *            20260822020000_fn_hr_attendance_period_compute_and_lock.sql
 *            20260822030000_fn_hr_lock_reopen_attendance_period_and_console.sql
 *            20260822040000_hr_attendance_period_lock_enforcement.sql
 *
 * CLOSING THE MONTH SITS BETWEEN BIOMETRIC AND PAYROLL. Punches are imported,
 * requests are approved and the attendance recomputed, and then HR Head freezes
 * the month — after which no request touching it can be raised, decided or
 * withdrawn, and the per-staff day counts stop moving.
 *
 * NOT hr_payroll_periods. That table's `locked` is the LAST stage of a
 * five-signature approval chain, reached after payslips are distributed. This
 * one has to happen BEFORE payroll reads the day counts.
 *
 * Every method goes through an RPC rather than a table write, because each one
 * has a guard that cannot be expressed as RLS: the lock refuses while requests
 * are outstanding, and reopening is super-admin-only.
 *
 * Static class, SupabaseClient passed in — the convention across
 * lib/services/hr/payroll/.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getErrorMessage } from '@/lib/utils';

/** One institution's state for a month, as the console lists it. */
export interface AttendancePeriodConsoleRow {
  institution_id: string;
  institution_name: string;
  /** null until someone has opened or closed this month for this institution. */
  period_id: string | null;
  status: 'open' | 'locked';
  locked_at: string | null;
  /**
   * BIOMETRIC COVERAGE, not headcount: how many distinct people appear in the
   * imported records for this month. The close writes one frozen summary per
   * person IN THIS SET, so anyone missing from it gets no row at all and
   * payroll later finds nothing rather than a zero.
   *
   * It also counts people who have already left — the import matches on the
   * employee code alone and ignores staff.is_active — which is why coverage can
   * exceed 100%. Nursing sat at 25 of 24 in July.
   */
  staff_with_records: number;
  /** The denominator: active staff on the roster, imported or not. */
  active_staff: number;
  /** How many of staff_with_records have already been relieved. */
  relieved_with_records: number;
  record_count: number;
  /**
   * Undecided requests overlapping the month. ANY of these blocks the close.
   *
   * Split by type because the three live behind three different tabs of the
   * approvals screen: a single "12 pending" says something is in the way but
   * not where to go and fix it.
   */
  pending_total: number;
  pending_leave: number;
  pending_short_time_off: number;
  pending_comp_off: number;
  approved_leave: number;
  approved_short_time_off: number;
  approved_comp_off: number;
  /** Days the evaluator could not judge — worth clearing before closing. */
  unprocessed_days: number;
}

/** The frozen day counts for one staff member. */
export interface AttendancePeriodSummary {
  id: string;
  period_id: string;
  staff_id: string;
  working_days: number;
  present_days: number;
  half_days: number;
  absent_days: number;
  weekly_off_days: number;
  holiday_days: number;
  leave_days: number;
  on_duty_days: number;
  comp_off_days: number;
  lop_days: number;
  payable_days: number;
  /** { "CL": 2, "ML": 1 } — per leave-type code. */
  leave_by_type: Record<string, number>;
  short_time_off_minutes: number;
  late_minutes: number;
  excused_minutes: number;
  unprocessed_days: number;
  computed_at: string;
}

export interface AttendancePeriod {
  id: string;
  institution_id: string;
  period_year: number;
  period_month: number;
  status: 'open' | 'locked';
  locked_at: string | null;
  locked_by: string | null;
  reopened_at: string | null;
  reopen_reason: string | null;
  working_days_count: number | null;
  staff_count: number | null;
}

/** numeric(5,1) arrives from PostgREST as a string; every count is coerced. */
function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : Number(v) || 0;
}

export class AttendancePeriodService {
  /**
   * Every institution's state for one month.
   *
   * Institutions with no attendance data are INCLUDED, with zeroes — a console
   * that silently omits them reads as "all done" when it means "never
   * imported". The RPC raises rather than returning [] for a caller without the
   * key, so an empty list means "no institutions in scope".
   */
  static async listConsole(
    supabase: SupabaseClient,
    year: number,
    month: number
  ): Promise<AttendancePeriodConsoleRow[]> {
    const { data, error } = await (supabase as any).rpc('hr_attendance_period_console', {
      p_year: year,
      p_month: month,
    });

    if (error) {
      throw new Error(`Failed to load the attendance close console: ${getErrorMessage(error)}`);
    }

    return ((data ?? []) as any[]).map((r) => ({
      ...r,
      staff_with_records: num(r.staff_with_records),
      active_staff: num(r.active_staff),
      relieved_with_records: num(r.relieved_with_records),
      record_count: num(r.record_count),
      pending_total: num(r.pending_total),
      pending_leave: num(r.pending_leave),
      pending_short_time_off: num(r.pending_short_time_off),
      pending_comp_off: num(r.pending_comp_off),
      approved_leave: num(r.approved_leave),
      approved_short_time_off: num(r.approved_short_time_off),
      approved_comp_off: num(r.approved_comp_off),
      unprocessed_days: num(r.unprocessed_days),
    })) as AttendancePeriodConsoleRow[];
  }

  /**
   * Close one institution-month.
   *
   * THROWS while any request overlapping the month is pending or escalated, and
   * there is no way round it — resolving every request first is compulsory, and
   * the RPC takes no override argument. The caller should surface the message
   * verbatim: it names the count.
   */
  static async lock(
    supabase: SupabaseClient,
    input: { institutionId: string; year: number; month: number }
  ): Promise<AttendancePeriod> {
    const { data, error } = await (supabase as any).rpc('fn_hr_lock_attendance_period', {
      p_institution_id: input.institutionId,
      p_year: input.year,
      p_month: input.month,
    });

    if (error) throw new Error(getErrorMessage(error));
    return data as AttendancePeriod;
  }

  /** Reopen a closed month. Super admin only; the frozen summaries are discarded. */
  static async reopen(
    supabase: SupabaseClient,
    periodId: string,
    reason: string
  ): Promise<AttendancePeriod> {
    const { data, error } = await (supabase as any).rpc('fn_hr_reopen_attendance_period', {
      p_period_id: periodId,
      p_reason: reason,
    });

    if (error) throw new Error(getErrorMessage(error));
    return data as AttendancePeriod;
  }

  /**
   * The frozen day counts for a closed month.
   *
   * Read straight from the table rather than recomputed — that is the whole
   * point of freezing them. Empty while the month is open.
   */
  static async listSummaries(
    supabase: SupabaseClient,
    periodId: string
  ): Promise<AttendancePeriodSummary[]> {
    const { data, error } = await (supabase as any)
      .from('hr_attendance_period_summaries')
      .select('*')
      .eq('period_id', periodId)
      .limit(5000);

    if (error) {
      throw new Error(`Failed to load the frozen day counts: ${getErrorMessage(error)}`);
    }

    return ((data ?? []) as any[]).map((r) => ({
      ...r,
      working_days: num(r.working_days),
      present_days: num(r.present_days),
      absent_days: num(r.absent_days),
      leave_days: num(r.leave_days),
      on_duty_days: num(r.on_duty_days),
      comp_off_days: num(r.comp_off_days),
      lop_days: num(r.lop_days),
      payable_days: num(r.payable_days),
      leave_by_type: (r.leave_by_type ?? {}) as Record<string, number>,
    })) as AttendancePeriodSummary[];
  }
}
