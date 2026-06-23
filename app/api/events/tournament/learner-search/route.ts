export const dynamic = 'force-dynamic';

// GET /api/events/tournament/learner-search?q=<name or register number>
// Organizer-only learner lookup for the tournament "Add Entry" dialog. Lets the
// organizer LINK a real JKKN learner to an individual entry (→ events_registrations
// .learner_id) or a roster member (→ tournament_team_members.learner_id) so that
// fn_award_achievements can post their wins to their athlete profile (decision #4).
//
// Security:
//   - requires a logged-in user holding sports.tournaments.manage (same gate as the
//     organizer POST /entries route). Not an RPC, so the "REVOKE anon" rule is met by
//     the auth check — anon callers get 401.
//   - reads learners_profiles via the service-role client to bypass the
//     learners_profiles RLS gap (a sports_coordinator does NOT hold learners.* perms,
//     exactly like the CDC picker), then RE-IMPOSES the same institution scope every
//     other route uses (createApiInstitutionFilter + applyInstitutionFilterToQuery):
//     super_admin / all-scope roles see all institutions; everyone else only their own.
//   - returns at most 20 PII-light rows (id, name, register number) for a combobox.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  createApiInstitutionFilter,
  applyInstitutionFilterToQuery,
} from '@/lib/auth/api-institution-filter';

interface LearnerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  register_number: string | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 1. Must be authenticated.
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Must hold sports.tournaments.manage (same gate as organizer entry creation).
  const auth = await createClient();
  const { data: canManage } = await auth.rpc('user_has_permission', {
    permission_name: 'sports.tournaments.manage',
  });
  if (canManage !== true) {
    return NextResponse.json(
      { error: 'Forbidden — sports.tournaments.manage required' },
      { status: 403 }
    );
  }

  // 3. Sanitize the search term. We feed it into a PostgREST .or() filter, so strip
  //    anything that could break that comma/paren-delimited syntax or inject wildcards.
  const raw = request.nextUrl.searchParams.get('q') ?? '';
  const q = raw.replace(/[^A-Za-z0-9 ._/-]/g, '').trim().slice(0, 60);
  if (q.length < 2) {
    return NextResponse.json({ results: [] }, { status: 200 });
  }

  // 4. Resolve the caller's institution scope (super_admin / all-scope → []).
  const filter = await createApiInstitutionFilter(request);
  if (!filter.isAllowed) {
    return NextResponse.json(
      { error: filter.reason || 'Institution access denied' },
      { status: 403 }
    );
  }

  try {
    const svc = createServiceRoleClient();
    let query = (svc as any)
      .from('learners_profiles')
      .select('id, first_name, last_name, register_number')
      .in('lifecycle_status', ['active', 'graduated'])
      .or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,register_number.ilike.%${q}%`
      )
      .order('first_name', { ascending: true })
      .limit(20);

    // Re-impose institution scope (never cross-tenant for non-bypass roles).
    query = applyInstitutionFilterToQuery(query, filter);

    const { data, error } = await query;
    if (error) {
      console.error('[tournament/learner-search] query failed:', error.message);
      return NextResponse.json({ error: 'Failed to search learners' }, { status: 500 });
    }

    const results = ((data || []) as LearnerRow[]).map((l) => ({
      id: l.id,
      name: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim(),
      register_number: l.register_number,
    }));

    return NextResponse.json(
      { results },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[tournament/learner-search] error:', err);
    return NextResponse.json({ error: 'Failed to search learners' }, { status: 500 });
  }
}
