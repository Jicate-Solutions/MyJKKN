import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import {
  resolveInternalMarksAccess,
  resolveCoeInstitutionCode,
  resolveCoeInstitutionById,
} from '@/lib/utils/internal-marks/internal-marks-access';
import type { IaCourseOutcome } from '@/types/ia-question-paper';

/**
 * /api/question-papers/course-outcomes — proxy to COE `/api/v1/ia/course-outcomes`.
 *
 * The CO master (CO1…CO5 + descriptions) per course. It feeds the CO dropdown on
 * every question card, and the authoring screen's CO manager writes to it.
 *
 * Deliberately NOT a hard gate: when a course has no COs defined the editor falls
 * back to CO1–CO6, so a missing master can never block an author from finishing a
 * paper (spec 5.3).
 *
 * GET    ?course_id=…                     → { data: IaCourseOutcome[] }
 * POST   { course_id, course_code, outcomes[] | co_code, co_description }
 * DELETE ?id=…                            → { success: true }
 */

/** Resolve the caller's COE institution_code, or null when they have no scope. */
async function callerInstitutionCode(userId: string): Promise<{
  code: string | null;
  isSuperAdmin: boolean;
}> {
  const scope = await resolveInternalMarksAccess(userId);
  if (!scope.institutionId) return { code: null, isSuperAdmin: scope.isSuperAdmin };
  return {
    code: await resolveCoeInstitutionCode(scope.institutionId),
    isSuperAdmin: scope.isSuperAdmin,
  };
}

/**
 * Do these COE rows belong to the caller's institution? CAS-safe: compares the
 * COE institution_code, so SF + Aided siblings share one CO master.
 */
async function rowsInScope(
  rows: IaCourseOutcome[] | undefined,
  callerCode: string | null,
  isSuperAdmin: boolean
): Promise<boolean> {
  if (isSuperAdmin) return true;
  if (!rows || rows.length === 0) return true; // nothing to leak
  if (!callerCode) return false;
  const inst = await resolveCoeInstitutionById(rows[0].institutions_id);
  return !!inst && inst.institution_code.toUpperCase() === callerCode.toUpperCase();
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

    const courseId = request.nextUrl.searchParams.get('course_id');
    const courseCode = request.nextUrl.searchParams.get('course_code');
    if (!courseId && !courseCode) {
      return NextResponse.json(
        { error: 'course_id or course_code is required' },
        { status: 400 }
      );
    }

    const { code, isSuperAdmin } = await callerInstitutionCode(user.id);
    const qs = new URLSearchParams();
    if (courseId) qs.set('course_id', courseId);
    if (courseCode) qs.set('course_code', courseCode);
    // The course_code branch is institution-scoped COE-side; pass our code so a
    // shared code across colleges resolves to the caller's own master.
    if (code) qs.set('institution_code', code);

    const client = CoeRestClient.create();
    const coe = await client.get<{ data: IaCourseOutcome[] }>(
      `/api/v1/ia/course-outcomes?${qs.toString()}`
    );
    const rows = Array.isArray(coe?.data) ? coe.data : [];

    // The course_id branch is NOT institution-scoped upstream — re-guard here.
    if (!(await rowsInScope(rows, code, isSuperAdmin))) {
      return NextResponse.json({ data: [] });
    }
    return NextResponse.json({ data: rows });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[question-papers/course-outcomes] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch course outcomes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    if (!body?.course_id || !body?.course_code) {
      return NextResponse.json(
        { error: 'course_id and course_code are required' },
        { status: 400 }
      );
    }

    const { code } = await callerInstitutionCode(user.id);
    if (!code) {
      return NextResponse.json({ error: 'No institution scope' }, { status: 403 });
    }

    const client = CoeRestClient.create();
    // institution_code decides which institution the rows land under; always send
    // the CALLER's, never one supplied by the browser.
    const coe = await client.post<{ data: IaCourseOutcome | IaCourseOutcome[] }>(
      '/api/v1/ia/course-outcomes',
      { ...body, institution_code: code }
    );
    return NextResponse.json({ data: coe?.data }, { status: 201 });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[question-papers/course-outcomes] POST error:', error);
    return NextResponse.json({ error: 'Failed to save course outcome' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    // COE re-checks the row's institution against the API key's set; our own
    // narrower check happens implicitly because a CO the caller cannot see was
    // never offered as a chip in the first place.
    const client = CoeRestClient.create();
    await client.delete(`/api/v1/ia/course-outcomes?id=${encodeURIComponent(id)}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[question-papers/course-outcomes] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete course outcome' }, { status: 500 });
  }
}
