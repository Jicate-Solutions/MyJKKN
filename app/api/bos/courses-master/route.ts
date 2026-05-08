// app/api/bos/courses-master/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { canAccessBos, resolveCoeInstitutionId } from '@/lib/utils/bos/bos-access';
import { courseFormSchema, toCoeCreatePayload } from '@/lib/services/bos/courses-schemas';

// ── GET /api/bos/courses-master ───────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await canAccessBos(user.id, 'academic.bos-courses', 'view'))) {
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
    const data = await client.get<unknown>('/api/v1/courses', {
      institutions_id: coeInstitutionId,
      regulation_code: searchParams.get('regulation_code') ?? undefined,
      program_code:    searchParams.get('program_code') ?? undefined,
      search:          searchParams.get('search') ?? undefined,
      is_active:       searchParams.get('is_active') ?? 'true',
      limit:           searchParams.get('limit') ?? '100',
      offset:          searchParams.get('offset') ?? '0',
    });

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[bos/courses-master] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 });
  }
}

// ── POST /api/bos/courses-master ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await canAccessBos(user.id, 'academic.bos-courses', 'create'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = courseFormSchema.safeParse(body.form);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { institution_id, institution_code, regulation_code, regulation_id } = body.context ?? {};
    if (!institution_id || !institution_code || !regulation_code) {
      return NextResponse.json(
        { error: 'context.institution_id, .institution_code, .regulation_code required' },
        { status: 400 }
      );
    }

    const coeInstitutionId = await resolveCoeInstitutionId(institution_id);
    if (!coeInstitutionId) {
      return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
    }

    const payload = toCoeCreatePayload(parsed.data, {
      institutions_id: coeInstitutionId,
      institution_code,
      regulation_code,
      regulation_id,
    });

    const client = CoeRestClient.create();
    const created = await client.post<unknown>('/api/v1/courses', payload);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    console.error('[bos/courses-master] POST error:', error);
    return NextResponse.json({ error: 'Failed to create course' }, { status: 500 });
  }
}
