// app/api/schools-network/scoreboard/route.ts
// ============================================================================
// GET /api/schools-network/scoreboard → leadership momentum board.
//
// Backed by fn_schools_network_scoreboard (SECURITY DEFINER, permission-gated
// inside). Returns ONE json object with the org-wide current-vs-prior cycle
// momentum headline plus top-10 gainers / losers by per-school delta. Numbers
// reconcile with the feeder panel (same canonical key + alias resolution +
// cycle detection). No data is copied — the RPC reads the canonical sources.
// ============================================================================

export const dynamic = 'force-dynamic';

import { connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { successResponse, errorResponse } from '@/lib/api/response';

export const GET = withAuth(
  async (request, auth) => {
    await connection();
    const { searchParams } = new URL(request.url);
    // Optional pinned cycle year; the RPC falls back to the latest cycle with
    // learners when null or unrecognised.
    const cycleParam = searchParams.get('cycleYear');
    const parsed = cycleParam ? parseInt(cycleParam, 10) : NaN;
    const cycleYear = Number.isFinite(parsed) ? parsed : null;

    const { data, error } = await auth.supabase.rpc(
      'fn_schools_network_scoreboard',
      { p_cycle_year: cycleYear }
    );
    if (error) {
      // The RPC's own permission gate raises ERRCODE 42501 — surface it as a 403
      // so the page's dedicated access-denied branch fires (not a generic 500).
      const status = error.code === '42501' ? 403 : 500;
      const code = error.code === '42501' ? 'FORBIDDEN' : 'SCOREBOARD_FAILED';
      return errorResponse(error.message, status, code);
    }

    // The RPC returns a single json object already in the desired shape.
    return successResponse(data ?? {});
  },
  { allowApiKey: false, requirePermission: 'schools_network.schools.view' }
);
