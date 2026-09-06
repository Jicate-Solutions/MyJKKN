export const dynamic = 'force-dynamic';

// ============================================================================
// POST /api/hr/attendance/import
// ----------------------------------------------------------------------------
// Biometric monthly-report importer.
// Plan: docs/superpowers/plans/2026-08-06-biometric-attendance-ingestion.md
//
// Rewritten 2026-08-06 for the machine's real export shape. Previously this
// route expected one row per punch and wrote faculty_attendance_days; the real
// device produces a PIVOTED MATRIX (10 rows per employee, days across columns)
// in legacy BIFF .xls, which the old parser read as zero punches.
//
// PIPELINE
//   parse (SheetJS, .xls + .xlsx)
//     -> resolve the MACHINE's institution from Dept. Name / CompName
//     -> match Empcode to staff via (biometric_institution_id, normalised code)
//     -> resolve every (staff, date) shift timing in ONE bulk RPC
//     -> evaluate each day with the shared pure evaluator
//     -> dryRun ? report : write hr_attendance_records + hr_attendance_exceptions
//
// TWO MODES, ONE CODE PATH: everything above the write is identical for
// dryRun=true and dryRun=false, so the preview cannot disagree with the commit.
//
// IDENTITY: Empcode is a per-machine enrolment number. NONE of the 48 codes in
// the real July export matches staff.staff_id, and each machine numbers from 1,
// so a code only means anything paired with the machine that issued it. Names
// are display-only and never matched — they carry honorifics the machine drops.
//
// TENANCY: the file header identifies the MACHINE, not the employee. In the
// real export 13 of 36 identified people on the Main Office machine belong to
// other institutions, so each record's institution_id/hr_organization_id comes
// from that staff member's own row, never from the file.
//
// CLIENTS: reads use the service-role client so a restrictive staff policy
// cannot silently shrink the match set (a partial match would mis-attribute,
// not just under-report). Writes use the SESSION client so RLS genuinely
// enforces hr.attendance.override + role_has_institution_access.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { parseMonthlyReportFile } from '@/lib/hr/biometric/parse-monthly-report';
import { resolveInstitutionFromReport } from '@/lib/hr/biometric/resolve-institution';
import { normBiometricCode } from '@/lib/hr/biometric/normalize-code';
import {
  fetchApprovedPermissions, permissionKey, type PermissionsByStaffDay,
} from '@/lib/hr/biometric/fetch-permissions';
import { evaluateDay, type AttendanceVerdict } from '@/lib/hr/biometric/evaluate-day';
import {
  applyHolidayToStatusCode,
  fetchHolidayKeys,
  holidayKey,
} from '@/lib/hr/attendance/holiday-dates';
import type { ResolvedShiftTiming } from '@/types/hr-shift-timings';
import type {
  BiometricAnomaly,
  BiometricAnomalyKind,
  BiometricFieldTotals,
  BiometricReconciliationRow,
  BiometricShiftCoverageRow,
} from '@/types/hr-biometric';

const PREVIEW_LIMIT = 500;
const MAX_BYTES = 10 * 1024 * 1024;
/** Anomalies are per-day and a bad month can produce thousands; cap what we ship. */
const ANOMALY_LIMIT = 2000;

