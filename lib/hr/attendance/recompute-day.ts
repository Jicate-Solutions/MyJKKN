/**
 * Re-judge ONE (employee, date) after a short-time-off decision.
 * Created: 2026-08-21.
 *
 * Approving a permission can reinstate a half whose missing minutes it covers,
 * and cancelling one has to take that back. Both go through the same evaluator
 * the importer and the bulk recompute route use — a fourth caller of
 * evaluateDay(), not a fourth copy of the rule.
 *
 * WHY SERVICE ROLE
 *   Two separate walls stand between an approver and this write:
 *     - hr_attendance_records UPDATE needs hr.attendance.override, which an HR
 *       Manager holding hr.leave.approve does not have;
 *     - fn_resolve_shift_timing(s_bulk) both refuse a caller without one of
 *       is_super_admin / is_admin / hr.shift_timings.view /
 *       hr.attendance.override.
 *   Neither is a statement that the approver may not do this — approving the
 *   permission IS the authorisation, already enforced by assertCanDecide() and
 *   hr_trig_leave_enforce_approver. The elevation is bounded to exactly the one
 *   (employee, work_date) named by the application that was just decided, and
 *   the timing comes from fn_shift_window, which is ungated precisely so this
 *   path can resolve it.
 *
 * SCOPE: source='biometric' rows only. A LEAVE or REGULARIZED day was authored
 * by another writer; re-deriving it from punches would revoke it.
 *
 * HOLIDAY IS THE EXCEPTION, AND IT USED TO BE A BUG. A holiday stamped onto a
 * biometric row leaves `source` as 'biometric', so the filter below does NOT
 * exclude it — this function would re-derive the day from punches and put a
 * declared holiday straight back to ABSENT. Every stamp died at the next leave
 * approval or import, including the ones the older institution_leaves trigger
 * made. The holiday is therefore re-applied here (2026-09-02) rather than
 * assumed out of scope.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import { evaluateDay, type AttendanceVerdict } from '@/lib/hr/biometric/evaluate-day';
import { fetchApprovedPermissions, permissionKey } from '@/lib/hr/biometric/fetch-permissions';
import { applyHolidayToStatusCode, isCalendarHoliday } from '@/lib/hr/attendance/holiday-dates';
import type { ResolvedShiftTiming } from '@/types/hr-shift-timings';

const VERDICT_TO_CODE: Record<Exclude<AttendanceVerdict, 'EXCEPTION'>, string> = {
  PRESENT: 'PRESENT', HALF_DAY: 'HALF_DAY', ABSENT: 'ABSENT', WEEKLY_OFF: 'WEEKLY_OFF',
};

/**
 * `in_at` is timestamptz and PostgREST returns the INSTANT IN UTC —
 * "2026-07-09T03:54:00+00:00" for a 09:24 IST punch. Reading the digits out of
 * that string yields 03:54, which is before every shift boundary, so both
 * halves fail and a fully worked day is written ABSENT. This is the identical
 * conversion punchToHHMM in the recompute route uses, and the zone is pinned
 * rather than left to the host: a UTC server would shift every punch.
 */
const IST_HHMM = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function punchToHHMM(ts: string | null): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return IST_HHMM.format(d);
}

export interface RecomputeDayResult {
  changed: boolean;
  from: string | null;
  to: string | null;
  reason?: string;
}

