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
  ExamAuditAttendanceBucket,
  ExamAuditRubricVerdict,
  ExamAuditStudentDetailRow,
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
  /** The round NUMBERS the rubric configures — so consumers can name the round
   *  that never happened, not just count it. */
  rubric_rounds: number[];
  rubric_setting_names: string[];
  /** The rubric's actual definition (rounds, windows, components) — what the
   *  page's rubric viewer shows. null = no rubric covers this program. */
  rubric_definition: ExamAuditRubricDefinition | null;
}

export interface ExamAuditRubricComponentDef {
  name: string;
  max_marks: number;
}

export interface ExamAuditRubricRoundDef {
  round: number;
  round_name: string | null;
  entry_from: string | null;
  entry_to: string | null;
  components: ExamAuditRubricComponentDef[];
  total_max: number;
}

/** What the rubric SAYS — surfaced so the Director/Registrar can see the
 *  assessment pattern itself, not just verdicts against it (2026-07-14). */
export interface ExamAuditRubricDefinition {
  setting_names: string[];
  rounds: ExamAuditRubricRoundDef[];
  /** True when the whole rubric carries zero max marks (the CAS case) —
   *  a rubric that exists on paper but grades nothing. */
  is_empty: boolean;
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
    definition: ExamAuditRubricDefinition;
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
    const roundDefs: ExamAuditRubricRoundDef[] = [];
    for (const s of covering) {
      for (const r of s.cia_rounds ?? []) {
        if (typeof r.round !== 'number') continue;
        rounds.add(r.round);
        const { entryFrom, entryTo } = resolveRoundDates(r);
        const list = windowsByRound.get(r.round) ?? [];
        list.push({ from: entryFrom, to: entryTo });
        windowsByRound.set(r.round, list);
        const components = (r.components ?? []).map((c) => ({
          name: c.name,
          max_marks: c.max_marks ?? 0,
        }));
        roundDefs.push({
          round: r.round,
          round_name: r.round_name ?? null,
          entry_from: entryFrom,
          entry_to: entryTo,
          components,
          total_max: components.reduce((sum, c) => sum + c.max_marks, 0),
        });
      }
    }
    roundDefs.sort((a, b) => a.round - b.round);
    return {
      settingNames: covering.map((s) => s.setting_name),
      rounds,
      windowsByRound,
      definition: {
        setting_names: covering.map((s) => s.setting_name),
        rounds: roundDefs,
        is_empty: roundDefs.reduce((sum, r) => sum + r.total_max, 0) === 0,
      },
    };
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
        rubric_rounds: rubric ? [...rubric.rounds].sort((a, b) => a - b) : [],
        rubric_setting_names: rubric?.settingNames ?? [],
        rubric_definition: rubric?.definition ?? null,
      },
      studentIds: [...p.students],
    });
  }
  out.sort((a, b) => a.row.program_code.localeCompare(b.row.program_code));
  return out;
}

// ── Shared eligibility bucketing ─────────────────────────────────────────────
// The overview counts and the drill-down's per-student rows MUST bucket the
// same way — both call these. (Attendance gates who may SIT the exam; it never
// decides the internal marks.)

// FALLBACK defaults only. The live values come from platform_policies
// (POLICY_KEYS.EXAM_ELIGIBILITY_*) and are resolved at the edge — API routes use
// getPolicyInt(), client components use useEligibilityThresholds(). These constants
// are what those helpers fall back to when the policy row is missing or the RPC
// fails, so the numbers here must stay equal to the seeded row values.
// This module stays PURE (no policy import) so it can be reasoned about and unit
// tested without a Supabase client.
export const ATTENDANCE_ELIGIBILITY = 75; // university norm
export const CONDONATION_FLOOR = 65; // condonation band below eligibility

export type EligibilityThresholds = {
  /** pct at or above this is eligible */
  eligibility: number;
  /** pct below this is at risk of ineligibility */
  condonation: number;
};

export const DEFAULT_ELIGIBILITY_THRESHOLDS: EligibilityThresholds = {
  eligibility: ATTENDANCE_ELIGIBILITY,
  condonation: CONDONATION_FLOOR,
};

/** Sum per-course attendance rows into one {present,protected,total} per learner.
 *
 * `protected` is the count of days the learner was marked absent but which an
 * approved tournament permission or full-day on-duty application excuses —
 * fn_attendance_protected_days is the single source of that, and the "With
 * Attendance" line on the Principal's permission letter is why it exists. It is
 * carried SEPARATELY from `present` rather than folded into it, so the raw
 * marked record and the excused credit stay tellable apart at every layer.
 *
 * Rows from before this column existed simply have no `protected` and score
 * exactly as they did.
 */
export function aggregateAttendanceByStudent(
  rows: Array<{ student_id: string; present: number; total: number; protected?: number | null }>,
): Map<string, { present: number; protected: number; total: number }> {
  const byStudent = new Map<string, { present: number; protected: number; total: number }>();
  for (const a of rows) {
    const cur = byStudent.get(a.student_id) ?? { present: 0, protected: 0, total: 0 };
    cur.present += a.present;
    cur.protected += a.protected ?? 0;
    cur.total += a.total;
    byStudent.set(a.student_id, cur);
  }
  return byStudent;
}

