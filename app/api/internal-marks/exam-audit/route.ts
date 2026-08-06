/**
 * GET /api/internal-marks/exam-audit?institutionId=&sessionCode=
 *
 * Exam IA Audit — program-wise, per exam session: is the internal assessment
 * "as per JKKN data, or some other data"? (Director, 2026-07-13. The Registrar
 * audits departments in person; this is the overview they walk in with.)
 *
 * Proven baseline this page exists to surface (COE prod, APRIL-MAY-2026):
 * CIA bulk-entered by 4 operator accounts, 99.8% on one day, round 1 only,
 * attendance component blank, nothing verified. Every number here is computed
 * fresh from COE (university-bound records) + MyJKKN (continuous day-one
 * attendance) — never trusted from a summary someone typed.
 *
 * Authorization: fn_exam_audit_access() (Role Management key
 * academic.internal_marks.exam_audit.view) is the single authority; every COE
 * fetch below is keyed to the institutions it returns. Explicit 403 — never a
 * silent redirect (CLAUDE.md #27).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  isCoeDbConfigured,
  getCoeExaminationSessions,
  getCoeCurrentTerm,
  getCoeCiaProvenance,
  getCoeCiaSettings,
  getCoeExamRegistrations,
  getCoePrograms,
  resolveCoeInstitutionByMyjkknId,
} from '@/lib/services/coe/coe-db-client';
import {
  ATTENDANCE_ELIGIBILITY,
  CONDONATION_FLOOR,
  type EligibilityThresholds,
  aggregateAttendanceByStudent,
  computeExamAuditPrograms,
  computeExamAuditStudentDetail,
  eligibilityBucket,
} from '@/lib/services/exam-audit/compute';
import { getPolicyInt } from '@/lib/policies/get-policy';
import { POLICY_KEYS } from '@/lib/policies/keys';
import {
  resolveExamAuditScope,
  scopeAllowsInstitution,
  sessionSemesterWindow,
} from '@/lib/utils/internal-marks/exam-audit-access';
import type {
  ExamAuditOverviewResponse,
  ExamAuditProgramDetailResponse,
  ExamAuditProgramRow,
} from '@/types/exam-audit';

interface AttendanceRow {
  student_id: string;
  course_id: string | null;
  course_code: string | null;
  present: number;
  total: number;
  pct: number | null;
  /** Absences excused by an approved tournament permission or full-day on-duty
   *  application (fn_attendance_protected_days). Counted into eligibility. */
  protected: number;
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

    const scope = await resolveExamAuditScope(supabase);
    if (!scope.allowed) {
      return NextResponse.json(
        { error: 'You do not have access to the exam audit — contact your administrator.' },
        { status: 403 },
      );
    }

    // Institutions the caller may audit (names via service client — the scope
    // decision already happened in the SECURITY DEFINER fn; this is labels only).
    const service = createServiceRoleClient();
    let instQuery = service.from('institutions').select('id, name').order('name');
    if (!scope.isSuper && scope.institutionIds !== null) {
      instQuery = instQuery.in('id', scope.institutionIds);
    }
    const { data: instRows, error: instErr } = await instQuery;
    if (instErr) {
      return NextResponse.json({ error: 'Failed to list institutions.' }, { status: 500 });
    }
    const institutions = (instRows ?? []) as Array<{ id: string; name: string | null }>;

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institutionId');
    if (!institutionId) {
      return NextResponse.json({ needsInstitution: true, institutions });
    }
    if (!scopeAllowsInstitution(scope, institutionId)) {
      return NextResponse.json(
        { error: 'You do not have access to this institution.' },
        { status: 403 },
      );
    }

    const coeInst = await resolveCoeInstitutionByMyjkknId(institutionId);
    if (!coeInst) {
      return NextResponse.json(
        { error: 'This institution is not mapped in COE.', institutions },
        { status: 404 },
      );
    }

    // Sessions for the picker (every authorized auditor may pick any exam —
    // auditing past cycles is the point) + auto-detected current term.
    const allSessions = await getCoeExaminationSessions(coeInst.coeId);
    const seen = new Set<string>();
    const sessionOptions = allSessions.filter((s) => {
      if (!s.session_code || seen.has(s.session_code)) return false;
      seen.add(s.session_code);
      return true;
    });

    let sessionCode = searchParams.get('sessionCode');
    let autoDetected = false;
    if (!sessionCode) {
      const current = await getCoeCurrentTerm(
        coeInst.coeId,
        new Date().toISOString().slice(0, 10),
      );
      if (!current) {
        return NextResponse.json({
          institutions,
          institution: { id: institutionId, name: coeInst.name },
          sessions: sessionOptions,
          noTerm: true,
        });
      }
      sessionCode = current.session_code;
      autoDetected = true;
    }

    const sessionRows = allSessions.filter((s) => s.session_code === sessionCode);
    if (sessionRows.length === 0) {
      return NextResponse.json(
        { error: `Unknown exam session "${sessionCode}" for this institution.`, institutions },
        { status: 404 },
      );
    }
    const sessionMeta = sessionRows[0];
    const window = sessionSemesterWindow(sessionMeta);

    // The three source pulls: university-bound records (COE) + continuous
    // attendance (MyJKKN, caller-session RPC — the SECDEF fn re-checks scope).
    const [registrations, provenance, programs, ciaSettings, attendanceRes] = await Promise.all([
      getCoeExamRegistrations(sessionCode, coeInst.coeId),
      getCoeCiaProvenance(sessionRows.map((s) => s.id), coeInst.coeId),
      getCoePrograms(coeInst.coeId),
      getCoeCiaSettings(coeInst.coeId, sessionRows.map((s) => s.id)),
      supabase.rpc('fn_exam_audit_attendance', {
        p_institution_ids: coeInst.myjkknInstitutionIds,
        p_from: window.from,
        p_to: window.to,
      }),
    ]);
    if (attendanceRes.error) {
      return NextResponse.json(
        { error: `Failed to compute JKKN attendance: ${attendanceRes.error.message}` },
        { status: 500 },
      );
    }
    const attendance = (attendanceRes.data ?? []) as AttendanceRow[];
    const attByStudent = aggregateAttendanceByStudent(attendance);

    // Eligibility thresholds are configuration, not a constant (2026-07-26).
    // Scoped to this institution so a college on a different affiliating-university
    // norm gets its own row; falls back to the 75/65 compute.ts defaults when no
    // row exists or the RPC fails.
    const thresholds: EligibilityThresholds = {
      eligibility: await getPolicyInt(
        POLICY_KEYS.EXAM_ELIGIBILITY_ATTENDANCE_PCT,
        ATTENDANCE_ELIGIBILITY,
        institutionId,
      ),
      condonation: await getPolicyInt(
        POLICY_KEYS.EXAM_ELIGIBILITY_CONDONATION_FLOOR_PCT,
        CONDONATION_FLOOR,
        institutionId,
      ),
    };

    // Verdicts come from the SHARED computation (also used by the weekly alert
    // cron — the alert fires on exactly what this page shows). This route adds
    // only the caller-scoped eligibility columns on top.
    const computed = computeExamAuditPrograms({
      registrations,
      provenance,
      programs,
      ciaSettings,
    });
    const rows: ExamAuditProgramRow[] = computed.map(({ row, studentIds }) => {
      let below75 = 0;
      let below65 = 0;
      let noAttendanceRecord = 0;
      for (const sid of studentIds) {
        const bucket = eligibilityBucket(attByStudent.get(sid), thresholds);
        if (bucket === 'no_record') noAttendanceRecord += 1;
        else if (bucket === 'below_65') below65 += 1;
        else if (bucket === 'below_75') below75 += 1;
      }
      return {
        ...row,
        att_below_75: below75,
        att_below_65: below65,
        att_no_record: noAttendanceRecord,
      };
    });

    // Drill-down: ?program=<code> returns the per-student rows behind that
    // program's counts — same pulls, same attach rule, same bucketing
    // (computeExamAuditStudentDetail), so the rows always sum to the overview.
    const programCode = searchParams.get('program');
    if (programCode) {
      const programRow = rows.find((r) => r.program_code === programCode);
      if (!programRow) {
        return NextResponse.json(
          { error: `Program "${programCode}" has no exam registrations in this session.` },
          { status: 404 },
        );
      }
      const students = computeExamAuditStudentDetail({
        programCode,
        registrations,
        provenance,
        programs,
        attendanceByStudent: attByStudent,
        thresholds,
      });
      const detail: ExamAuditProgramDetailResponse = {
        institution: { id: institutionId, name: coeInst.name },
        session: {
          session_code: sessionCode,
          session_name: sessionMeta.session_name,
          session_status: sessionMeta.session_status,
          exam_start_date: sessionMeta.exam_start_date,
          exam_end_date: sessionMeta.exam_end_date,
          auto_detected: autoDetected,
        },
        window,
        thresholds,
        program: programRow,
        students,
      };
      return NextResponse.json(detail);
    }

    const response: ExamAuditOverviewResponse = {
      institutions,
      institution: { id: institutionId, name: coeInst.name },
      sessions: sessionOptions,
      session: {
        session_code: sessionCode,
        session_name: sessionMeta.session_name,
        session_status: sessionMeta.session_status,
        exam_start_date: sessionMeta.exam_start_date,
        exam_end_date: sessionMeta.exam_end_date,
        auto_detected: autoDetected,
      },
      window,
      thresholds,
      programs: rows,
      totals: {
        programs: rows.length,
        registered_students: new Set(
          registrations.map((r) => r.student_id).filter(Boolean),
        ).size,
        cia_rows: provenance.length,
        missing_programs: rows.filter((r) => r.verdict === 'missing').length,
        operator_bulk_programs: rows.filter((r) => r.verdict === 'operator_bulk').length,
      },
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error('[internal-marks/exam-audit] error:', error);
    return NextResponse.json(
      { error: 'Failed to load the exam audit.' },
      { status: 500 },
    );
  }
}
