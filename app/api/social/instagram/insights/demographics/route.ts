export const dynamic = 'force-dynamic';

/**
 * GET /api/social/instagram/insights/demographics  (contract C6)
 *
 * Query params:
 *   account_id — uuid, REQUIRED (400 when missing/invalid)
 *
 * Response (success envelope):
 *   { success: true, data: {
 *       updated_at: string | null,
 *       raw: object | null       // ig_account_metrics.follower_demographics
 *                                // passthrough (raw Meta shape, unmodified)
 *   } }
 *
 * Semantics: reads the LATEST ig_account_metrics row whose
 * follower_demographics JSONB is non-null for the account and passes the
 * blob through untouched. Both fields are null when no snapshot has captured
 * demographics yet (UI empty-state signal).
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
      .select('snapshot_at, follower_demographics')
      .eq('account_id', accountId)
      .not('follower_demographics', 'is', null)
      .order('snapshot_at', { ascending: false })
      .limit(1);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const latest = data?.[0] as
      | { snapshot_at: string; follower_demographics: Record<string, unknown> | null }
      | undefined;

    return NextResponse.json({
      success: true,
      data: {
        updated_at: latest?.follower_demographics ? latest.snapshot_at : null,
        raw: latest?.follower_demographics ?? null,
      },
    });
  } catch (error) {
    console.error('[ig-insights-demographics] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Demographics query failed' },
      { status: 500 }
    );
  }
}
