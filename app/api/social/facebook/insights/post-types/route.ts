export const dynamic = 'force-dynamic';

/**
 * GET /api/social/facebook/insights/post-types  (contract F3)
 *
 * Query params:
 *   page_id — uuid, optional (omit = all visible pages, RLS-scoped)
 *   days    — int, default 90, clamped to [1, 365]
 *
 * Response (success envelope):
 *   { success: true, data: {
 *       types: [{ type: string, posts: number, reactions: number,
 *                 comments: number, shares: number, avg_engagement: number }]
 *   } }
 *
 * Semantics: fb_posts posted within the window grouped by post_type
 * ('(unknown)' for null). reactions / comments / shares sum the fb_posts
 * counts (null-safe → 0). avg_engagement = (reactions + comments + shares)
 * / posts, rounded to 2dp. Types are sorted by posts desc (ties:
 * avg_engagement desc, then type asc).
 *
 * Auth: any authenticated user; row visibility enforced by fb_posts RLS via
 * the user-session client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;
const MAX_PAGES = 20;

interface PostRow {
  post_type: string | null;
  reactions_count: number | null;
  comments_count: number | null;
  shares_count: number | null;
}

interface TypeBucket {
  posts: number;
  reactions: number;
  comments: number;
  shares: number;
}

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
    const pageId = searchParams.get('page_id');
    const days = parseDays(searchParams.get('days'), 90);

    if (days === null) {
      return NextResponse.json(
        { success: false, error: 'Invalid days parameter — must be a positive integer' },
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
        .select('post_type, reactions_count, comments_count, shares_count')
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

    // 2. Group by post_type ('(unknown)' for null).
    const byType = new Map<string, TypeBucket>();
    for (const p of posts) {
      const type = p.post_type ?? '(unknown)';
      const bucket = byType.get(type) ?? { posts: 0, reactions: 0, comments: 0, shares: 0 };
      bucket.posts += 1;
      bucket.reactions += p.reactions_count ?? 0;
      bucket.comments += p.comments_count ?? 0;
      bucket.shares += p.shares_count ?? 0;
      byType.set(type, bucket);
    }

    const types = Array.from(byType.entries())
      .map(([type, b]) => ({
        type,
        posts: b.posts,
        reactions: b.reactions,
        comments: b.comments,
        shares: b.shares,
        avg_engagement:
          b.posts > 0
            ? Math.round(((b.reactions + b.comments + b.shares) / b.posts) * 100) / 100
            : 0,
      }))
      .sort(
        (a, b) =>
          b.posts - a.posts ||
          b.avg_engagement - a.avg_engagement ||
          (a.type < b.type ? -1 : 1)
      );

    return NextResponse.json({ success: true, data: { types } });
  } catch (error) {
    console.error('[fb-insights-post-types] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Post-types query failed' },
      { status: 500 }
    );
  }
}
