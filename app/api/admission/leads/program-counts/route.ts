export const dynamic = 'force-dynamic';

// app/api/admission/leads/program-counts/route.ts
// Returns per-program lead counts for a given institution, used to render
// the "Course wise" tab strip on the All Leads page (BUG-003181).
//
// Response shape:
//   {
//     data: Array<{ program_id: string; program_name: string; count: number }>,
//     total: number      // total leads across *all* programs for the scope
//   }
//
// Uses the same service-role + manual auth pattern as /list, because the
// admission_leads RLS policies cascade 3 levels deep and exceed the
// authenticated role statement timeout.
//
// PERF (2026-08-02): the data assembly is ONE RPC round-trip,
// get_admission_lead_program_counts (SECURITY INVOKER, EXECUTE locked to
// service_role). Previously this route issued three sequential PostgREST
// queries — programs, then EVERY admission_leads row with
// interested_programs populated (10,946 rows / ~1MB in prod; the old comment
// said "typically <500 rows"), then an exact count — and aggregated in JS.
// Besides the latency, the un-ranged row fetch was silently truncated at the
// PostgREST max-rows cap (10,000), so global-scope counts UNDERCOUNTED once
// the table passed 10k qualifying rows. The RPC aggregates in SQL (<35ms) and
// returns only the per-program totals, which is both faster and correct.
// Equivalence vs the old JS aggregation was verified cross-implementation
// across all 10 institutions + global scope (12/12 identical once the old
// path's fetch was paginated past the cap). NOTE: interested_programs is
// text[] — entries are compared to program ids as strings, exactly as the JS
// did; non-UUID / orphan entries are dropped at the join.
//
// The permission prelude is unchanged in behavior; the two non-super-admin
// lookups (user_has_permission + scoped user_roles) now run in parallel
// since both depend only on user.id.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServiceRoleClient, getAuthUser } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  await connection();

  // 1. Authenticate the user
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  // 2. Profile + permission check (mirrors /api/admission/leads/list)
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, institution_id, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
  }

  const isSuperAdmin = !!profile.is_super_admin || profile.role === 'super_admin';

  // 3+4. Permission gate + cross-institution scope. Both lookups depend only
  // on user.id, so for non-super-admins they run in ONE parallel round-trip
  // instead of two sequential ones. Super admins skip both (as before).
  let canViewLeads = isSuperAdmin;
  let isAdmissionGlobalUser = isSuperAdmin;

  if (!isSuperAdmin) {
    const [permRes, rolesRes] = await Promise.all([
      supabase.rpc('user_has_permission', {
        user_id: user.id,
        permission_key: 'admission.leads.view'
      }),
      supabase
        .from('user_roles')
        .select('custom_roles!inner(institution_scope, module_scopes)')
        .eq('user_id', user.id)
    ]);

    canViewLeads = !!permRes.data;
    if (!canViewLeads) {
      return NextResponse.json(
        { error: 'Forbidden: admission.leads.view permission required' },
        { status: 403 }
      );
    }

    isAdmissionGlobalUser = (rolesRes.data || []).some((ur: any) => {
      const cr = ur.custom_roles;
      if (!cr) return false;
      if (cr.institution_scope === 'all') return true;
      const moduleScope = (cr.module_scopes ?? {})['admission'];
      return moduleScope === 'all_institutions';
    });
  }

  // 5. Determine target institution
  const { searchParams } = request.nextUrl;
  const requestedInstitutionId = searchParams.get('institution_id') || undefined;

  // Apply the same scoping rules as /list: explicit param wins for global
  // users; non-global users are clamped to their own institution.
  let institutionId: string | undefined;
  if (requestedInstitutionId) {
    institutionId = requestedInstitutionId;
  } else if (!isAdmissionGlobalUser) {
    institutionId = profile.institution_id || undefined;
    if (!institutionId) {
      return NextResponse.json({ data: [], total: 0 });
    }
  }

  try {
    // 6. Single-scan aggregate: programs (count 0 included), per-program
    //    DISTINCT-lead counts, total leads in scope, and leads with a
    //    non-empty interested_programs array — one round-trip.
    const { data: agg, error: aggError } = await supabase.rpc(
      'get_admission_lead_program_counts',
      { p_institution_id: institutionId ?? null }
    );
    if (aggError) throw aggError;

    // 7. Assemble response — sorted by count desc then program_name asc so
    //    the tab strip shows active programs first (same JS sort as before).
    const result = ((agg?.programs || []) as Array<{
      program_id: string;
      program_name: string;
      count: number;
    }>)
      .map((p) => ({
        program_id: p.program_id,
        program_name: p.program_name,
        count: p.count || 0,
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.program_name.localeCompare(b.program_name);
      });

    return NextResponse.json({
      data: result,
      total: agg?.total || 0,
      totalWithProgram: agg?.total_with_program || 0,
    });
  } catch (err) {
    console.error('[admission/leads/program-counts] API route error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
