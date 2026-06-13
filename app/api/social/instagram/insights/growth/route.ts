export const dynamic = 'force-dynamic';

/**
 * GET /api/social/instagram/insights/growth  (contract C1)
 *
 * Query params:
 *   account_id — uuid, optional. When omitted, sums across all accounts
 *                visible to the caller (RLS-scoped).
 *   days       — int, default 30, clamped to [1, 365].
 *
 * Response (success envelope):
 *   { success: true, data: {
 *       series: [{ date: 'YYYY-MM-DD', followers: number|null,
 *                  reach: number|null, impressions: number|null,
 *                  profile_views: number|null }],
 *       followers_now: number,
 *       followers_gained: number
 *   } }
 *
 * Semantics: snapshots in the window are reduced to the LAST snapshot per
 * (account, UTC day); per-day values are then summed across accounts (a day's
 * metric is null only when every account is null for it that day). Series is
 * ascending by date and contains only days that have at least one snapshot.
 * followers_now = last non-null followers in the series (0 when none);
 * followers_gained = last non-null minus first non-null (0 when fewer than
 * one non-null point).
 *
 * Auth: any authenticated user; row visibility enforced by ig_account_metrics
 * RLS (institution match OR super_admin) via the user-session client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;
const MAX_PAGES = 20;

interface MetricRow {
  account_id: string;
  snapshot_at: string;
  followers: number | null;
  reach: number | null;
  impressions: number | null;
  profile_views: number | null;
}

interface DayBucket {
  followers: number | null;
  reach: number | null;
  impressions: number | null;
  profile_views: number | null;
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
    const accountId = searchParams.get('account_id');
    const days = parseDays(searchParams.get('days'), 30);

    if (days === null) {
      return NextResponse.json(
        { success: false, error: 'Invalid days parameter — must be a positive integer' },
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

    // Paginated fetch (PostgREST caps a single response at ~1000 rows; a
    // 365-day window across many accounts can exceed that).
    const rows: MetricRow[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      let query = supabase
        .from('ig_account_metrics')
        .select('account_id, snapshot_at, followers, reach, impressions, profile_views')
        .gte('snapshot_at', sinceIso)
        .order('snapshot_at', { ascending: false })
        .order('id', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (accountId) query = query.eq('account_id', accountId);

      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      const batch = (data ?? []) as MetricRow[];
      rows.push(...batch);
      if (batch.length < PAGE) break;
    }

    // Rows are newest-first → first-seen-wins = LAST snapshot per (account, UTC day).
    const latestPerAccountDay = new Map<string, MetricRow>();
    for (const r of rows) {
      const key = `${r.account_id}|${r.snapshot_at.slice(0, 10)}`;
      if (!latestPerAccountDay.has(key)) latestPerAccountDay.set(key, r);
    }

    // Merge by day: sum non-null values across accounts; null only when all null.
    const byDay = new Map<string, DayBucket>();
    for (const r of latestPerAccountDay.values()) {
      const date = r.snapshot_at.slice(0, 10);
      const bucket = byDay.get(date) ?? {
        followers: null,
        reach: null,
        impressions: null,
        profile_views: null,
      };
      if (r.followers !== null) bucket.followers = (bucket.followers ?? 0) + r.followers;
      if (r.reach !== null) bucket.reach = (bucket.reach ?? 0) + r.reach;
      if (r.impressions !== null) bucket.impressions = (bucket.impressions ?? 0) + r.impressions;
      if (r.profile_views !== null) bucket.profile_views = (bucket.profile_views ?? 0) + r.profile_views;
      byDay.set(date, bucket);
    }

    const series = Array.from(byDay.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, b]) => ({ date, ...b }));

    const followerPoints = series
      .map((s) => s.followers)
      .filter((v): v is number => v !== null);
    const followersNow = followerPoints.length > 0 ? followerPoints[followerPoints.length - 1] : 0;
    const followersGained =
      followerPoints.length > 1
        ? followerPoints[followerPoints.length - 1] - followerPoints[0]
        : 0;

    return NextResponse.json({
      success: true,
      data: {
        series,
        followers_now: followersNow,
        followers_gained: followersGained,
      },
    });
  } catch (error) {
    console.error('[ig-insights-growth] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Growth query failed' },
      { status: 500 }
    );
  }
}
