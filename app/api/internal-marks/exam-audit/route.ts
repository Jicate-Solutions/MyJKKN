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
import { resolveRoundDates } from '@/types/internal-marks';
import {
  resolveExamAuditScope,
  scopeAllowsInstitution,
  sessionSemesterWindow,
} from '@/lib/utils/internal-marks/exam-audit-access';
import type {
  ExamAuditOverviewResponse,
  ExamAuditProgramRow,
  ExamAuditRubricVerdict,
  ExamAuditVerdict,
} from '@/types/exam-audit';

const ATTENDANCE_ELIGIBILITY = 75; // university norm; condonation band below
const CONDONATION_FLOOR = 65;

interface AttendanceRow {
  student_id: string;
  course_id: string | null;
  course_code: string | null;
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

    const programNameById = new Map(programs.map((p) => [p.id, p]));

    // Per-student overall attendance within the window (all courses pooled).
    const attByStudent = new Map<string, { present: number; total: number }>();
    for (const a of attendance) {
      const cur = attByStudent.get(a.student_id) ?? { present: 0, total: 0 };
      cur.present += a.present;
      cur.total += a.total;
      attByStudent.set(a.student_id, cur);
    }

    // Group registrations by program_code — the university's own program key.
    interface ProgAgg {
      students: Set<string>;
      courses: Set<string>;
      cia: {
        rows: number;
        enterers: Set<string>;
        facultyFilled: number;
        days: Map<string, number>;
        rounds: Set<number>;
        verified: number;
        approved: number;
        students: Set<string>;
        /** (round, entry-day) per row — graded against the rubric's windows. */
        roundDays: Array<{ round: number | null; day: string }>;
      };
    }
    const byProgram = new Map<string, ProgAgg>();
    const progOf = (code: string): ProgAgg => {
      let p = byProgram.get(code);
      if (!p) {
        p = {
          students: new Set(),
          courses: new Set(),
          cia: {
            rows: 0,
            enterers: new Set(),
            facultyFilled: 0,
            days: new Map(),
            rounds: new Set(),
            verified: 0,
            approved: 0,
            students: new Set(),
            roundDays: [],
          },
        };
        byProgram.set(code, p);
      }
      return p;
    };

    const programCodeByStudent = new Map<string, string>();
    for (const r of registrations) {
      const code = r.program_code ?? '(unknown program)';
      const p = progOf(code);
      if (r.student_id) {
        p.students.add(r.student_id);
        if (!programCodeByStudent.has(r.student_id)) {
          programCodeByStudent.set(r.student_id, code);
        }
      }
      if (r.course_code) p.courses.add(r.course_code);
    }

    // CIA provenance rows attach to programs via COE program_id → program_code.
    for (const c of provenance) {
      const prog = c.program_id ? programNameById.get(c.program_id) : undefined;
      const code =
        prog?.program_code ??
        (c.student_id ? programCodeByStudent.get(c.student_id) : undefined) ??
        '(unknown program)';
      const agg = progOf(code).cia;
      agg.rows += 1;
      if (c.created_by) agg.enterers.add(c.created_by);
      if (c.faculty_id) agg.facultyFilled += 1;
      const day = (c.created_at ?? c.submission_date ?? '').slice(0, 10);
      if (day) agg.days.set(day, (agg.days.get(day) ?? 0) + 1);
      if (typeof c.cia_round === 'number') agg.rounds.add(c.cia_round);
      if (c.is_verified) agg.verified += 1;
      if (c.is_approved) agg.approved += 1;
      if (c.student_id) agg.students.add(c.student_id);
      if (day) agg.roundDays.push({ round: c.cia_round ?? null, day });
    }

    // Rubric per program: which active CIA settings cover it, the rounds they
    // configure, and each round's entry window (resolveRoundDates — the same
    // canonical fallback logic the entry grid uses).
    interface Rubric {
      settingNames: string[];
      rounds: Set<number>;
      windowsByRound: Map<number, Array<{ from: string | null; to: string | null }>>;
    }
    const rubricFor = (code: string): Rubric | null => {
      const covering = ciaSettings.filter((s) => {
        const codes = s.program_codes ?? (s.program_code ? [s.program_code] : []);
        return Array.isArray(codes) && codes.includes(code);
      });
      if (covering.length === 0) return null;
      const rounds = new Set<number>();
      const windowsByRound = new Map<number, Array<{ from: string | null; to: string | null }>>();
      for (const s of covering) {
        for (const r of s.cia_rounds ?? []) {
          if (typeof r.round !== 'number') continue;
          rounds.add(r.round);
          const { entryFrom, entryTo } = resolveRoundDates(r);
          const list = windowsByRound.get(r.round) ?? [];
          list.push({ from: entryFrom, to: entryTo });
          windowsByRound.set(r.round, list);
        }
      }
      return { settingNames: covering.map((s) => s.setting_name), rounds, windowsByRound };
    };

