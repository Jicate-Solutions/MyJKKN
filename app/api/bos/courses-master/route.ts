// app/api/bos/courses-master/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { canAccessBos, resolveBosAccess, resolveCoeInstitutionId, applyInstitutionScope, guardInstitutionWrite } from '@/lib/utils/bos/bos-access';
import { courseFormSchema, toCoeCreatePayload } from '@/lib/services/bos/courses-schemas';
import type { BosCourseMaster, BosCourseListResponse } from '@/types/bos-courses';

/**
 * COE /api/v1/courses may return all courses without filtering by institutions_id.
 * This helper ensures we only surface courses that belong to the requested institution.
 */
function filterByInstitution(
  raw: unknown,
  coeInstitutionId: string,
): unknown {
  const keep = (c: BosCourseMaster) =>
    !c.institutions_id || c.institutions_id === coeInstitutionId;

  if (Array.isArray(raw)) {
    return (raw as BosCourseMaster[]).filter(keep);
  }
  const wrapped = raw as BosCourseListResponse;
  if (wrapped && Array.isArray(wrapped.data)) {
    return { ...wrapped, data: wrapped.data.filter(keep) };
  }
  return raw;
}

// ── GET /api/bos/courses-master ───────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [hasAccess, scope] = await Promise.all([
      canAccessBos(user.id, 'academic.bos-courses', 'view'),
      resolveBosAccess(user.id),
    ]);

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    // Non-super-admins are forced to their own institution regardless of what
    // the client sends. Super-admins use the client-provided value (may be null = all).
    const effectiveInstitutionId = applyInstitutionScope(scope, searchParams.get('institution_id'));

    if (!effectiveInstitutionId && !scope.isSuperAdmin) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }

    const client = CoeRestClient.create();

    // All-institutions mode (super-admin, no institution selected).
    if (!effectiveInstitutionId) {
      const raw = await client.get<unknown>('/api/v1/courses', {
        regulation_code: searchParams.get('regulation_code') ?? undefined,
        search:          searchParams.get('search') ?? undefined,
        is_active:       searchParams.get('is_active') ?? 'true',
        limit:           searchParams.get('limit') ?? '200',
        offset:          searchParams.get('offset') ?? '0',
      });
      return NextResponse.json(raw);
    }

    const coeInstitutionId = await resolveCoeInstitutionId(effectiveInstitutionId);
    if (!coeInstitutionId) {
      return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
    }

    const raw = await client.get<unknown>('/api/v1/courses', {
      institutions_id: coeInstitutionId,
      regulation_code: searchParams.get('regulation_code') ?? undefined,
      program_code:    searchParams.get('program_code') ?? undefined,
      search:          searchParams.get('search') ?? undefined,
      is_active:       searchParams.get('is_active') ?? 'true',
      limit:           searchParams.get('limit') ?? '100',
      offset:          searchParams.get('offset') ?? '0',
    });

    // COE may return all courses regardless of institutions_id — filter defensively.
    return NextResponse.json(filterByInstitution(raw, coeInstitutionId));
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

    const [hasAccess, scope] = await Promise.all([
      canAccessBos(user.id, 'academic.bos-courses', 'create'),
      resolveBosAccess(user.id),
    ]);

    if (!hasAccess) {
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

    const writeError = guardInstitutionWrite(scope, institution_id);
    if (writeError) {
      return NextResponse.json({ error: writeError }, { status: 403 });
    }

    const coeInstitutionId = await resolveCoeInstitutionId(institution_id);
    if (!coeInstitutionId) {
      return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
    }

    const client = CoeRestClient.create();
    const ctx = { institutions_id: coeInstitutionId, institution_code, regulation_code, regulation_id };

    // Upsert: check if a course with this code already exists for the institution.
    const searchRaw = await client.get<unknown>('/api/v1/courses', {
      institutions_id: coeInstitutionId,
      search: parsed.data.course_code.toUpperCase(),
      limit: '10',
      offset: '0',
    });
    const searchRows: BosCourseMaster[] = Array.isArray(searchRaw)
      ? searchRaw as BosCourseMaster[]
      : ((searchRaw as BosCourseListResponse)?.data ?? []);

    const existing = searchRows.find(
      (c) => c.course_code?.toUpperCase() === parsed.data.course_code.toUpperCase()
    );

    if (existing) {
      const lockVal = (existing as BosCourseMaster & { courses_status?: string }).courses_status ?? existing.course_status;
      if (lockVal?.toLowerCase() === 'locked') {
        return NextResponse.json(
          { error: 'Course already exists and is locked — cannot update', code: 'LOCKED' },
          { status: 423 }
        );
      }
      // Update existing course instead of creating a duplicate.
      const payload = toCoeCreatePayload(parsed.data, ctx);
      const updated = await client.put<unknown>(`/api/v1/courses/${existing.id}`, payload);
      return NextResponse.json({ ...updated as object, _upsertAction: 'updated' }, { status: 200 });
    }

    const payload = toCoeCreatePayload(parsed.data, ctx);
    const created = await client.post<unknown>('/api/v1/courses', payload);
    return NextResponse.json({ ...created as object, _upsertAction: 'created' }, { status: 201 });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
    }
    console.error('[bos/courses-master] POST error:', error);
    return NextResponse.json({ error: 'Failed to create course' }, { status: 500 });
  }
}
