export const dynamic = 'force-dynamic';

/**
 * GET /api/social/instagram/insights/summary  (contract C7)
 *
 * Query params:
 *   days — int, default 30, clamped to [1, 365]
 *
 * Response (success envelope):
 *   { success: true, data: {
 *       accounts: [{ id, username, institution_name,
 *                    followers, followers_gained, reach, impressions,
 *                    engagement_rate: number|null }],
 *       totals: { followers, reach, impressions, posts }
 *   } }
 *
 * Semantics unchanged: one row per visible ig_account. followers/reach/
 * impressions from the LATEST ig_account_metrics snapshot (null → 0);
 * followers_gained = latest minus the first snapshot in the window (0 when
 * either side is missing; can be negative); engagement_rate =
 * total_interactions / followers * 100 (2dp, null when interactions null or
 * followers 0); totals.posts = ig_posts posted within the window.
 *
 * Implementation (2026-07-13): delegates to the fn_ig_insights_summary(p_days)
 * SECURITY DEFINER RPC, which resolves the caller's visible accounts ONCE by
 * replicating the ig_accounts RLS OR-logic, then aggregates with indexed
 * DISTINCT ON queries (~150ms). Replaces a 20-page OFFSET loop over the
 * RLS-filtered ig_account_metrics table that re-sorted ~49k rows per page and
 * hung 40s+ (skeleton loaders never filled). Row visibility is enforced inside
 * the RPC; the route still 401s anonymous callers.
 */

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function parseDays(raw: string | null, def: number): number | null {
  if (raw === null || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return Math.min(n, 365);
}

export async function GET(request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = parseDays(searchParams.get('days'), 30);

    if (days === null) {
      return NextResponse.json(
        { success: false, error: 'Invalid days parameter — must be a positive integer' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc('fn_ig_insights_summary', { p_days: days });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[ig-insights-summary] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Summary query failed' },
      { status: 500 }
    );
  }
}
