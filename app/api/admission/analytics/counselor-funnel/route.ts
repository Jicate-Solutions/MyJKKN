export const dynamic = 'force-dynamic';

// app/api/admission/analytics/counselor-funnel/route.ts
// GET /api/admission/analytics/counselor-funnel?institution_id=X
// Returns per-counselor lead conversion funnel: assigned → contacted → qualified → applied → enrolled
//
// FIX (2026-08-02): the aggregation now runs in SQL via the
// get_admission_counselor_funnel_agg RPC (SECURITY INVOKER, EXECUTE locked to
// service_role — see the migration of the same name). Previously this route
// fetched EVERY counselor-assigned admission_leads row and counted in JS;
// PostgREST caps un-ranged selects at 10,000 rows with HTTP 200, and prod
// holds 20,039 assigned leads — so every count and the conversion-rate
// ranking were computed over HALF the data (enrolled showed 4 of 6).
// Same disease and fix shape as PR #2762.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

// ============================================================================
// TYPES
// ============================================================================

export interface CounselorFunnelRow {
  counselor_id: string;
  name: string;
  /** Total leads with this counselor */
  assigned: number;
  /** Leads that have progressed past 'new' */
  contacted: number;
  /** Leads in a qualified/engaged/application stage */
  qualified: number;
  /** Leads that have started or submitted an application */
  applied: number;
  /** Leads that have enrolled or confirmed */
  enrolled: number;
  /** enrolled / assigned × 100, rounded to 1dp */
  conversion_rate: number;
}

export interface CounselorFunnelResponse {
  counselors: CounselorFunnelRow[];
}

// ============================================================================
// STAGE BUCKETS
// The contacted / qualified / applied / enrolled stage buckets are encoded
// inside the get_admission_counselor_funnel_agg RPC (see the migration of the
// same name) with the exact stage lists this route previously applied in JS.
// See types/admission.ts for the full FunnelStage union.
// ============================================================================

// Per-counselor aggregate row returned by the RPC.
interface CounselorAggRpcRow {
  counselor_id: string;
  assigned: number;
  contacted: number;
  qualified: number;
  applied: number;
  enrolled: number;
}

// ============================================================================
// HANDLER
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // Auth check
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = request.nextUrl;
    const institution_id = searchParams.get('institution_id') || undefined;

    const supabase = createServiceRoleClient();

    // 1. Fetch active counselors
    let counselorQuery = supabase
      .from('admission_counselors')
      .select('id, name')
      .eq('is_active', true);
    if (institution_id) counselorQuery = counselorQuery.eq('institution_id', institution_id);

    const { data: counselors, error: counselorError } = await counselorQuery;
    if (counselorError) throw new Error(`Failed to fetch counselors: ${counselorError.message}`);
    if (!counselors || counselors.length === 0) {
      return NextResponse.json({ counselors: [] } satisfies CounselorFunnelResponse);
    }

    // 2. Aggregate per counselor in SQL — one round-trip over the FULL table.
    //    The previous row fetch was capped at 10,000 of 20,039 prod rows by
    //    PostgREST.
    const { data: aggRows, error: leadsError } = await supabase.rpc(
      'get_admission_counselor_funnel_agg',
      { p_institution_id: institution_id ?? null }
    );
    if (leadsError) throw new Error(`Failed to aggregate leads: ${leadsError.message}`);

    // 3. Merge aggregates into the counselor list
    const countsMap = new Map<string, {
      assigned: number;
      contacted: number;
      qualified: number;
      applied: number;
      enrolled: number;
    }>();

    // Initialise all counselors with zeros so we always return every counselor
    for (const c of counselors) {
      countsMap.set(c.id, { assigned: 0, contacted: 0, qualified: 0, applied: 0, enrolled: 0 });
    }

    for (const row of (aggRows || []) as CounselorAggRpcRow[]) {
      const entry = countsMap.get(row.counselor_id);
      if (!entry) continue; // leads assigned to inactive/other-institution counselor

      entry.assigned += row.assigned;
      entry.contacted += row.contacted;
      entry.qualified += row.qualified;
      entry.applied += row.applied;
      entry.enrolled += row.enrolled;
    }

    // 4. Build response rows — sort by conversion rate descending (best first)
    const rows: CounselorFunnelRow[] = counselors.map((c) => {
      const counts = countsMap.get(c.id) ?? { assigned: 0, contacted: 0, qualified: 0, applied: 0, enrolled: 0 };
      const conversion_rate =
        counts.assigned > 0
          ? Math.round((counts.enrolled / counts.assigned) * 1000) / 10
          : 0;
      return {
        counselor_id: c.id,
        name: c.name || 'Unknown',
        ...counts,
        conversion_rate,
      };
    });

    rows.sort((a, b) => b.conversion_rate - a.conversion_rate);

    logger.info('admission/analytics/counselor-funnel', 'Funnel computed', {
      institution_id,
      counselor_count: rows.length,
    });

    return NextResponse.json({ counselors: rows } satisfies CounselorFunnelResponse);
  } catch (error) {
    logger.error('admission/analytics/counselor-funnel', 'Get counselor funnel error', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
