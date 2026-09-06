/**
 * GET /api/internal-marks/attendance-insight
 *
 * Live internal-assessment monitoring for the CURRENT term, with two lists shown
 * side by side (Director directive 2026-07-05: "we want IA marks entered live
 * through the semester, not dumped at the end — that's why we monitor"):
 *
 *   1. "Owes marks"  — students who have attendance but NO internal marks entered
 *                      yet for the term. This is the live-entry chase list.
 *   2. "Attendance vs marks" — for students who DO have marks: flag "struggling"
 *                      (regular attendance, low marks) and "anomaly" (low
 *                      attendance, high marks). 0%-attendance rows are split into
 *                      a separate "check data" bucket (usually missing data, not
 *                      a real anomaly).
 *
 * Term selection: auto-detected (COE has no reliable current flag) as the
 * ongoing-or-next exam term; a super-admin may override via ?sessionCode= (peek).
 * The detected term + reason are returned so the EAO can confirm the guess.
 *
 * Split colleges (Self/Aided) are merged: attendance totals across ALL MyJKKN ids
 * the COE institution maps to, via fn_student_attendance_pct(uuid[]) which
 * internally filters to the ids the caller may access.
 *
 * Thresholds are per-institution config rows (internal_marks_insight_config),
 * falling back to platform defaults.
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
  getCoeCurrentTerm,
  getCoeCiaStudentDetail,
  resolveCoeInstitutionByMyjkknId,
} from '@/lib/services/coe/coe-db-client';

const DEFAULTS = { attendance: 75, anomaly_cia: 75, struggling_cia: 50 };
const ROW_CAP = 300;

type Note = 'struggling' | 'anomaly';

interface FlaggedRow {
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

interface CheckDataRow {
  student_id: string | null;
  student_name: string | null;
  register_no: string | null;
  course_code: string | null;
  course_name: string | null;
  cia_pct: number;
  total: number;
}

interface OwesRow {
  student_id: string;
  student_name: string | null;
  register_no: string | null;
  attendance_pct: number;
  present: number;
  total: number;
}

interface AttendanceRpcRow {
  student_id: string;
  present: number;
  total: number;
  pct: number | null;
}

function todayIso(): string {
  // Server-local date is fine — term windows are day-grained.
  return new Date().toISOString().slice(0, 10);
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

    if (!institutionId) {
      // Super-admin hasn't chosen an institution yet.
      return NextResponse.json({ needsInstitution: true });
    }

    const coeInst = await resolveCoeInstitutionByMyjkknId(institutionId);
    if (!coeInst) {
      return NextResponse.json(
        { error: 'This institution is not mapped in COE.' },
        { status: 404 },
      );
    }

    // Admin peek: list the terms available to override to.
    if (searchParams.get('listSessions') === '1') {
      if (!scope.isSuperAdmin) return NextResponse.json({ sessions: [] });
      const sessions = await getCoeExaminationSessions(coeInst.coeId);
      // De-dupe to one entry per code (COE keeps several rows per term).
      const seen = new Set<string>();
      const unique = sessions.filter((s) => {
        if (!s.session_code || seen.has(s.session_code)) return false;
        seen.add(s.session_code);
        return true;
      });
      return NextResponse.json({ sessions: unique });
    }

    // Resolve the term: super-admin override (peek) or auto-detected current term.
    const peek = scope.isSuperAdmin ? searchParams.get('sessionCode') : null;
    let sessionCode: string;
    let termName: string | null = null;
    let autoDetected = true;
    let reason: string | null = null;

    if (peek) {
      sessionCode = peek;
      autoDetected = false;
    } else {
      const current = await getCoeCurrentTerm(coeInst.coeId, todayIso());
      if (!current) {
        return NextResponse.json({
          institution: coeInst.name,
          term: null,
          canPeek: scope.isSuperAdmin,
          noTerm: true,
        });
      }
      sessionCode = current.session_code;
      termName = current.session_name;
      reason = current.reason;
    }

    // Per-institution thresholds (fall back to platform defaults).
    const { data: cfg } = await supabase
      .from('internal_marks_insight_config')
      .select('attendance_threshold, anomaly_cia_threshold, struggling_cia_threshold')
      .eq('institution_id', institutionId)
      .maybeSingle();
    const thresholds = {
      attendance: cfg?.attendance_threshold ?? DEFAULTS.attendance,
      anomaly_cia: cfg?.anomaly_cia_threshold ?? DEFAULTS.anomaly_cia,
      struggling_cia: cfg?.struggling_cia_threshold ?? DEFAULTS.struggling_cia,
    };

    // 1) COE CIA per student × course for the term.
    // 2) MyJKKN attendance % merged across the college's halves.
    const [cia, attendanceRes] = await Promise.all([
      getCoeCiaStudentDetail(sessionCode, coeInst.institutionCode),
      supabase.rpc('fn_student_attendance_pct', {
        p_institution_ids: coeInst.myjkknInstitutionIds,
      }),
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

    const flagged: FlaggedRow[] = [];
    const checkData: CheckDataRow[] = [];
    const studentsWithMarks = new Set<string>();
    const marksStudentsWithAttendance = new Set<string>();
    let marksWithoutAttendance = 0;
    const seenMarksNoAtt = new Set<string>();

    for (const c of cia) {
      const sid = c.student_id;
      const cia_pct = c.internal_percentage;
      if (!sid || typeof cia_pct !== 'number') continue;
      studentsWithMarks.add(sid);

      const att = attByStudent.get(sid);
      if (!att || typeof att.pct !== 'number') {
        if (!seenMarksNoAtt.has(sid)) {
          seenMarksNoAtt.add(sid);
          marksWithoutAttendance += 1;
        }
        continue;
      }
      marksStudentsWithAttendance.add(sid);

      // 0% attendance among students with marks = almost always missing data.
      if (att.present === 0) {
        checkData.push({
          student_id: sid,
          student_name: c.student_name,
          register_no: c.stu_register_no,
          course_code: c.course_code,
          course_name: c.course_name,
          cia_pct,
          total: att.total,
        });
        continue;
      }

      const attendance_pct = att.pct;
      let note: Note | null = null;
      if (attendance_pct >= thresholds.attendance && cia_pct < thresholds.struggling_cia)
        note = 'struggling';
      else if (attendance_pct < thresholds.attendance && cia_pct >= thresholds.anomaly_cia)
        note = 'anomaly';
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

    // Owes marks: has attendance but no CIA row for this term (the live-entry gap).
    const owesIds: string[] = [];
    for (const [sid, att] of attByStudent) {
      if (!studentsWithMarks.has(sid) && att.total > 0) owesIds.push(sid);
    }

    // Name the capped owes-marks subset from MyJKKN (attendance rows carry only ids).
    const owesCapIds = owesIds.slice(0, ROW_CAP);
    const nameById = new Map<string, { name: string | null; reg: string | null }>();
    if (owesCapIds.length > 0) {
      const { data: profs } = await supabase
        .from('learners_profiles')
        .select('id, first_name, last_name, register_number')
        .in('id', owesCapIds);
      for (const p of (profs ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        register_number: string | null;
      }>) {
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || null;
        nameById.set(p.id, { name, reg: p.register_number });
      }
    }
    const owesMarks: OwesRow[] = owesCapIds.map((sid) => {
      const att = attByStudent.get(sid)!;
      const nm = nameById.get(sid);
      return {
        student_id: sid,
        student_name: nm?.name ?? null,
        register_no: nm?.reg ?? null,
        attendance_pct: att.pct ?? 0,
        present: att.present,
        total: att.total,
      };
    });

    // Sort flagged: struggling first, then anomaly; within each, widest gap first.
    flagged.sort((a, b) => {
      if (a.note !== b.note) return a.note === 'struggling' ? -1 : 1;
      return (
        Math.abs(b.attendance_pct - b.cia_pct) - Math.abs(a.attendance_pct - a.cia_pct)
      );
    });
    // Owes marks: lowest attendance first (least engaged + no marks = most urgent).
    owesMarks.sort((a, b) => a.attendance_pct - b.attendance_pct);

    const summary = {
      students_with_attendance: attByStudent.size,
      students_with_marks: marksStudentsWithAttendance.size,
      owes_marks: owesIds.length,
      struggling: flagged.filter((r) => r.note === 'struggling').length,
      anomaly: flagged.filter((r) => r.note === 'anomaly').length,
      check_data: checkData.length,
      marks_without_attendance: marksWithoutAttendance,
    };

    return NextResponse.json({
      institution: coeInst.name,
      term: {
        session_code: sessionCode,
        session_name: termName,
        auto_detected: autoDetected,
        reason,
      },
      canPeek: scope.isSuperAdmin,
      thresholds,
      summary,
      owesMarksTotal: owesIds.length,
      owesMarks,
      flaggedTotal: flagged.length,
      flagged: flagged.slice(0, ROW_CAP),
      checkDataTotal: checkData.length,
      checkData: checkData.slice(0, ROW_CAP),
    });
  } catch (error) {
    console.error('[internal-marks/attendance-insight] error:', error);
    return NextResponse.json(
      { error: 'Failed to load the attendance-vs-marks insight.' },
      { status: 500 },
    );
  }
}
