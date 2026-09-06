// READ-ONLY MODULE.
// This module reads ad performance data only. No publishing, mutating,
// pausing, resuming, or boosting. Any future write capability requires a
// separate PR with explicit Director approval and a clear audit trail.

// lib/meta/ads-client.ts
// Meta Ads Insights client. Built on `lib/meta/graph-api-client.ts`.
//
// Scope (Phase 1):
//   - listAdAccounts(businessId)        — discover ad accounts under a Meta Business
//   - listCampaigns(adAccountId)        — list campaigns under one ad account
//   - getCampaignInsights(campaignId)   — daily-rollup insights for one campaign
//   - getAccountInsights(adAccountId)   — daily-rollup insights for one ad account
//
// All methods take an `accessToken` carrying the `ads_read`,
// `business_management`, and `read_insights` scopes. All methods are
// READ-ONLY — there is no publish / mutate / pause / boost surface here, and
// adding one is explicitly out of scope for this module.
//
// Sentry op is set to `meta.ads` so transactions surface separately from
// WhatsApp / Instagram / Facebook calls in the Sentry dashboard.

import {
  graphRequest,
  graphRequestData,
} from '@/lib/meta/graph-api-client';
import type {
  MetaGraphListResponse,
  MetaGraphResponse,
} from '@/lib/meta/types';
import type {
  DatePreset,
  FbAdAccount,
  FbAdInsight,
  FbCampaign,
  FbInsightBreakdown,
  FbInsightLevel,
} from '@/lib/meta/ads-types';

const SENTRY_OP = 'meta.ads';

// ---------------------------------------------------------------------------
// Default field sets
// ---------------------------------------------------------------------------

const DEFAULT_AD_ACCOUNT_FIELDS = [
  'id',
  'account_id',
  'name',
  'currency',
  'account_status',
  'timezone_name',
  'business_name',
].join(',');

const DEFAULT_CAMPAIGN_FIELDS = [
  'id',
  'name',
  'status',
  'effective_status',
  'objective',
  'daily_budget',
  'lifetime_budget',
  'start_time',
  'stop_time',
  'created_time',
  'updated_time',
].join(',');

const DEFAULT_INSIGHT_FIELDS = [
  'account_id',
  'account_name',
  'account_currency',
  'campaign_id',
  'campaign_name',
  'adset_id',
  'adset_name',
  'ad_id',
  'ad_name',
  'date_start',
  'date_stop',
  'spend',
  'impressions',
  'clicks',
  'reach',
  'cpm',
  'cpc',
  'ctr',
  'frequency',
  'unique_clicks',
  'actions',
  'action_values',
].join(',');

// ---------------------------------------------------------------------------
// Common call config
// ---------------------------------------------------------------------------

export interface AdsCallConfig {
  /**
   * Long-lived access token with the following scopes:
   *   - `ads_read`            — read insights + entity reads
   *   - `business_management` — enumerate ad accounts under a business
   *   - `read_insights`       — historical insight access
   */
  accessToken: string;
  /** Override Graph API version. Default falls through to lib/meta default (v21.0). */
  apiVersion?: string;
}

export interface InsightsOptions {
  /**
   * One of Meta's named windows. Mutually exclusive with explicit
   * `time_range` (timeRangeSince + timeRangeUntil). If both are passed, Meta
   * uses `time_range` and ignores `date_preset`.
   */
  datePreset?: DatePreset;
  /** ISO date `YYYY-MM-DD`. Inclusive lower bound when datePreset is omitted. */
  timeRangeSince?: string;
  /** ISO date `YYYY-MM-DD`. Inclusive upper bound when datePreset is omitted. */
  timeRangeUntil?: string;
  /** Aggregation grain. Default `1` → one row per day. Omit for a single rollup row. */
  timeIncrement?: 1 | 7 | 'monthly' | 'all_days';
  /** Override the field set. Defaults to the full headline set. */
  fields?: string;
  /** Aggregation level (account/campaign/adset/ad). Defaults vary per method. */
  level?: FbInsightLevel;
  /** Optional breakdowns — comma-joined client-side. */
  breakdowns?: FbInsightBreakdown[];
  /** Page-size hint. Meta caps at 500 rows / page. */
  limit?: number;
  /** Pagination cursor — value of `paging.cursors.after` from a prior call. */
  after?: string;
}