    const rows: ExamAuditProgramRow[] = [];
    for (const [code, p] of byProgram) {
      const cia = p.cia;
      let topDayShare = 0;
      let entryDays = 0;
      if (cia.rows > 0) {
        entryDays = cia.days.size;
        const top = Math.max(0, ...cia.days.values());
        topDayShare = Math.round((100 * top) / cia.rows);
      }
      const facultyShare = cia.rows > 0 ? Math.round((100 * cia.facultyFilled) / cia.rows) : 0;

      // Rubric compliance: all configured rounds entered + entries inside their
      // round's window. Attendance plays NO part here — internal marks are
      // defined by the rubric's components, attendance only gates eligibility.
      const rubric = rubricFor(code);
      let rubricVerdict: ExamAuditRubricVerdict = 'no_rubric';
      let onWindowPct: number | null = null;
      if (rubric) {
        const configured = [...rubric.rounds];
        const enteredConfigured = configured.filter((r) => cia.rounds.has(r)).length;
        let dated = 0;
        let onWindow = 0;
        for (const rd of cia.roundDays) {
          if (rd.round === null) continue;
          const windows = rubric.windowsByRound.get(rd.round);
          if (!windows || windows.length === 0) continue;
          const bounded = windows.filter((w) => w.from && w.to);
          if (bounded.length === 0) continue; // window not configured — don't penalize
          dated += 1;
          if (bounded.some((w) => rd.day >= (w.from as string) && rd.day <= (w.to as string)))
            onWindow += 1;
        }
        onWindowPct = dated > 0 ? Math.round((100 * onWindow) / dated) : null;
        if (cia.rows === 0) {
          rubricVerdict = 'off_rubric'; // rubric exists, nothing entered
        } else if (
          enteredConfigured === configured.length &&
          (onWindowPct === null || onWindowPct >= 80)
        ) {
          rubricVerdict = 'follows_rubric';
        } else if (
          enteredConfigured * 2 < configured.length ||
          (onWindowPct !== null && onWindowPct < 50)
        ) {
          rubricVerdict = 'off_rubric';
        } else {
          rubricVerdict = 'partial';
        }
      }

      let verdict: ExamAuditVerdict;
      if (cia.rows === 0) verdict = 'missing';
      else if (facultyShare === 0 || topDayShare >= 80) verdict = 'operator_bulk';
      else if (facultyShare >= 50 && topDayShare < 50 && entryDays >= 3)
        verdict = 'faculty_continuous';
      else verdict = 'partial';

      // Eligibility risk among this program's REGISTERED students, from JKKN data.
      let below75 = 0;
      let below65 = 0;
      let noAttendanceRecord = 0;
      for (const sid of p.students) {
        const att = attByStudent.get(sid);
        if (!att || att.total === 0) {
          noAttendanceRecord += 1;
          continue;
        }
        const pct = (100 * att.present) / att.total;
        if (pct < CONDONATION_FLOOR) below65 += 1;
        else if (pct < ATTENDANCE_ELIGIBILITY) below75 += 1;
      }

      const progName =
        programs.find((pr) => pr.program_code === code)?.program_name ?? null;

      rows.push({
        program_code: code,
        program_name: progName,
        registered_students: p.students.size,
        registered_courses: p.courses.size,
        cia_rows: cia.rows,
        cia_students: cia.students.size,
        distinct_enterers: cia.enterers.size,
        faculty_entered_pct: facultyShare,
        entry_days: entryDays,
        top_day_share_pct: topDayShare,
        rounds_used: [...cia.rounds].sort((a, b) => a - b),
        verified_pct: cia.rows > 0 ? Math.round((100 * cia.verified) / cia.rows) : 0,
        approved_pct: cia.rows > 0 ? Math.round((100 * cia.approved) / cia.rows) : 0,
        verdict,
        rubric_verdict: rubricVerdict,
        rubric_rounds_configured: rubric ? rubric.rounds.size : null,
        on_window_pct: onWindowPct,
        rubric_setting_names: rubric?.settingNames ?? [],
        att_below_75: below75,
        att_below_65: below65,
        att_no_record: noAttendanceRecord,
      });
    }
    rows.sort((a, b) => a.program_code.localeCompare(b.program_code));

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
      thresholds: { eligibility: ATTENDANCE_ELIGIBILITY, condonation: CONDONATION_FLOOR },
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
