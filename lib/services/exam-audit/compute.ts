/**
 * Exam IA Audit — SHARED verdict computation (pure, no I/O).
 *
 * Single source for the program-wise CIA-source and rubric verdicts, consumed
 * by BOTH the interactive page API (app/api/internal-marks/exam-audit) and the
 * weekly alert cron (app/api/cron/exam-audit-alerts). Extracted so the two can
 * never drift — the alert must fire on exactly the verdicts the page shows.
 *
 * Inputs are the raw COE pulls (registrations, cia_marks provenance, programs,
 * cia_entry_settings rows in the canonical CiaSettings shape). Attendance /
 * eligibility is deliberately NOT here — it is caller-session-scoped on the
 * page (SECDEF RPC) and not part of the alert condition. Internal marks are
 * defined by the rubric's components; attendance only gates exam eligibility.
 */

import { resolveRoundDates } from '@/types/internal-marks';
import type {
  CoeCiaProvenanceRow,
  CoeCiaSettingsRow,
  CoeExamRegistrationRow,
  CoeProgramRef,
} from '@/lib/services/coe/coe-db-client';
import type {
  ExamAuditRubricVerdict,
  ExamAuditVerdict,
} from '@/types/exam-audit';

/** One program's verdicts — everything the page shows EXCEPT the
 *  attendance/eligibility columns (which the page adds from its own
 *  caller-scoped RPC). */
export interface ExamAuditProgramVerdict {
  program_code: string;
  program_name: string | null;
  registered_students: number;
  registered_courses: number;
  cia_rows: number;
  cia_students: number;
  distinct_enterers: number;
  faculty_entered_pct: number;
  entry_days: number;
  top_day_share_pct: number;
  rounds_used: number[];
  verified_pct: number;
  approved_pct: number;
  verdict: ExamAuditVerdict;
  rubric_verdict: ExamAuditRubricVerdict;
  rubric_rounds_configured: number | null;
  on_window_pct: number | null;
  rubric_setting_names: string[];
}

export interface ExamAuditComputeResult {
  row: ExamAuditProgramVerdict;
  /** Registered-student ids for this program — the page maps these against
   *  its attendance RPC for the eligibility columns; the cron ignores them. */
  studentIds: string[];
}

export function computeExamAuditPrograms(input: {
  registrations: CoeExamRegistrationRow[];
  provenance: CoeCiaProvenanceRow[];
  programs: CoeProgramRef[];
  ciaSettings: CoeCiaSettingsRow[];
}): ExamAuditComputeResult[] {
  const { registrations, provenance, programs, ciaSettings } = input;
  const programNameById = new Map(programs.map((p) => [p.id, p]));

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
    const windowsByRound = new Map<
      number,
      Array<{ from: string | null; to: string | null }>
    >();
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

  const out: ExamAuditComputeResult[] = [];
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
    // round's window. Attendance plays NO part here.
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

    const progName = programs.find((pr) => pr.program_code === code)?.program_name ?? null;

    out.push({
      row: {
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
      },
      studentIds: [...p.students],
    });
  }
  out.sort((a, b) => a.row.program_code.localeCompare(b.row.program_code));
  return out;
}