export async function recomputeAttendanceDay(
  employeeId: string,
  workDate: string,
): Promise<RecomputeDayResult> {
  const svc = createServiceRoleClient();

  const { data: record, error: recErr } = await svc
    .from('hr_attendance_records')
    .select('id, institution_id, status_type_id, in_at, out_at, day_calc, first_half_attended, second_half_attended, late_minutes, excused_minutes, shift_timing_id')
    .eq('employee_id', employeeId)
    .eq('work_date', workDate)
    .eq('source', 'biometric')
    .maybeSingle();
  if (recErr) throw recErr;
  if (!record) return { changed: false, from: null, to: null, reason: 'No biometric record for that day.' };

  const { data: windows, error: winErr } = await svc.rpc('fn_shift_window', {
    p_staff_id: employeeId,
    p_date: workDate,
  });
  if (winErr) throw winErr;

  const w = (Array.isArray(windows) ? windows[0] : windows) as Record<string, unknown> | undefined;
  const timing: ResolvedShiftTiming | null = w
    ? {
        timing_id: w.timing_id as string,
        institution_id: '',
        // matched_by is the RESOLVED scope ('second_saturday_holiday' included);
        // evaluateDay never reads staff_scope, so the wider value is harmless.
        staff_scope: w.matched_by as ResolvedShiftTiming['matched_by'] as ResolvedShiftTiming['staff_scope'],
        employment_category_id: null,
        // Placeholder, like institution_id above and day_of_week below:
        // fn_shift_window returns the window only, and evaluateDay reads none of
        // the three. The gender was already applied inside the resolver.
        applicable_gender: 'all',
        day_of_week: 1,
        is_working_day: w.is_working_day as boolean,
        first_half_start: w.first_half_start as string | null,
        first_half_end: w.first_half_end as string | null,
        second_half_start: w.second_half_start as string | null,
        second_half_end: w.second_half_end as string | null,
        grace_minutes: (w.grace_minutes as number) ?? 0,
        grace_deadline: null,
        matched_by: w.matched_by as ResolvedShiftTiming['matched_by'],
      }
    : null;

  const permissions = (await fetchApprovedPermissions(svc, [employeeId], workDate, workDate))
    .get(permissionKey(employeeId, workDate)) ?? [];

  const verdict = evaluateDay({
    inTime: punchToHHMM(record.in_at as string | null),
    outTime: punchToHHMM(record.out_at as string | null),
    timing,
    permissions,
  });

  // A day the evaluator cannot judge keeps the verdict it already had. Blanking
  // it would replace something that was true when it was made with nothing.
  if (verdict.verdict === 'EXCEPTION') {
    return { changed: false, from: null, to: null, reason: verdict.exceptionReason ?? 'Not evaluable.' };
  }

  const { data: types, error: typeErr } = await svc
    .from('hr_attendance_status_types')
    .select('id, code')
    .is('institution_id', null);
  if (typeErr) throw typeErr;

  const idByCode = new Map<string, string>();
  const codeById = new Map<string, string>();
  for (const t of (types ?? []) as Array<{ id: string; code: string }>) {
    idByCode.set(t.code, t.id);
    codeById.set(t.id, t.code);
  }

  // Re-apply the declared holiday before choosing a status: without this the
  // punches decide, and a festival with no punches resolves to ABSENT again.
  const nextCode = applyHolidayToStatusCode(
    VERDICT_TO_CODE[verdict.verdict],
    await isCalendarHoliday(svc, record.institution_id as string | null, workDate),
  );
  const nextStatusId = idByCode.get(nextCode);
  if (!nextStatusId) return { changed: false, from: null, to: null, reason: 'Status type missing.' };

  const fromCode = codeById.get(record.status_type_id as string) ?? 'UNKNOWN';
  const unchanged =
    nextStatusId === record.status_type_id &&
    (verdict.dayCalc ?? null) === (record.day_calc ?? null) &&
    (verdict.firstHalfAttended ?? null) === (record.first_half_attended ?? null) &&
    (verdict.secondHalfAttended ?? null) === (record.second_half_attended ?? null) &&
    verdict.excusedMinutes === (record.excused_minutes ?? null);
  if (unchanged) return { changed: false, from: fromCode, to: fromCode };

  const { error: updErr } = await svc
    .from('hr_attendance_records')
    .update({
      status_type_id: nextStatusId,
      day_calc: verdict.dayCalc,
      first_half_attended: verdict.firstHalfAttended,
      second_half_attended: verdict.secondHalfAttended,
      late_minutes: verdict.lateMinutes,
      excused_minutes: verdict.excusedMinutes,
      excused_by_application_ids: verdict.excusedBy.length > 0 ? verdict.excusedBy : null,
      shift_timing_id: verdict.shiftTimingId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', record.id);
  if (updErr) throw updErr;

  return { changed: true, from: fromCode, to: verdict.verdict };
}

/**
 * Recompute only when the decided application is a short-time-off one.
 * Never throws: a decision must not fail because attendance could not be
 * re-judged. The caller has already committed the decision.
 */
export async function recomputeForShortTimeOff(app: {
  id: string;
  employee_id: string;
  start_date: string;
  leave_type_id: string;
}): Promise<void> {
  try {
    const svc = createServiceRoleClient();
    const { data: type } = await svc
      .from('hr_leave_types')
      .select('request_category')
      .eq('id', app.leave_type_id)
      .maybeSingle();

    if ((type as { request_category?: string } | null)?.request_category !== 'short_time_off') return;

    await recomputeAttendanceDay(app.employee_id, app.start_date);
  } catch (err) {
    console.warn('[hr/attendance] short-time-off recompute failed:', err);
  }
}
