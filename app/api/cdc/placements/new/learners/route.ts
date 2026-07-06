export const dynamic = 'force-dynamic';

// ============================================================================
// app/api/cdc/placements/new/learners/route.ts
// ----------------------------------------------------------------------------
// Institution-scoped learner picker source for the "Record Placement" form
// (/cdc/placements/new).
//
// WHY THIS EXISTS (BUG-004044):
// The form previously read `learners_profiles` directly from the BROWSER
// supabase client. That table's RLS SELECT policy requires one of
// `learners.admissions.view` / `learners.profiles.view` / `learners.view`
// (plus institution access), or super_admin/admin. A CDC placement
// coordinator holds `cdc.placements.*` but typically NONE of the
// `learners.*` permissions — so the client read returned 0 rows under RLS
// and the picker rendered "No matching learners" even though ~4,500
// active+graduated learners exist.
//
// Fix: read learners server-side with the service-role client (bypasses the
// learners RLS gate), but scope strictly to the caller's accessible
// institutions via createApiInstitutionFilter so no cross-institution data
// leaks. Same defense-in-depth pattern as /api/b2a/learners.
// ============================================================================

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  createApiInstitutionFilter,
  applyInstitutionFilterToQuery,
} from '@/lib/auth/api-institution-filter';

// Learners eligible to receive a placement offer.
const PLACEABLE_LIFECYCLE_STATUSES = ['active', 'graduated'] as const;

interface LearnerPickerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  register_number: string | null;
  // Embedded via the single FK learners_profiles.institution_id -> institutions.id.
  // PostgREST returns a to-one relationship as an object (or null when unset).
  institution: { name: string | null } | null;
}

export async function GET(request: NextRequest) {
  await connection();

  // Resolve the caller's accessible institutions (super_admin / admission =>
  // all). Returns isAllowed:false when unauthenticated or no institution.
  const filter = await createApiInstitutionFilter(request);
  if (!filter.isAllowed) {
    return NextResponse.json(
      { error: filter.reason ?? 'Not authorized to view learners' },
      { status: filter.reason === 'User not authenticated' ? 401 : 403 }
    );
  }

  try {
    const supabase = createServiceRoleClient();

    let query = (supabase as any)
      .from('learners_profiles')
      .select(
        'id, first_name, last_name, register_number, institution:institutions!fk_learners_profiles_institution(name)'
      )
      .in('lifecycle_status', [...PLACEABLE_LIFECYCLE_STATUSES])
      .order('first_name', { ascending: true })
      .limit(5000);

    // Scope to the caller's institutions (no-op for super_admin / admission).
    query = applyInstitutionFilterToQuery(query, filter, 'institution_id');

    const { data, error } = await query;

    if (error) {
      console.error('[cdc/placements/new/learners] query error:', error.message);
      return NextResponse.json(
        { error: 'Failed to load learners' },
        { status: 500 }
      );
    }

    const options = ((data ?? []) as LearnerPickerRow[]).map((l) => {
      const name = `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim();
      const reg = l.register_number ? ` (${l.register_number})` : '';
      // BUG-004296: append the learner's college/institution so coordinators can
      // disambiguate same-named learners across institutions in the picker.
      const inst = l.institution?.name ? ` — ${l.institution.name}` : '';
      return { value: l.id, label: `${name}${reg}${inst}` };
    });

    return NextResponse.json(
      { data: options },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[cdc/placements/new/learners] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
