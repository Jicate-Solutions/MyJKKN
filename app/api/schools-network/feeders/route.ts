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

    const { data, error } = await auth.supabase.rpc('fn_schools_network_feeders', {
      p_search: search,
      p_source: source,
      p_adopted: adopted,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) return errorResponse(error.message, 500, 'LIST_FAILED');

    const arr = (data ?? []) as Array<Record<string, unknown>>;
    const rows = arr.map((r) => ({
      schoolName: r.school_name as string,
      enrolledCount: Number(r.enrolled_count ?? 0),
      leadsCount: Number(r.leads_count ?? 0),
      sources: (r.sources ?? []) as string[],
      adoptedSchoolId: (r.adopted_school_id ?? null) as string | null,
    }));
    const total = arr.length > 0 ? Number(arr[0].total_count ?? rows.length) : 0;
    return successResponse({ rows, total, limit, offset });
  },
  { allowApiKey: false, requirePermission: 'schools_network.schools.view' }
);
