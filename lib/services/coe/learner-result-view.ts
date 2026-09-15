/**
 * lib/services/coe/learner-result-view.ts
 *
 * Server-side fetch of ONE learner's full COE result view (every semester,
 * regular + arrear papers, grades, SGPA). Lifted out of
 * app/api/learners/my-marks/result-view/route.ts so the same COE access path —
 * live REST first, COE DB fallback second — serves both the learner's own
 * Result tab and the CDC willingness flow (CGPA + arrears at declaration).
 *
 * The caller is responsible for authorising WHICH learner may be read; this
 * module only knows how to fetch. Never expose it to a client-supplied id
 * without a scope check.
 */

import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { isCoeDbConfigured } from '@/lib/services/coe/coe-db-client';
import { buildStudentResultViewFromDb } from '@/lib/services/coe/build-student-result-view';
import { resolveCoeInstitutionId } from '@/lib/utils/internal-marks/internal-marks-access';
import type {
  StudentResultView,
  ResultViewSession,
  ResultViewCourse,
} from '@/types/my-marks';

export function emptyResultView(registerNumber: string): StudentResultView {
  return {
    student: {
      student_id: null,
      register_number: registerNumber,
      student_name: null,
      program_code: null,
      grade_system_code: '',
    },
    grade_system: [],
    sessions: [],
  };
}

/**
 * COE is mid-rollout: the endpoint may return the new session-grouped shape
 * (`sessions[]`) OR the older semester-grouped shape (`semesters[]`). We accept
 * either here and normalize to `sessions[]` so callers only ever see one
 * shape — no lockstep deploy needed between MyJKKN and COE.
 */
export interface RawResultView {
  student?: StudentResultView['student'];
  grade_system?: StudentResultView['grade_system'];
  sessions?: ResultViewSession[];
  semesters?: Array<
    Partial<ResultViewSession> & {
      semester_label: string;
      semester_index: number;
      courses: ResultViewCourse[];
      summary: ResultViewSession['summary'];
    }
  >;
}

export function normalizeResultView(
  raw: RawResultView,
  registerNumber: string
): StudentResultView {
  const sessions: ResultViewSession[] =
    raw.sessions ??
    (raw.semesters ?? []).map((sem) => ({
      examination_session_id: sem.examination_session_id ?? null,
      session_code: sem.session_code ?? null,
      session_name: sem.session_name ?? null,
      session_status: sem.session_status ?? null,
      result_declaration_date: sem.result_declaration_date ?? null,
      semester_code: sem.semester_code ?? null,
      semester_label: sem.semester_label,
      semester_index: sem.semester_index,
      courses: (sem.courses ?? []).map((c) => ({
        ...c,
        semester_code: c.semester_code ?? sem.semester_code ?? null,
        semester_index: c.semester_index ?? sem.semester_index ?? null,
        credit_included: c.credit_included ?? null,
        examination_session_id:
          c.examination_session_id ?? sem.examination_session_id ?? null,
      })),
      summary: sem.summary,
    }));

  return {
    student: raw.student ?? emptyResultView(registerNumber).student,
    grade_system: raw.grade_system ?? [],
    sessions,
  };
}

export type ResultViewSource = 'coe_rest' | 'coe_db' | 'rate_limited' | 'unavailable';

export interface LearnerResultViewResult {
  view: StudentResultView | null;
  source: ResultViewSource;
  /** Set when source = 'unavailable'; the COE error when it was one. */
  error?: CoeApiError | Error;
  /** Set when the MyJKKN institution has no COE mapping. */
  institutionUnmapped?: boolean;
}

export interface LearnerResultViewInput {
  /** learners_profiles.id (COE student_id for the DB fallback). */
  learnerId: string;
  registerNumber: string;
  /** MyJKKN institution id — resolved to the COE institution id here. */
  institutionId: string;
}

/**
 * Live COE REST first (so the view AUTOMATICALLY returns to live data once a
 * COE key is restored), COE DB fallback second. 429 → `rate_limited` with an
 * empty view (never propagates; avoids client retry storms).
 */
export async function fetchLearnerResultView(
  input: LearnerResultViewInput
): Promise<LearnerResultViewResult> {
  const { learnerId, registerNumber, institutionId } = input;

  const coeInstitutionId = await resolveCoeInstitutionId(institutionId);
  if (!coeInstitutionId) {
    return { view: null, source: 'unavailable', institutionUnmapped: true };
  }

  try {
    const client = CoeRestClient.create();
    const raw = await client.get<RawResultView>('/api/v1/student-result-view', {
      register_number: registerNumber,
      institution_id: coeInstitutionId,
    });
    return { view: normalizeResultView(raw, registerNumber), source: 'coe_rest' };
  } catch (err) {
    if (err instanceof CoeApiError && err.status === 429) {
      return { view: emptyResultView(registerNumber), source: 'rate_limited', error: err };
    }

    if (isCoeDbConfigured()) {
      try {
        const view = await buildStudentResultViewFromDb(learnerId, registerNumber);
        return { view, source: 'coe_db' };
      } catch (dbErr) {
        console.error('[coe/learner-result-view] COE DB fallback failed:', dbErr);
      }
    }

    return {
      view: null,
      source: 'unavailable',
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}
