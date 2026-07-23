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

    // Tenant scoping (skeptic HIGH on #1745): the profiles RLS select policy
    // is NOT institution-scoped, so an unscoped search would let any holder
    // of schools_network.owners.manage enumerate staff names/emails across
    // ALL institutions. Cross-institution search is a super-admin/admin
    // privilege (canonical triad); everyone else is pinned to their own
    // institution — mirroring the induction assignableStaff pattern. A
    // non-admin caller with no institution on file gets an empty result,
    // never an unscoped one.
    const [{ data: isSuper }, { data: isAdmin }] = await Promise.all([
      auth.supabase.rpc('is_super_admin'),
      auth.supabase.rpc('is_admin'),
    ]);
    const crossInstitution = isSuper === true || isAdmin === true;
    if (!crossInstitution && !auth.institutionId) {
      return successResponse({ rows: [] });
    }

    let query = auth.supabase
      .from('profiles')
      .select('id, full_name, email, role, institution_id')
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .in('role', ['staff', 'faculty', 'hod', 'admin', 'super_admin'])
      .limit(10);
    if (!crossInstitution) {
      query = query.eq('institution_id', auth.institutionId);
    }
    const { data, error } = await query;
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
