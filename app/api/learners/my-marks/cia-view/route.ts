/**
 * GET /api/learners/my-marks/cia-view
 *
 * Single-call proxy to COE /api/v1/student-cia-view — returns the calling
 * student's entire internal-assessment (CIA) view: every session, its CIA
 * round/component config (settings[]) and the learner's component marks per
 * course per round (courses[].rounds[]). Replaces the old ~40-call fan-out
 * (registrations + cia-settings + cia-marks/report per course per round).
 *
 * Security: passes the caller's own register_number + COE institution, so COE
 * resolves and returns only this learner. Resilience: fail-soft on 429/404.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { isCoeDbConfigured } from '@/lib/services/coe/coe-db-client';
import { buildStudentCiaViewFromDb } from '@/lib/services/coe/build-student-cia-view';
import { resolveCoeInstitutionId } from '@/lib/utils/internal-marks/internal-marks-access';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import type { StudentCiaView, CiaViewSession } from '@/types/my-marks';

function emptyView(registerNumber: string): StudentCiaView {
  return {
    student: {
      student_id: null,
      register_number: registerNumber,
      student_name: null,
      program_code: null,
      grade_system_code: '',
    },
    sessions: [],
  };
}

/**
 * COE may return the session-grouped shape (`sessions[]`) or, during rollout, a
 * legacy semester-grouped shape (`semesters[]`). Normalize to `sessions[]` so
 * the client only ever sees one shape.
 */
interface RawCiaView {
  student?: StudentCiaView['student'];
  sessions?: CiaViewSession[];
  semesters?: Array<
    Partial<CiaViewSession> & {
      semester_label: string;
      semester_index: number;
      settings?: CiaViewSession['settings'];
      courses?: CiaViewSession['courses'];
    }
  >;
}

function normalizeCiaView(raw: RawCiaView, registerNumber: string): StudentCiaView {
  const sessions: CiaViewSession[] =
    raw.sessions ??
    (raw.semesters ?? []).map((sem) => ({
      examination_session_id: sem.examination_session_id ?? null,
      session_code: sem.session_code ?? null,
      session_name: sem.session_name ?? null,
      session_status: sem.session_status ?? null,
      semester_code: sem.semester_code ?? null,
      semester_label: sem.semester_label,
      semester_index: sem.semester_index,
      settings: sem.settings ?? [],
      courses: sem.courses ?? [],
    }));

  return {
    student: raw.student ?? emptyView(registerNumber).student,
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
      return NextResponse.json({ error: 'Student profile not found' }, { status: 404 });
    }

    const { data: learner } = await adminClient
      .from('learners_profiles')
      .select('register_number, institution_id')
      .eq('id', profile.learner_id)
      .single();

    const registerNumber = learner?.register_number;
    const institutionId = learner?.institution_id;
    if (!registerNumber || !institutionId) {
      return NextResponse.json({ error: 'Student profile incomplete' }, { status: 422 });
    }

    const coeInstitutionId = await resolveCoeInstitutionId(institutionId);
    if (!coeInstitutionId) {
      console.warn(
        `[my-marks/cia-view] 404 institution-not-mapped: register_number=${registerNumber} myjkkn_institution_id=${institutionId}`
      );
      return NextResponse.json(
        { error: 'Institution not mapped in COE', institution_id: institutionId },
        { status: 404 }
      );
    }

    let view: StudentCiaView | null = null;

    // Prefer the live COE REST endpoint (richest, publish-gated view). This is
    // tried first on every request so the route AUTOMATICALLY returns to the
    // full grid the moment the COE API key is restored.
    try {
      const client = CoeRestClient.create();
      const raw = await client.get<RawCiaView>('/api/v1/student-cia-view', {
        register_number: registerNumber,
        institution_id: coeInstitutionId,
      });
      view = normalizeCiaView(raw, registerNumber);
      console.warn(
        `[my-marks/cia-view] register_number=${registerNumber} COE keys=[${Object.keys(raw ?? {}).join(',')}] sessions=${raw?.sessions?.length ?? 'none'} semesters=${raw?.semesters?.length ?? 'none'} → ${view.sessions.length} tab(s)`
      );
    } catch (err) {
      // Transient rate-limit → empty view (don't fall back to a heavy DB build
      // on every burst; the next request retries REST).
      if (err instanceof CoeApiError && err.status === 429) {
        console.warn(
          '[my-marks/cia-view] COE 429 (rate limited) — returning empty view to avoid retry storm'
        );
        return NextResponse.json({ data: emptyView(registerNumber) });
      }

      // Any other REST failure (expired/absent API key → 401/403, config missing,
      // 5xx, 404) → fall back to reading the COE database directly so the student
      // still sees their stored internal marks.
      if (isCoeDbConfigured()) {
        try {
          view = await buildStudentCiaViewFromDb(profile.learner_id, registerNumber);
          console.warn(
            `[my-marks/cia-view] COE REST unavailable (${
              err instanceof CoeApiError ? err.status : 'config'
            }) → served ${view.sessions.length} session(s) from COE DB fallback for ${registerNumber}`
          );
        } catch (dbErr) {
          console.error('[my-marks/cia-view] COE DB fallback failed:', dbErr);
        }
      }

      if (!view) {
        // Neither path worked — preserve the original error surface.
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
    res.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=120');
    return res;
  } catch (error) {
    if (error instanceof CoeApiError) {
      console.warn(`[my-marks/cia-view] ${error.status} COE-error: ${error.message}`);
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }
    console.error('[my-marks/cia-view] error:', error);
    return NextResponse.json({ error: 'Failed to load your internal marks' }, { status: 500 });
  }
}
