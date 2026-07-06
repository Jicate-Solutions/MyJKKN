// app/api/schools-network/worklist/owners/route.ts
// ============================================================================
// GET /api/schools-network/worklist/owners → the assign picker's source.
//
// Returns ONLY people eligible to own a school visit — active school owners /
// coordinators (school_jkkn_owners) or holders of the outreach_coordinator /
// program_lead role (Director ruling 2026-07-05: "coordinators & owners only",
// not every staff member). Backed by fn_schools_network_list_assignable_owners
// (SECURITY DEFINER, schools.edit gated inside). Small list — the UI fetches it
// once and filters client-side.
// ============================================================================

export const dynamic = 'force-dynamic';

import { connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { successResponse, errorResponse } from '@/lib/api/response';

export const GET = withAuth(
  async (_request, auth) => {
    await connection();

    const { data, error } = await auth.supabase.rpc(
      'fn_schools_network_list_assignable_owners'
    );
    if (error) {
      const status = error.code === '42501' ? 403 : 500;
      const code = error.code === '42501' ? 'FORBIDDEN' : 'OWNERS_FAILED';
      const msg = error.code === '42501' ? error.message : 'Could not load coordinators.';
      if (error.code !== '42501') console.error('[worklist/owners] RPC failed:', error.message);
      return errorResponse(msg, status, code);
    }

    const arr = (data ?? []) as Array<Record<string, unknown>>;
    const owners = arr.map((r) => ({
      id: r.id as string,
      fullName: (r.full_name ?? '') as string,
      email: (r.email ?? null) as string | null,
      roleLabel: (r.role_label ?? '') as string,
    }));
    return successResponse({ owners });
  },
  { allowApiKey: false, requirePermission: 'schools_network.schools.edit' }
);
