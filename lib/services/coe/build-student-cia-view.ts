/**
 * Builds a StudentCiaView DIRECTLY from the COE database (server-side only),
 * as a fallback for when the COE REST endpoint `/api/v1/student-cia-view` is
 * unavailable (e.g. the COE API key is expired).
 *
 * IMPORTANT — what this does and does NOT reproduce:
 *   The live COE endpoint computes a per-round, per-component grid using COE's
 *   internal weighting/conversion rules. Those rules are NOT fully derivable
 *   from the read-accessible COE tables (the `cia_marks` component columns that
 *   feed the total — e.g. the test_N marks — are not exposed with their maxima
 *   in the readable views, and `total_internal_marks` does not sum from the
 *   visible components). So this builder does NOT invent a component grid.
 *
 *   Instead it shows what IS authoritative and stored: each course's stored
 *   `total_internal_marks` out of `max_internal_marks` (+ percentage + status),
 *   plus any component marks that ARE stored, as a single "Internal Assessment"
 *   round. This is correct (all values are read straight from COE), just less
 *   granular than the live endpoint's grid. When the COE REST key is restored,
 *   the route reverts to the richer live view automatically.
 *
 * NEVER import from client/browser code — reads the COE service-role DB.
 */

import { createCoeDbClient } from './coe-db-client';
import type {
  StudentCiaView,
  CiaViewSession,
  CiaViewCourse,
  CiaViewComponent,
} from '@/types/my-marks';

/** Stored component columns in `cia_marks_detailed_view` (code → value column). */
const COMPONENT_COLUMNS: Array<{ code: string; name: string; col: string; maxCol: string }> = [
  { code: 'assignment', name: 'Assignment', col: 'assignment_marks', maxCol: 'max_assignment_marks' },
  { code: 'quiz', name: 'Quiz', col: 'quiz_marks', maxCol: 'max_quiz_marks' },
  { code: 'mid_term', name: 'Mid Term', col: 'mid_term_marks', maxCol: 'max_mid_term_marks' },
  { code: 'presentation', name: 'Presentation', col: 'presentation_marks', maxCol: 'max_presentation_marks' },
  { code: 'attendance', name: 'Attendance', col: 'attendance_marks', maxCol: 'max_attendance_marks' },
  { code: 'lab', name: 'Lab', col: 'lab_marks', maxCol: 'max_lab_marks' },
  { code: 'project', name: 'Project', col: 'project_marks', maxCol: 'max_project_marks' },
  { code: 'seminar', name: 'Seminar', col: 'seminar_marks', maxCol: 'max_seminar_marks' },
  { code: 'viva', name: 'Viva', col: 'viva_marks', maxCol: 'max_viva_marks' },
  { code: 'other', name: 'Other', col: 'other_marks', maxCol: 'max_other_marks' },
];

const SELECT_COLS = [
  'examination_session_id',
  'session_code',
  'session_name',
  'course_code',
  'course_name',
  'program_code',
  'semester',
  'marks_status',
  'total_internal_marks',
  'max_internal_marks',
  'internal_percentage',
  'student_name',
  'stu_register_no',
  ...COMPONENT_COLUMNS.flatMap((c) => [c.col, c.maxCol]),
].join(',');

type Row = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/**
 * Assemble a StudentCiaView for one learner from `cia_marks_detailed_view`,
 * grouped by exam session. `studentId` is the COE student_id, which equals the
 * MyJKKN learners_profiles.id.
 */
export async function buildStudentCiaViewFromDb(
  studentId: string,
  registerNumber: string,
): Promise<StudentCiaView> {
  const coe = createCoeDbClient();
  const { data, error } = await coe
    .from('cia_marks_detailed_view')
    .select(SELECT_COLS)
    .eq('student_id', studentId)
    .eq('is_active', true);

  if (error) throw new Error(`COE cia_marks_detailed_view read failed: ${error.message}`);
  const rows = (data ?? []) as Row[];

  const empty: StudentCiaView = {
    student: {
      student_id: studentId,
      register_number: registerNumber,
      student_name: null,
      program_code: null,
      grade_system_code: '',
    },
    sessions: [],
  };
  if (rows.length === 0) return empty;

  empty.student.student_name = str(rows[0].student_name);
  empty.student.program_code = str(rows[0].program_code);

  // Which components appear anywhere in this learner's data (value or max > 0)?
  const usedComponents = COMPONENT_COLUMNS.filter((c) =>
    rows.some((r) => (num(r[c.col]) ?? 0) > 0 || (num(r[c.maxCol]) ?? 0) > 0),
  );
  const componentDefs: CiaViewComponent[] = usedComponents.map((c) => ({
    code: c.code,
    name: c.name,
    max_marks: null,
  }));

  const sessionsMap = new Map<string, CiaViewSession>();

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
        semester_code: semester != null ? String(semester) : null,
        semester_label: semester != null ? `Semester ${semester}` : (str(r.session_name) ?? 'Session'),
        semester_index: semester ?? 0,
        settings: [
          {
            setting_id: `${sessKey}-internal`,
            setting_name: 'Internal Assessment',
            rounds: [
              {
                round: 1,
                round_name: 'Internal Assessment',
                components: componentDefs,
              },
            ],
          },
        ],
        courses: [],
      };
      sessionsMap.set(sessKey, session);
    }

    const marks: Record<string, number | null> = {};
    for (const c of usedComponents) marks[c.code] = num(r[c.col]);

    const course: CiaViewCourse = {
      course_code: str(r.course_code),
      course_name: str(r.course_name),
      course_order: null,
      internal_max_mark: num(r.max_internal_marks),
      is_regular: true,
      semester_code: session.semester_code,
      semester_index: session.semester_index,
      rounds: [
        {
          round: 1,
          round_name: 'Internal Assessment',
          marks,
          total: num(r.total_internal_marks),
          max_total: num(r.max_internal_marks),
          marks_status: str(r.marks_status),
          has_entries: num(r.total_internal_marks) != null,
        },
      ],
    };
    session.courses.push(course);
  }

  // Sort sessions newest-semester first, courses by code.
  const sessions = [...sessionsMap.values()].sort(
    (a, b) => b.semester_index - a.semester_index,
  );
  for (const s of sessions) {
    s.courses.sort((a, b) => (a.course_code ?? '').localeCompare(b.course_code ?? ''));
  }

  return { ...empty, sessions };
}
