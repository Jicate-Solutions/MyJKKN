// app/api/bos/course-mapping/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { canAccessBos, resolveCoeInstitutionId } from '@/lib/utils/bos/bos-access';

// COE returns the joined course record under the key `courses` (plural, Supabase
// convention) with `credits` and `course_title`. We normalize to the singular
// `course` key with `credit` and `course_name` to match BosCourseMappingDetailed.
function normalizeMappingResponse(raw: Record<string, unknown>): Record<string, unknown> {
  const rows = raw?.data;
  if (!Array.isArray(rows)) return raw;
  return {
    ...raw,
    data: rows.map((m: Record<string, unknown>) => {
      const joined = (m.courses ?? {}) as Record<string, unknown>;
      const course: Record<string, unknown> = {
        ...joined,
        course_name: joined.course_name ?? joined.course_title ?? '',
        credit:      joined.credit      ?? joined.credits      ?? 0,
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
    const raw = await client.get<Record<string, unknown>>('/api/v1/course-mapping', {
      institutions_id: coeInstitutionId,
      program_code:    searchParams.get('program_code') ?? undefined,
      regulation_code: searchParams.get('regulation_code') ?? undefined,
      batch_code:      searchParams.get('batch_code') ?? undefined,
      semester_code:   searchParams.get('semester_code') ?? undefined,
      is_active:       searchParams.get('is_active') ?? 'true',
      details:         searchParams.get('details') ?? 'true',
      id:              searchParams.get('id') ?? undefined,
      limit:           searchParams.get('limit') ?? '500',
    });

    // Normalize COE field names to match BosCourseMappingDetailed type:
    // COE returns join as `courses` (plural) with `credits`/`course_title`;
    // our type expects `course` (singular) with `credit`/`course_name`.
    const data = normalizeMappingResponse(raw);
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