// ---------------------------------------------------------------------------
// 1. listAdAccounts(businessId)
// ---------------------------------------------------------------------------

/**
 * List ad accounts under a Meta Business. Concatenates both `owned_ad_accounts`
 * (accounts the business owns directly) and `client_ad_accounts` (accounts
 * other businesses share with this business). De-duplicated by id.
 *
 * Endpoints:
 *   `GET /{business-id}/owned_ad_accounts`
 *   `GET /{business-id}/client_ad_accounts`
 *
 * Requires the access token to carry the `business_management` scope. Returns
 * an empty array if the token has access to zero accounts under the business.
 */
export async function listAdAccounts(
  businessId: string,
  config: AdsCallConfig,
  options?: { fields?: string }
): Promise<FbAdAccount[]> {
  const fields = options?.fields || DEFAULT_AD_ACCOUNT_FIELDS;

  const ownedPromise = graphRequestData<MetaGraphListResponse<FbAdAccount>>({
    endpoint: `/${businessId}/owned_ad_accounts`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: { fields, limit: 100 },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'listAdAccounts.owned',
  });

  const clientPromise = graphRequestData<MetaGraphListResponse<FbAdAccount>>({
    endpoint: `/${businessId}/client_ad_accounts`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: { fields, limit: 100 },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'listAdAccounts.client',
  });

  const [owned, client] = await Promise.all([ownedPromise, clientPromise]);

  const merged = new Map<string, FbAdAccount>();
  for (const acct of [...owned.data, ...client.data]) {
    if (!merged.has(acct.id)) merged.set(acct.id, acct);
  }

  return Array.from(merged.values());
}

// ---------------------------------------------------------------------------
// 2. listCampaigns(adAccountId)
// ---------------------------------------------------------------------------

export interface ListCampaignsOptions {
  /** Override the field set. Default = full campaign field set. */
  fields?: string;
  /** Page-size hint. Meta caps at 500. */
  limit?: number;
  /** Pagination cursor. */
  after?: string;
  /**
   * Effective-status filter. Without this, Meta excludes ARCHIVED + DELETED
   * by default; pass `['ACTIVE','PAUSED','ARCHIVED','DELETED']` to see all.
   */
  effectiveStatus?: string[];
}

/**
 * List campaigns under one ad account. Returns the parsed Meta envelope so
 * callers can paginate via `paging.cursors.after`.
 *
 * Endpoint: `GET /{ad-account-id}/campaigns`
 *
 * `adAccountId` MUST include the `act_` prefix (the canonical id form).
 */
export async function listCampaigns(
  adAccountId: string,
  config: AdsCallConfig,
  options?: ListCampaignsOptions
): Promise<MetaGraphListResponse<FbCampaign>> {
  const query: Record<string, string | number | boolean | undefined> = {
    fields: options?.fields || DEFAULT_CAMPAIGN_FIELDS,
    limit: options?.limit ?? 100,
    after: options?.after,
  };

  if (options?.effectiveStatus && options.effectiveStatus.length > 0) {
    query['effective_status'] = JSON.stringify(options.effectiveStatus);
  }

  return graphRequestData<MetaGraphListResponse<FbCampaign>>({
    endpoint: `/${adAccountId}/campaigns`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query,
    sentryOp: SENTRY_OP,
    sentrySpanName: 'listCampaigns',
  });
}

// ---------------------------------------------------------------------------
// 3. getCampaignInsights(campaignId)
// ---------------------------------------------------------------------------

