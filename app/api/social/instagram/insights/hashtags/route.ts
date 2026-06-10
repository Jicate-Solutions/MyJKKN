export const dynamic = 'force-dynamic';

/**
 * GET /api/social/instagram/insights/hashtags  (contract C2)
 *
 * Query params:
 *   account_id — uuid, optional (omit = all visible accounts, RLS-scoped)
 *   days       — int, default 90, clamped to [1, 365]
 *   limit      — int, default 20, clamped to [1, 100]
 *
 * Response (success envelope):
 *   { success: true, data: {
 *       hashtags: [{ tag: string, occurrences: number, likes: number,
 *                    comments: number, saves: number, engagement: number }]
 *   } }
 *
 * Semantics: captions of ig_posts in the window are parsed with
 * /#[\p{L}\p{N}_]+/gu and lowercased; `tag` is the lowercased match INCLUDING
 * the leading '#'. Tags are deduplicated per post (a tag used twice in one
 * caption counts once), so `occurrences` = number of posts using the tag and
 * a post's metrics are credited to each of its tags exactly once. Metrics
 * come from the LATEST ig_post_metrics snapshot per post (null-safe → 0).
 * Sorted by engagement desc (ties: occurrences desc), sliced to `limit`.
 *
 * Auth: any authenticated user; row visibility enforced by ig_posts /
 * ig_post_metrics RLS via the user-session client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;
const PAGE = 1000;
const MAX_PAGES = 20;
const IN_CHUNK = 200;

interface PostRow {
  id: string;
  caption: string | null;
}

interface PostMetricRow {
  post_id: string;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  engagement: number | null;
}

interface TagAgg {
  tag: string;
  occurrences: number;
  likes: number;
  comments: number;
  saves: number;
  engagement: number;
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

    // 1. Posts in window that have a caption (paginated past the ~1000-row cap).
    const posts: PostRow[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      let query = supabase
        .from('ig_posts')
        .select('id, caption')
        .gte('posted_at', sinceIso)
        .not('caption', 'is', null)
        .order('posted_at', { ascending: false })
        .order('id', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (accountId) query = query.eq('account_id', accountId);

      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      const batch = (data ?? []) as PostRow[];
      posts.push(...batch);
      if (batch.length < PAGE) break;
    }

    // 2. Latest ig_post_metrics per post — batched .in() chunks, newest-first,
    //    first-seen-wins dedupe (same idiom as the accounts list route).
    const latestMetrics = new Map<string, PostMetricRow>();
    const postIds = posts.map((p) => p.id);
    for (let i = 0; i < postIds.length; i += IN_CHUNK) {
      const chunk = postIds.slice(i, i + IN_CHUNK);
      const { data, error } = await supabase
        .from('ig_post_metrics')
        .select('post_id, likes, comments, saves, engagement')
        .in('post_id', chunk)
        .order('snapshot_at', { ascending: false });
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      for (const m of (data ?? []) as PostMetricRow[]) {
        if (!latestMetrics.has(m.post_id)) latestMetrics.set(m.post_id, m);
      }
    }

    // 3. Parse captions and aggregate per tag (unique tags per post).
    const aggs = new Map<string, TagAgg>();
    for (const post of posts) {
      const matches = post.caption?.match(HASHTAG_RE);
      if (!matches || matches.length === 0) continue;

      const tags = new Set(matches.map((t) => t.toLowerCase()));
      const m = latestMetrics.get(post.id);

      for (const tag of tags) {
        const agg = aggs.get(tag) ?? {
          tag,
          occurrences: 0,
          likes: 0,
          comments: 0,
          saves: 0,
          engagement: 0,
        };
        agg.occurrences += 1;
        agg.likes += m?.likes ?? 0;
        agg.comments += m?.comments ?? 0;
        agg.saves += m?.saves ?? 0;
        agg.engagement += m?.engagement ?? 0;
        aggs.set(tag, agg);
      }
    }

    const hashtags = Array.from(aggs.values())
      .sort((a, b) => b.engagement - a.engagement || b.occurrences - a.occurrences)
      .slice(0, limit);

    return NextResponse.json({ success: true, data: { hashtags } });
  } catch (error) {
    console.error('[ig-insights-hashtags] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Hashtags query failed' },
      { status: 500 }
    );
  }
}
