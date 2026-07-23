export const dynamic = 'force-dynamic';

// app/api/cdc/pickers/learners-detailed/route.ts
// GET /api/cdc/pickers/learners-detailed — institution-scoped learner source that
// ALSO returns program / department / admission-batch, so a UI can FILTER by those
// dimensions and select-all (the training bulk-enroll "Filter & select" mode,
// BUG-004199).
//
// Same service-role + institution-scope contract as /api/cdc/pickers/learners:
// a CDC coordinator holds cdc.* but NOT learners.* (the BUG-004044 class), so the
// browser/RLS client returns 0 rows. We read via the service-role client to bypass
// that RLS gap, then re-impose the SAME institution scope every other CDC API uses
// (createApiInstitutionFilter + applyInstitutionFilterToQuery). super_admin /
// admission keep their cross-institution bypass; everyone else only ever sees their
// own institutions' learners — no cross-tenant leak. The ONLY difference from the
// plain picker route is the richer projection.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import {
  createApiInstitutionFilter,
  applyInstitutionFilterToQuery,
} from '@/lib/auth/api-institution-filter';

// To-one PostgREST embeds normally come back as an object, but the codebase's
// array-or-object gotcha means we defensively unwrap a one-element array too.
function embeddedName(v: unknown, key: string): string | null {
  const o = Array.isArray(v) ? v[0] : v;
  if (o && typeof o === 'object') {
    const name = (o as Record<string, unknown>)[key];
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  }
  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const filter = await createApiInstitutionFilter(request);
  if (!filter.isAllowed) {
    return NextResponse.json(
      { error: filter.reason || 'Institution access denied' },
      { status: 403 }
    );
  }

  try {
    const supabase = createServiceRoleClient();
    let query = supabase
      .from('learners_profiles')
      .select(
        `id, first_name, last_name, register_number,
         program_id, department_id, admission_year_id,
         program:programs!fk_learners_profiles_program(program_name),
         department:departments!fk_learners_profiles_department(department_name),
         admission_year:admission_years!learners_profiles_admission_year_id_fkey(admission_year_name)`
      )
      .in('lifecycle_status', ['active', 'graduated'])
      .order('first_name', { ascending: true })
      .limit(5000);

    query = applyInstitutionFilterToQuery(query, filter);

    const { data, error } = await query;
    if (error) {
      console.error('[cdc/pickers/learners-detailed] query failed:', error.message);
      return NextResponse.json({ error: 'Failed to load learners' }, { status: 500 });
    }

    const learners = ((data || []) as Array<Record<string, unknown>>).map((l) => ({
      id: l.id as string,
      name: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Unnamed learner',
      register_number: (l.register_number as string | null) ?? null,
      program_id: (l.program_id as string | null) ?? null,
      program_name: embeddedName(l.program, 'program_name'),
      department_id: (l.department_id as string | null) ?? null,
      department_name: embeddedName(l.department, 'department_name'),
      batch_id: (l.admission_year_id as string | null) ?? null,
      batch_name: embeddedName(l.admission_year, 'admission_year_name'),
    }));

    return NextResponse.json(
      { learners },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[cdc/pickers/learners-detailed] error:', err);
    return NextResponse.json({ error: 'Failed to load learners' }, { status: 500 });
  }
}
