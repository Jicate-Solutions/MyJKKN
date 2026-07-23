// lib/meta/ads-types.ts
// Meta Ads Insights types — built on top of the shared Meta Graph types in
// lib/meta/types.ts. Covers the Ads Insights read-only surface:
// ad accounts, campaigns, ad sets, ads, daily insight rollups.
//
// READ-ONLY MODULE. These types describe READS only. No create / update /
// pause / boost shapes are intentionally absent — a write surface requires
// a separate PR with explicit Director approval.
//
// Reference:
//   https://developers.facebook.com/docs/marketing-api/insights

// ---------------------------------------------------------------------------
// Ad account
// ---------------------------------------------------------------------------

/**
 * Returned by `/{business-id}/owned_ad_accounts` and
 * `/{business-id}/client_ad_accounts`. Minimal fields — caller fans out to
 * insights endpoints for performance data.
 */
export interface FbAdAccount {
  /** Ad account id in the canonical form `act_<numeric>`. */
  id: string;
  /** Numeric account id without the `act_` prefix. */
  account_id?: string;
  /** Human-readable name set by the advertiser. */
  name?: string;
  /** ISO-4217 currency the account spends in (e.g. `INR`, `USD`). */
  currency?: string;
  /**
   * Account status code per Meta:
   *   1=ACTIVE, 2=DISABLED, 3=UNSETTLED, 7=PENDING_RISK_REVIEW,
   *   8=PENDING_SETTLEMENT, 9=IN_GRACE_PERIOD, 100=PENDING_CLOSURE,
   *   101=CLOSED, 201=ANY_ACTIVE, 202=ANY_CLOSED.
   */
  account_status?: number;
  /** IANA timezone string, e.g. `Asia/Kolkata`. */
  timezone_name?: string;
  business_name?: string;
}

// ---------------------------------------------------------------------------
// Campaign / ad set / ad (hierarchy)
// ---------------------------------------------------------------------------

export type FbObjectiveLegacy =
  | 'OUTCOME_AWARENESS'
  | 'OUTCOME_TRAFFIC'
  | 'OUTCOME_ENGAGEMENT'
  | 'OUTCOME_LEADS'
  | 'OUTCOME_APP_PROMOTION'
  | 'OUTCOME_SALES'
  // Legacy objectives still seen on older campaigns:
  | 'BRAND_AWARENESS'
  | 'REACH'
  | 'LINK_CLICKS'
  | 'POST_ENGAGEMENT'
  | 'PAGE_LIKES'
  | 'EVENT_RESPONSES'
  | 'VIDEO_VIEWS'
  | 'LEAD_GENERATION'
  | 'MESSAGES'
  | 'CONVERSIONS'
  | 'CATALOG_SALES'
  | 'STORE_VISITS';

export type FbEntityStatus =
  | 'ACTIVE'
  | 'PAUSED'
  | 'DELETED'
  | 'ARCHIVED'
  | 'IN_PROCESS'
  | 'WITH_ISSUES';

export interface FbCampaign {
  id: string;
  name?: string;
  status?: FbEntityStatus;
  /** Effective status accounts for parent + delivery state. */
  effective_status?: FbEntityStatus;
  objective?: FbObjectiveLegacy;
  /** Daily budget in account currency MINOR units (paise / cents). */
  daily_budget?: string;
  /** Lifetime budget in account currency MINOR units. */
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  created_time?: string;
  updated_time?: string;
}

export interface FbAdSet {
  id: string;
  name?: string;
  campaign_id?: string;
  status?: FbEntityStatus;
  effective_status?: FbEntityStatus;
  daily_budget?: string;
  lifetime_budget?: string;
  optimization_goal?: string;
  billing_event?: string;
  start_time?: string;
  end_time?: string;
  created_time?: string;
  updated_time?: string;
}

export interface FbAd {
  id: string;
  name?: string;
  adset_id?: string;
  campaign_id?: string;
  status?: FbEntityStatus;
  effective_status?: FbEntityStatus;
  created_time?: string;
  updated_time?: string;
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

/**
 * Date presets Meta accepts on the `/insights` endpoint. NOT exhaustive —
 * these are the ones we plan to surface in the admin UI date-range picker.
 *
 * See https://developers.facebook.com/docs/marketing-api/insights/parameters
 * for the full catalog. `last_n_d` style presets all sample the past N days
 * ending YESTERDAY (Meta does not include today in preset windows).
 */
export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'this_week_mon_today'
  | 'this_week_sun_today'
  | 'last_week_mon_sun'
  | 'last_week_sun_sat'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'maximum'
  | 'last_3d'
  | 'last_7d'
  | 'last_14d'
  | 'last_28d'
  | 'last_30d'
  | 'last_90d';

/**
 * Action / conversion type returned in the `actions` array. Meta reports one
 * entry per action_type — common types include `link_click`,
 * `post_engagement`, `lead`, `offsite_conversion.fb_pixel_lead`, etc.
 */
export interface FbAdAction {
  action_type: string;
  /** Decimal string (Meta returns numbers as strings). */
  value: string;
}

/**
 * Single insight row returned by `/{ad-object}/insights`. Meta returns numeric
 * fields as STRINGS — callers must parse before arithmetic. Field set returned
 * depends on the `fields` parameter passed in the query.
 */
export interface FbAdInsight {
  /** Account-level fields, present on every row when requested. */
  account_id?: string;
  account_name?: string;
  account_currency?: string;
  /** Object-level fields — populated based on the queried `level`. */
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  /** ISO date for the bucket. Present when `time_increment=1`. */
  date_start?: string;
  date_stop?: string;
  /** Headline numeric metrics — Meta serializes as strings. */
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  cpm?: string;
  cpc?: string;
  ctr?: string;
  frequency?: string;
  unique_clicks?: string;
  /** Conversion / engagement actions. */
  actions?: FbAdAction[];
  action_values?: FbAdAction[];
  cost_per_action_type?: FbAdAction[];
}

/**
 * Per-row insight breakdown grouping. Meta supports many breakdowns; we
 * expose the common ones the admin UI may want to filter by. NOT exhaustive.
 */
export type FbInsightBreakdown =
  | 'age'
  | 'gender'
  | 'country'
  | 'region'
  | 'publisher_platform'
  | 'platform_position'
  | 'impression_device';

/**
 * Level the insights query is aggregated at. `account` returns one row per
 * (account, date) bucket; `campaign` returns one row per (campaign, date),
 * and so on.
 */
export type FbInsightLevel = 'account' | 'campaign' | 'adset' | 'ad';