/** 'HH:MM' -> minutes since midnight. */
function toMinutes(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Wall-clock minutes between the two punches, or null if either is missing. */
function spanMinutes(inTime: string | null, outTime: string | null): number | null {
  const a = toMinutes(inTime);
  const b = toMinutes(outTime);
  if (a === null || b === null || b < a) return null;
  return b - a;
}

function fmt(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function pushAnomaly(
  list: BiometricAnomaly[],
  emp: { code: string; name: string },
  workDate: string,
  kind: BiometricAnomalyKind,
  detail: string,
): void {
  if (list.length >= ANOMALY_LIMIT) return;
  list.push({ code: emp.code, name: emp.name, work_date: workDate, kind, detail });
}

interface PreviewRow {
  code: string;
  device_name: string;
  staff_name: string | null;
  staff_code: string | null;
  work_date: string;
  weekday: string;
  in_time: string | null;
  out_time: string | null;
  work_minutes: number | null;
  overtime_minutes: number | null;
  device_status: string;
  shift_window: string | null;
  verdict: AttendanceVerdict;
  day_calc: string | null;
  late_minutes: number | null;
  exception_reason: string | null;
}

export async function POST(request: NextRequest) {
  try {
    // ---- Auth ---------------------------------------------------------------
    const session = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await session.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized', message: 'Sign in to import.' }, { status: 401 });
    }

    const [{ data: isAdmin }, { data: canOverride }] = await Promise.all([
      session.rpc('is_admin'),
      session.rpc('user_has_permission', { permission_name: 'hr.attendance.override' }),
    ]);
    if (isAdmin !== true && canOverride !== true) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You need Override Attendance Records to import biometric data.' },
        { status: 403 },
      );
    }

    // ---- File ---------------------------------------------------------------
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const dryRun = String(formData.get('dryRun') ?? '') === 'true';

    if (!file) {
      return NextResponse.json({ error: 'No file provided', message: 'Upload the biometric export.' }, { status: 400 });
    }
    if (!/\.(xls|xlsx)$/i.test(file.name)) {
      return NextResponse.json(
        { error: 'Invalid file type', message: 'Upload the machine export as .xls or .xlsx.' },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large', message: 'File exceeds the 10 MB limit.' }, { status: 400 });
    }

    const report = parseMonthlyReportFile(new Uint8Array(await file.arrayBuffer()));

    if (report.employees.length === 0) {
      return NextResponse.json(
        {
          error: 'No employees found',
          message:
            'No employee blocks were readable. Expected the machine\'s Monthly Performance Report ' +
            '(a "Dept. Name" row followed by an "Empcode" row for each person). ' +
            (report.warnings[0] ?? ''),
        },
        { status: 400 },
      );
    }
    if (report.year === 0) {
      return NextResponse.json(
        { error: 'Unreadable report month', message: `Could not read the Report Month ("${report.monthLabel}").` },
        { status: 400 },
      );
    }

    const svc = createServiceRoleClient();

    // ---- Which machine? -----------------------------------------------------
    const resolution = await resolveInstitutionFromReport(svc, report.institutionCode, report.institutionName);
    if (!resolution.institution) {
      return NextResponse.json(
        { error: 'Institution not identified', message: resolution.error, candidates: resolution.candidates },
        { status: 400 },
      );
    }
    const machine = resolution.institution;

    // ---- Empcode -> staff ---------------------------------------------------
    // v_hr_staff, not staff: a category with included_in_hr = false takes no
    // part in HR, and the import is what CREATES attendance — leaving it on the
    // base table would silently re-add excluded staff every month, which is the
    // one thing that would make the flag look broken. Same columns (the view is
    // SELECT s.*), and no embed here, so the swap is a table-name change only.
    //
    // ACTIVE STAFF ONLY (2026-09-02). Until now the resolution ignored
    // employment status entirely, so a relieved employee whose enrolment code
    // was never cleared from the device kept generating attendance for as long
    // as they kept punching -- 107 relieved staff still hold a code, and 26 of
    // them already had records. Their days flowed into the period summary and
    // out the other side as payable days on the Salary Register.
    //
    // A SKIP, NEVER A DELETE. The upsert below is keyed on
    // (employee_id, work_date), so an inactive person simply produces no row;
    // records already imported while they were active are left exactly as they
    // are. That matters because `staff` carries no relieving date -- only the
    // is_active boolean -- so re-importing an old month cannot tell "left after
    // this date" from "left before it". Not writing is safe; deleting would not
    // have been.
    //
    // Their codes fall through to the unmatched list, which the report shows, so
    // a skipped person is visible rather than silently missing.
    const { data: enrolled, error: staffErr } = await svc
      .from('v_hr_staff')
      .select('id, staff_id, first_name, last_name, institution_id, biometric_id, category_id')
      .eq('biometric_institution_id', machine.id)
      .eq('is_active', true)
      .not('biometric_id', 'is', null)
      .limit(5000);
    if (staffErr) {
      console.error('[hr/attendance/import] staff lookup error:', staffErr);
      return NextResponse.json({ error: 'Staff lookup failed', message: staffErr.message }, { status: 500 });
    }

    interface StaffRow {
      id: string; staff_id: string | null; first_name: string | null;
      last_name: string | null; institution_id: string | null; biometric_id: string | null;
      category_id: string | null;
    }
    const staffByCode = new Map<string, StaffRow>();
    for (const s of (enrolled ?? []) as StaffRow[]) {
      const key = normBiometricCode(s.biometric_id);
      if (key && !staffByCode.has(key)) staffByCode.set(key, s);
    }

    // The same enrolment set again, but RELIEVED. Only used to tell "this code
    // belongs to someone who left" apart from "nobody owns this code" -- two very
    // different things for whoever reads the report, and indistinguishable if
    // the skipped rows just vanished into unmatched_codes.
    const { data: relievedEnrolled } = await svc
      .from('staff')
      .select('staff_id, first_name, last_name, biometric_id')
      .eq('biometric_institution_id', machine.id)
      .eq('is_active', false)
      .not('biometric_id', 'is', null)
      .limit(5000);

    const relievedByCode = new Map<string, string>();
    for (const s of (relievedEnrolled ?? []) as Array<{
      staff_id: string | null; first_name: string | null;
      last_name: string | null; biometric_id: string | null;
    }>) {
      const key = normBiometricCode(s.biometric_id);
      if (key && !relievedByCode.has(key)) {
        relievedByCode.set(
          key,
          [[s.first_name, s.last_name].filter(Boolean).join(' ').trim(), s.staff_id]
            .filter(Boolean).join(' · ') || 'unnamed',
        );
      }
    }

    const matched: Array<{ staff: StaffRow; emp: (typeof report.employees)[number] }> = [];
    const unmatched: Array<{ code: string; name: string }> = [];
    const relievedSkipped: Array<{ code: string; name: string; staff: string }> = [];
    for (const emp of report.employees) {
      const key = normBiometricCode(emp.code);
      const s = key ? staffByCode.get(key) : undefined;
      if (s) {
        matched.push({ staff: s, emp });
      } else if (key && relievedByCode.has(key)) {
        relievedSkipped.push({ code: emp.code, name: emp.name, staff: relievedByCode.get(key)! });
      } else {
        unmatched.push({ code: emp.code, name: emp.name });
      }
    }

    // ---- Shift timings for every (staff, date), in one call -----------------
    const allDates = report.employees.flatMap((e) => e.days.map((d) => d.workDate)).filter(Boolean).sort();
    const dateFrom = allDates[0] ?? null;
    const dateTo = allDates[allDates.length - 1] ?? null;

    const timingByKey = new Map<string, ResolvedShiftTiming>();
    if (matched.length > 0 && dateFrom && dateTo) {
      const { data: timings, error: timingErr } = await session.rpc('fn_resolve_shift_timings_bulk', {
        p_staff_ids: matched.map((m) => m.staff.id),
        p_from: dateFrom,
        p_to: dateTo,
      });
      if (timingErr) {
        console.error('[hr/attendance/import] timing resolve error:', timingErr);
        return NextResponse.json({ error: 'Shift timing lookup failed', message: timingErr.message }, { status: 500 });
      }
      for (const t of (timings ?? []) as Array<Record<string, unknown>>) {
        if (!t.timing_id) continue;
        timingByKey.set(`${t.staff_id}|${t.work_date}`, {
          timing_id: t.timing_id as string,
          institution_id: '',
          staff_scope: t.matched_by as ResolvedShiftTiming['staff_scope'],
          employment_category_id: null,
          // Placeholder, like institution_id above and day_of_week below:
          // fn_resolve_shift_timings_bulk returns the window only, and
          // evaluateDay reads none of the three. The gender was already applied
          // inside the resolver.
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

    // Employment categories, so the coverage table can name WHICH category
    // override matched rather than printing a uuid.
    const { data: cats } = await svc
      .from('employment_categories')
      .select('id, category_name, is_teaching')
      .limit(500);
    const catById = new Map<string, { name: string; isTeaching: boolean | null }>();
    for (const c of (cats ?? []) as Array<{ id: string; category_name: string; is_teaching: boolean | null }>) {
      catById.set(c.id, { name: c.category_name, isTeaching: c.is_teaching });
    }

    // Approved permissions for the same window. evaluateDay reinstates a half
    // whose missing minutes one of these fully covers, so the importer must see
    // them or a re-import would silently revoke every excusal. Read with the
    // service-role client, like the staff and institution lookups above: this
    // spans every employee in the file, not just the caller's own.
    const permissionsByDay = (matched.length > 0 && dateFrom && dateTo)
      ? await fetchApprovedPermissions(svc, matched.map((m) => m.staff.id), dateFrom, dateTo)
      : (new Map() as PermissionsByStaffDay);

    // hr_attendance_records.hr_organization_id is NOT NULL; institutions map 1:1.
    const { data: orgs, error: orgErr } = await svc
      .from('hr_organizations')
      .select('id, institution_id')
      .limit(500);
    if (orgErr) {
      console.error('[hr/attendance/import] hr_organizations lookup error:', orgErr);
      return NextResponse.json({ error: 'Organization lookup failed', message: orgErr.message }, { status: 500 });
    }
    const orgByInstitution = new Map<string, string>();
    for (const o of (orgs ?? []) as Array<{ id: string; institution_id: string | null }>) {
      if (o.institution_id) orgByInstitution.set(o.institution_id, o.id);
    }

    const { data: statusTypes, error: statusErr } = await svc
      .from('hr_attendance_status_types')
      .select('id, code')
      .is('institution_id', null);
    if (statusErr) {
      console.error('[hr/attendance/import] status types lookup error:', statusErr);
      return NextResponse.json({ error: 'Status type lookup failed', message: statusErr.message }, { status: 500 });
    }
    const statusIdByCode = new Map<string, string>();
    for (const s of (statusTypes ?? []) as Array<{ id: string; code: string }>) {
      statusIdByCode.set(s.code, s.id);
    }

    const VERDICT_TO_CODE: Record<Exclude<AttendanceVerdict, 'EXCEPTION'>, string> = {
      PRESENT: 'PRESENT',
      HALF_DAY: 'HALF_DAY',
      ABSENT: 'ABSENT',
      WEEKLY_OFF: 'WEEKLY_OFF',
    };
    // Not a verdict evaluateDay can produce — it is substituted below for a
    // declared holiday — but the id has to exist before the loop runs.
    const HOLIDAY_CODE = 'HOLIDAY';
    /**
     * DECLARED HOLIDAYS FOR THIS IMPORT'S RANGE, loaded once.
     *
     * Without this the importer writes ABSENT for every staff member on a
     * festival, and ABSENT carries affects_lop = true — so the Salary Register
     * deducts a day's pay for a paid holiday. A trigger corrects it afterwards,
     * but only afterwards: anything reading in between sees absences that were
     * never real, and until 2026-09-02 no trigger watched the calendar at all.
     *
     * Institutions come from the matched staff, so an import that touches one
     * college does not resolve holidays for the whole group.
     */
    const holidayKeys =
      dateFrom && dateTo
        ? await fetchHolidayKeys(
            svc,
            matched.map((m) => m.staff.institution_id).filter(Boolean) as string[],
            dateFrom,
            dateTo,
          )
        : new Set<string>();

    const missingStatus = [...Object.values(VERDICT_TO_CODE), HOLIDAY_CODE]
      .filter((c) => !statusIdByCode.has(c));
    if (missingStatus.length > 0) {
      return NextResponse.json(
        { error: 'Attendance status types missing', message: `No system status row for: ${missingStatus.join(', ')}.` },
        { status: 500 },
      );
    }

    // ---- Evaluate -----------------------------------------------------------
    const counts: Record<AttendanceVerdict, number> = {
      PRESENT: 0, HALF_DAY: 0, ABSENT: 0, WEEKLY_OFF: 0, EXCEPTION: 0,
    };
    const preview: PreviewRow[] = [];
    const records: Array<Record<string, unknown>> = [];
    const exceptions: Array<Record<string, unknown>> = [];
    const exceptionList: Array<{ code: string; name: string; work_date: string; reason: string }> = [];
    let skippedNoOrg = 0;

    // ---- Field-level validation of the machine's own columns ---------------
    // The export carries its own per-employee totals, so it can grade our
    // arithmetic: if our verdicts do not add back up to the machine's Present
    // and Absent counts, one of the two is wrong and we say so before writing.
    const reconciliation: BiometricReconciliationRow[] = [];
    const shiftCoverage: BiometricShiftCoverageRow[] = [];
    const anomalies: BiometricAnomaly[] = [];
    const fieldTotals: BiometricFieldTotals = {
      late_days: 0, half_days: 0, ot_days: 0, ot_minutes: 0,
      break_days: 0, work_minutes: 0,
      status_disagreements: 0, expected_weekly_off_flips: 0,
    };

    for (const { staff, emp } of matched) {
      const institutionId = staff.institution_id;
      const orgId = institutionId ? orgByInstitution.get(institutionId) : undefined;
      const staffName = [staff.first_name, staff.last_name].filter(Boolean).join(' ').trim() || null;

      const mine = { PRESENT: 0, HALF_DAY: 0, ABSENT: 0, WEEKLY_OFF: 0, EXCEPTION: 0 };
      let myWorkMinutes = 0;

      for (const day of emp.days) {
        if (!day.workDate) continue;
        const timing = timingByKey.get(`${staff.id}|${day.workDate}`) ?? null;
        const verdict = evaluateDay({
          inTime: day.inTime,
          outTime: day.outTime,
          timing,
          permissions: permissionsByDay.get(permissionKey(staff.id, day.workDate)) ?? [],
        });
        counts[verdict.verdict] += 1;
        mine[verdict.verdict] += 1;
        if (day.workMinutes) myWorkMinutes += day.workMinutes;

        // --- new-field checks ------------------------------------------------
        const span = spanMinutes(day.inTime, day.outTime);
        if (day.workMinutes !== null && span !== null && day.workMinutes > span + 1) {
          pushAnomaly(anomalies, emp, day.workDate, 'work_exceeds_span',
            `Machine reports ${fmt(day.workMinutes)} worked but the punches are only ${fmt(span)} apart (${day.inTime}–${day.outTime}).`);
        }
        if (span !== null && (day.workMinutes ?? 0) === 0) {
          pushAnomaly(anomalies, emp, day.workDate, 'work_zero_with_both_punches',
            `Both punches present (${day.inTime}–${day.outTime}) but the machine reports no worked time.`);
        }
        if ((day.overtimeMinutes ?? 0) > 0 && (day.workMinutes ?? 0) === 0) {
          pushAnomaly(anomalies, emp, day.workDate, 'ot_without_work',
            `Machine reports ${fmt(day.overtimeMinutes!)} overtime with zero worked time.`);
        }
        if ((day.breakMinutes ?? 0) > 0) {
          fieldTotals.break_days += 1;
          pushAnomaly(anomalies, emp, day.workDate, 'break_recorded',
            `Machine reports a ${fmt(day.breakMinutes!)} break — lunch punches appear to be captured now.`);
        }

        if (day.workMinutes) fieldTotals.work_minutes += day.workMinutes;
        if (day.overtimeMinutes) {
          fieldTotals.ot_days += 1;
          fieldTotals.ot_minutes += day.overtimeMinutes;
        }
        if (verdict.lateMinutes && verdict.lateMinutes > 0) fieldTotals.late_days += 1;
        if (verdict.verdict === 'HALF_DAY') fieldTotals.half_days += 1;

        // A machine 'A' that we call WEEKLY_OFF is the expected, designed flip —
        // the machines have no weekly off configured. Count it, don't cry wolf.
        const ds = (day.deviceStatus || '').toUpperCase();
        if (ds === 'A' && verdict.verdict === 'WEEKLY_OFF') {
          fieldTotals.expected_weekly_off_flips += 1;
        } else if (
          (ds === 'P' && (verdict.verdict === 'ABSENT' || verdict.verdict === 'WEEKLY_OFF')) ||
          (ds === 'A' && (verdict.verdict === 'PRESENT' || verdict.verdict === 'HALF_DAY'))
        ) {
          fieldTotals.status_disagreements += 1;
          pushAnomaly(anomalies, emp, day.workDate, 'status_disagreement',
            `Machine says "${ds}", MyJKKN says ${verdict.verdict} (in ${day.inTime ?? '—'}, out ${day.outTime ?? '—'}).`);
        }

        if (preview.length < PREVIEW_LIMIT) {
          preview.push({
            code: emp.code,
            device_name: emp.name,
            staff_name: staffName,
            staff_code: staff.staff_id,
            work_date: day.workDate,
            weekday: day.weekday,
            in_time: day.inTime,
            out_time: day.outTime,
            work_minutes: day.workMinutes,
            overtime_minutes: day.overtimeMinutes,
            device_status: day.deviceStatus,
            // The rule this row was judged against, so the preview can be read
            // without cross-referencing the shift-timings admin.
            shift_window: timing && timing.first_half_start && timing.second_half_end
              ? `${timing.first_half_start.slice(0, 5)}–${timing.second_half_end.slice(0, 5)}`
                + (timing.grace_minutes ? ` +${timing.grace_minutes}m` : '')
              : null,
            verdict: verdict.verdict,
            day_calc: verdict.dayCalc,
            late_minutes: verdict.lateMinutes,
            exception_reason: verdict.exceptionReason,
          });
        }

        if (verdict.verdict === 'EXCEPTION') {
          exceptionList.push({
            code: emp.code, name: emp.name, work_date: day.workDate,
            reason: verdict.exceptionReason ?? 'Could not be evaluated.',
          });
          exceptions.push({
            employee_id: staff.id,
            hr_organization_id: orgId ?? null,
            institution_id: institutionId,
            exception_date: day.workDate,
            exception_type: 'biometric_unresolved',
            raw_payload: {
              reason: verdict.exceptionReason,
              in: day.inTime, out: day.outTime,
              device_status: day.deviceStatus,
              biometric_code: emp.code,
              machine_institution_id: machine.id,
            },
            resolution_status: 'open',
          });
          continue;
        }

        // hr_organization_id is NOT NULL — never write a partial row.
        if (!orgId || !institutionId) {
          skippedNoOrg += 1;
          continue;
        }

        records.push({
          employee_id: staff.id,
          hr_organization_id: orgId,
          institution_id: institutionId,
          work_date: day.workDate,
          // A declared holiday turns a no-show into HOLIDAY, which
          // fn_hr_compute_attendance_period_summary subtracts from working days
          // so it can never be LOP. PRESENT and HALF_DAY pass through untouched:
          // a punch is evidence of work.
          status_type_id: statusIdByCode.get(
            applyHolidayToStatusCode(
              VERDICT_TO_CODE[verdict.verdict as Exclude<AttendanceVerdict, 'EXCEPTION'>],
              holidayKeys.has(holidayKey(institutionId, day.workDate)),
            ),
          ),
          in_at: day.inTime ? `${day.workDate}T${day.inTime}:00+05:30` : null,
          out_at: day.outTime ? `${day.workDate}T${day.outTime}:00+05:30` : null,
          source: 'biometric',
          day_calc: verdict.dayCalc,
          hours_worked: day.workMinutes === null ? null : Number((day.workMinutes / 60).toFixed(2)),
          overtime_minutes: day.overtimeMinutes,
          break_minutes: day.breakMinutes,
          device_status: day.deviceStatus || null,
          // A decided verdict that still carries a reason is a lone-punch
          // absence. Keeping it here is what separates "forgot to punch out"
          // from "did not come in" once the day is just an ABSENT row.
          notes: verdict.exceptionReason,
          first_half_attended: verdict.firstHalfAttended,
          second_half_attended: verdict.secondHalfAttended,
          late_minutes: verdict.lateMinutes,
          excused_minutes: verdict.excusedMinutes,
          excused_by_application_ids: verdict.excusedBy.length > 0 ? verdict.excusedBy : null,
          shift_timing_id: verdict.shiftTimingId,
          biometric_institution_id: machine.id,
          biometric_code: emp.code,
          updated_at: new Date().toISOString(),
        });
      }

      // The machine counts any day with a punch as P, and everything else — including
      // every Sunday — as A. So its P should equal our present + half + unjudgeable,
      // and its A should equal our absent + weekly off.
      const machineP = emp.summary.present;
      const machineA = emp.summary.absent;
      const reconciled =
        (machineP === null || machineP === mine.PRESENT + mine.HALF_DAY + mine.EXCEPTION) &&
        (machineA === null || machineA === mine.ABSENT + mine.WEEKLY_OFF);

      // Which timing rule actually applied to this person, and where it was
      // missing. Collected here rather than re-resolved later: timingByKey is
      // already the exact map the verdicts were computed from.
      {
        const scopes = new Set<string>();
        let daysTotal = 0;
        let daysMissing = 0;
        let win: string | null = null;
        let grace: number | null = null;
        for (const day of emp.days) {
          if (!day.workDate) continue;
          daysTotal += 1;
          const t = timingByKey.get(`${staff.id}|${day.workDate}`);
          if (!t) { daysMissing += 1; continue; }
          // second_saturday_holiday is an override ON a scope, not a scope.
          if (t.matched_by && t.matched_by !== 'second_saturday_holiday') scopes.add(t.matched_by);
          if (!win && t.first_half_start && t.second_half_end) {
            win = `${t.first_half_start.slice(0, 5)}–${t.second_half_end.slice(0, 5)}`;
            grace = t.grace_minutes ?? 0;
          }
        }
        const cat = staff.category_id ? catById.get(staff.category_id) : undefined;
        shiftCoverage.push({
          code: emp.code,
          staff_name: staffName,
          staff_code: staff.staff_id,
          category_name: cat?.name ?? null,
          is_teaching: cat?.isTeaching ?? null,
          matched_by: scopes.size > 0 ? [...scopes][0] : null,
          mixed: scopes.size > 1,
          window: win,
          grace_minutes: grace,
          days_total: daysTotal,
          days_without_timing: daysMissing,
        });
      }

      reconciliation.push({
        code: emp.code,
        name: emp.name,
        staff_name: staffName,
        machine_present: machineP,
        machine_absent: machineA,
        machine_work_minutes: emp.summary.totalWorkMinutes,
        our_present: mine.PRESENT,
        our_half_day: mine.HALF_DAY,
        our_absent: mine.ABSENT,
        our_weekly_off: mine.WEEKLY_OFF,
        our_exception: mine.EXCEPTION,
        our_work_minutes: myWorkMinutes,
        reconciled,
      });
    }


    /**
     * DAYS THIS IMPORT MARKED AS A PENALTY THAT SOMEBODY HAS ALREADY CLAIMED.
     *
     * Attendance restamps only on APPROVAL -- status feeds payable_days and the
     * Salary Register -- so an ABSENT or HALF_DAY with an undecided request
     * behind it is correct, and was also indistinguishable from an unexplained
     * one. This REPORTS the overlap; it changes nothing that gets written.
     *
     * One query over the import's own range, matched in memory against the rows
     * being written -- not a lookup per row.
     */
    const pendingOnMarkedDays: {
      count: number;
      staff: number;
      sample: Array<{ staff_name: string; work_date: string; request: string; category: string }>;
    } = { count: 0, staff: 0, sample: [] };

    if (dateFrom && dateTo && matched.length > 0) {
      const penaltyIds = new Set(
        ['ABSENT', 'HALF_DAY'].map((c) => statusIdByCode.get(c)).filter(Boolean) as string[],
      );
      const marked = new Set(
        records
          .filter((r) => penaltyIds.has(r.status_type_id as string))
          .map((r) => `${r.employee_id as string}|${r.work_date as string}`),
      );

      if (marked.size > 0) {
        const { data: pendingRows } = await svc
          .from('hr_leave_applications')
          .select('employee_id, start_date, end_date, hr_leave_types:leave_type_id ( leave_type_name, request_category )')
          .in('employee_id', matched.map((m) => m.staff.id))
          .in('status', ['pending', 'escalated'])
          .lte('start_date', dateTo)
          .gte('end_date', dateFrom)
          .limit(5000);

        const nameById = new Map(
          matched.map((m) => [
            m.staff.id,
            [m.staff.first_name, m.staff.last_name].filter(Boolean).join(' ').trim() || m.emp.name,
          ]),
        );
        const seenStaff = new Set<string>();

        for (const row of (pendingRows ?? []) as Array<Record<string, unknown>>) {
          const emb = row.hr_leave_types as
            | { leave_type_name?: string; request_category?: string }
            | Array<{ leave_type_name?: string; request_category?: string }>
            | null;
          const lt = Array.isArray(emb) ? emb[0] : emb;
          const empId = row.employee_id as string;

          // Expand the request across its days and keep only those this import
          // actually penalised.
          for (
            let d = new Date(`${row.start_date as string}T00:00:00`);
            d <= new Date(`${row.end_date as string}T00:00:00`);
            d.setDate(d.getDate() + 1)
          ) {
            const key = `${empId}|${d.toISOString().slice(0, 10)}`;
            if (!marked.has(key)) continue;
            pendingOnMarkedDays.count += 1;
            seenStaff.add(empId);
            if (pendingOnMarkedDays.sample.length < PREVIEW_LIMIT) {
              pendingOnMarkedDays.sample.push({
                staff_name: nameById.get(empId) ?? 'unknown',
                work_date: d.toISOString().slice(0, 10),
                request: lt?.leave_type_name ?? 'Time off',
                category: lt?.request_category ?? 'leave',
              });
            }
          }
        }
        pendingOnMarkedDays.staff = seenStaff.size;
      }
    }
    const base = {
      success: true,
      dry_run: dryRun,
      institution: { id: machine.id, name: machine.name, code: machine.counselling_code, matched_by: resolution.matchedBy },
      month_label: report.monthLabel,
      date_from: dateFrom,
      date_to: dateTo,
      employees_in_file: report.employees.length,
      matched_employees: matched.length,
      unmatched_codes: unmatched,
      relieved_skipped: relievedSkipped,
      pending_requests_on_marked_days: pendingOnMarkedDays,
      total_day_cells: report.employees.reduce((n, e) => n + e.days.length, 0),
      counts,
      preview,
      preview_truncated: preview.length >= PREVIEW_LIMIT,
      parser_warnings: report.warnings,
      exceptions: exceptionList.slice(0, PREVIEW_LIMIT),
      exceptions_total: exceptionList.length,
      skipped_no_organization: skippedNoOrg,
      shift_coverage: shiftCoverage,
      reconciliation,
      reconciled_employees: reconciliation.filter((r) => r.reconciled).length,
      anomalies: anomalies.slice(0, PREVIEW_LIMIT),
      anomalies_total: anomalies.length,
      field_totals: fieldTotals,
      written: 0,
      exceptions_written: 0,
      leave_restamped: 0,
    };

    if (dryRun) {
      return NextResponse.json(
        { ...base, message: `${records.length} day-record(s) ready for ${matched.length} employee(s).` },
        { status: 200 },
      );
    }

    // ---- Commit (session client -> RLS enforces) ----------------------------
    let written = 0;
    for (let i = 0; i < records.length; i += 500) {
      const chunk = records.slice(i, i + 500);
      const { data: up, error: upErr } = await session
        .from('hr_attendance_records')
        .upsert(chunk, { onConflict: 'employee_id,work_date' })
        .select('id');
      if (upErr) {
        console.error('[hr/attendance/import] upsert error:', upErr);
        return NextResponse.json(
          { error: 'Import write failed', message: upErr.message, written },
          { status: 500 },
        );
      }
      written += up?.length ?? chunk.length;
    }

    // ---- Re-apply approved leave stamps -------------------------------------
    // The upsert above wrote status_type_id straight from the biometric verdict,
    // which knows nothing about approved leave. Without this step the import
    // ERASES every LEAVE / HALF_DAY stamp in its range, and any leave approved
    // before the upload never lands at all — fn_recompute_attendance_on_leave_-
    // approval is a bare UPDATE, so with no row for the day it matched nothing
    // and the approval was lost silently.
    //
    // Running it here makes upload order stop mattering: approve-then-import and
    // import-then-approve both end with the day stamped. Short Time Off needs
    // nothing here — evaluateDay already consumed approved permissions above,
    // and recomputeForShortTimeOff covers the other direction.
    //
    // PER INSTITUTION, not once for the file's own: one machine carries staff
    // from several institutions (13 of 36 identified people on the Main Office
    // machine belong elsewhere), and the function is institution-scoped.
    let leaveRestamped = 0;
    const restampInstitutions = [
      ...new Set(records.map((r) => r.institution_id as string).filter(Boolean)),
    ];
    if (dateFrom && dateTo) {
      for (const instId of restampInstitutions) {
        const { data: restamped, error: restampErr } = await session.rpc(
          'fn_restamp_leave_attendance',
          { p_institution_id: instId, p_from: dateFrom, p_to: dateTo },
        );
        // Not fatal: the attendance that just imported is still correct for
        // everyone without approved leave, and losing it to a re-stamp failure
        // would be the worse outcome. Surfaced in the response so a silent
        // partial is visible rather than assumed.
        if (restampErr) {
          console.error('[hr/attendance/import] leave re-stamp failed:', restampErr);
          continue;
        }
        leaveRestamped += (restamped as number | null) ?? 0;
      }
    }

    let exceptionsWritten = 0;
    for (let i = 0; i < exceptions.length; i += 500) {
      const chunk = exceptions.slice(i, i + 500);
      const { data: ex, error: exErr } = await session
        .from('hr_attendance_exceptions')
        .insert(chunk)
        .select('id');
      // An exception row failing must not lose the attendance that did import.
      if (exErr) {
        console.error('[hr/attendance/import] exception insert error:', exErr);
        break;
      }
      exceptionsWritten += ex?.length ?? chunk.length;
    }

    return NextResponse.json(
      {
        ...base,
        written,
        exceptions_written: exceptionsWritten,
        leave_restamped: leaveRestamped,
        message:
          `Imported ${written} day-record(s) for ${matched.length} employee(s); ` +
          `${exceptionsWritten} exception(s) raised` +
          (leaveRestamped > 0
            ? `; ${leaveRestamped} day(s) re-stamped from approved leave.`
            : '.'),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[hr/attendance/import] unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Import failed', message }, { status: 500 });
  }
}