/** The percentage eligibility is judged on: marked-present days PLUS excused
 *  days, over every session held. Only a day marked absent can be excused, so
 *  this can never exceed 100. */
export function eligiblePct(att: { present: number; protected?: number; total: number }): number {
  if (att.total <= 0) return 0; // no sessions held is not 0% attendance, but it is never a band
  return (100 * (att.present + (att.protected ?? 0))) / att.total;
}

// The 'below_65' / 'below_75' bucket NAMES are a stable API (types, response
// payloads, the drill-down UI) and deliberately keep their historical labels even
// when the configured thresholds differ — they mean "at risk" and "needs
// condonation", not literally 65 and 75. Render the numbers from the resolved
// thresholds, never from the bucket name.
export function eligibilityBucket(
  att: { present: number; protected?: number; total: number } | undefined,
  thresholds: EligibilityThresholds = DEFAULT_ELIGIBILITY_THRESHOLDS,
): ExamAuditAttendanceBucket {
  if (!att || att.total === 0) return 'no_record';
  const pct = eligiblePct(att);
  if (pct < thresholds.condonation) return 'below_65';
  if (pct < thresholds.eligibility) return 'below_75';
  return 'ok';
}

// ── Program drill-down: per-student rows (2026-07-14) ────────────────────────
// Same raw pulls as the overview; same program-attach rule for CIA rows
// (program_id → program_code, falling back to the student's registration
// program) — so the per-student rows always sum to the overview's counts.

const BUCKET_ORDER: Record<ExamAuditAttendanceBucket, number> = {
  no_record: 0,
  below_65: 1,
  below_75: 2,
  ok: 3,
};

export function computeExamAuditStudentDetail(input: {
  programCode: string;
  registrations: CoeExamRegistrationRow[];
  provenance: CoeCiaProvenanceRow[];
  programs: CoeProgramRef[];
  attendanceByStudent: Map<string, { present: number; protected?: number; total: number }>;
  /** Resolved from platform_policies by the caller; falls back to 75/65. */
  thresholds?: EligibilityThresholds;
}): ExamAuditStudentDetailRow[] {
  const { programCode, registrations, provenance, programs, attendanceByStudent } = input;
  const thresholds = input.thresholds ?? DEFAULT_ELIGIBILITY_THRESHOLDS;
  const programNameById = new Map(programs.map((p) => [p.id, p]));

  // Student → registration program (the SAME fallback map the overview builds).
  const programCodeByStudent = new Map<string, string>();
  for (const r of registrations) {
    if (r.student_id && !programCodeByStudent.has(r.student_id)) {
      programCodeByStudent.set(r.student_id, r.program_code ?? '(unknown program)');
    }
  }

  interface StudentAgg {
    name: string | null;
    registerNo: string | null;
    regCourses: Set<string>;
    ciaRows: number;
    ciaCourses: Set<string>;
    rounds: Set<number>;
    facultyStamped: number;
    verified: number;
    pctSum: number;
    pctCount: number;
  }
  const byStudent = new Map<string, StudentAgg>();
  const studentOf = (sid: string): StudentAgg => {
    let s = byStudent.get(sid);
    if (!s) {
      s = {
        name: null,
        registerNo: null,
        regCourses: new Set(),
        ciaRows: 0,
        ciaCourses: new Set(),
        rounds: new Set(),
        facultyStamped: 0,
        verified: 0,
        pctSum: 0,
        pctCount: 0,
      };
      byStudent.set(sid, s);
    }
    return s;
  };

  // The program's registered students — the SAME universe the overview counts.
  for (const r of registrations) {
    const code = r.program_code ?? '(unknown program)';
    if (code !== programCode || !r.student_id) continue;
    const s = studentOf(r.student_id);
    if (!s.name && r.student_name) s.name = r.student_name;
    if (!s.registerNo && r.stu_register_no) s.registerNo = r.stu_register_no;
    if (r.course_code) s.regCourses.add(r.course_code);
  }

  // CIA rows attached to this program by the overview's exact rule.
  for (const c of provenance) {
    if (!c.student_id) continue;
    const prog = c.program_id ? programNameById.get(c.program_id) : undefined;
    const code =
      prog?.program_code ?? programCodeByStudent.get(c.student_id) ?? '(unknown program)';
    if (code !== programCode) continue;
    const s = studentOf(c.student_id);
    s.ciaRows += 1;
    if (c.course_id) s.ciaCourses.add(c.course_id);
    if (typeof c.cia_round === 'number') s.rounds.add(c.cia_round);
    if (c.faculty_id) s.facultyStamped += 1;
    if (c.is_verified) s.verified += 1;
    if (typeof c.internal_percentage === 'number') {
      s.pctSum += c.internal_percentage;
      s.pctCount += 1;
    }
  }

  const out: ExamAuditStudentDetailRow[] = [];
  for (const [sid, s] of byStudent) {
    const att = attendanceByStudent.get(sid);
    const bucket = eligibilityBucket(att, thresholds);
    out.push({
      student_id: sid,
      student_name: s.name,
      register_no: s.registerNo,
      registered_courses: s.regCourses.size,
      cia_rows: s.ciaRows,
      cia_courses: s.ciaCourses.size,
      rounds_used: [...s.rounds].sort((a, b) => a - b),
      faculty_stamped_pct: s.ciaRows > 0 ? Math.round((100 * s.facultyStamped) / s.ciaRows) : null,
      verified_pct: s.ciaRows > 0 ? Math.round((100 * s.verified) / s.ciaRows) : null,
      avg_internal_pct: s.pctCount > 0 ? Math.round(s.pctSum / s.pctCount) : null,
      att_present: att && att.total > 0 ? att.present : null,
      att_protected: att && att.total > 0 ? (att.protected ?? 0) : null,
      att_total: att && att.total > 0 ? att.total : null,
      att_pct: att && att.total > 0 ? Math.round(10 * eligiblePct(att)) / 10 : null,
      att_bucket: bucket,
    });
  }
  out.sort(
    (a, b) =>
      BUCKET_ORDER[a.att_bucket] - BUCKET_ORDER[b.att_bucket] ||
      (a.register_no ?? '').localeCompare(b.register_no ?? ''),
  );
  return out;
}

