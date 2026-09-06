export const dynamic = 'force-dynamic';

/**
 * GET /api/social/instagram/insights/reels  (contract C4)
 *
 * Query params:
 *   account_id — uuid, optional (omit = all visible accounts, RLS-scoped)
 *   days       — int, default 90, clamped to [1, 365]
 *   limit      — int, default 20, clamped to [1, 100]
 *
 * Response (success envelope):
 *   { success: true, data: {
 *       reels: [{ post_id, ig_media_id, caption: string|null,
 *                 permalink: string|null, posted_at,
 *                 plays: number|null, avg_watch_time_ms: number|null,
 *                 likes: number|null, comments: number, saves: number,
 *                 shares: number, engagement: number }],
 *       rollup: { reels: number, plays: number, likes: number,
 *                 comments: number, saves: number, shares: number }
 *   } }
 *
 * Semantics: ig_posts with media_type='REEL' posted within the window, joined
 * to the LATEST ig_post_metrics snapshot per post (batched .in() chunks,
 * newest-first, first-seen-wins). plays / avg_watch_time_ms / likes are null
 * when no metrics exist yet (per contract); comments / saves / shares /
 * engagement default to 0. The `reels` list is sorted by plays desc (null
 * treated as 0; ties: engagement desc, then posted_at desc) and sliced to
 * `limit`; `rollup` sums across ALL matching reels in the window (not just
 * the returned page), with nulls counted as 0.
 *
 * Auth: any authenticated user; row visibility enforced by ig_posts /
 * ig_post_metrics RLS via the user-session client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;
const MAX_PAGES = 20;
const IN_CHUNK = 200;

interface ReelPostRow {
  id: string;
  ig_media_id: string;
  caption: string | null;
  permalink: string | null;
  posted_at: string;
}

interface PostMetricRow {
  post_id: string;
  plays: number | null;
  avg_watch_time_ms: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  engagement: number | null;
}

function parseIntParam(raw: string | null, def: number, max: number): number | null {
  if (raw === null || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return Math.min(n, max);
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
    const accountId = searchParams.get('account_id');
    const days = parseIntParam(searchParams.get('days'), 90, 365);
    const limit = parseIntParam(searchParams.get('limit'), 20, 100);

    if (days === null || limit === null) {
      return NextResponse.json(
        { success: false, error: 'Invalid days/limit parameter — must be a positive integer' },
        { status: 400 }
      );
    }
    if (accountId && !UUID_RE.test(accountId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid account_id parameter — must be a UUID' },
        { status: 400 }
      );
    }

    const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();

    // 1. Reels in window (paginated past the ~1000-row cap).
    const posts: ReelPostRow[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      let query = supabase
        .from('ig_posts')
        .select('id, ig_media_id, caption, permalink, posted_at')
        .eq('media_type', 'REEL')
        .gte('posted_at', sinceIso)
        .order('posted_at', { ascending: false })
        .order('id', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (accountId) query = query.eq('account_id', accountId);

      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      const batch = (data ?? []) as ReelPostRow[];
      posts.push(...batch);
      if (batch.length < PAGE) break;
    }

    // 2. Latest ig_post_metrics per reel — batched .in() chunks, newest-first,
    //    first-seen-wins dedupe.
    const latestMetrics = new Map<string, PostMetricRow>();
    const postIds = posts.map((p) => p.id);
    for (let i = 0; i < postIds.length; i += IN_CHUNK) {
      const chunk = postIds.slice(i, i + IN_CHUNK);
      const { data, error } = await supabase
        .from('ig_post_metrics')
        .select('post_id, plays, avg_watch_time_ms, likes, comments, saves, shares, engagement')
        .in('post_id', chunk)
        .order('snapshot_at', { ascending: false });
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      for (const m of (data ?? []) as PostMetricRow[]) {
        if (!latestMetrics.has(m.post_id)) latestMetrics.set(m.post_id, m);
      }
    }

    // 3. Shape every reel, build the all-rows rollup, then sort + slice.
    const rollup = { reels: posts.length, plays: 0, likes: 0, comments: 0, saves: 0, shares: 0 };
    const allReels = posts.map((p) => {
      const m = latestMetrics.get(p.id);
      const reel = {
        post_id: p.id,
        ig_media_id: p.ig_media_id,
        caption: p.caption,
        permalink: p.permalink,
        posted_at: p.posted_at,
        plays: m?.plays ?? null,
        avg_watch_time_ms: m?.avg_watch_time_ms ?? null,
        likes: m?.likes ?? null,
        comments: m?.comments ?? 0,
        saves: m?.saves ?? 0,
        shares: m?.shares ?? 0,
        engagement: m?.engagement ?? 0,
      };
      rollup.plays += reel.plays ?? 0;
      rollup.likes += reel.likes ?? 0;
      rollup.comments += reel.comments;
      rollup.saves += reel.saves;
      rollup.shares += reel.shares;
      return reel;
    });

    const reels = allReels
      .sort(
        (a, b) =>
          (b.plays ?? 0) - (a.plays ?? 0) ||
          b.engagement - a.engagement ||
          (a.posted_at < b.posted_at ? 1 : -1)
      )
      .slice(0, limit);

    return NextResponse.json({ success: true, data: { reels, rollup } });
  } catch (error) {
    console.error('[ig-insights-reels] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Reels query failed' },
      { status: 500 }
    );
  }
}
