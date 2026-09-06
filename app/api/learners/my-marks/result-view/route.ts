/**
 * GET /api/learners/my-marks/result-view
 *
 * Single-call proxy to COE /api/v1/student-result-view — returns the calling
 * student's ENTIRE multi-semester result view (every semester, regular + arrear
 * courses, marks, grades, SGPA, grade-band legend) in one request. Replaces the
 * old ~20-call fan-out (registrations + results + course-mapping + courses +
 * grade-system) for the Result tab.
 *
 * Security: we pass the caller's OWN register_number + their COE institution, so
 * COE resolves and returns only this learner (a student can never read another).
 *
 * Resilience: fails soft on 429 (returns an empty view, never propagates the
 * rate-limit error) so a burst can't trigger a client retry storm.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { isCoeDbConfigured } from '@/lib/services/coe/coe-db-client';
import { buildStudentResultViewFromDb } from '@/lib/services/coe/build-student-result-view';
import { resolveCoeInstitutionId } from '@/lib/utils/internal-marks/internal-marks-access';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import type {
  StudentResultView,
  ResultViewSession,
  ResultViewCourse,
} from '@/types/my-marks';

function emptyView(registerNumber: string): StudentResultView {
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
 * either here and normalize to `sessions[]` so the client only ever sees one
 * shape — no lockstep deploy needed between MyJKKN and COE.
 */
interface RawResultView {
  student?: StudentResultView['student'];
  grade_system?: StudentResultView['grade_system'];
  sessions?: ResultViewSession[];
  // Legacy semester-grouped shape (each lacks session_code/name but is otherwise
  // structurally compatible with a session tab).
  semesters?: Array<
    Partial<ResultViewSession> & {
      semester_label: string;
      semester_index: number;
      courses: ResultViewCourse[];
      summary: ResultViewSession['summary'];
    }
  >;
}

function normalizeResultView(
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
    student:
      raw.student ?? emptyView(registerNumber).student,
    grade_system: raw.grade_system ?? [],
    sessions,
  };
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const validation = await StudentValidationService.validateStudentAccess(user.id);
    if (!validation.allowed) {
      return NextResponse.json(
        { error: 'Forbidden', reason: validation.reason },
        { status: 403 }
      );
    }

    const adminClient = createServiceRoleClient();
    const { data: profile } = await adminClient
      .from('profiles')
      .select('learner_id, role')
      .eq('id', user.id)
      .single();

    if (!profile?.learner_id || profile.role !== 'student') {
      return NextResponse.json(
        { error: 'Student profile not found' },
        { status: 404 }
      );
    }

    const { data: learner } = await adminClient
      .from('learners_profiles')
      .select('register_number, institution_id')
      .eq('id', profile.learner_id)
      .single();

    const registerNumber = learner?.register_number;
    const institutionId = learner?.institution_id;
    if (!registerNumber || !institutionId) {
      return NextResponse.json(
        { error: 'Student profile incomplete' },
        { status: 422 }
      );
    }

    const coeInstitutionId = await resolveCoeInstitutionId(institutionId);
    if (!coeInstitutionId) {
      console.warn(
        `[my-marks/result-view] 404 institution-not-mapped: register_number=${registerNumber} myjkkn_institution_id=${institutionId}`
      );
      return NextResponse.json(
        { error: 'Institution not mapped in COE', institution_id: institutionId },
        { status: 404 }
      );
    }

    let view: StudentResultView | null = null;

    // Prefer the live COE REST endpoint; tried first on every request so the
    // route AUTOMATICALLY returns to the live view once the COE key is restored.
    try {
      const client = CoeRestClient.create();
      const raw = await client.get<RawResultView>('/api/v1/student-result-view', {
        register_number: registerNumber,
        institution_id: coeInstitutionId,
      });
      view = normalizeResultView(raw, registerNumber);
      console.warn(
        `[my-marks/result-view] register_number=${registerNumber} COE keys=[${Object.keys(raw ?? {}).join(',')}] sessions=${raw?.sessions?.length ?? 'none'} semesters=${raw?.semesters?.length ?? 'none'} → normalized ${view.sessions.length} tab(s)`
      );
    } catch (err) {
      // Transient rate-limit → empty view (next request retries REST).
      if (err instanceof CoeApiError && err.status === 429) {
        console.warn(
          '[my-marks/result-view] COE 429 (rate limited) — returning empty view to avoid retry storm'
        );
        return NextResponse.json({ data: emptyView(registerNumber) });
      }

      // Any other REST failure (expired/absent key → 401/403, config missing,
      // 5xx, 404) → read the declared results directly from the COE database.
      if (isCoeDbConfigured()) {
        try {
          view = await buildStudentResultViewFromDb(profile.learner_id, registerNumber);
          console.warn(
            `[my-marks/result-view] COE REST unavailable (${
              err instanceof CoeApiError ? err.status : 'config'
            }) → served ${view.sessions.length} session(s) from COE DB fallback for ${registerNumber}`
          );
        } catch (dbErr) {
          console.error('[my-marks/result-view] COE DB fallback failed:', dbErr);
        }
      }

      if (!view) {
        if (err instanceof CoeApiError) {
          return NextResponse.json(
            { error: err.message, details: err.details },
            { status: err.status }
          );
        }
        throw err;
      }
    }

    const res = NextResponse.json({ data: view });
    // Published results are immutable; cache briefly to ease repeat views.
    res.headers.set(
      'Cache-Control',
      'private, max-age=30, stale-while-revalidate=120'
    );
    return res;
  } catch (error) {
    if (error instanceof CoeApiError) {
      console.warn(`[my-marks/result-view] ${error.status} COE-error: ${error.message}`);
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }
    console.error('[my-marks/result-view] error:', error);
    return NextResponse.json(
      { error: 'Failed to load your result' },
      { status: 500 }
    );
  }
}
