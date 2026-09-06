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
    // Only a bare 4-digit year pins a cycle; junk like '2026abc' (which
    // parseInt would silently accept as 2026) falls back to the latest cycle.
    const cycleParam = searchParams.get('cycleYear');
    const cycleYear = cycleParam && /^\d{4}$/.test(cycleParam) ? Number(cycleParam) : null;

    const { data, error } = await auth.supabase.rpc(
      'fn_schools_network_scoreboard',
      { p_cycle_year: cycleYear }
    );
    if (error) {
      // The RPC's own permission gate raises ERRCODE 42501 — surface it as a 403
      // so the page's dedicated access-denied branch fires (not a generic 500).
      if (error.code === '42501') {
        return errorResponse(error.message, 403, 'FORBIDDEN');
      }
      // Don't leak raw Postgres internals (function/column names, statement-
      // timeout details) to the client — log server-side, return a generic message.
      console.error('[scoreboard] RPC failed:', error.message);
      return errorResponse(
        'Could not load the scoreboard. Please try again.',
        500,
        'SCOREBOARD_FAILED'
      );
    }

    // The RPC returns a single json object already in the desired shape.
    return successResponse(data ?? {});
  },
  { allowApiKey: false, requirePermission: 'schools_network.schools.view' }
);