// ── Evidence pack: findings derivation (2026-07-14) ──────────────────────────
// Pure derivation from the SAME verdict rows the page and cron consume — the
// pack the Registrar hands to the exam cell can never disagree with the page.
// Zero-registered programs are noise, not findings (cron precedent).

export interface ExamAuditEvidenceFinding {
  program_code: string;
  program_name: string | null;
  registered_students: number;
  detail: string;
}

export interface ExamAuditEvidenceFindings {
  no_rubric: ExamAuditEvidenceFinding[];
  /** Rubric exists but every component carries 0 max marks — grades nothing. */
  rubric_empty: ExamAuditEvidenceFinding[];
  rubric_zero_entries: ExamAuditEvidenceFinding[];
  rounds_missing: ExamAuditEvidenceFinding[];
  operator_bulk: ExamAuditEvidenceFinding[];
  /** Programs with registered students and no finding above. */
  ok_count: number;
}

export function deriveEvidenceFindings(
  rows: ExamAuditProgramVerdict[],
): ExamAuditEvidenceFindings {
  const findings: ExamAuditEvidenceFindings = {
    no_rubric: [],
    rubric_empty: [],
    rubric_zero_entries: [],
    rounds_missing: [],
    operator_bulk: [],
    ok_count: 0,
  };
  for (const row of rows) {
    if (row.registered_students === 0) continue;
    const ref = {
      program_code: row.program_code,
      program_name: row.program_name,
      registered_students: row.registered_students,
    };
    let flagged = false;
    if (row.rubric_verdict === 'no_rubric') {
      findings.no_rubric.push({
        ...ref,
        detail:
          row.cia_rows === 0
            ? 'no assessment rubric configured and zero CIA entries'
            : `no assessment rubric configured — ${row.cia_rows} CIA rows entered without one`,
      });
      flagged = true;
    } else if (row.rubric_definition?.is_empty) {
      findings.rubric_empty.push({
        ...ref,
        detail: `rubric "${row.rubric_setting_names.join(', ')}" exists but every component carries 0 max marks — it grades nothing`,
      });
      flagged = true;
    } else if (row.cia_rows === 0) {
      findings.rubric_zero_entries.push({
        ...ref,
        detail: `rubric "${row.rubric_setting_names.join(', ')}" configures round${row.rubric_rounds.length === 1 ? '' : 's'} ${row.rubric_rounds.join(', ')} — zero CIA entries`,
      });
      flagged = true;
    } else if (row.rubric_rounds.length > 0) {
      const missing = row.rubric_rounds.filter((r) => !row.rounds_used.includes(r));
      if (missing.length > 0) {
        findings.rounds_missing.push({
          ...ref,
          detail: `round${missing.length === 1 ? '' : 's'} ${missing.join(', ')} never entered (${row.rounds_used.length}/${row.rubric_rounds.length} rounds present)`,
        });
        flagged = true;
      }
    }
    if (row.verdict === 'operator_bulk') {
      findings.operator_bulk.push({
        ...ref,
        detail: `${row.cia_rows} rows by ${row.distinct_enterers} enterer${row.distinct_enterers === 1 ? '' : 's'} over ${row.entry_days} day${row.entry_days === 1 ? '' : 's'}, ${row.faculty_entered_pct}% faculty-stamped, busiest day ${row.top_day_share_pct}%`,
      });
      flagged = true;
    }
    if (!flagged) findings.ok_count += 1;
  }
  return findings;
}
