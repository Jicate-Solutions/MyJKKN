export const dynamic = 'force-dynamic';

// ============================================================================
// app/api/cdc/internships/new/learners/route.ts
// ----------------------------------------------------------------------------
// Institution-scoped learner picker source for the "New Corporate Internship"
// form (/cdc/internships/new).
//
// WHY THIS EXISTS (BUG-004294):
// The form previously used the shared /api/cdc/pickers/learners picker, whose
// label is "First Last (REGISTER_NO)" with no institution. When a coordinator
// can see learners across more than one institution, two learners with similar
// names are indistinguishable in the dropdown. This route adds the learner's
// institution name to the label — same approach as placements (BUG-004296).
//
// It keeps the same service-role + re-imposed-institution-scope pattern as the
// shared picker and the placements picker (createApiInstitutionFilter +
// applyInstitutionFilterToQuery): a CDC coordinator holds cdc.* but NOT
// learners.*, so a browser/RLS read returns 0 rows. We read via the
// service-role client to bypass that RLS gap, then re-impose the SAME
// institution scope so no cross-tenant data leaks.
// ============================================================================

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  createApiInstitutionFilter,
  applyInstitutionFilterToQuery,
} from '@/lib/auth/api-institution-filter';

// Learners eligible to be assigned an internship.
const ASSIGNABLE_LIFECYCLE_STATUSES = ['active', 'graduated'] as const;

interface LearnerPickerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  register_number: string | null;
  institution: { id: string; name: string | null } | { id: string; name: string | null }[] | null;
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
      .select('id, first_name, last_name, register_number, institution:institutions(id, name)')
      .in('lifecycle_status', [...ASSIGNABLE_LIFECYCLE_STATUSES])
      .order('first_name', { ascending: true })
      .limit(5000);

    // Scope to the caller's institutions (no-op for super_admin / admission).
    query = applyInstitutionFilterToQuery(query, filter, 'institution_id');

    const { data, error } = await query;

    if (error) {
      console.error('[cdc/internships/new/learners] query error:', error.message);
      return NextResponse.json({ error: 'Failed to load learners' }, { status: 500 });
    }

    const options = ((data ?? []) as LearnerPickerRow[]).map((l) => {
      // PostgREST may embed a to-one relation as an object or a single-element
      // array depending on the inferred cardinality — handle both.
      const inst = Array.isArray(l.institution) ? l.institution[0] : l.institution;
      const name = `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim();
      const reg = l.register_number ? ` (${l.register_number})` : '';
      const institutionName = inst?.name ? ` — ${inst.name}` : '';
      return {
        value: l.id,
        label: `${name}${reg}${institutionName}`,
      };
    });

    return NextResponse.json(
      { options },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[cdc/internships/new/learners] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
