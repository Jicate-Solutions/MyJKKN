/**
 * GET /api/learners/my-marks/marks-batch
 *
 * Performance-optimized variant of /marks: takes ONE list of (course, round)
 * pairs and returns all of the calling student's rows in a single response.
 *
 * Replaces N separate marks fetches with one — for a semester with 8
 * subjects, this drops 8 client→server→COE round trips to 1 client→server
 * round trip + N parallel server→COE calls.
 *
 * Query params (comma-delimited):
 *   examSessionId  — single value, all rows share this session
 *   programCode    — single value
 *   ciaRound       — single value, all rows share this round
 *   courseCodes    — comma-separated list of course_codes to fetch
 *
 * Each row is server-side filtered to ONLY the calling student's
 * register_number — same security guarantee as the single-row endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { resolveCoeInstitutionId } from '@/lib/utils/internal-marks/internal-marks-access';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import { flattenReportExtraMarks } from '@/lib/utils/internal-marks/flatten-extra-marks';
import type { CiaReportResponse } from '@/types/internal-marks';
import type { MyMarksReportRow } from '@/types/my-marks';

interface BatchResponseRow {
  row: MyMarksReportRow | null;
  error?: string;
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
    const programCode = searchParams.get('programCode');
    const ciaRound = searchParams.get('ciaRound');
    const codesParam = searchParams.get('courseCodes');

    if (!examSessionId || !programCode || !ciaRound || !codesParam) {
      return NextResponse.json(
        {
          error:
            'examSessionId, programCode, ciaRound and courseCodes are required',
        },
        { status: 400 }
      );
    }

    const courseCodes = codesParam
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    if (courseCodes.length === 0) {
      return NextResponse.json({ data: { rows: {} } });
    }

    if (courseCodes.length > 50) {
      return NextResponse.json(
        { error: 'Too many course codes (max 50 per call)' },
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

    const results = await Promise.all(
      courseCodes.map(async (courseCode): Promise<[string, BatchResponseRow]> => {
        try {
          const raw = await client.get<CiaReportResponse>(
            '/api/v1/cia-marks/report',
            {
              institutions_id: coeInstitutionId,
              examination_session_id: examSessionId,
              course_code: courseCode,
              cia_round: ciaRound,
              program_code: programCode,
            }
          );
          const flat = flattenReportExtraMarks(raw);
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
          return [courseCode, { row }];
        } catch (err) {
          // 400/404 from COE → "no marks yet for this course" — render em-dash.
          if (err instanceof CoeApiError && (err.status === 404 || err.status === 400)) {
            return [courseCode, { row: null }];
          }
          // Other failures don't block siblings — surface a soft error.
          const msg = err instanceof Error ? err.message : 'Failed to load marks';
          return [courseCode, { row: null, error: msg }];
        }
      })
    );

    const rows: Record<string, BatchResponseRow> = {};
    for (const [code, val] of results) rows[code] = val;

    const res = NextResponse.json({ data: { rows } });
    // Short browser cache — marks change during entry windows but only every
    // few seconds at most. 15s lets students click around without re-hitting COE.
    res.headers.set(
      'Cache-Control',
      'private, max-age=15, stale-while-revalidate=60'
    );
    return res;
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }
    console.error('[my-marks/marks-batch] error:', error);
    return NextResponse.json(
      { error: 'Failed to load your marks' },
      { status: 500 }
    );
  }
}
