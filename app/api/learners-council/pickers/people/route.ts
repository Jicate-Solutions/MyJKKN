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
    const scope = searchParams.get('scope') || 'all';
    const termId = searchParams.get('term_id') || '';

    const supabase = createServiceRoleClient();

    // Step 3a: Executive seats are filled by ELECTION FROM the sitting council
    // (ElectionType 'executive_rotation' — "Current LC members can self-nominate
    // for executive positions", selection-service.ts). A learner becomes an LC
    // member first, and only then is elected to one of the 4 executive seats.
    // So when the caller is filling an executive seat we narrow the pool to the
    // active members of that term rather than every learner.
    if (scope === 'lc_members') {
      if (!termId) {
        return NextResponse.json({ options: [] }, { status: 200 });
      }

      const { data: memberRows, error: memberError } = await supabase
        .from('lc_members')
        .select('user_id, institution_id, user:profiles!user_id(id, full_name, email)')
        .eq('status', 'active')
        .eq('term_id', termId);

      if (memberError) {
        console.error(
          '[learners-council/pickers/people] member query failed:',
          memberError.message
        );
        return NextResponse.json({ error: 'Failed to load council members' }, { status: 500 });
      }

      const allowedInstitutions =
        filter.isSuperAdmin || filter.institutionIds.length === 0
          ? null
          : new Set(filter.institutionIds);

      const needle = search.toLowerCase();
      const options = (memberRows || [])
        .map((row) => {
          const person = (row as unknown as { user: PeoplePickerRow | null }).user;
          const institutionId = (row as unknown as { institution_id: string | null })
            .institution_id;
          return { person, institutionId };
        })
        .filter(({ person, institutionId }) => {
          if (!person) return false;
          // Re-impose the SAME institution scope used everywhere else.
          if (allowedInstitutions && !allowedInstitutions.has(institutionId || '')) {
            return false;
          }
          if (!needle) return true;
          return (
            (person.full_name || '').toLowerCase().includes(needle) ||
            (person.email || '').toLowerCase().includes(needle)
          );
        })
        .map(({ person }) => ({
          value: person!.id,
          label: (person!.full_name || person!.email || person!.id.slice(0, 8)).trim(),
          sublabel: person!.full_name && person!.email ? person!.email : null,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

      return NextResponse.json(
        { options },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Step 3b: Default pool — every active person in the caller's scope.
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
