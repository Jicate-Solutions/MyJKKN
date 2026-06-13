export const dynamic = 'force-dynamic';

/**
 * GET /api/social/facebook/insights/top-posts  (contract F2)
 *
 * Query params:
 *   page_id — uuid, optional (omit = all visible pages, RLS-scoped)
 *   days    — int, default 90, clamped to [1, 365]
 *   limit   — int, default 20, clamped to [1, 100]
 *
 * Response (success envelope):
 *   { success: true, data: {
 *       posts: [{ post_id, fb_post_id, message: string|null,
 *                 permalink_url: string|null, post_type: string|null,
 *                 posted_at, reactions: number, comments: number,
 *                 shares: number, impressions: number|null,
 *                 engaged_users: number|null, clicks: number|null,
 *                 video_views: number|null, engagement: number }],
 *       rollup: { posts: number, reactions: number, comments: number,
 *                 shares: number, impressions: number }
 *   } }
 *
 * Semantics: fb_posts posted within the window, joined to the LATEST
 * fb_post_metrics snapshot per post (batched .in() chunks, newest-first,
 * first-seen-wins). reactions / comments / shares come from the fb_posts
 * counts (null-safe → 0); engagement = reactions + comments + shares.
 * impressions / engaged_users / clicks / video_views come from the latest
 * metrics snapshot and are null when no metrics exist yet (per contract).
 * The `posts` list is sorted by engagement desc (ties: posted_at desc) and
 * sliced to `limit`; `rollup` sums across ALL matching posts in the window
 * (not just the returned page), with nulls counted as 0.
 *
 * Auth: any authenticated user; row visibility enforced by fb_posts /
 * fb_post_metrics RLS via the user-session client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;
const MAX_PAGES = 20;
const IN_CHUNK = 200;

interface PostRow {
  id: string;
  fb_post_id: string;
  message: string | null;
  permalink_url: string | null;
  post_type: string | null;
  posted_at: string;
  reactions_count: number | null;
  comments_count: number | null;
  shares_count: number | null;
}

interface PostMetricRow {
  post_id: string;
  impressions: number | null;
  engaged_users: number | null;
  clicks: number | null;
  video_views: number | null;
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
    const pageId = searchParams.get('page_id');
    const days = parseIntParam(searchParams.get('days'), 90, 365);
    const limit = parseIntParam(searchParams.get('limit'), 20, 100);

    if (days === null || limit === null) {
      return NextResponse.json(
        { success: false, error: 'Invalid days/limit parameter — must be a positive integer' },
        { status: 400 }
      );
    }
    if (pageId && !UUID_RE.test(pageId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid page_id parameter — must be a UUID' },
        { status: 400 }
      );
    }

    const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();

    // 1. Posts in window (paginated past the ~1000-row cap).
    const posts: PostRow[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      let query = supabase
        .from('fb_posts')
        .select(
          'id, fb_post_id, message, permalink_url, post_type, posted_at, reactions_count, comments_count, shares_count'
        )
        .gte('posted_at', sinceIso)
        .order('posted_at', { ascending: false })
        .order('id', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (pageId) query = query.eq('page_id', pageId);

      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      const batch = (data ?? []) as PostRow[];
      posts.push(...batch);
      if (batch.length < PAGE) break;
    }

    // 2. Latest fb_post_metrics per post — batched .in() chunks, newest-first,
    //    first-seen-wins dedupe.
    const latestMetrics = new Map<string, PostMetricRow>();
    const postIds = posts.map((p) => p.id);
    for (let i = 0; i < postIds.length; i += IN_CHUNK) {
      const chunk = postIds.slice(i, i + IN_CHUNK);
      const { data, error } = await supabase
        .from('fb_post_metrics')
        .select('post_id, impressions, engaged_users, clicks, video_views')
        .in('post_id', chunk)
        .order('snapshot_at', { ascending: false });
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      for (const m of (data ?? []) as PostMetricRow[]) {
        if (!latestMetrics.has(m.post_id)) latestMetrics.set(m.post_id, m);
      }
    }

    // 3. Shape every post, build the all-rows rollup, then sort + slice.
    const rollup = { posts: posts.length, reactions: 0, comments: 0, shares: 0, impressions: 0 };
    const allPosts = posts.map((p) => {
      const m = latestMetrics.get(p.id);
      const reactions = p.reactions_count ?? 0;
      const comments = p.comments_count ?? 0;
      const shares = p.shares_count ?? 0;
      const shaped = {
        post_id: p.id,
        fb_post_id: p.fb_post_id,
        message: p.message,
        permalink_url: p.permalink_url,
        post_type: p.post_type,
        posted_at: p.posted_at,
        reactions,
        comments,
        shares,
        impressions: m?.impressions ?? null,
        engaged_users: m?.engaged_users ?? null,
        clicks: m?.clicks ?? null,
        video_views: m?.video_views ?? null,
        engagement: reactions + comments + shares,
      };
      rollup.reactions += shaped.reactions;
      rollup.comments += shaped.comments;
      rollup.shares += shaped.shares;
      rollup.impressions += shaped.impressions ?? 0;
      return shaped;
    });

    const topPosts = allPosts
      .sort(
        (a, b) =>
          b.engagement - a.engagement || (a.posted_at < b.posted_at ? 1 : -1)
      )
      .slice(0, limit);

    return NextResponse.json({ success: true, data: { posts: topPosts, rollup } });
  } catch (error) {
    console.error('[fb-insights-top-posts] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Top-posts query failed' },
      { status: 500 }
    );
  }
}
