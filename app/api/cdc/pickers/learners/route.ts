export const dynamic = 'force-dynamic';

// app/api/cdc/pickers/learners/route.ts
// GET /api/cdc/pickers/learners — institution-scoped learner option source
// for CDC "new" form pickers (placements, idp, internships, mentors, etc.).
//
// WHY service-role: a CDC coordinator holds cdc.* permissions but NOT
// learners.* — so the browser (anon/RLS) client is blocked by
// learners_profiles_select_policy and the picker returns 0 rows, pushing
// users to type raw UUIDs (BUG-004085, BUG-004093). This route reads via
// the service-role client to bypass that RLS gap, then re-imposes the
// SAME institution scope every other API route uses
// (createApiInstitutionFilter + applyInstitutionFilterToQuery). super_admin
// and admission roles keep their cross-institution bypass; everyone else
// only ever sees their own institutions' learners — no cross-tenant leak.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import {
  createApiInstitutionFilter,
  applyInstitutionFilterToQuery,
} from '@/lib/auth/api-institution-filter';

interface LearnerPickerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  register_number: string | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Step 1: Session auth — must be a logged-in user
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Step 2: Resolve caller's institution scope (super_admin/admission bypass
  // preserved — they return institutionIds: [] which means "all").
  const filter = await createApiInstitutionFilter(request);
  if (!filter.isAllowed) {
    return NextResponse.json(
      { error: filter.reason || 'Institution access denied' },
      { status: 403 }
    );
  }

  try {
    // Step 3: Service-role read (bypasses learners_profiles RLS) ...
    const supabase = createServiceRoleClient();
    let query = supabase
      .from('learners_profiles')
      .select('id, first_name, last_name, register_number')
      .in('lifecycle_status', ['active', 'graduated'])
      .order('first_name', { ascending: true })
      .limit(5000);

    // Step 4: ... then re-impose institution scope (NEVER cross-tenant).
    query = applyInstitutionFilterToQuery(query, filter);

    const { data, error } = await query;
    if (error) {
      console.error('[cdc/pickers/learners] query failed:', error.message);
      return NextResponse.json(
        { error: 'Failed to load learners' },
        { status: 500 }
      );
    }

    const options = ((data || []) as LearnerPickerRow[]).map((l) => ({
      value: l.id,
      label:
        `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() +
        (l.register_number ? ` (${l.register_number})` : ''),
    }));

    return NextResponse.json(
      { options },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[cdc/pickers/learners] error:', err);
    return NextResponse.json(
      { error: 'Failed to load learners' },
      { status: 500 }
    );
  }
}
