export const dynamic = 'force-dynamic';

// app/api/learners-council/pickers/people/route.ts
// GET /api/learners-council/pickers/people — institution-scoped people option
// source for the Learners Council "Assign Member" dialog.
//
// WHY this exists: the assign dialog used to ask for a raw profiles UUID
// ("Enter the learner's user ID"), which no office bearer can supply. That is
// the same failure CDC hit (BUG-004085 / BUG-004093) and fixed with
// app/api/cdc/pickers/learners/route.ts — this route mirrors that pattern.
//
// WHY profiles (not learners_profiles): lc_members.user_id references
// profiles.id. learners_profiles.id is a DIFFERENT key (profiles.learner_id →
// learners_profiles.id), so the CDC route's ids cannot be reused here.
//
// WHY service-role: a council administrator may hold learners-council.*
// permissions but not learners.*, so the browser (anon/RLS) client can return
// 0 rows. This reads via service-role, then re-imposes the SAME institution
// scope every other API route uses (createApiInstitutionFilter +
// applyInstitutionFilterToQuery). super_admin keeps its cross-institution
// bypass; everyone else only ever sees their own institutions — no
// cross-tenant leak.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import {
  createApiInstitutionFilter,
  applyInstitutionFilterToQuery,
} from '@/lib/auth/api-institution-filter';

interface PeoplePickerRow {
  id: string;
  full_name: string | null;
  email: string | null;
  institution_id: string | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Step 1: Session auth — must be a logged-in user
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Step 2: Resolve caller's institution scope (super_admin bypass preserved —
  // it returns institutionIds: [] which means "all").
  const filter = await createApiInstitutionFilter(request);
  if (!filter.isAllowed) {
    return NextResponse.json(
      { error: filter.reason || 'Institution access denied' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim();

    // Step 3: Service-role read (bypasses profiles RLS for this picker) ...
    const supabase = createServiceRoleClient();
    let query = supabase
      .from('profiles')
      .select('id, full_name, email, institution_id')
      .eq('is_active', true)
      .order('full_name', { ascending: true })
      .limit(50);

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    // Step 4: ... then re-impose institution scope (NEVER cross-tenant).
    query = applyInstitutionFilterToQuery(query, filter);

    const { data, error } = await query;
    if (error) {
      console.error('[learners-council/pickers/people] query failed:', error.message);
      return NextResponse.json(
        { error: 'Failed to load people' },
        { status: 500 }
      );
    }

    const options = ((data || []) as PeoplePickerRow[]).map((p) => ({
      value: p.id,
      label: (p.full_name || p.email || p.id.slice(0, 8)).trim(),
      sublabel: p.full_name && p.email ? p.email : null,
    }));

    return NextResponse.json(
      { options },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[learners-council/pickers/people] error:', err);
    return NextResponse.json(
      { error: 'Failed to load people' },
      { status: 500 }
    );
  }
}
