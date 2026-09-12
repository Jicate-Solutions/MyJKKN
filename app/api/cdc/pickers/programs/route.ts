export const dynamic = 'force-dynamic';

// app/api/cdc/pickers/programs/route.ts
// GET /api/cdc/pickers/programs?drive_id=<uuid>
//
// Option source for the drive eligibility form, so the CDC team picks real
// programs instead of typing ids.
//
// WHY service-role: the same RLS gap the staff / learners / semesters pickers
// document. A CDC coordinator holds cdc.* but NOT organization/academic
// permissions, so the browser (anon/RLS) client returns 0 rows from `programs`
// and the picker looks empty. RLS denies by returning no rows rather than an
// error, so this fails silently and looks like "this institution has no
// programs". We read via service-role and then re-impose the SAME institution
// scope every other CDC picker uses (applyInstitutionFilterToQuery), so
// super_admin keeps its cross-institution view (institutionIds: []) and
// everyone else only ever sees their own institutions' programs.
//
// `drive_id` narrows further to the institutions that drive actually targets —
// eligibility for a drive should not offer programs from a college the drive
// was never aimed at. The caller's own scope is still applied on top, so a
// drive_id can never widen access.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import {
  createApiInstitutionFilter,
  applyInstitutionFilterToQuery,
} from '@/lib/auth/api-institution-filter';

interface ProgramRow {
  id: string;
  program_name: string | null;
  display_name: string | null;
  institution_id: string | null;
  program_order: number | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Step 1: Session auth — must be a logged-in user.
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Step 2: Resolve caller's institution scope (super_admin bypass preserved).
  const filter = await createApiInstitutionFilter(request);
  if (!filter.isAllowed) {
    return NextResponse.json(
      { error: filter.reason || 'Institution access denied' },
      { status: 403 }
    );
  }

  const driveId = request.nextUrl.searchParams.get('drive_id');

  try {
    const supabase = createServiceRoleClient();

    // Step 3: narrow to the drive's target institutions when asked.
    let driveInstitutions: string[] = [];
    if (driveId) {
      const { data: drive, error: driveErr } = await supabase
        .from('cdc_drives')
        .select('institutions')
        .eq('id', driveId)
        .maybeSingle();
      if (driveErr) {
        console.error('[cdc/pickers/programs] drive lookup failed:', driveErr.message);
      }
      driveInstitutions = ((drive?.institutions as string[] | null) ?? []).filter(Boolean);
    }

    let query = supabase
      .from('programs')
      .select('id, program_name, display_name, institution_id, program_order')
      .eq('is_active', true)
      .order('program_order', { ascending: true })
      .limit(2000);

    if (driveInstitutions.length > 0) {
      query = query.in('institution_id', driveInstitutions);
    }

    // Step 4: ... then re-impose the caller's institution scope (NEVER cross-tenant).
    query = applyInstitutionFilterToQuery(query, filter);

    const { data, error } = await query;
    if (error) {
      console.error('[cdc/pickers/programs] query failed:', error.message);
      return NextResponse.json({ error: 'Failed to load programs' }, { status: 500 });
    }

    // MERGE DUPLICATE MASTER ROWS. `programs` holds more than one active row for
    // the same program at the same institution — on JKKN College of Engineering
    // and Technology, five programs are doubled. Learners are split unevenly
    // across the copies (B.E. CSE: 237 learners on one id, 2 on the other), so
    // offering them as two identical checkboxes lets a coordinator tick the
    // wrong one and silently miss almost the whole cohort — the exact
    // reaches-nobody failure this feature exists to end. One option per distinct
    // name, carrying EVERY id that shares it, so a single tick covers them all.
    const grouped = new Map<
      string,
      { value: string; label: string; ids: string[]; institution_id: string | null; order: number }
    >();
    for (const p of (data ?? []) as ProgramRow[]) {
      const label = (p.display_name || p.program_name || '').trim();
      if (!label) continue;
      const key = `${p.institution_id ?? ''}::${label.toLowerCase()}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.ids.push(p.id);
        existing.order = Math.min(existing.order, p.program_order ?? 9999);
      } else {
        grouped.set(key, {
          value: p.id,
          label,
          ids: [p.id],
          institution_id: p.institution_id,
          order: p.program_order ?? 9999,
        });
      }
    }

    const options = Array.from(grouped.values())
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
      .map(({ value, label, ids, institution_id }) => ({ value, label, ids, institution_id }));

    return NextResponse.json(
      { options },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[cdc/pickers/programs] error:', err);
    return NextResponse.json({ error: 'Failed to load programs' }, { status: 500 });
  }
}
