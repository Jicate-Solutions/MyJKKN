/**
 * GET /api/internal-marks/attendance-insight
 *
 * Cross-references each student's MyJKKN attendance % against their COE internal
 * (CIA) marks for a session, and surfaces two teaching signals:
 *   • "struggling" — high attendance but low internal marks (shows up, scores low)
 *   • "anomaly"    — low attendance but high internal marks (scores well despite absence)
 *
 * Why this shape (and not a literal attendance reconciliation): COE stores no
 * attendance of its own (its `cia_marks.attendance_marks` is empty across every
 * row, and there is no COE attendance table). MyJKKN is the sole system of record
 * for attendance. So there is nothing to "reconcile" between two copies — instead
 * we put the two authoritative-but-separate numbers (MyJKKN attendance %, COE CIA
 * %) side by side for the same student and flag the notable mismatches.
 *
 * Attendance grain caveat: attendance % is OVERALL per student (present periods /
 * total periods across all their marked classes), not per-course — MyJKKN records
 * attendance per timetable-period with the student list in a JSONB, and the
 * period→course link is not reliably available. CIA % is per course. So each row
 * pairs a course's CIA % with the student's overall attendance %. This is stated
 * in the UI.
 *
 * Modes:
 *   • no `sessionCode`   → { sessions } for the picker.
 *   • with `sessionCode` → { summary, flagged } — flagged = struggling/anomaly rows.
 *
 * Scope: super-admins must pick an `institutionId` (the attendance rollup is
 * per-institution); everyone else is locked to their own.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  resolveInternalMarksAccess,
  resolveEffectiveInstitutionId,
} from '@/lib/utils/internal-marks/internal-marks-access';
import {
  isCoeDbConfigured,
  getCoeExaminationSessions,
  getCoeCiaStudentDetail,
  resolveCoeInstitutionByMyjkknId,
} from '@/lib/services/coe/coe-db-client';

// Thresholds for the two signals (documented in the UI).
const ATTEND_HIGH = 75; // "regular" attendance
const ATTEND_LOW = 75; // below this = low attendance
const CIA_LOW = 50; // failing-ish internal marks
const CIA_HIGH = 75; // strong internal marks

type Note = 'struggling' | 'anomaly';

interface InsightRow {
  student_id: string | null;
  student_name: string | null;
  register_no: string | null;
  program_code: string | null;
  course_code: string | null;
  course_name: string | null;
  attendance_pct: number;
  present: number;
  total: number;
  cia_pct: number;
  note: Note;
}

interface AttendanceRpcRow {
  student_id: string;
  present: number;
  total: number;
  pct: number | null;
}

export async function GET(request: NextRequest) {
  try {
    if (!isCoeDbConfigured()) {
      return NextResponse.json(
        { error: 'COE database is not configured on the server.' },
        { status: 503 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveInternalMarksAccess(user.id);
    if (!scope.isSuperAdmin && !scope.institutionId) {
      return NextResponse.json(
        { error: 'You do not have access to internal-marks data.' },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const institutionId = resolveEffectiveInstitutionId(
      scope,
      searchParams.get('institutionId'),
    );

    let coeInst: { coeId: string; institutionCode: string; name: string | null } | null =
      null;
    if (institutionId) {
      coeInst = await resolveCoeInstitutionByMyjkknId(institutionId);
      if (!coeInst) {
        return NextResponse.json(
          { error: 'This institution is not mapped in COE.' },
          { status: 404 },
        );
      }
    }

    const sessionCode = searchParams.get('sessionCode');

    // Picker mode.
    if (!sessionCode) {
      const sessions = await getCoeExaminationSessions(coeInst?.coeId);
      return NextResponse.json({ sessions, institution: coeInst?.name ?? null });
    }

    // Insight mode requires a concrete institution (attendance is rolled up per
    // institution, and the student join is within one institution).
    if (!institutionId || !coeInst) {
      return NextResponse.json(
        { error: 'Select an institution to compare attendance against internal marks.' },
        { status: 400 },
      );
    }

    // 1) COE CIA per student × course for the session (paginated read).
    // 2) MyJKKN attendance % per student for the institution (SECURITY DEFINER RPC).
    const [cia, attendanceRes] = await Promise.all([
      getCoeCiaStudentDetail(sessionCode, coeInst.institutionCode),
      supabase.rpc('fn_student_attendance_pct', { p_institution_id: institutionId }),
    ]);

    if (attendanceRes.error) {
      console.error('[attendance-insight] attendance RPC error:', attendanceRes.error);
      return NextResponse.json(
        { error: 'Failed to compute attendance percentages.' },
        { status: 500 },
      );
    }

    const attByStudent = new Map<string, AttendanceRpcRow>();
    for (const a of (attendanceRes.data ?? []) as AttendanceRpcRow[]) {
      attByStudent.set(a.student_id, a);
    }

    const flagged: InsightRow[] = [];
    const studentsWithBoth = new Set<string>();
    const ciaStudents = new Set<string>();
    let ciaStudentsWithoutAttendance = 0;
    const seenWithout = new Set<string>();

    for (const c of cia) {
      const sid = c.student_id;
      const cia_pct = c.internal_percentage;
      if (!sid || typeof cia_pct !== 'number') continue;
      ciaStudents.add(sid);

      const att = attByStudent.get(sid);
      if (!att || typeof att.pct !== 'number') {
        if (!seenWithout.has(sid)) {
          seenWithout.add(sid);
          ciaStudentsWithoutAttendance += 1;
        }
        continue;
      }
      studentsWithBoth.add(sid);

      const attendance_pct = att.pct;
      let note: Note | null = null;
      if (attendance_pct >= ATTEND_HIGH && cia_pct < CIA_LOW) note = 'struggling';
      else if (attendance_pct < ATTEND_LOW && cia_pct >= CIA_HIGH) note = 'anomaly';
      if (!note) continue;

      flagged.push({
        student_id: sid,
        student_name: c.student_name,
        register_no: c.stu_register_no,
        program_code: c.program_code,
        course_code: c.course_code,
        course_name: c.course_name,
        attendance_pct,
        present: att.present,
        total: att.total,
        cia_pct,
        note,
      });
    }

    // Struggling first (high attendance wasted), then anomalies; within each, by
    // widest gap between attendance and marks.
    flagged.sort((a, b) => {
      if (a.note !== b.note) return a.note === 'struggling' ? -1 : 1;
      const gapA = Math.abs(a.attendance_pct - a.cia_pct);
      const gapB = Math.abs(b.attendance_pct - b.cia_pct);
      return gapB - gapA;
    });

    const summary = {
      cia_students: ciaStudents.size,
      students_compared: studentsWithBoth.size,
      cia_students_without_attendance: ciaStudentsWithoutAttendance,
      struggling: flagged.filter((r) => r.note === 'struggling').length,
      anomaly: flagged.filter((r) => r.note === 'anomaly').length,
    };

    // The full flagged list can be large (a cohort whose marks are weakly tied to
    // attendance flags many rows). It is already sorted most-severe first (widest
    // attendance↔marks gap), so cap the returned rows to the top slice for a
    // scannable table; the summary counts above still report the true totals.
    const ROW_CAP = 300;
    const flagged_total = flagged.length;

    return NextResponse.json({
      sessionCode,
      institution: coeInst.name,
      thresholds: {
        attend_high: ATTEND_HIGH,
        attend_low: ATTEND_LOW,
        cia_low: CIA_LOW,
        cia_high: CIA_HIGH,
      },
      summary,
      flagged_total,
      flagged: flagged.slice(0, ROW_CAP),
    });
  } catch (error) {
    console.error('[internal-marks/attendance-insight] error:', error);
    return NextResponse.json(
      { error: 'Failed to load the attendance-vs-marks insight.' },
      { status: 500 },
    );
  }
}
