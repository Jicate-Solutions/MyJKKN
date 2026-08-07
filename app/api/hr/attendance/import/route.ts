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
import { evaluateDay, type AttendanceVerdict } from '@/lib/hr/biometric/evaluate-day';
import type { ResolvedShiftTiming } from '@/types/hr-shift-timings';
import type {
  BiometricAnomaly,
  BiometricAnomalyKind,
  BiometricFieldTotals,
  BiometricReconciliationRow,
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
    const { data: enrolled, error: staffErr } = await svc
      .from('staff')
      .select('id, staff_id, first_name, last_name, institution_id, biometric_id')
      .eq('biometric_institution_id', machine.id)
      .not('biometric_id', 'is', null)
      .limit(5000);
    if (staffErr) {
      console.error('[hr/attendance/import] staff lookup error:', staffErr);
      return NextResponse.json({ error: 'Staff lookup failed', message: staffErr.message }, { status: 500 });
    }

    interface StaffRow {
      id: string; staff_id: string | null; first_name: string | null;
      last_name: string | null; institution_id: string | null; biometric_id: string | null;
    }
    const staffByCode = new Map<string, StaffRow>();
    for (const s of (enrolled ?? []) as StaffRow[]) {
      const key = normBiometricCode(s.biometric_id);
      if (key && !staffByCode.has(key)) staffByCode.set(key, s);
    }

    const matched: Array<{ staff: StaffRow; emp: (typeof report.employees)[number] }> = [];
    const unmatched: Array<{ code: string; name: string }> = [];
    for (const emp of report.employees) {
      const key = normBiometricCode(emp.code);
      const s = key ? staffByCode.get(key) : undefined;
      if (s) matched.push({ staff: s, emp });
      else unmatched.push({ code: emp.code, name: emp.name });
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
    const missingStatus = Object.values(VERDICT_TO_CODE).filter((c) => !statusIdByCode.has(c));
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
        const verdict = evaluateDay({ inTime: day.inTime, outTime: day.outTime, timing });
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
          status_type_id: statusIdByCode.get(VERDICT_TO_CODE[verdict.verdict as Exclude<AttendanceVerdict, 'EXCEPTION'>]),
          in_at: day.inTime ? `${day.workDate}T${day.inTime}:00+05:30` : null,
          out_at: day.outTime ? `${day.workDate}T${day.outTime}:00+05:30` : null,
          source: 'biometric',
          day_calc: verdict.dayCalc,
          hours_worked: day.workMinutes === null ? null : Number((day.workMinutes / 60).toFixed(2)),
          overtime_minutes: day.overtimeMinutes,
          break_minutes: day.breakMinutes,
          device_status: day.deviceStatus || null,
          first_half_attended: verdict.firstHalfAttended,
          second_half_attended: verdict.secondHalfAttended,
          late_minutes: verdict.lateMinutes,
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
      total_day_cells: report.employees.reduce((n, e) => n + e.days.length, 0),
      counts,
      preview,
      preview_truncated: preview.length >= PREVIEW_LIMIT,
      parser_warnings: report.warnings,
      exceptions: exceptionList.slice(0, PREVIEW_LIMIT),
      exceptions_total: exceptionList.length,
      skipped_no_organization: skippedNoOrg,
      reconciliation,
      reconciled_employees: reconciliation.filter((r) => r.reconciled).length,
      anomalies: anomalies.slice(0, PREVIEW_LIMIT),
      anomalies_total: anomalies.length,
      field_totals: fieldTotals,
      written: 0,
      exceptions_written: 0,
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
        message: `Imported ${written} day-record(s) for ${matched.length} employee(s); ${exceptionsWritten} exception(s) raised.`,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[hr/attendance/import] unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Import failed', message }, { status: 500 });
  }
}
