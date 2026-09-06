// lib/instagram/api-client.ts
// Instagram-specific Graph API client. Built on `lib/meta/graph-api-client.ts`.
//
// Scope (Phase 1A):
//   - discoverAccounts(businessId)        — list IG Business accounts owned by a Meta business
//   - getAccountProfile(igUserId)         — profile fields + follower/media counts
//   - getAccountInsights(igUserId, ...)   — account-level insights
//   - getMedia(igUserId, options?)        — recent media (paginated, optional `since`)
//   - getMediaInsights(mediaId, metrics)  — media-level insights
//
// All methods accept an `accessToken` (long-lived system-user / page token).
// All methods are read-only; no publishing flows here.
//
// Sentry op is set to `meta.instagram` so transactions surface separately from
// WhatsApp/Facebook calls in the Sentry dashboard.

import {
  graphRequest,
  graphRequestData,
} from '@/lib/meta/graph-api-client';
import type {
  MetaGraphListResponse,
  MetaGraphResponse,
} from '@/lib/meta/types';
import type {
  IgAccountMetric,
  IgAccountProfile,
  IgAccountSummary,
  IgInsightPeriod,
  IgInsightSeries,
  IgMedia,
  IgMediaInsightEntry,
  IgMediaMetric,
} from '@/lib/instagram/types';

const SENTRY_OP = 'meta.instagram';

// ---------------------------------------------------------------------------
// Default field sets
// ---------------------------------------------------------------------------

const DEFAULT_PROFILE_FIELDS = [
  'id',
  'username',
  'name',
  'biography',
  'website',
  'profile_picture_url',
  'followers_count',
  'follows_count',
  'media_count',
  // 'account_type' removed 2026-06-10: Meta dropped the field from the
  // page-linked IG User node — requesting it returns
  // "(#100) Tried accessing nonexisting field (account_type)" and fails
  // the whole profile fetch. Live receipt: 9/9 metrics-poller profile
  // calls failed on first prod tick. Callers default to 'BUSINESS'.
].join(',');

const DEFAULT_MEDIA_FIELDS = [
  'id',
  'caption',
  'media_type',
  'media_product_type',
  'media_url',
  'permalink',
  'thumbnail_url',
  'timestamp',
  'username',
  'like_count',
  'comments_count',
].join(',');

// ---------------------------------------------------------------------------
// Common call config
// ---------------------------------------------------------------------------

export interface IgCallConfig {
  /** Long-lived access token with `instagram_basic` + `instagram_manage_insights` scopes. */
  accessToken: string;
  /** Override Graph API version. Default falls through to lib/meta default (v21.0). */
  apiVersion?: string;
}

// ---------------------------------------------------------------------------
// 1. discoverAccounts(businessId)
// ---------------------------------------------------------------------------

/**
 * List Instagram Business / Creator accounts owned by a Meta Business.
 *
 * Endpoint: `GET /{business-id}/owned_instagram_accounts`
 *
 * Requires the access token to have the `business_management` scope and be
 * issued by (or assigned to) the business with the given id. For JKKN the
 * business id is `1720903384834051` — see the discover route for context.
 */
export async function discoverAccounts(
  businessId: string,
  config: IgCallConfig
): Promise<IgAccountSummary[]> {
  const payload = await graphRequestData<MetaGraphListResponse<IgAccountSummary>>({
    endpoint: `/${businessId}/owned_instagram_accounts`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: { fields: 'id,username' },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'discoverAccounts',
  });

  return payload.data;
}

// NOTE: a `client_instagram_accounts` edge was attempted (PR #1300) for
// partner-shared accounts but that Graph field does not exist (#100). The
// working approach for accounts owned by OTHER portfolios is one token per
// portfolio, each queried via the proven `owned_instagram_accounts` edge above
// (discoverAccounts) — see lib/instagram/extra-portfolios.ts.

// ---------------------------------------------------------------------------
// 2. getAccountProfile(igUserId)
// ---------------------------------------------------------------------------

/**
 * Fetch the full profile for a single Instagram Business/Creator account.
 * Returns counts (followers, follows, media) + display fields.
 */
export async function getAccountProfile(
  igUserId: string,
  config: IgCallConfig,
  options?: { fields?: string }
): Promise<IgAccountProfile> {
  return graphRequestData<IgAccountProfile>({
    endpoint: `/${igUserId}`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: { fields: options?.fields || DEFAULT_PROFILE_FIELDS },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getAccountProfile',
  });
}

