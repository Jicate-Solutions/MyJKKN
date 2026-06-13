export const dynamic = 'force-dynamic';

/**
 * GET /api/social/ads/insights
 *
 * READ-ONLY query against the local `meta_ad_insights` cache. Returns daily
 * rollups in the requested date range, optionally filtered to one ad account
 * or one campaign.
 *
 * This route does NOT hit Meta's Graph API directly — that's the sync
 * cron's job. Hitting Meta on every page load would burn rate-limit budget
 * and surface inconsistent numbers across viewers. The cache lag is
 * controlled by the `meta.ads.sync_interval_minutes` policy.
 *
 * Query params:
 *   account_id   — UUID of meta_ad_accounts row (optional, but at least
 *                  account_id OR institution_id must be set)
 *   campaign_id  — UUID of meta_campaigns row (optional)
 *   institution_id — UUID; required when account_id is not given
 *   since        — ISO date `YYYY-MM-DD` (inclusive)
 *   until        — ISO date `YYYY-MM-DD` (inclusive)
 *   level        — 'account' (default) | 'campaign'
 *
 * Auth: super_admin OR institution_admin scoped to institution_id of the row.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('account_id');
    const campaignId = searchParams.get('campaign_id');
    const institutionId = searchParams.get('institution_id');
    const since = searchParams.get('since');
    const until = searchParams.get('until');
    const level = (searchParams.get('level') || 'account') as
      | 'account'
      | 'campaign';

    if (since && !ISO_DATE.test(since)) {
      return NextResponse.json(
        { success: false, error: 'since must be YYYY-MM-DD' },
        { status: 400 }
      );
    }
    if (until && !ISO_DATE.test(until)) {
      return NextResponse.json(
        { success: false, error: 'until must be YYYY-MM-DD' },
        { status: 400 }
      );
    }
    if (!accountId && !institutionId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Provide account_id OR institution_id',
        },
        { status: 400 }
      );
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();

    const isSuperAdmin = profile?.role === 'super_admin';

    // RLS will enforce institution scope; we ALSO gate non-super-admin
    // explicitly to surface 403 instead of an empty result for mis-scoped
    // queries.
    if (!isSuperAdmin) {
      if (institutionId && profile?.institution_id !== institutionId) {
        return NextResponse.json(
          { success: false, error: 'Access denied' },
          { status: 403 }
        );
      }
    }

    let query = supabase
      .from('meta_ad_insights')
      .select(
        'id, account_id, campaign_id, date, spend, impressions, clicks, reach, cpm, cpc, ctr, actions, synced_at, meta_ad_accounts!inner(id, institution_id, name, currency)'
      )
      .order('date', { ascending: false })
      .limit(2000);

    if (accountId) query = query.eq('account_id', accountId);
    if (campaignId) query = query.eq('campaign_id', campaignId);
    if (institutionId)
      query = query.eq('meta_ad_accounts.institution_id', institutionId);
    if (since) query = query.gte('date', since);
    if (until) query = query.lte('date', until);
    if (level === 'account') {
      query = query.is('campaign_id', null);
    } else if (level === 'campaign') {
      query = query.not('campaign_id', 'is', null);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[meta-ads-insights] Supabase error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        rows: data || [],
        count: data?.length ?? 0,
        level,
      },
    });
  } catch (error) {
    console.error('[meta-ads-insights] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Read failed',
      },
      { status: 500 }
    );
  }
}
