/**
 * Builds a StudentResultView DIRECTLY from the COE database (server-side only),
 * as a fallback for when the COE REST endpoint `/api/v1/student-result-view` is
 * unavailable (e.g. the COE API key is expired).
 *
 * Unlike the CIA view, final-marks map cleanly to the target type:
 * `final_marks_detailed_view` already carries internal/external/total obtained &
 * maxima, percentage, letter grade, grade points, credit and pass status per
 * course. So this fallback is faithful — it reads the same declared results the
 * live endpoint would return. SGPA is computed from grade_points × credit over
 * the session's credit-bearing passed papers.
 *
 * NEVER import from client/browser code — reads the COE service-role DB.
 */

import { createCoeDbClient } from './coe-db-client';
import type {
  StudentResultView,
  ResultViewSession,
  ResultViewCourse,
  ResultViewGradeBand,
} from '@/types/my-marks';

type Row = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

const FINAL_COLS = [
  'examination_session_id',
  'session_code',
  'session_name',
  'course_code',
  'course_name',
  'program_code',
  'semester',
  'credit',
  'internal_marks_obtained',
  'internal_marks_maximum',
  'external_marks_obtained',
  'external_marks_maximum',
  'total_marks_obtained',
  'total_marks_maximum',
  'percentage',
  'letter_grade',
  'grade_points',
  'grade_description',
  'is_pass',
  'pass_status',
  'result_status',
  'published_date',
  'student_name',
  'program_id',
  'institutions_id',
].join(',');

/** UG/PG hint from a program code (U… → UG, P… → PG). */
function gradeSystemCode(programCode: string | null): string {
  if (!programCode) return '';
  const first = programCode.charAt(0).toUpperCase();
  if (first === 'U') return 'UG';
  if (first === 'P') return 'PG';
  return '';
}

export async function buildStudentResultViewFromDb(
  studentId: string,
  registerNumber: string,
): Promise<StudentResultView> {
  const coe = createCoeDbClient();
  const { data, error } = await coe
    .from('final_marks_detailed_view')
    .select(FINAL_COLS)
    .eq('student_id', studentId)
    .eq('is_active', true);
  if (error) throw new Error(`COE final_marks_detailed_view read failed: ${error.message}`);
  const rows = (data ?? []) as Row[];

  const empty: StudentResultView = {
    student: {
      student_id: studentId,
      register_number: registerNumber,
      student_name: null,
      program_code: null,
      grade_system_code: '',
    },
    grade_system: [],
    sessions: [],
  };
  if (rows.length === 0) return empty;

  const programCode = str(rows[0].program_code);
  empty.student.student_name = str(rows[0].student_name);
  empty.student.program_code = programCode;
  empty.student.grade_system_code = gradeSystemCode(programCode);
  const institutionsId = str(rows[0].institutions_id);

  // Grade bands for this institution (+ derived UG/PG code when resolvable).
  let gradeBands: ResultViewGradeBand[] = [];
  if (institutionsId) {
    let gq = coe
      .from('grade_system')
      .select('grade, grade_point, min_mark, max_mark, description, grade_system_code')
      .eq('institutions_id', institutionsId)
      .eq('is_active', true);
    const gsc = empty.student.grade_system_code;
    if (gsc) gq = gq.eq('grade_system_code', gsc);
    const { data: gs } = await gq;
    gradeBands = ((gs ?? []) as Row[]).map((g) => ({
      grade: str(g.grade),
      grade_point: num(g.grade_point),
      min_mark: num(g.min_mark),
      max_mark: num(g.max_mark),
      description: str(g.description),
      qualify: null,
      is_absent: null,
      exclude_cgpa: null,
      result_status: null,
    }));
  }

  const sessionsMap = new Map<string, ResultViewSession>();
  for (const r of rows) {
    const sessKey = str(r.examination_session_id) ?? str(r.session_code) ?? 'unknown';
    let session = sessionsMap.get(sessKey);
    if (!session) {
      const semester = num(r.semester);
      session = {
        examination_session_id: str(r.examination_session_id),
        session_code: str(r.session_code),
        session_name: str(r.session_name),
        session_status: null,
        result_declaration_date: str(r.published_date),
        semester_code: semester != null ? String(semester) : null,
        semester_label: semester != null ? `Semester ${semester}` : (str(r.session_name) ?? 'Session'),
        semester_index: semester ?? 0,
        courses: [],
        summary: { sgpa: null, total_credits: 0, passed: 0, total: 0 },
      };
      sessionsMap.set(sessKey, session);
    }

    const semester = num(r.semester);
    const isPass = bool(r.is_pass);
    const gradePoints = num(r.grade_points);
    const credit = num(r.credit);
    const course: ResultViewCourse = {
      course_code: str(r.course_code),
      course_name: str(r.course_name),
      course_order: null,
      credit,
      internal_obtained: num(r.internal_marks_obtained),
      internal_max: num(r.internal_marks_maximum),
      external_obtained: num(r.external_marks_obtained),
      external_max: num(r.external_marks_maximum),
      total_obtained: num(r.total_marks_obtained),
      total_max: num(r.total_marks_maximum),
      percentage: num(r.percentage),
      letter_grade: str(r.letter_grade),
      grade_points: gradePoints,
      total_grade_points:
        gradePoints != null && credit != null ? gradePoints * credit : null,
      is_pass: isPass,
      pass_status: str(r.pass_status),
      result_status: str(r.result_status),
      // COE marks a declared result via result_status='Published' (published_date
      // is unused/null in the readable view), so key is_published off that.
      is_published: str(r.result_status) === 'Published',
      is_regular: true,
      attempt_number: null,
      semester_code: semester != null ? String(semester) : null,
      semester_index: semester,
      credit_included: isPass,
      examination_session_id: str(r.examination_session_id),
    };
    session.courses.push(course);
  }

  // Per-session summary: SGPA = Σ(gp × credit) / Σ(credit) over credit-included papers.
  const sessions = [...sessionsMap.values()];
  for (const s of sessions) {
    let creditSum = 0;
    let weighted = 0;
    let passed = 0;
    for (const c of s.courses) {
      if (c.is_pass) passed += 1;
      if (c.credit_included && c.credit != null) {
        creditSum += c.credit;
        if (c.grade_points != null) weighted += c.grade_points * c.credit;
      }
    }
    s.summary = {
      sgpa: creditSum > 0 ? Math.round((weighted / creditSum) * 100) / 100 : null,
      total_credits: creditSum,
      passed,
      total: s.courses.length,
    };
    s.courses.sort((a, b) => (a.course_code ?? '').localeCompare(b.course_code ?? ''));
  }
  sessions.sort((a, b) => b.semester_index - a.semester_index);

  return { ...empty, grade_system: gradeBands, sessions };
}