// ---------------------------------------------------------------------------
// 3. getAccountInsights(igUserId, metrics, period)
// ---------------------------------------------------------------------------

/**
 * Read account-level insights. Pass at least one metric; pass a `period` that
 * is valid for ALL requested metrics — mixed-period requests will 400.
 *
 * Endpoint: `GET /{ig-user-id}/insights`
 */
export async function getAccountInsights(
  igUserId: string,
  metrics: IgAccountMetric[],
  period: IgInsightPeriod,
  config: IgCallConfig,
  options?: { since?: string; until?: string }
): Promise<IgInsightSeries[]> {
  if (metrics.length === 0) {
    throw new Error('getAccountInsights requires at least one metric');
  }

  const payload = await graphRequestData<MetaGraphListResponse<IgInsightSeries>>({
    endpoint: `/${igUserId}/insights`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: {
      metric: metrics.join(','),
      period,
      since: options?.since,
      until: options?.until,
    },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getAccountInsights',
  });

  return payload.data;
}

// ---------------------------------------------------------------------------
// 4. getMedia(igUserId, options?)
// ---------------------------------------------------------------------------

export interface GetMediaOptions {
  /**
   * ISO-8601 timestamp (or unix seconds). Returns only media posted at or
   * after this time. Passed to Meta as `since`.
   */
  since?: string | number;
  /**
   * ISO-8601 timestamp (or unix seconds). Returns only media posted at or
   * before this time. Passed to Meta as `until`.
   */
  until?: string | number;
  /**
   * Page size hint. Meta caps at 100; default 25.
   */
  limit?: number;
  /**
   * Override the field set. Default = full media field set.
   */
  fields?: string;
  /**
   * Pagination cursor — pass the value of `paging.cursors.after` from a
   * prior response to fetch the next page.
   */
  after?: string;
}

/**
 * List recent media for an IG account. Returns the parsed Meta envelope so
 * callers can paginate via `paging.cursors.after`.
 */
export async function getMedia(
  igUserId: string,
  config: IgCallConfig,
  options?: GetMediaOptions
): Promise<MetaGraphListResponse<IgMedia>> {
  return graphRequestData<MetaGraphListResponse<IgMedia>>({
    endpoint: `/${igUserId}/media`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: {
      fields: options?.fields || DEFAULT_MEDIA_FIELDS,
      since: options?.since,
      until: options?.until,
      limit: options?.limit ?? 25,
      after: options?.after,
    },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getMedia',
  });
}

// ---------------------------------------------------------------------------
// 5. getMediaInsights(mediaId, metrics)
// ---------------------------------------------------------------------------

/**
 * Read media-level insights. The metric set must be compatible with the
 * media's `media_product_type`:
 *
 *   FEED  → impressions, reach, engagement, saved, video_views
 *   STORY → impressions, reach, exits, replies, taps_forward, taps_back
 *   REELS → plays, reach, likes, comments, shares, saved, total_interactions
 *
 * Mixed-product or unsupported metrics will 400. Callers should branch on
 * `media.media_product_type` before assembling the metric array.
 *
 * Endpoint: `GET /{media-id}/insights`
 */
export async function getMediaInsights(
  mediaId: string,
  metrics: IgMediaMetric[],
  config: IgCallConfig
): Promise<IgMediaInsightEntry[]> {
  if (metrics.length === 0) {
    throw new Error('getMediaInsights requires at least one metric');
  }

  const payload = await graphRequestData<MetaGraphListResponse<IgMediaInsightEntry>>({
    endpoint: `/${mediaId}/insights`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: { metric: metrics.join(',') },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getMediaInsights',
  });

  return payload.data;
}

// ---------------------------------------------------------------------------
// Rate-limit-aware variants
// ---------------------------------------------------------------------------

/**
 * Same as `getAccountProfile` but returns the full envelope (status +
 * rateLimit) so callers can pause polling when `rateLimit.nearLimit` is true.
 * Use this in cron/poller code where back-pressure matters.
 */
export async function getAccountProfileWithMeta(
  igUserId: string,
  config: IgCallConfig,
  options?: { fields?: string }
): Promise<MetaGraphResponse<IgAccountProfile>> {
  return graphRequest<IgAccountProfile>({
    endpoint: `/${igUserId}`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: { fields: options?.fields || DEFAULT_PROFILE_FIELDS },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getAccountProfileWithMeta',
  });
}
