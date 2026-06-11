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
 *                 fans: number, fans_gained: number,
 *                 impressions_unique: number, post_engagements: number,
 *                 posts_in_window: number }],
 *       totals: { fans: number, impressions_unique: number,
 *                 post_engagements: number, posts: number }
 *   } }
 *
 * Semantics: one row per fb_page visible to the caller (RLS-scoped).
 * fans / impressions_unique / post_engagements come from the page's LATEST
 * fb_page_metrics snapshot (null-safe → 0). fans_gained = latest fan_count
 * minus the FIRST snapshot's fan_count within the window (0 when either side
 * is missing; can be negative on real fan loss). posts_in_window counts
 * fb_posts posted within the window per page. totals sums the page rows;
 * totals.posts = count of fb_posts posted within the window across visible
 * pages.
 *
 * Auth: any authenticated user; row visibility enforced by fb_pages /
 * fb_page_metrics / fb_posts RLS via the user-session client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const PAGE = 1000;
const MAX_PAGES = 20;

interface PageRow {
  id: string;
  name: string;
  institutions: { name: string } | null;
}

interface SnapshotRow {
  page_id: string;
  snapshot_at: string;
  fan_count: number | null;
  impressions_unique: number | null;
  post_engagements: number | null;
}

interface PostRow {
  page_id: string;
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
    const days = parseDays(searchParams.get('days'), 30);

    if (days === null) {
      return NextResponse.json(
        { success: false, error: 'Invalid days parameter — must be a positive integer' },
        { status: 400 }
      );
    }

    const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();

    // 1. Visible pages (RLS scopes rows to the caller's institution).
    const { data: pageData, error: pagesError } = await supabase
      .from('fb_pages')
      .select('id, name, institutions(name)')
      .order('name', { ascending: true });

    if (pagesError) {
      return NextResponse.json({ success: false, error: pagesError.message }, { status: 500 });
    }

    const pages = (pageData ?? []) as unknown as PageRow[];
    const pageIds = pages.map((p) => p.id);

    // 2a. LATEST snapshot per page — newest-first pages, first-seen-wins;
    //     stop early once every page has resolved.
    const latest = new Map<string, SnapshotRow>();
    // 2b. FIRST snapshot per page within the window — oldest-first pages.
    const firstInWindow = new Map<string, SnapshotRow>();

    if (pageIds.length > 0) {
      for (let page = 0; page < MAX_PAGES; page++) {
        const { data, error } = await supabase
          .from('fb_page_metrics')
          .select('page_id, snapshot_at, fan_count, impressions_unique, post_engagements')
          .in('page_id', pageIds)
          .order('snapshot_at', { ascending: false })
          .order('id', { ascending: false })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
        const batch = (data ?? []) as SnapshotRow[];
        for (const row of batch) {
          if (!latest.has(row.page_id)) latest.set(row.page_id, row);
        }
        if (batch.length < PAGE || latest.size === pageIds.length) break;
      }

      for (let page = 0; page < MAX_PAGES; page++) {
        const { data, error } = await supabase
          .from('fb_page_metrics')
          .select('page_id, snapshot_at, fan_count, impressions_unique, post_engagements')
          .in('page_id', pageIds)
          .gte('snapshot_at', sinceIso)
          .order('snapshot_at', { ascending: true })
          .order('id', { ascending: true })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
        const batch = (data ?? []) as SnapshotRow[];
        for (const row of batch) {
          if (!firstInWindow.has(row.page_id)) firstInWindow.set(row.page_id, row);
        }
        if (batch.length < PAGE || firstInWindow.size === pageIds.length) break;
      }
    }

    // 3. Posts published within the window, counted per page (paginated;
    //    RLS scopes rows).
    const postsPerPage = new Map<string, number>();
    let totalPosts = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await supabase
        .from('fb_posts')
        .select('page_id')
        .gte('posted_at', sinceIso)
        .order('id', { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      const batch = (data ?? []) as PostRow[];
      for (const row of batch) {
        postsPerPage.set(row.page_id, (postsPerPage.get(row.page_id) ?? 0) + 1);
        totalPosts += 1;
      }
      if (batch.length < PAGE) break;
    }

    // 4. Shape per-page rows + totals.
    const totals = { fans: 0, impressions_unique: 0, post_engagements: 0, posts: totalPosts };
    const pageRows = pages.map((p) => {
      const latestSnap = latest.get(p.id);
      const firstSnap = firstInWindow.get(p.id);

      const fans = latestSnap?.fan_count ?? 0;
      const impressionsUnique = latestSnap?.impressions_unique ?? 0;
      const postEngagements = latestSnap?.post_engagements ?? 0;
      const fansGained =
        latestSnap?.fan_count != null && firstSnap?.fan_count != null
          ? latestSnap.fan_count - firstSnap.fan_count
          : 0;

      totals.fans += fans;
      totals.impressions_unique += impressionsUnique;
      totals.post_engagements += postEngagements;

      return {
        id: p.id,
        name: p.name,
        institution_name: p.institutions?.name ?? '',
        fans,
        fans_gained: fansGained,
        impressions_unique: impressionsUnique,
        post_engagements: postEngagements,
        posts_in_window: postsPerPage.get(p.id) ?? 0,
      };
    });

    return NextResponse.json({ success: true, data: { pages: pageRows, totals } });
  } catch (error) {
    console.error('[fb-insights-summary] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Summary query failed' },
      { status: 500 }
    );
  }
}
