/**
 * GET /api/learners/my-marks/result
 *
 * Returns ONLY the calling student's published semester result for a single
 * exam session. COE's /api/v1/results endpoint returns published+declared
 * marks for every learner in a session; this proxy:
 *   1. Resolves the caller's register_number + COE institution.
 *   2. Looks up the caller's COE student_id from /api/v1/registrations for the
 *      session (so it can ask COE to scope server-side via learner_id).
 *   3. Calls /api/v1/results scoped to (session_id, institution_id, learner_id).
 *   4. Defensively re-filters to the caller's register_number before returning.
 *
 * By COE's contract, a row only appears here when the result is Published AND
 * the session's result_declaration_date has arrived — so any returned row is
 * "officially declared". An empty array means "not declared yet".
 *
 * Required params:
 *   examSessionId   — the exam session (one per semester, from registrations)
 *
 * Security: a student can NEVER see another student's result. The
 * register_number filter happens before any data leaves this route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { resolveCoeInstitutionId } from '@/lib/utils/internal-marks/internal-marks-access';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import type { MyMarksResultRow, MyMarksResultResponse } from '@/types/my-marks';

/** Raw shape of a COE /api/v1/results row (subset we consume). */
interface CoeResultRow {
  student_id?: string;
  register_number?: string;
  course_offering_id?: string | null;
  course_id?: string | null;
  program_code?: string | null;
  internal_marks_obtained?: number | null;
  internal_marks_maximum?: number | null;
  external_marks_obtained?: number | null;
  external_marks_maximum?: number | null;
  total_marks_obtained?: number | null;
  total_marks_maximum?: number | null;
  percentage?: number | null;
  letter_grade?: string | null;
  grade_points?: number | null;
  credit?: number | null;
  total_grade_points?: number | null;
  is_pass?: boolean | null;
  pass_status?: string | null;
  result_status?: string | null;
  result_declaration_date?: string | null;
  session_status?: string | null;
}

interface CoeRegistrationRow {
  student_id?: string;
  stu_register_no?: string;
}

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const examSessionId = searchParams.get('examSessionId');
    if (!examSessionId) {
      return NextResponse.json(
        { error: 'examSessionId is required' },
        { status: 400 }
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
      return NextResponse.json(
        { error: 'Institution not mapped in COE' },
        { status: 404 }
      );
    }

    const client = CoeRestClient.create();

    // Resolve the caller's COE student_id from registrations so we can scope
    // the results query server-side (avoids pulling every learner's result).
    // If we can't resolve it, we still proceed — the register_number filter
    // below is the real security boundary.
    let studentId: string | undefined;
    try {
      const regsRaw = await client.get<
        { data: CoeRegistrationRow[] } | CoeRegistrationRow[]
      >('/api/v1/registrations', {
        institutions_id: coeInstitutionId,
        examination_session_id: examSessionId,
        limit: '5000',
        is_regular: 'true',
      });
      const regs = Array.isArray(regsRaw) ? regsRaw : regsRaw.data ?? [];
      studentId = regs.find(
        (r) => r.stu_register_no === registerNumber
      )?.student_id;
    } catch (err) {
      console.warn(
        `[my-marks/result] student_id lookup failed for session ${examSessionId}:`,
        err
      );
    }

    // Fetch published results for the session. COE only returns rows that are
    // Published AND past their declaration date, so 404/empty == "not declared".
    let resultsRaw: { data: CoeResultRow[] } | CoeResultRow[];
    try {
      resultsRaw = await client.get<{ data: CoeResultRow[] } | CoeResultRow[]>(
        '/api/v1/results',
        {
          session_id: examSessionId,
          institution_id: coeInstitutionId,
          learner_id: studentId, // omitted automatically if undefined
        }
      );
    } catch (err) {
      // 404/400 → no published results yet. 429 → rate-limited; fail soft to an
      // empty state rather than erroring, so the client never enters a retry
      // storm (the page shows "not published yet" and recovers on a later load).
      if (
        err instanceof CoeApiError &&
        (err.status === 404 || err.status === 400 || err.status === 429)
      ) {
        if (err.status === 429) {
          console.warn(
            '[my-marks/result] COE 429 (rate limited) — returning empty result to avoid retry storm'
          );
        }
        const empty: MyMarksResultResponse = { results: [], declared: false };
        return NextResponse.json({ data: empty });
      }
      throw err;
    }

    const rawRows = Array.isArray(resultsRaw) ? resultsRaw : resultsRaw.data ?? [];

    // SERVER-SIDE FILTER: only the caller's own rows are allowed to leave.
    const myRows = rawRows.filter(
      (r) => r.register_number === registerNumber
    );

    const results: MyMarksResultRow[] = myRows.map((r) => ({
      course_offering_id: r.course_offering_id ?? null,
      course_id: r.course_id ?? null,
      program_code: r.program_code ?? null,
      register_number: r.register_number ?? registerNumber,
      internal_obtained: r.internal_marks_obtained ?? null,
      internal_max: r.internal_marks_maximum ?? null,
      external_obtained: r.external_marks_obtained ?? null,
      external_max: r.external_marks_maximum ?? null,
      total_obtained: r.total_marks_obtained ?? null,
      total_max: r.total_marks_maximum ?? null,
      percentage: r.percentage ?? null,
      letter_grade: r.letter_grade ?? null,
      grade_points: r.grade_points ?? null,
      credit: r.credit ?? null,
      total_grade_points: r.total_grade_points ?? null,
      is_pass: r.is_pass ?? null,
      pass_status: r.pass_status ?? null,
      result_status: r.result_status ?? null,
      result_declaration_date: r.result_declaration_date ?? null,
      session_status: r.session_status ?? null,
    }));

    const response: MyMarksResultResponse = {
      results,
      declared: results.length > 0,
    };

    const res = NextResponse.json({ data: response });
    // Published results are immutable; cache briefly to avoid re-hitting COE
    // as the student clicks between semesters.
    res.headers.set(
      'Cache-Control',
      'private, max-age=30, stale-while-revalidate=120'
    );
    return res;
  } catch (error) {
    if (error instanceof CoeApiError) {
      // Fail soft on rate-limit so a 429 burst doesn't cascade into a client
      // retry storm — return an empty (not declared) view instead of erroring.
      if (error.status === 429) {
        console.warn(
          '[my-marks/result] COE 429 (rate limited) — returning empty result to avoid retry storm'
        );
        return NextResponse.json({ data: { results: [], declared: false } });
      }
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }
    console.error('[my-marks/result] error:', error);
    return NextResponse.json(
      { error: 'Failed to load your result' },
      { status: 500 }
    );
  }
}
