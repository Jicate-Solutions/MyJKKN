export const dynamic = 'force-dynamic';

/**
 * GET /api/social/engagement/leaderboard — the within-college momentum board.
 *
 * Ranks the caller's OWN college's graph-tier department handles on real signal
 * (saves + shares + comments) and MOMENTUM (recent vs prior window) — never on
 * followers/likes/absolute totals. Recognition-framed: exposes tiers + the single
 * most-improved dept. Cross-college isolated inside fn_social_leaderboard_my_college
 * (college = the caller's institution_id). Any authenticated user may read their own
 * college's board; a caller with no graph-tier college handle gets an empty board.
 *
 * Query: ?days=<7..180> (default 30).
 */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  DeptHandle,
  LeaderboardRow,
  LeaderboardResponse,
} from '@/lib/types/social-engagement';

const DEFAULT_DAYS = 30;

export async function GET(request: Request): Promise<NextResponse<LeaderboardResponse>> {
  try {
    const supabase: SupabaseClient = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    // Guard param presence — Number(null) === 0 is finite and would clamp default to 7, not 30.
    const rawDays = url.searchParams.get('days');
    const windowDays = rawDays && Number.isFinite(+rawDays) && +rawDays > 0 ? Math.min(Math.max(Math.trunc(+rawDays), 7), 180) : DEFAULT_DAYS;

    const [boardRes, handleRes] = await Promise.all([
      supabase.rpc('fn_social_leaderboard_my_college', { p_days: windowDays }),
      supabase.rpc('fn_social_my_dept_handle'),
    ]);

    if (boardRes.error) {
      return NextResponse.json({ success: false, error: boardRes.error.message }, { status: 500 });
    }

    const rows = (boardRes.data as LeaderboardRow[] | null) ?? [];
    // Don't let a mine-handle lookup failure masquerade as "no handle" — log it, then degrade.
    if (handleRes.error) {
      console.warn('[social/engagement] leaderboard mine-handle lookup failed:', handleRes.error.message);
    }
    const myHandle = ((handleRes.data as DeptHandle[] | null) ?? [])[0] ?? null;
    const mine = myHandle
      ? rows.find((r) => r.dept_account_id === myHandle.dept_account_id) ?? null
      : null;

    return NextResponse.json({ success: true, rows, mine, windowDays });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to load the leaderboard.' },
      { status: 500 }
    );
  }
}
