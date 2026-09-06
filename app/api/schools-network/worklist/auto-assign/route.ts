// app/api/schools-network/worklist/auto-assign/route.ts
// ============================================================================
// POST /api/schools-network/worklist/auto-assign → fill every unassigned
//      school's visit owner automatically: Pass 1 uses each school's active
//      school_jkkn_owners owner (prefer outreach_coordinator); Pass 2 inherits
//      the district's most-common coordinator for the rest. Admin fills gaps.
//      schools.edit gated via fn_schools_network_auto_assign_visits.
// ============================================================================

export const dynamic = 'force-dynamic';

import { connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { successResponse, errorResponse } from '@/lib/api/response';

export const POST = withAuth(
  async (_request, auth) => {
    await connection();

    const { data, error } = await auth.supabase.rpc('fn_schools_network_auto_assign_visits');
    if (error) {
      const status = error.code === '42501' ? 403 : 500;
      return errorResponse(error.message, status, 'AUTO_ASSIGN_FAILED');
    }
    // The RPC returns a scalar integer (count of newly-created assignments).
    const assigned = typeof data === 'number' ? data : Number(data ?? 0);
    return successResponse({ assigned });
  },
  { allowApiKey: false, requirePermission: 'schools_network.schools.edit' }
);
