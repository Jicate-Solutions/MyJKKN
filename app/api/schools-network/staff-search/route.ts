// app/api/schools-network/staff-search/route.ts
// ============================================================================
// GET /api/schools-network/staff-search?q=… → search JKKN staff to own a
// school relationship (outreach coordinator / program lead).
//
// Used by the Assign-owner form's debounced picker. Returns at most 10 rows,
// camelCase. Short-circuits (empty) for queries under 2 chars so the client
// doesn't hammer the endpoint on the first keystroke.
// ============================================================================

export const dynamic = 'force-dynamic';

import { connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { successResponse, errorResponse } from '@/lib/api/response';

export const GET = withAuth(
  async (request, auth) => {
    await connection();

    const { searchParams } = new URL(request.url);
    // PostgREST `.or()` treats comma as a filter delimiter and %()* as
    // pattern/logic-tree operators. Strip them so a user's typed query can't
    // break — or inject into — the filter expression below.
    const q = (searchParams.get('q') ?? '')
      .replace(/[,%()*]/g, '')
      .trim();

    if (q.length < 2) return successResponse({ rows: [] });

    const { data, error } = await auth.supabase
      .from('profiles')
      .select('id, full_name, email, role, institution_id')
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .in('role', ['staff', 'faculty', 'hod', 'admin', 'super_admin'])
      .limit(10);
    if (error) return errorResponse(error.message, 500, 'SEARCH_FAILED');

    const rows = (data ?? []).map((r) => ({
      id: r.id as string,
      fullName: (r.full_name ?? '') as string,
      email: (r.email ?? null) as string | null,
      role: (r.role ?? null) as string | null,
      institutionId: (r.institution_id ?? null) as string | null,
    }));
    return successResponse({ rows });
  },
  { allowApiKey: false, requirePermission: 'schools_network.owners.manage' }
);
