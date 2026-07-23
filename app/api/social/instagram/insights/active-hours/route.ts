export const dynamic = 'force-dynamic';

/**
 * GET /api/social/instagram/insights/active-hours  (contract C3)
 *
 * Query params:
 *   account_id — uuid, REQUIRED (400 when missing/invalid)
 *
 * Response (success envelope):
 *   { success: true, data: {
 *       hours: [{ hour: number (0-23), value: number }],   // always 24 entries
 *       updated_at: string | null
 *   } }
 *
 * Semantics: reads the LATEST ig_account_metrics row whose online_followers
 * JSONB is non-null for the account ({"0": n, ..., "23": n} hourly shape from
 * Meta's online_followers metric). Missing hour keys default to 0. When the
 * account has no snapshot with online_followers yet, hours is the full
 * 24-entry array of zeros and updated_at is null (UI empty-state signal).
 *
 * Auth: any authenticated user; row visibility enforced by ig_account_metrics
 * RLS via the user-session client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    if (!accountId || !UUID_RE.test(accountId)) {
      return NextResponse.json(
        { success: false, error: 'account_id is required and must be a UUID' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('ig_account_metrics')
      .select('snapshot_at, online_followers')
      .eq('account_id', accountId)
      .not('online_followers', 'is', null)
      .order('snapshot_at', { ascending: false })
      .limit(1);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const latest = data?.[0] as
      | { snapshot_at: string; online_followers: Record<string, number> | null }
      | undefined;
    const onlineFollowers = latest?.online_followers ?? null;

    const hours = Array.from({ length: 24 }, (_, hour) => {
      const raw = onlineFollowers?.[String(hour)];
      return { hour, value: typeof raw === 'number' && Number.isFinite(raw) ? raw : 0 };
    });

    return NextResponse.json({
      success: true,
      data: {
        hours,
        updated_at: onlineFollowers ? latest?.snapshot_at ?? null : null,
      },
    });
  } catch (error) {
    console.error('[ig-insights-active-hours] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Active-hours query failed' },
      { status: 500 }
    );
  }
}
