export const dynamic = 'force-dynamic';

// ============================================================================
// POST /api/hr/attendance/recompute
// ----------------------------------------------------------------------------
// Re-judge already-imported biometric days against the shift timings currently
// in force, without needing the original export file.
//
// WHY THIS EXISTS
//   hr_attendance_records froze each day's verdict at import time. Editing a
//   shift timing — raising grace, moving a half, marking a day non-working —
//   changed nothing that had already been imported, so an operator would fix
//   the rule, reload the attendance page, and see the same wrong answer.
//   hr_shift_timings carries no recompute trigger (only set_updated_at), unlike
//   institution_leaves and hr_leave_applications which both fan into this table.
//
// WHY IT CAN WORK FROM THE DATABASE ALONE
//   in_at / out_at preserve the punch pair, which is the entire input to
//   evaluateDay() alongside the timing. Nothing else from the machine export is
//   needed to reach the same verdict, so re-uploading the file is unnecessary.
//
// ONE EVALUATOR, THREE CALLERS
//   Dry-run import, commit import and this route all call the same pure
//   evaluateDay(). A SQL reimplementation inside a trigger would have been
//   real-time, but it would be a second copy of the rule free to drift from the
//   first — the exact failure the importer's "TWO MODES, ONE CODE PATH" note
//   was written to prevent.
//
// WHAT IT WILL NOT TOUCH
//   Only source='biometric' rows. LEAVE, HOLIDAY and REGULARIZED rows are
//   authored by the leave trigger, the holiday trigger and the regularization
//   service respectively; re-deriving them from punches would silently revoke
//   an approved leave day.
//
// CLIENTS: session client throughout, so RLS enforces hr.attendance.override +
// role_has_institution_access on both the read and the write.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { evaluateDay, type AttendanceVerdict } from '@/lib/hr/biometric/evaluate-day';
import {
  applyHolidayToStatusCode,
  fetchHolidayKeys,
  holidayKey,
} from '@/lib/hr/attendance/holiday-dates';
import { fetchApprovedPermissions, permissionKey } from '@/lib/hr/biometric/fetch-permissions';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { ResolvedShiftTiming } from '@/types/hr-shift-timings';

/** fn_resolve_shift_timings_bulk refuses a span wider than this. */
const MAX_SPAN_DAYS = 400;
const CHUNK = 500;
/** Bulk-resolving timings is per (staff x day); keep one call sane. */
const MAX_STAFF_PER_RESOLVE = 400;

interface ChangeRow {
  employee_id: string;
  work_date: string;
  from: string;
  to: string;
}

/**
 * `${work_date}T${HH:mm}:00+05:30` is how the importer wrote these, so the
 * wall-clock reading is recoverable by formatting in the same zone. Doing it
 * with the server's local zone would shift every punch on a UTC host.
 */
const IST_HHMM = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function punchToHHMM(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return IST_HHMM.format(d);
}

