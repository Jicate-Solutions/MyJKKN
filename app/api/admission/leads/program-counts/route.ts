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

import { NextRequest, NextResponse, connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient,
  getAuthUser,
} from '@/lib/supabase/server';

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

  // Canonical super-admin check: `is_super_admin()` RPC reads
  // profiles.is_super_admin = true under the caller's session (auth.uid()).
  // Replaces the previous `profile.role === 'super_admin'` string fallback,
  // which duplicated the signal via a role_key anti-pattern. Must be called
  // on the cookie-authenticated client, not the service-role client, so that
  // auth.uid() resolves to the session user.
  const authedSupabase = await createServerSupabaseClient();
  const { data: superAdminRes } = await authedSupabase.rpc('is_super_admin');
  const isSuperAdmin = superAdminRes === true;

  let canViewLeads = isSuperAdmin;
  if (!canViewLeads) {
    const { data: permResult } = await supabase.rpc('user_has_permission', {
      user_id: user.id,
      permission_key: 'admission.leads.view'
    });
    canViewLeads = !!permResult;
  }

  if (!canViewLeads) {
    return NextResponse.json(
      { error: 'Forbidden: admission.leads.view permission required' },
      { status: 403 }
    );
  }

  // 3. Resolve cross-institution access
  let isAdmissionGlobalUser = isSuperAdmin;
  if (!isAdmissionGlobalUser) {
    const { data: scopedRoles } = await supabase
      .from('user_roles')
      .select('custom_roles!inner(institution_scope, module_scopes)')
      .eq('user_id', user.id);
    isAdmissionGlobalUser = (scopedRoles || []).some((ur: any) => {
      const cr = ur.custom_roles;
      if (!cr) return false;
      if (cr.institution_scope === 'all') return true;
      const moduleScope = (cr.module_scopes ?? {})['admission'];
      return moduleScope === 'all_institutions';
    });
  }

  // 4. Determine target institution
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
    // 5. Load programs for the target scope.
    //    If no institutionId (global user, no param), return all programs
    //    across institutions — still useful so the tab strip works globally.
    let programsQuery = supabase
      .from('programs')
      .select('id, program_name, institution_id')
      .order('program_name', { ascending: true });

    if (institutionId) {
      programsQuery = programsQuery.eq('institution_id', institutionId);
    }

    const { data: programs, error: programsError } = await programsQuery;
    if (programsError) throw programsError;

    const programList = programs || [];

    // 6. Load leads with interested_programs populated for the same scope.
    //    Since interested_programs is uuid[], we can't aggregate in a single
    //    Supabase query without a custom RPC — we fetch the array column and
    //    aggregate client-side. This is cheap (typically <500 rows).
    let leadsQuery = supabase
      .from('admission_leads')
      .select('id, interested_programs, institution_id')
      .not('interested_programs', 'is', null);

    if (institutionId) {
      leadsQuery = leadsQuery.eq('institution_id', institutionId);
    } else if (!isAdmissionGlobalUser && profile.institution_id) {
      leadsQuery = leadsQuery.eq('institution_id', profile.institution_id);
    }

    const { data: leads, error: leadsError } = await leadsQuery;
    if (leadsError) throw leadsError;

    // 7. Aggregate lead counts per program.
    const countMap = new Map<string, number>();
    let totalWithProgram = 0;
    (leads || []).forEach((lead: any) => {
      const ips = Array.isArray(lead.interested_programs)
        ? lead.interested_programs
        : [];
      if (ips.length > 0) totalWithProgram += 1;
      const seen = new Set<string>();
      ips.forEach((pid: string) => {
        if (!pid || seen.has(pid)) return;
        seen.add(pid);
        countMap.set(pid, (countMap.get(pid) || 0) + 1);
      });
    });

    // 8. Total count — all leads in scope (not just those with a program).
    let totalCountQuery = supabase
      .from('admission_leads')
      .select('id', { count: 'exact', head: true });

    if (institutionId) {
      totalCountQuery = totalCountQuery.eq('institution_id', institutionId);
    } else if (!isAdmissionGlobalUser && profile.institution_id) {
      totalCountQuery = totalCountQuery.eq('institution_id', profile.institution_id);
    }

    const { count: totalCount } = await totalCountQuery;

    // 9. Assemble response — include every program (even count 0), sorted
    //    by count desc then program_name asc so the tab strip shows active
    //    programs first.
    const result = programList
      .map((p: any) => ({
        program_id: p.id,
        program_name: p.program_name,
        count: countMap.get(p.id) || 0,
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.program_name.localeCompare(b.program_name);
      });

    return NextResponse.json({
      data: result,
      total: totalCount || 0,
      totalWithProgram,
    });
  } catch (err) {
    console.error('[admission/leads/program-counts] API route error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
