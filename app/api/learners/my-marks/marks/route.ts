/**
 * GET /api/learners/my-marks/marks
 *
 * Returns ONLY the calling student's marks for a single (course, round).
 * The COE /api/v1/cia-marks/report endpoint returns all learners in a
 * course; this proxy server-side-filters that down to one row before
 * sending anything back. A student can never see another student's marks
 * even if they tamper with the query string.
 *
 * Required params:
 *   examSessionId
 *   courseCode
 *   ciaRound        (1 | 2 | 3)
 *   programCode
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { resolveCoeInstitutionId } from '@/lib/utils/internal-marks/internal-marks-access';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import { flattenReportExtraMarks } from '@/lib/utils/internal-marks/flatten-extra-marks';
import type { CiaReportResponse } from '@/types/internal-marks';
import type { MyMarksReportRow } from '@/types/my-marks';

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
    const courseCode = searchParams.get('courseCode');
    const ciaRound = searchParams.get('ciaRound');
    const programCode = searchParams.get('programCode');

    if (!examSessionId || !courseCode || !ciaRound || !programCode) {
      return NextResponse.json(
        {
          error:
            'examSessionId, courseCode, ciaRound, and programCode are required',
        },
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

    // Gracefully handle "no report exists" — a course with no marks entered
    // yet returns 400/404 from COE. From the student's POV that's "marks
    // pending" not "error", so we degrade to a null row and let the UI
    // render em-dashes.
    let raw: CiaReportResponse;
    try {
      raw = await client.get<CiaReportResponse>('/api/v1/cia-marks/report', {
        institutions_id: coeInstitutionId,
        examination_session_id: examSessionId,
        course_code: courseCode,
        cia_round: ciaRound,
        program_code: programCode,
      });
    } catch (err) {
      if (err instanceof CoeApiError && (err.status === 404 || err.status === 400)) {
        return NextResponse.json({
          data: { row: null, course: null, round: null, exam_session: null },
        });
      }
      throw err;
    }

    const flat = flattenReportExtraMarks(raw);

    // SERVER-SIDE FILTER: only the caller's own row is allowed to leave.
    const myRow = (flat?.learners ?? []).find(
      (l) => l.register_number === registerNumber
    );

    const row: MyMarksReportRow | null = myRow
      ? {
          course_code: flat.course?.course_code ?? courseCode,
          course_name: flat.course?.course_name ?? '',
          internal_max_mark: flat.course?.internal_max_mark ?? 0,
          cia_round: Number(ciaRound),
          cia_round_name: flat.round?.round_name ?? `CIA ${ciaRound}`,
          marks: myRow.marks ?? {},
          total: myRow.total ?? null,
          has_entries: Object.values(myRow.marks ?? {}).some(
            (v) => v !== null && v !== undefined
          ),
        }
      : null;

    return NextResponse.json({
      data: {
        row,
        course: flat.course,
        round: flat.round,
        exam_session: flat.exam_session,
      },
    });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }
    console.error('[my-marks/marks] error:', error);
    return NextResponse.json(
      { error: 'Failed to load your marks' },
      { status: 500 }
    );
  }
}
