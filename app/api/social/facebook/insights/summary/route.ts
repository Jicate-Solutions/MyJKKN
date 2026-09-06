export const dynamic = 'force-dynamic';

/**
 * GET /api/social/facebook/insights/summary  (contract F4)
 *
 * Query params:
 *   days — int, default 30, clamped to [1, 365]
 *
 * Response (success envelope):
 *   { success: true, data: {
 *       pages: [{ id, name, institution_name,
 *                 fans, fans_gained, impressions_unique, post_engagements,
 *                 posts_in_window }],
 *       totals: { fans, impressions_unique, post_engagements, posts }
 *   } }
 *
 * Semantics unchanged: one row per visible fb_page. fans/impressions_unique/
 * post_engagements from the LATEST fb_page_metrics snapshot (null → 0);
 * fans_gained = latest fan_count minus the first snapshot in the window (0 when
 * either side is missing; can be negative); posts_in_window counts fb_posts per
 * page in the window; totals.posts = fb_posts across visible pages in the window.
 *
 * Implementation (2026-07-13): delegates to the fn_fb_insights_summary(p_days)
 * SECURITY DEFINER RPC (mirror of the Instagram fix), which resolves visible
 * pages ONCE by replicating the fb_pages RLS OR-logic then aggregates with
 * indexed DISTINCT ON queries (~25ms). Replaces three 20-page OFFSET loops over
 * the RLS-filtered fb_page_metrics / fb_posts tables that hung 40s+. Row
 * visibility is enforced inside the RPC; the route still 401s anonymous callers.
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

    const { data, error } = await supabase.rpc('fn_fb_insights_summary', { p_days: days });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[fb-insights-summary] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Summary query failed' },
      { status: 500 }
    );
  }
}
