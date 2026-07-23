export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * /api/cron/meta-ads-sync
 *
 * Scheduled Meta Ads Insights sync. Default cadence is every 2 hours,
 * controlled by the `meta.ads.sync_interval_minutes` policy. When
 * `meta.ads.is_enabled` is false, the job exits as a no-op.
 *
 * For each active meta_ad_accounts row:
 *   1. listCampaigns → upsert meta_campaigns
 *   2. getAccountInsights(level=account, time_increment=1) → meta_ad_insights
 *   3. getAccountInsights(level=campaign, time_increment=1) → meta_ad_insights
 *   4. stamp meta_ad_accounts.last_synced_at
 *
 * Auth: Bearer CRON_SECRET (Vercel cron auto-sends) OR ?secret= for manual.
 *
 * READ-ONLY toward Meta: only reads Insights data.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createServiceRoleClient,
} from '@/lib/supabase/server';
import {
  getAccountInsights,
  listCampaigns,
} from '@/lib/meta/ads-client';
import type { FbAdInsight } from '@/lib/meta/ads-types';

const JOB_NAME = 'meta-ads-sync';
const DEFAULT_LOOKBACK_DAYS = 7;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toNumber(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toNumberOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: NextRequest) {
  const started = Date.now();
  const ranAt = new Date().toISOString();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, job: JOB_NAME, error: 'CRON_SECRET not configured' },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json(
      { ok: false, job: JOB_NAME, error: 'unauthorized' },
      { status: 401 }
    );
  }

  const accessToken =
    process.env.META_ADS_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      {
        ok: false,
        job: JOB_NAME,
        error: 'META_ADS_ACCESS_TOKEN not configured',
      },
      { status: 503 }
    );
  }

  const serviceClient = createServiceRoleClient();

  // 1. Check master kill-switch policy
  const { data: kill } = await serviceClient
    .from('platform_policies')
    .select('value')
    .eq('policy_key', 'meta.ads.is_enabled')
    .eq('scope_type', 'global')
    .is('scope_id', null)
    .maybeSingle();

  const isEnabled = kill?.value === true;
  if (!isEnabled) {
    return NextResponse.json({
      ok: true,
      job: JOB_NAME,
      skipped: true,
      reason: 'meta.ads.is_enabled is false',
      ran_at: ranAt,
      duration_ms: Date.now() - started,
    });
  }

  // 2. Enumerate active accounts
  const { data: targets, error: targetsError } = await serviceClient
    .from('meta_ad_accounts')
    .select('id, fb_ad_account_id, institution_id')
    .eq('status', 'active');

  if (targetsError) {
    return NextResponse.json(
      { ok: false, job: JOB_NAME, error: targetsError.message },
      { status: 500 }
    );
  }

  if (!targets || targets.length === 0) {
    return NextResponse.json({
      ok: true,
      job: JOB_NAME,
      ran_at: ranAt,
      duration_ms: Date.now() - started,
      synced_accounts: 0,
      message: 'No active ad accounts',
    });
  }

  // Sliding window — last DEFAULT_LOOKBACK_DAYS days ending today.
  const until = new Date();
  const since = new Date(until.getTime() - DEFAULT_LOOKBACK_DAYS * 86400 * 1000);
  const insightsOptions = {
    timeRangeSince: isoDate(since),
    timeRangeUntil: isoDate(until),
    timeIncrement: 1 as const,
  };

  let syncedCampaigns = 0;
  let syncedRows = 0;
  const errors: Array<{ account_id: string; error: string }> = [];

  for (const target of targets as Array<{
    id: string;
    fb_ad_account_id: string;
    institution_id: string;
  }>) {
    try {
      // Campaigns
      const campaignsRes = await listCampaigns(
        target.fb_ad_account_id,
        { accessToken },
        { effectiveStatus: ['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED'] }
      );

      const campaignRows = campaignsRes.data.map((c) => ({
        account_id: target.id,
        fb_campaign_id: c.id,
        name: c.name || '(unnamed)',
        status: c.status ?? null,
        effective_status: c.effective_status ?? null,
        objective: c.objective ?? null,
        daily_budget: c.daily_budget ?? null,
        lifetime_budget: c.lifetime_budget ?? null,
        start_time: c.start_time ?? null,
        stop_time: c.stop_time ?? null,
        fb_created_time: c.created_time ?? null,
        fb_updated_time: c.updated_time ?? null,
        last_synced_at: new Date().toISOString(),
      }));

      if (campaignRows.length > 0) {
        const { error: campError } = await serviceClient
          .from('meta_campaigns')
          .upsert(campaignRows, { onConflict: 'fb_campaign_id' });
        if (campError) {
          errors.push({
            account_id: target.id,
            error: `campaigns: ${campError.message}`,
          });
          continue;
        }
        syncedCampaigns += campaignRows.length;
      }

      const { data: campLookup } = await serviceClient
        .from('meta_campaigns')
        .select('id, fb_campaign_id')
        .eq('account_id', target.id);
      const campaignIdByFb = new Map<string, string>(
        (campLookup || []).map(
          (c: { id: string; fb_campaign_id: string }) => [c.fb_campaign_id, c.id]
        )
      );

      // Account-level insights
      const acctInsights = await getAccountInsights(
        target.fb_ad_account_id,
        { accessToken },
        { ...insightsOptions, level: 'account' }
      );

      const acctRows = (acctInsights.data || [])
        .filter((r: FbAdInsight) => r.date_start)
        .map((r: FbAdInsight) => ({
          account_id: target.id,
          campaign_id: null as string | null,
          date: r.date_start as string,
          spend: toNumber(r.spend),
          impressions: toNumber(r.impressions),
          clicks: toNumber(r.clicks),
          reach: toNumber(r.reach),
          cpm: toNumberOrNull(r.cpm),
          cpc: toNumberOrNull(r.cpc),
          ctr: toNumberOrNull(r.ctr),
          actions: r.actions ?? null,
          synced_at: new Date().toISOString(),
        }));

      if (acctRows.length > 0) {
        const dates = acctRows.map((r) => r.date);
        await serviceClient
          .from('meta_ad_insights')
          .delete()
          .eq('account_id', target.id)
          .is('campaign_id', null)
          .in('date', dates);
        const { error: insErr } = await serviceClient
          .from('meta_ad_insights')
          .insert(acctRows);
        if (insErr) {
          errors.push({
            account_id: target.id,
            error: `account insights: ${insErr.message}`,
          });
          continue;
        }
        syncedRows += acctRows.length;
      }

      // Campaign-level insights
      const campInsights = await getAccountInsights(
        target.fb_ad_account_id,
        { accessToken },
        { ...insightsOptions, level: 'campaign' }
      );

      const campRows = (campInsights.data || [])
        .filter((r: FbAdInsight) => r.date_start && r.campaign_id)
        .map((r: FbAdInsight) => ({
          account_id: target.id,
          campaign_id: campaignIdByFb.get(r.campaign_id as string) ?? null,
          date: r.date_start as string,
          spend: toNumber(r.spend),
          impressions: toNumber(r.impressions),
          clicks: toNumber(r.clicks),
          reach: toNumber(r.reach),
          cpm: toNumberOrNull(r.cpm),
          cpc: toNumberOrNull(r.cpc),
          ctr: toNumberOrNull(r.ctr),
          actions: r.actions ?? null,
          synced_at: new Date().toISOString(),
        }))
        .filter((r) => r.campaign_id !== null);

      if (campRows.length > 0) {
        const allDates = Array.from(new Set(campRows.map((r) => r.date)));
        const allCampaignIds = Array.from(
          new Set(campRows.map((r) => r.campaign_id as string))
        );
        await serviceClient
          .from('meta_ad_insights')
          .delete()
          .eq('account_id', target.id)
          .in('campaign_id', allCampaignIds)
          .in('date', allDates);
        const { error: insErr2 } = await serviceClient
          .from('meta_ad_insights')
          .insert(campRows);
        if (insErr2) {
          errors.push({
            account_id: target.id,
            error: `campaign insights: ${insErr2.message}`,
          });
          continue;
        }
        syncedRows += campRows.length;
      }

      await serviceClient
        .from('meta_ad_accounts')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', target.id);
    } catch (err) {
      errors.push({
        account_id: target.id,
        error: err instanceof Error ? err.message : 'unknown sync error',
      });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    job: JOB_NAME,
    ran_at: ranAt,
    duration_ms: Date.now() - started,
    synced_accounts: targets.length,
    synced_campaigns: syncedCampaigns,
    synced_insight_rows: syncedRows,
    errors,
  });
}
