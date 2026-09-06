export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/social/ads/sync
 *
 * Manual trigger to pull Meta Ads Insights for an ad account (or all ad
 * accounts of an institution) RIGHT NOW. Writes to `meta_ad_accounts`,
 * `meta_campaigns`, `meta_ad_insights` via service role.
 *
 * Body (JSON):
 *   { account_id?: string, institution_id?: string, since?: 'YYYY-MM-DD', until?: 'YYYY-MM-DD' }
 *
 * Auth: super_admin OR institution_admin scoped to the row's institution_id.
 *
 * READ-ONLY toward Meta: this only READS Insights data from Meta and writes
 * the cache; it does NOT mutate any Meta-side object.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import {
  getAccountInsights,
  getCampaignInsights,
  listCampaigns,
} from '@/lib/meta/ads-client';
import type { FbAdInsight } from '@/lib/meta/ads-types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface SyncBody {
  account_id?: string;
  institution_id?: string;
  since?: string;
  until?: string;
}

interface InsightsRow {
  account_id: string;
  campaign_id: string | null;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  cpm: number | null;
  cpc: number | null;
  ctr: number | null;
  actions: unknown;
  synced_at: string;
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

export async function POST(request: NextRequest) {
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

    let body: SyncBody = {};
    try {
      body = (await request.json()) as SyncBody;
    } catch {
      // empty body is allowed; treated as "sync everything I can see"
    }

    const { account_id: accountId, institution_id: institutionId, since, until } = body;

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

    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();

    const isSuperAdmin = profile?.role === 'super_admin';
    const isInstitutionAdmin = profile?.role === 'institution_admin';

    // 2026-06-11 granular-permission retrofit: roles granted
    // social.ads.manage via Role Management pass too — like
    // institution_admin they are hard-pinned to their own institution by
    // the effectiveInstitutionId resolution below.
    let hasManagePerm = false;
    if (!isSuperAdmin && !isInstitutionAdmin) {
      const { data: perm } = await supabase.rpc('user_has_permission', {
        permission_name: 'social.ads.manage',
      });
      hasManagePerm = !!perm;
    }

    if (!isSuperAdmin && !isInstitutionAdmin && !hasManagePerm) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    // Force the institution scope server-side — never trust the body for it.
    // A super_admin may optionally narrow to one institution (or omit it to
    // sync all). An institution_admin is hard-pinned to their own institution
    // regardless of what the body asks for; otherwise they could sync (and
    // cache Insights for) ad accounts belonging to another institution by
    // passing a foreign institution_id or account_id.
    const effectiveInstitutionId = isSuperAdmin
      ? institutionId
      : profile?.institution_id;

    if (!isSuperAdmin && !effectiveInstitutionId) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    const accessToken =
      process.env.META_ADS_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'META_ADS_ACCESS_TOKEN not configured' },
        { status: 503 }
      );
    }

    const serviceClient = createServiceRoleClient();

    // Resolve target ad accounts
    let acctQuery = serviceClient
      .from('meta_ad_accounts')
      .select('id, fb_ad_account_id, institution_id')
      .eq('status', 'active');
    if (accountId) acctQuery = acctQuery.eq('id', accountId);
    // institution_admin is always constrained to effectiveInstitutionId, so a
    // foreign account_id collapses to zero rows ("No ad accounts to sync").
    if (effectiveInstitutionId)
      acctQuery = acctQuery.eq('institution_id', effectiveInstitutionId);

    const { data: targets, error: targetsError } = await acctQuery;
    if (targetsError) {
      return NextResponse.json(
        { success: false, error: targetsError.message },
        { status: 500 }
      );
    }
    if (!targets || targets.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          synced_accounts: 0,
          synced_campaigns: 0,
          synced_insight_rows: 0,
          message: 'No ad accounts to sync',
        },
      });
    }

    const insightsOptions: {
      timeRangeSince?: string;
      timeRangeUntil?: string;
    } = {};
    if (since) insightsOptions.timeRangeSince = since;
    if (until) insightsOptions.timeRangeUntil = until;

    let syncedCampaigns = 0;
    let syncedRows = 0;
    const errors: Array<{ account_id: string; error: string }> = [];

    for (const target of targets as Array<{
      id: string;
      fb_ad_account_id: string;
      institution_id: string;
    }>) {
      try {
        // 1. Sync campaigns
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
              error: `campaigns upsert: ${campError.message}`,
            });
            continue;
          }
          syncedCampaigns += campaignRows.length;
        }

        // Resolve campaign UUIDs for the insight upsert that follows
        const { data: campLookup } = await serviceClient
          .from('meta_campaigns')
          .select('id, fb_campaign_id')
          .eq('account_id', target.id);
        const campaignIdByFb = new Map<string, string>(
          (campLookup || []).map((c: { id: string; fb_campaign_id: string }) => [
            c.fb_campaign_id,
            c.id,
          ])
        );

        // 2. Sync account-level insights
        const acctInsights = await getAccountInsights(
          target.fb_ad_account_id,
          { accessToken },
          { ...insightsOptions, level: 'account', timeIncrement: 1 }
        );

        const acctRows: InsightsRow[] = (acctInsights.data || [])
          .filter((r: FbAdInsight) => r.date_start)
          .map((r: FbAdInsight) => ({
            account_id: target.id,
            campaign_id: null,
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
          // Account-level rows have campaign_id=NULL, so we cannot use a
          // generic upsert (Supabase needs ON CONFLICT against a real
          // constraint, and we have a partial unique index for NULL only).
          // Strategy: delete + insert per (account_id, date) range.
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
              error: `account insights insert: ${insErr.message}`,
            });
            continue;
          }
          syncedRows += acctRows.length;
        }

        // 3. Sync campaign-level insights (one bulk call at level=campaign)
        const campInsights = await getAccountInsights(
          target.fb_ad_account_id,
          { accessToken },
          { ...insightsOptions, level: 'campaign', timeIncrement: 1 }
        );

        const campRows: InsightsRow[] = (campInsights.data || [])
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
          // Delete + insert per (account_id, campaign_id, date) keys to keep
          // the partial unique index happy.
          const keys = campRows.map((r) => ({
            campaign_id: r.campaign_id as string,
            date: r.date,
          }));
          // Bulk delete by date range + account, then re-insert. Cheaper
          // than per-row deletes for a typical 14-day window.
          const allDates = Array.from(new Set(keys.map((k) => k.date)));
          const allCampaignIds = Array.from(
            new Set(keys.map((k) => k.campaign_id))
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
              error: `campaign insights insert: ${insErr2.message}`,
            });
            continue;
          }
          syncedRows += campRows.length;
        }

        // Stamp last_synced_at
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
      success: errors.length === 0,
      data: {
        synced_accounts: targets.length,
        synced_campaigns: syncedCampaigns,
        synced_insight_rows: syncedRows,
        errors,
      },
    });
  } catch (error) {
    console.error('[meta-ads-sync] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Sync failed',
      },
      { status: 500 }
    );
  }
}