export async function POST(request: NextRequest) {
  try {
    const session = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await session.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized', message: 'Sign in to recompute.' }, { status: 401 });
    }

    const [{ data: isAdmin }, { data: canOverride }] = await Promise.all([
      session.rpc('is_admin'),
      session.rpc('user_has_permission', { permission_name: 'hr.attendance.override' }),
    ]);
    if (isAdmin !== true && canOverride !== true) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You need Override Attendance Records to recompute attendance.' },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const institutionId: string | null = body.institutionId ?? null;
    const from: string = body.from ?? '';
    const to: string = body.to ?? '';
    const dryRun = body.dryRun === true;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json(
        { error: 'Invalid range', message: 'from and to must be YYYY-MM-DD.' },
        { status: 400 },
      );
    }
    if (to < from) {
      return NextResponse.json(
        { error: 'Invalid range', message: 'to must not be earlier than from.' },
        { status: 400 },
      );
    }
    const spanDays = Math.round(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
    );
    if (spanDays > MAX_SPAN_DAYS) {
      return NextResponse.json(
        { error: 'Range too wide', message: `Recompute at most ${MAX_SPAN_DAYS} days at a time.` },
        { status: 400 },
      );
    }

    // ---- The days to re-judge ----------------------------------------------
    let q = session
      .from('hr_attendance_records')
      // institution_id is selected only so the leave re-stamp below knows which
      // institutions were touched — institutionId is optional in the body, and
      // a group-wide recompute must re-stamp every institution it rewrote.
      .select('id, employee_id, institution_id, work_date, in_at, out_at, status_type_id, day_calc, first_half_attended, second_half_attended, late_minutes, excused_minutes, excused_by_application_ids, shift_timing_id')
      .eq('source', 'biometric')
      .gte('work_date', from)
      .lte('work_date', to)
      .order('work_date', { ascending: true })
      .limit(20000);
    if (institutionId) q = q.eq('institution_id', institutionId);

    const { data: records, error: recErr } = await q;
    if (recErr) {
      console.error('[hr/attendance/recompute] record load error:', recErr);
      return NextResponse.json({ error: 'Load failed', message: recErr.message }, { status: 500 });
    }

    if (!records || records.length === 0) {
      return NextResponse.json({
        success: true, dry_run: dryRun, examined: 0, changed: 0,
        unresolvable: 0, transitions: {}, changes: [],
        message: 'No biometric attendance records in that range.',
      });
    }

    // ---- Status code <-> id -------------------------------------------------
    const { data: statusTypes, error: stErr } = await session
      .from('hr_attendance_status_types')
      .select('id, code')
      .is('institution_id', null);
    if (stErr) {
      console.error('[hr/attendance/recompute] status type error:', stErr);
      return NextResponse.json({ error: 'Status lookup failed', message: stErr.message }, { status: 500 });
    }
    const idByCode = new Map<string, string>();
    const codeById = new Map<string, string>();
    for (const s of (statusTypes ?? []) as Array<{ id: string; code: string }>) {
      idByCode.set(s.code, s.id);
      codeById.set(s.id, s.code);
    }

    /**
     * DECLARED HOLIDAYS OVER THE EXAMINED RANGE.
     *
     * Same hazard the leave re-stamp below documents: this route writes
     * status_type_id straight from the punch verdict, and a festival has no
     * punches, so every holiday in range would revert to ABSENT. That took the
     * calendar's stamps AND the older institution_leaves trigger's with it,
     * because a holiday stamped onto a biometric row keeps source='biometric'
     * and is not excluded by anything.
     *
     * Applied inline rather than as a post-pass so ABSENT is never written in
     * the first place.
     */
    const holidayKeys = await fetchHolidayKeys(
      session,
      (records as Array<Record<string, unknown>>)
        .map((r) => r.institution_id as string | null)
        .filter((v): v is string => !!v),
      from,
      to,
    );

    const VERDICT_TO_CODE: Record<Exclude<AttendanceVerdict, 'EXCEPTION'>, string> = {
      PRESENT: 'PRESENT', HALF_DAY: 'HALF_DAY', ABSENT: 'ABSENT', WEEKLY_OFF: 'WEEKLY_OFF',
    };

    // ---- Timings for every (staff, date) -----------------------------------
    const staffIds = [...new Set(records.map((r) => r.employee_id as string))];
    const timingByKey = new Map<string, ResolvedShiftTiming>();

    for (let i = 0; i < staffIds.length; i += MAX_STAFF_PER_RESOLVE) {
      const slice = staffIds.slice(i, i + MAX_STAFF_PER_RESOLVE);
      const { data: timings, error: tErr } = await session.rpc('fn_resolve_shift_timings_bulk', {
        p_staff_ids: slice,
        p_from: from,
        p_to: to,
      });
      if (tErr) {
        console.error('[hr/attendance/recompute] timing resolve error:', tErr);
        return NextResponse.json({ error: 'Shift timing lookup failed', message: tErr.message }, { status: 500 });
      }
      for (const t of (timings ?? []) as Array<Record<string, unknown>>) {
        if (!t.timing_id) continue;
        timingByKey.set(`${t.staff_id}|${t.work_date}`, {
          timing_id: t.timing_id as string,
          institution_id: '',
          staff_scope: t.matched_by as ResolvedShiftTiming['staff_scope'],
          employment_category_id: null,
          // Placeholder, like institution_id and day_of_week beside it:
          // fn_resolve_shift_timings_bulk returns only the window, and
          // evaluateDay reads none of these three. The gender that produced this
          // row was already applied inside the resolver.
          applicable_gender: 'all',
          day_of_week: 1,
          is_working_day: t.is_working_day as boolean,
          first_half_start: t.first_half_start as string | null,
          first_half_end: t.first_half_end as string | null,
          second_half_start: t.second_half_start as string | null,
          second_half_end: t.second_half_end as string | null,
          grace_minutes: (t.grace_minutes as number) ?? 0,
          grace_deadline: null,
          matched_by: t.matched_by as ResolvedShiftTiming['matched_by'],
        });
      }
    }

    // ---- Approved permissions for the same window ---------------------------
    // The evaluator reinstates a half whose missing minutes one of these fully
    // covers. Omitting them here would make this route disagree with the
    // importer about the very same punch pair.
    //
    // Read with a service-role client, unlike everything else in this route.
    // hla_select admits an approver or a leave viewer, neither of which
    // hr.attendance.override implies — so the caller this route already
    // authorised would come back with an empty set and silently revoke every
    // excusal it touched. The read is narrow: id, employee, date and the two
    // times, for staff whose attendance rows this caller could already read.
    const permissionsByDay = await fetchApprovedPermissions(
      createServiceRoleClient(),
      [...new Set((records ?? []).map((r) => (r as Record<string, unknown>).employee_id as string))],
      from,
      to,
    );

    // ---- Re-judge ------------------------------------------------------------
    const updates: Array<Record<string, unknown>> = [];
    const changes: ChangeRow[] = [];
    const transitions: Record<string, number> = {};
    let unresolvable = 0;

    for (const r of records as Array<Record<string, unknown>>) {
      const employeeId = r.employee_id as string;
      const workDate = r.work_date as string;
      const timing = timingByKey.get(`${employeeId}|${workDate}`) ?? null;

      const verdict = evaluateDay({
        inTime: punchToHHMM(r.in_at as string | null),
        outTime: punchToHHMM(r.out_at as string | null),
        timing,
        permissions: permissionsByDay.get(permissionKey(employeeId, workDate)) ?? [],
      });

      // A day that no longer resolves is left exactly as it is. Deleting the
      // record or blanking the status would destroy a verdict that was valid
      // when it was made, to represent "we currently cannot say".
      if (verdict.verdict === 'EXCEPTION') {
        unresolvable += 1;
        continue;
      }

      const nextStatusId = idByCode.get(
        applyHolidayToStatusCode(
          VERDICT_TO_CODE[verdict.verdict],
          holidayKeys.has(
            holidayKey(r.institution_id as string, String(r.work_date).slice(0, 10)),
          ),
        ),
      );
      if (!nextStatusId) continue;

      const sameStatus = nextStatusId === r.status_type_id;
      const sameCalc = (verdict.dayCalc ?? null) === (r.day_calc ?? null);
      const sameFirst = (verdict.firstHalfAttended ?? null) === (r.first_half_attended ?? null);
      const sameSecond = (verdict.secondHalfAttended ?? null) === (r.second_half_attended ?? null);
      const sameLate = (verdict.lateMinutes ?? null) === (r.late_minutes ?? null);
      const sameExcused = verdict.excusedMinutes === (r.excused_minutes ?? null);
      const sameTiming = (verdict.shiftTimingId ?? null) === (r.shift_timing_id ?? null);

      if (sameStatus && sameCalc && sameFirst && sameSecond && sameLate && sameExcused && sameTiming) continue;

      if (!sameStatus) {
        const fromCode = codeById.get(r.status_type_id as string) ?? 'UNKNOWN';
        const key = `${fromCode} → ${verdict.verdict}`;
        transitions[key] = (transitions[key] ?? 0) + 1;
        if (changes.length < 200) {
          changes.push({ employee_id: employeeId, work_date: workDate, from: fromCode, to: verdict.verdict });
        }
      }

      updates.push({
        id: r.id,
        status_type_id: nextStatusId,
        day_calc: verdict.dayCalc,
        first_half_attended: verdict.firstHalfAttended,
        second_half_attended: verdict.secondHalfAttended,
        late_minutes: verdict.lateMinutes,
        excused_minutes: verdict.excusedMinutes,
        excused_by_application_ids: verdict.excusedBy.length > 0 ? verdict.excusedBy : null,
        shift_timing_id: verdict.shiftTimingId,
        updated_at: new Date().toISOString(),
      });
    }

    const base = {
      success: true,
      dry_run: dryRun,
      examined: records.length,
      changed: updates.length,
      status_changed: Object.values(transitions).reduce((a, b) => a + b, 0),
      unresolvable,
      transitions,
      changes,
    };

    // Only a DRY RUN returns early. "Nothing to update" deliberately falls
    // through to the leave re-stamp below: a day whose punch verdict already
    // equals its stored status produces no update, and that is exactly the state
    // a leave day is left in after an earlier recompute overwrote its LEAVE
    // stamp with ABSENT. Returning here would make the repair unreachable in the
    // one case that needs it most.
    if (dryRun) {
      return NextResponse.json({
        ...base,
        message: updates.length === 0
          ? `${records.length} day(s) examined; all already agree with the current timings.`
          : `${updates.length} of ${records.length} day(s) would change.`,
      });
    }

    // ---- Write ---------------------------------------------------------------
    // Update by id, not upsert: an upsert would need every NOT NULL column
    // (employee_id, hr_organization_id, work_date, source) restated, and any
    // one omitted would be nulled out rather than left alone.
    let written = 0;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      const results = await Promise.all(
        chunk.map((u) => {
          const { id, ...patch } = u;
          return session.from('hr_attendance_records').update(patch).eq('id', id).select('id');
        }),
      );
      for (const { data, error } of results) {
        if (error) {
          console.error('[hr/attendance/recompute] update error:', error);
          return NextResponse.json(
            { ...base, error: 'Recompute write failed', message: error.message, written },
            { status: 500 },
          );
        }
        written += data?.length ?? 0;
      }
    }

    // ---- Re-apply approved leave stamps -------------------------------------
    // A recompute writes status_type_id straight from the punch verdict, which
    // knows nothing about approved leave — the same hazard the biometric import
    // had. Without this step every LEAVE / HALF_DAY day in range silently
    // reverts to ABSENT or PRESENT, and this route is exactly what an admin runs
    // after changing a shift timing, so the fix for one feature would break
    // another.
    //
    // Driven off `records`, not `updates`: a day whose punch verdict already
    // matches its stored status produces no update, but may still have lost its
    // leave stamp to an earlier recompute. Re-stamping the whole examined range
    // heals those too.
    let leaveRestamped = 0;
    const restampInstitutions = [
      ...new Set(
        (records as Array<Record<string, unknown>>)
          .map((r) => r.institution_id as string | null)
          .filter((v): v is string => !!v),
      ),
    ];
    for (const instId of restampInstitutions) {
      const { data: restamped, error: restampErr } = await session.rpc(
        'fn_restamp_leave_attendance',
        { p_institution_id: instId, p_from: from, p_to: to },
      );
      // Not fatal: the recompute that just landed is still correct for everyone
      // without approved leave. Surfaced in the response so a partial is visible
      // rather than assumed.
      if (restampErr) {
        console.error('[hr/attendance/recompute] leave re-stamp failed:', restampErr);
        continue;
      }
      leaveRestamped += (restamped as number | null) ?? 0;
    }

    return NextResponse.json({
      ...base,
      written,
      leave_restamped: leaveRestamped,
      message:
        `Recomputed ${written} day(s) of ${records.length} examined` +
        (leaveRestamped > 0
          ? `; ${leaveRestamped} day(s) re-stamped from approved leave.`
          : '.'),
    });
  } catch (error) {
    console.error('[hr/attendance/recompute] unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Recompute failed', message }, { status: 500 });
  }
}
