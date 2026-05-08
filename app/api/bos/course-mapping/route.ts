// app/api/bos/course-mapping/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { canAccessBos, resolveCoeInstitutionId } from '@/lib/utils/bos/bos-access';

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
    const data = await client.get<unknown>('/api/v1/course-mapping', {
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
