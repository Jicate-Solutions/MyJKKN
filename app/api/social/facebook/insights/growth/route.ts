export const dynamic = 'force-dynamic';

/**
 * GET /api/social/facebook/insights/growth  (contract F1)
 *
 * Query params:
 *   page_id — uuid, optional. When omitted, sums across all pages visible
 *             to the caller (RLS-scoped).
 *   days    — int, default 30, clamped to [1, 365].
 *
 * Response (success envelope):
 *   { success: true, data: {
 *       series: [{ date: 'YYYY-MM-DD', fans: number|null,
 *                  followers: number|null, impressions_unique: number|null,
 *                  post_engagements: number|null }],
 *       fans_now: number,
 *       fans_gained: number
 *   } }
 *
 * Semantics: snapshots in the window are reduced to the LAST snapshot per
 * (page, UTC day); per-day values are then summed across pages (a day's
 * metric is null only when every page is null for it that day). Series is
 * ascending by date and contains only days that have at least one snapshot.
 * fans_now = last non-null fans in the series (0 when none);
 * fans_gained = last non-null minus first non-null (0 when fewer than two
 * non-null points).
 *
 * Auth: any authenticated user; row visibility enforced by fb_page_metrics
 * RLS (institution match OR super_admin) via the user-session client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;
const MAX_PAGES = 20;

interface MetricRow {
  page_id: string;
  snapshot_at: string;
  fan_count: number | null;
  followers_count: number | null;
  impressions_unique: number | null;
  post_engagements: number | null;
}

interface DayBucket {
  fans: number | null;
  followers: number | null;
  impressions_unique: number | null;
  post_engagements: number | null;
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
    const days = parseDays(searchParams.get('days'), 30);

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

    // Paginated fetch (PostgREST caps a single response at ~1000 rows; a
    // 365-day window across many pages can exceed that).
    const rows: MetricRow[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      let query = supabase
        .from('fb_page_metrics')
        .select('page_id, snapshot_at, fan_count, followers_count, impressions_unique, post_engagements')
        .gte('snapshot_at', sinceIso)
        .order('snapshot_at', { ascending: false })
        .order('id', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (pageId) query = query.eq('page_id', pageId);

      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      const batch = (data ?? []) as MetricRow[];
      rows.push(...batch);
      if (batch.length < PAGE) break;
    }

    // Rows are newest-first → first-seen-wins = LAST snapshot per (page, UTC day).
    const latestPerPageDay = new Map<string, MetricRow>();
    for (const r of rows) {
      const key = `${r.page_id}|${r.snapshot_at.slice(0, 10)}`;
      if (!latestPerPageDay.has(key)) latestPerPageDay.set(key, r);
    }

    // Merge by day: sum non-null values across pages; null only when all null.
    const byDay = new Map<string, DayBucket>();
    for (const r of latestPerPageDay.values()) {
      const date = r.snapshot_at.slice(0, 10);
      const bucket = byDay.get(date) ?? {
        fans: null,
        followers: null,
        impressions_unique: null,
        post_engagements: null,
      };
      if (r.fan_count !== null) bucket.fans = (bucket.fans ?? 0) + r.fan_count;
      if (r.followers_count !== null) bucket.followers = (bucket.followers ?? 0) + r.followers_count;
      if (r.impressions_unique !== null) {
        bucket.impressions_unique = (bucket.impressions_unique ?? 0) + r.impressions_unique;
      }
      if (r.post_engagements !== null) {
        bucket.post_engagements = (bucket.post_engagements ?? 0) + r.post_engagements;
      }
      byDay.set(date, bucket);
    }

    const series = Array.from(byDay.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, b]) => ({ date, ...b }));

    const fanPoints = series
      .map((s) => s.fans)
      .filter((v): v is number => v !== null);
    const fansNow = fanPoints.length > 0 ? fanPoints[fanPoints.length - 1] : 0;
    const fansGained =
      fanPoints.length > 1 ? fanPoints[fanPoints.length - 1] - fanPoints[0] : 0;

    return NextResponse.json({
      success: true,
      data: {
        series,
        fans_now: fansNow,
        fans_gained: fansGained,
      },
    });
  } catch (error) {
    console.error('[fb-insights-growth] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Growth query failed' },
      { status: 500 }
    );
  }
}
