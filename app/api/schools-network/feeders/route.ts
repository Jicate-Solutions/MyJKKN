// app/api/schools-network/feeders/route.ts
// ============================================================================
// GET /api/schools-network/feeders → read-through feeder-school discovery.
//
// Backed by fn_schools_network_feeders (SECURITY DEFINER, permission-gated
// inside): UNIONs learners_profiles.last_school (real enrolled feeders) with
// marketing_leads_database.school_name (prospect schools), aggregates counts,
// and LEFT JOINs schools so the UI can mark which feeders are already adopted
// into the network. No data is copied — the sources stay canonical.
// ============================================================================

export const dynamic = 'force-dynamic';

import { connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { successResponse, errorResponse } from '@/lib/api/response';

export const GET = withAuth(
  async (request, auth) => {
    await connection();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || null;
    const source = searchParams.get('source') || null; // enrolled_learners | marketing_leads
    const adopted = searchParams.get('adopted') || null; // adopted | not_adopted
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));
    // 'priority' (default) = the moat-loop visit list: biggest per-cycle
    // enrollment DROP first, so the rank responds to the measured outcome.
    // 'volume' = legacy all-time count ordering. The DB default is 'volume'
    // (backward compat during the migration→deploy window); the product
    // default lives here.
    const sort = searchParams.get('sort') === 'volume' ? 'volume' : 'priority';
    // level: 'ug' → Feeder Schools, 'pg' → Feeder Colleges, 'other' → the
    // Other-levels section (diploma/PhD/unrecorded), null → combined (all
    // levels + marketing leads). Anything else ignored.
    const levelParam = searchParams.get('level');
    const level =
      levelParam === 'ug' || levelParam === 'pg' || levelParam === 'other'
        ? levelParam
        : null;

    const { data, error } = await auth.supabase.rpc('fn_schools_network_feeders', {
      p_search: search,
      p_source: source,
      p_adopted: adopted,
      p_limit: limit,
      p_offset: offset,
      p_sort: sort,
      p_cycle_year: null,
      p_degree_type: level,
    });
    if (error) return errorResponse(error.message, 500, 'LIST_FAILED');

    const arr = (data ?? []) as Array<Record<string, unknown>>;
    const rows = arr.map((r) => ({
      schoolName: r.school_name as string,
      enrolledCount: Number(r.enrolled_count ?? 0),
      leadsCount: Number(r.leads_count ?? 0),
      sources: (r.sources ?? []) as string[],
      adoptedSchoolId: (r.adopted_school_id ?? null) as string | null,
      cycleYear: Number(r.cycle_year ?? 0),
      priorCycleYear: Number(r.prior_cycle_year ?? 0),
      currentCycleEnrolled: Number(r.current_cycle_enrolled ?? 0),
      priorCycleEnrolled: Number(r.prior_cycle_enrolled ?? 0),
      cycleDelta: r.cycle_delta === null || r.cycle_delta === undefined ? null : Number(r.cycle_delta),
      cohortKnown: Number(r.cohort_known ?? 0),
    }));
    let total = arr.length > 0 ? Number(arr[0].total_count ?? rows.length) : 0;
    if (arr.length === 0 && offset > 0) {
      // Past-the-end page: the window count travels on rows, so an empty page
      // would misreport total=0 and collapse pagination. Recover it with a
      // 1-row probe at offset 0 (rare path — the UI never navigates past the
      // last page; this protects direct API consumers).
      const probe = await auth.supabase.rpc('fn_schools_network_feeders', {
        p_search: search,
        p_source: source,
        p_adopted: adopted,
        p_limit: 1,
        p_offset: 0,
        p_degree_type: level,
      });
      const parr = (probe.data ?? []) as Array<Record<string, unknown>>;
      total = parr.length > 0 ? Number(parr[0].total_count ?? 0) : 0;
    }
    return successResponse({ rows, total, limit, offset });
  },
  { allowApiKey: false, requirePermission: 'schools_network.schools.view' }
);
