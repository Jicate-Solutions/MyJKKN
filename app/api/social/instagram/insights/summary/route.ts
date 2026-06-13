export const dynamic = 'force-dynamic';

/**
 * GET /api/social/instagram/insights/summary  (contract C7)
 *
 * Query params:
 *   days — int, default 30, clamped to [1, 365]
 *
 * Response (success envelope):
 *   { success: true, data: {
 *       accounts: [{ id, username, institution_name,
 *                    followers: number, followers_gained: number,
 *                    reach: number, impressions: number,
 *                    engagement_rate: number|null }],
 *       totals: { followers: number, reach: number, impressions: number,
 *                 posts: number }
 *   } }
 *
 * Semantics: one row per ig_account visible to the caller (RLS-scoped).
 * followers / reach / impressions come from the account's LATEST
 * ig_account_metrics snapshot (null-safe → 0). followers_gained = latest
 * followers minus the FIRST snapshot's followers within the window (0 when
 * either side is missing; can be negative on real follower loss).
 * engagement_rate = total_interactions / followers * 100 rounded to 2dp from
 * the latest snapshot — null when total_interactions is null or followers is
 * 0 (null-safe per contract). totals sums the account rows; totals.posts =
 * count of ig_posts posted within the window across visible accounts.
 *
 * Auth: any authenticated user; row visibility enforced by ig_accounts /
 * ig_account_metrics / ig_posts RLS via the user-session client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const PAGE = 1000;
const MAX_PAGES = 20;

interface AccountRow {
  id: string;
  username: string;
  institutions: { name: string } | null;
}

interface SnapshotRow {
  account_id: string;
  snapshot_at: string;
  followers: number | null;
  reach: number | null;
  impressions: number | null;
  total_interactions: number | null;
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

    // 1. Visible accounts (RLS scopes rows to the caller's institution).
    const { data: accountData, error: accountsError } = await supabase
      .from('ig_accounts')
      .select('id, username, institutions(name)')
      .order('username', { ascending: true });

    if (accountsError) {
      return NextResponse.json({ success: false, error: accountsError.message }, { status: 500 });
    }

    const accounts = (accountData ?? []) as unknown as AccountRow[];
    const accountIds = accounts.map((a) => a.id);

    // 2a. LATEST snapshot per account — newest-first pages, first-seen-wins;
    //     stop early once every account has resolved.
    const latest = new Map<string, SnapshotRow>();
    // 2b. FIRST snapshot per account within the window — oldest-first pages.
    const firstInWindow = new Map<string, SnapshotRow>();

    if (accountIds.length > 0) {
      for (let page = 0; page < MAX_PAGES; page++) {
        const { data, error } = await supabase
          .from('ig_account_metrics')
          .select('account_id, snapshot_at, followers, reach, impressions, total_interactions')
          .in('account_id', accountIds)
          .order('snapshot_at', { ascending: false })
          .order('id', { ascending: false })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
        const batch = (data ?? []) as SnapshotRow[];
        for (const row of batch) {
          if (!latest.has(row.account_id)) latest.set(row.account_id, row);
        }
        if (batch.length < PAGE || latest.size === accountIds.length) break;
      }

      for (let page = 0; page < MAX_PAGES; page++) {
        const { data, error } = await supabase
          .from('ig_account_metrics')
          .select('account_id, snapshot_at, followers, reach, impressions, total_interactions')
          .in('account_id', accountIds)
          .gte('snapshot_at', sinceIso)
          .order('snapshot_at', { ascending: true })
          .order('id', { ascending: true })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
        const batch = (data ?? []) as SnapshotRow[];
        for (const row of batch) {
          if (!firstInWindow.has(row.account_id)) firstInWindow.set(row.account_id, row);
        }
        if (batch.length < PAGE || firstInWindow.size === accountIds.length) break;
      }
    }

    // 3. Posts published within the window (count only; RLS scopes rows).
    const { count: postsCount, error: postsError } = await supabase
      .from('ig_posts')
      .select('id', { count: 'exact', head: true })
      .gte('posted_at', sinceIso);

    if (postsError) {
      return NextResponse.json({ success: false, error: postsError.message }, { status: 500 });
    }

    // 4. Shape per-account rows + totals.
    const totals = { followers: 0, reach: 0, impressions: 0, posts: postsCount ?? 0 };
    const accountRows = accounts.map((a) => {
      const latestSnap = latest.get(a.id);
      const firstSnap = firstInWindow.get(a.id);

      const followers = latestSnap?.followers ?? 0;
      const reach = latestSnap?.reach ?? 0;
      const impressions = latestSnap?.impressions ?? 0;
      const followersGained =
        latestSnap?.followers != null && firstSnap?.followers != null
          ? latestSnap.followers - firstSnap.followers
          : 0;
      const engagementRate =
        latestSnap?.total_interactions != null && followers > 0
          ? Math.round((latestSnap.total_interactions / followers) * 100 * 100) / 100
          : null;

      totals.followers += followers;
      totals.reach += reach;
      totals.impressions += impressions;

      return {
        id: a.id,
        username: a.username,
        institution_name: a.institutions?.name ?? '',
        followers,
        followers_gained: followersGained,
        reach,
        impressions,
        engagement_rate: engagementRate,
      };
    });

    return NextResponse.json({ success: true, data: { accounts: accountRows, totals } });
  } catch (error) {
    console.error('[ig-insights-summary] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Summary query failed' },
      { status: 500 }
    );
  }
}
