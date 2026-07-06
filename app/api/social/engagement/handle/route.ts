export const dynamic = 'force-dynamic';

/**
 * GET /api/social/engagement/handle — the caller's own department Instagram handle,
 * its recent feed (deep-linkable posts), and the caller's loop hooks (their rota
 * turn + how many of their contributions are still awaiting review).
 *
 * Audience: any authenticated LEARNER (not the social team) — so this route does NOT
 * require social.view. Every read is caller-scoped INSIDE the SECURITY DEFINER RPCs
 * (auth.uid()), which return only non-sensitive handle identity + public IG content
 * (never login_email/login_password from the credential-vault registry). A learner
 * whose department has no graph-tier handle gets { handle: null } and an empty feed.
 *
 * Query: ?limit=<1..24> (default 6).
 */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  DeptHandle,
  FeedPost,
  RotaEntry,
  HandleFeedResponse,
} from '@/lib/types/social-engagement';

const DEFAULT_LIMIT = 6;

export async function GET(request: Request): Promise<NextResponse<HandleFeedResponse>> {
  try {
    const supabase: SupabaseClient = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    // Truncate first, then require >= 1 — guards a missing param (Number(null)=0) AND a fractional
    // one (0.5 → trunc 0), either of which would otherwise defeat the default.
    const nLimit = Math.trunc(Number(url.searchParams.get('limit')));
    const limit = Number.isFinite(nLimit) && nLimit >= 1 ? Math.min(nLimit, 24) : DEFAULT_LIMIT;

    // 1) Handle identity (safe columns, graph-tier, caller's own dept).
    const { data: handleRows, error: handleErr } = await supabase.rpc('fn_social_my_dept_handle');
    if (handleErr) {
      return NextResponse.json(
        { success: false, error: handleErr.message },
        { status: 500 }
      );
    }
    const handle = ((handleRows as DeptHandle[] | null) ?? [])[0] ?? null;

    // No handle for this learner's department → nothing more to load. Not an error.
    if (!handle) {
      return NextResponse.json({ success: true, handle: null, feed: [], myRota: null, myPendingContributions: 0 });
    }

    // Current week's Monday in IST (the ERP's operating timezone) so the rota window doesn't
    // shift a day near the Sun/Mon boundary. Surfaces the current/upcoming turn, not a stale one.
    const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
    const dow = istNow.getUTCDay(); // 0=Sun..6=Sat on the IST-shifted clock
    const monday = new Date(istNow);
    monday.setUTCDate(istNow.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
    const weekStart = monday.toISOString().slice(0, 10);

    // 2) Feed + loop hooks in parallel. Each is fail-soft. Both hooks are scoped to THIS handle.
    const [feedRes, rotaRes, pendingRes] = await Promise.all([
      supabase.rpc('fn_social_my_dept_feed', { p_limit: limit }),
      supabase
        .from('social_contributor_rota')
        .select('id, dept_account_id, week_start, contributor_profile_id, status, note, created_at')
        .eq('dept_account_id', handle.dept_account_id)
        .eq('contributor_profile_id', user.id)
        .gte('week_start', weekStart)
        .order('week_start', { ascending: true })
        .limit(1),
      supabase
        .from('social_contributions')
        .select('id', { count: 'exact', head: true })
        .eq('contributor_profile_id', user.id)
        .eq('dept_account_id', handle.dept_account_id)
        .eq('status', 'submitted'),
    ]);

    const feed = (feedRes.data as FeedPost[] | null) ?? [];
    const myRota = ((rotaRes.data as RotaEntry[] | null) ?? [])[0] ?? null;
    const myPendingContributions = pendingRes.count ?? 0;

    return NextResponse.json({
      success: true,
      handle,
      feed,
      myRota,
      myPendingContributions,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to load the department handle.' },
      { status: 500 }
    );
  }
}
