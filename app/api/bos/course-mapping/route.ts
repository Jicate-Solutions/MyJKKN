// app/api/bos/course-mapping/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { canAccessBos, resolveCoeInstitutionId } from '@/lib/utils/bos/bos-access';
import type { BosCourseMaster, BosCourseListResponse } from '@/types/bos-courses';

// Normalize the basic join fields that COE aliases differently.
// Structural fields (course_part_master, exam_duration, theory_hours, practical_hours)
// are NOT in the join — they are merged from a separate COE courses fetch below.
function normalizeMappingResponse(
  raw: Record<string, unknown>,
  coursesByCode: Map<string, BosCourseMaster>,
): Record<string, unknown> {
  const rows = raw?.data;
  if (!Array.isArray(rows)) return raw;
  return {
    ...raw,
    data: rows.map((m: Record<string, unknown>) => {
      const joined = (m.courses ?? {}) as Record<string, unknown>;
      // course_code lives on the flat mapping row, not inside the join object.
      const courseCode = (m.course_code ?? joined.course_code ?? '') as string;
      const full = coursesByCode.get(courseCode);
      const course: Record<string, unknown> = {
        ...joined,
        course_name:        joined.course_name  ?? joined.course_title    ?? '',
        credit:             joined.credit       ?? joined.credits         ?? 0,
        // Prefer the full course record for structural fields missing from the join.
        course_part_master: full?.course_part_master ?? joined.course_part_master ?? joined.part ?? null,
        course_type_code:   full?.course_type_code   ?? joined.course_type_code   ?? null,
        exam_duration:      full?.exam_duration      ?? joined.exam_duration      ?? null,
        theory_hours:       full?.theory_hours       ?? joined.theory_hours       ?? null,
        practical_hours:    full?.practical_hours     ?? joined.practical_hours    ?? null,
      };
      const { courses: _courses, ...rest } = m;
      return { ...rest, course };
    }),
  };
}

// ── GET /api/bos/course-mapping ───────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!(await canAccessBos(user.id, 'academic.bos-scheme', 'view'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');
    if (!institutionId) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }

    const coeInstitutionId = await resolveCoeInstitutionId(institutionId);
    if (!coeInstitutionId) {
      return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
    }

    const client = CoeRestClient.create();
    const programCode    = searchParams.get('program_code')    ?? undefined;
    const regulationCode = searchParams.get('regulation_code') ?? undefined;

    // Fetch mappings + full courses in parallel — courses provide the structural
    // fields (Part, Exam, L, P) that the mapping join omits.
    const [raw, coursesRaw] = await Promise.all([
      client.get<Record<string, unknown>>('/api/v1/course-mapping', {
        institutions_id: coeInstitutionId,
        program_code:    programCode,
        regulation_code: regulationCode,
        batch_code:      searchParams.get('batch_code')    ?? undefined,
        semester_code:   searchParams.get('semester_code') ?? undefined,
        is_active:       searchParams.get('is_active')     ?? 'true',
        details:         searchParams.get('details')       ?? 'true',
        id:              searchParams.get('id')            ?? undefined,
        // COE's /api/v1/course-mapping does range(0, limit-1) and IGNORES offset,
        // so it can't be drained page-by-page — request the producer's single-call
        // max (10000) instead. A CAS college's all-program scheme (no program_code)
        // exceeds 500, and since COE sorts PG (24P*) before UG (24U*), the dropped
        // tail is the UG data.
        limit:           searchParams.get('limit')         ?? '10000',
      }),
      client.get<unknown>('/api/v1/courses', {
        institutions_id: coeInstitutionId,
        regulation_code: regulationCode,
        // No program_code — shared courses (Tamil, English, NME) are not
        // program-scoped in COE, so filtering by program would exclude them.
        is_active:       'true',
        // Was '500' — truncated the courses supplement so UG structural fields
        // (Part, L+P, hours) went missing for large (CAS) institutions. 10000 is
        // the COE producer's single-call cap.
        limit:           '10000',
        offset:          '0',
      }),
    ]);

    // Build a lookup map: course_code → full BosCourseMaster
    const coursesList: BosCourseMaster[] = Array.isArray(coursesRaw)
      ? (coursesRaw as BosCourseMaster[])
      : ((coursesRaw as BosCourseListResponse)?.data ?? []);
    const coursesByCode = new Map(coursesList.map((c) => [c.course_code, c]));

    const data = normalizeMappingResponse(raw, coursesByCode);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[bos/course-mapping] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch mappings' }, { status: 500 });
  }
}

// ── POST /api/bos/course-mapping (single OR bulk via mappings: []) ────────────
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!(await canAccessBos(user.id, 'academic.bos-scheme', 'edit'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const client = CoeRestClient.create();

    // Pass through — COE handles single vs bulk via the `mappings` key
    const result = await client.post<unknown>('/api/v1/course-mapping', body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status },
      );
    }
    console.error('[bos/course-mapping] POST error:', error);
    return NextResponse.json({ error: 'Failed to create mapping' }, { status: 500 });
  }
}