/**
 * Read insights for a single campaign. Default level is `campaign` with
 * daily time-increment (one row per day in the requested window).
 *
 * Endpoint: `GET /{campaign-id}/insights`
 *
 * Insights queries can be slow on long windows; the underlying client default
 * timeout is 15s. For windows larger than `last_30d` consider paging.
 */
export async function getCampaignInsights(
  campaignId: string,
  config: AdsCallConfig,
  options?: InsightsOptions
): Promise<MetaGraphListResponse<FbAdInsight>> {
  return graphRequestData<MetaGraphListResponse<FbAdInsight>>({
    endpoint: `/${campaignId}/insights`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: buildInsightsQuery(options, { defaultLevel: 'campaign' }),
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getCampaignInsights',
    // Insights endpoints occasionally take >15s on wide windows.
    timeoutMs: 30000,
  });
}

// ---------------------------------------------------------------------------
// 4. getAccountInsights(adAccountId)
// ---------------------------------------------------------------------------

/**
 * Read insights at the ad account level. Default level is `account`, daily
 * time-increment. Pass `level: 'campaign'` to get one row per (campaign,
 * date) within the account — useful for the campaign-performance table.
 *
 * Endpoint: `GET /{ad-account-id}/insights`
 *
 * `adAccountId` MUST include the `act_` prefix.
 */
export async function getAccountInsights(
  adAccountId: string,
  config: AdsCallConfig,
  options?: InsightsOptions
): Promise<MetaGraphListResponse<FbAdInsight>> {
  return graphRequestData<MetaGraphListResponse<FbAdInsight>>({
    endpoint: `/${adAccountId}/insights`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: buildInsightsQuery(options, { defaultLevel: 'account' }),
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getAccountInsights',
    timeoutMs: 30000,
  });
}

// ---------------------------------------------------------------------------
// Rate-limit-aware variant (account insights)
// ---------------------------------------------------------------------------

/**
 * Same as `getAccountInsights` but returns the full envelope (status +
 * rateLimit) so callers can pause polling when `rateLimit.nearLimit` is true.
 * Use this from cron / sync code where back-pressure matters.
 */
export async function getAccountInsightsWithMeta(
  adAccountId: string,
  config: AdsCallConfig,
  options?: InsightsOptions
): Promise<MetaGraphResponse<MetaGraphListResponse<FbAdInsight>>> {
  return graphRequest<MetaGraphListResponse<FbAdInsight>>({
    endpoint: `/${adAccountId}/insights`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: buildInsightsQuery(options, { defaultLevel: 'account' }),
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getAccountInsightsWithMeta',
    timeoutMs: 30000,
  });
}

// ---------------------------------------------------------------------------
// Internal: shared insights query builder
// ---------------------------------------------------------------------------

function buildInsightsQuery(
  options: InsightsOptions | undefined,
  defaults: { defaultLevel: FbInsightLevel }
): Record<string, string | number | boolean | undefined> {
  const query: Record<string, string | number | boolean | undefined> = {
    fields: options?.fields || DEFAULT_INSIGHT_FIELDS,
    level: options?.level || defaults.defaultLevel,
    time_increment: options?.timeIncrement ?? 1,
    limit: options?.limit ?? 100,
    after: options?.after,
  };

  // time_range and date_preset are mutually exclusive on Meta's side.
  if (options?.timeRangeSince && options?.timeRangeUntil) {
    query['time_range'] = JSON.stringify({
      since: options.timeRangeSince,
      until: options.timeRangeUntil,
    });
  } else if (options?.datePreset) {
    query['date_preset'] = options.datePreset;
  } else {
    // Sensible default — last 7 days. Matches the admin UI default.
    query['date_preset'] = 'last_7d';
  }

  if (options?.breakdowns && options.breakdowns.length > 0) {
    query['breakdowns'] = options.breakdowns.join(',');
  }

  return query;
}
