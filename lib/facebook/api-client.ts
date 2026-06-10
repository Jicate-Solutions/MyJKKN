// lib/facebook/api-client.ts
// Facebook Pages-specific Graph API client. Built on `lib/meta/graph-api-client.ts`.
//
// Scope (Phase 1B):
//   - discoverPages(businessId)             — list FB Pages owned by a Meta business
//   - getPageProfile(pageId)                — profile fields + fan/follower counts
//   - getPagePosts(pageId, opts?)           — recent posts (paginated, optional `since`)
//   - getPostInsights(postId)               — post-level insights
//   - getPageInsights(pageId, metrics, period) — page-level insights time series
//
// All methods accept an `accessToken`. For discovery the token must be a
// System User token with `pages_show_list` + `business_management`. For
// page-level reads use the per-page `access_token` returned by discovery
// (with `pages_read_engagement` + `read_insights`).
//
// Sentry op is set to `meta.facebook` so transactions surface separately from
// WhatsApp/Instagram calls in the Sentry dashboard.

import {
  graphRequest,
  graphRequestData,
} from '@/lib/meta/graph-api-client';
import type {
  MetaGraphListResponse,
  MetaGraphResponse,
} from '@/lib/meta/types';
import type {
  FbInsightPeriod,
  FbInsightSeries,
  FbPage,
  FbPageMetric,
  FbPageSummary,
  FbPost,
  FbPostInsightEntry,
  FbPostMetric,
} from '@/lib/facebook/types';

const SENTRY_OP = 'meta.facebook';

// ---------------------------------------------------------------------------
// Default field sets
// ---------------------------------------------------------------------------

const DEFAULT_PROFILE_FIELDS = [
  'id',
  'name',
  'username',
  'about',
  'category',
  'category_list',
  'link',
  'picture',
  'fan_count',
  'followers_count',
  'verification_status',
  'is_published',
].join(',');

// NOTE (2026-06-10): the top-level `type` field and the aggregated attachment
// subfields (`type`, `url`) are deprecated for Graph v3.3+ — requesting them
// fails the whole call with "(#12) deprecate_post_aggregated_fields_for_
// attachement is deprecated for versions v3.3 and higher" (live evidence in
// social_facebook_logs, every tick, all pages). Callers should derive a coarse
// post type from `attachments.data[0].media_type` with a fallback of 'status'.
const DEFAULT_POST_FIELDS = [
  'id',
  'message',
  'story',
  'created_time',
  'updated_time',
  'permalink_url',
  'attachments{media_type,title,unshimmed_url}',
  'reactions.summary(true)',
  'comments.summary(true)',
  'shares',
].join(',');

// ---------------------------------------------------------------------------
// Common call config
// ---------------------------------------------------------------------------

export interface FbCallConfig {
  /** Access token. For Page-scoped reads, use the per-page token returned by
   *  `discoverPages`. For discovery itself, use a System User token with
   *  `pages_show_list` + `business_management`. */
  accessToken: string;
  /** Override Graph API version. Default falls through to lib/meta default (v21.0). */
  apiVersion?: string;
}

// ---------------------------------------------------------------------------
// 1. discoverPages(businessId)
// ---------------------------------------------------------------------------

/**
 * List Facebook Pages owned by a Meta Business.
 *
 * Endpoint: `GET /{business-id}/owned_pages`
 *
 * Requires the access token to have the `business_management` and
 * `pages_show_list` scopes and to be issued by (or assigned to) the business
 * with the given id. For JKKN the business id is `1720903384834051`.
 *
 * Each returned summary includes a per-page `access_token` that must be used
 * for subsequent page-scoped reads (profile, posts, insights).
 */
export async function discoverPages(
  businessId: string,
  config: FbCallConfig
): Promise<FbPageSummary[]> {
  const payload = await graphRequestData<MetaGraphListResponse<FbPageSummary>>({
    endpoint: `/${businessId}/owned_pages`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: { fields: 'id,name,access_token,category' },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'discoverPages',
  });

  return payload.data;
}

// ---------------------------------------------------------------------------
// 2. getPageProfile(pageId)
// ---------------------------------------------------------------------------

/**
 * Fetch the full profile for a single Facebook Page.
 * Returns counts (fan_count, followers_count) + display fields.
 *
 * Must be called with the page's own `access_token`, not the System User token.
 */
export async function getPageProfile(
  pageId: string,
  config: FbCallConfig,
  options?: { fields?: string }
): Promise<FbPage> {
  return graphRequestData<FbPage>({
    endpoint: `/${pageId}`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: { fields: options?.fields || DEFAULT_PROFILE_FIELDS },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getPageProfile',
  });
}

// ---------------------------------------------------------------------------
// 3. getPagePosts(pageId, options?)
// ---------------------------------------------------------------------------

export interface GetPagePostsOptions {
  /**
   * ISO-8601 timestamp (or unix seconds). Returns only posts published at or
   * after this time. Passed to Meta as `since`.
   */
  since?: string | number;
  /**
   * ISO-8601 timestamp (or unix seconds). Returns only posts published at or
   * before this time. Passed to Meta as `until`.
   */
  until?: string | number;
  /**
   * Page size hint. Meta caps at 100; default 25.
   */
  limit?: number;
  /**
   * Override the field set. Default = full post field set.
   */
  fields?: string;
  /**
   * Pagination cursor — pass the value of `paging.cursors.after` from a prior
   * response to fetch the next page.
   */
  after?: string;
}

/**
 * List recent posts published on a Page. Returns the parsed Meta envelope so
 * callers can paginate via `paging.cursors.after`.
 *
 * Endpoint: `GET /{page-id}/posts`
 *
 * Notes:
 *   - `/posts` returns posts published by the Page (not ones it was tagged in).
 *     Use `/feed` if you also want visitor posts.
 *   - The post id is page-scoped (`<pageId>_<postId>`); use it as-is for the
 *     `/{post-id}/insights` call below.
 */
export async function getPagePosts(
  pageId: string,
  config: FbCallConfig,
  options?: GetPagePostsOptions
): Promise<MetaGraphListResponse<FbPost>> {
  return graphRequestData<MetaGraphListResponse<FbPost>>({
    endpoint: `/${pageId}/posts`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: {
      fields: options?.fields || DEFAULT_POST_FIELDS,
      since: options?.since,
      until: options?.until,
      limit: options?.limit ?? 25,
      after: options?.after,
    },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getPagePosts',
  });
}

// ---------------------------------------------------------------------------
// 4. getPostInsights(postId, metrics)
// ---------------------------------------------------------------------------

/**
 * Read post-level insights. The metric set must be compatible with the post
 * media type — `post_video_*` metrics only return data for video posts.
 *
 * Endpoint: `GET /{post-id}/insights`
 *
 * If `metrics` is omitted, a conservative v25-valid default set is used:
 *   post_impressions, post_impressions_unique, post_reactions_by_type_total
 *
 * NOTE (2026-06-10): post_engaged_users and post_clicks were removed by
 * Meta's Nov-2024 insights deprecation, and parts of the post_impressions*
 * family were deprecated for NEWER posts in the 2024-25 purges — including
 * ANY dead metric fails the WHOLE call with "(#100) The value must be a
 * valid insights metric". Pollers should therefore probe metrics ONE PER
 * CALL and isolate failures (store NULL, keep going) — the param accepts
 * plain strings for metrics not yet in the `FbPostMetric` union.
 *
 * Must be called with the parent page's per-page `access_token`.
 */
export async function getPostInsights(
  postId: string,
  config: FbCallConfig,
  metrics?: ReadonlyArray<FbPostMetric | (string & {})>
): Promise<FbPostInsightEntry[]> {
  const metricList: ReadonlyArray<FbPostMetric | (string & {})> =
    metrics && metrics.length > 0
      ? metrics
      : [
          'post_impressions',
          'post_impressions_unique',
          'post_reactions_by_type_total',
        ];

  const payload = await graphRequestData<MetaGraphListResponse<FbPostInsightEntry>>({
    endpoint: `/${postId}/insights`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: { metric: metricList.join(',') },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getPostInsights',
  });

  return payload.data;
}

// ---------------------------------------------------------------------------
// 5. getPageInsights(pageId, metrics, period)
// ---------------------------------------------------------------------------

/**
 * Read page-level insights. Pass at least one metric; pass a `period` that
 * is valid for ALL requested metrics — mixed-period requests will 400.
 *
 * Endpoint: `GET /{page-id}/insights`
 *
 * Must be called with the page's per-page `access_token` (with the
 * `read_insights` scope).
 *
 * Metric validity changes across Graph versions (Meta's Nov-2024 deprecation
 * removed page_fan_adds / page_fan_removes / page_views_total among others),
 * so the param also accepts plain strings for metrics not yet in the
 * `FbPageMetric` union (e.g. `page_fans`). ONE invalid metric fails the
 * whole request with "(#100) The value must be a valid insights metric" —
 * pollers should fetch metrics individually and isolate failures.
 */
export async function getPageInsights(
  pageId: string,
  metrics: ReadonlyArray<FbPageMetric | (string & {})>,
  period: FbInsightPeriod,
  config: FbCallConfig,
  options?: { since?: string; until?: string }
): Promise<FbInsightSeries[]> {
  if (metrics.length === 0) {
    throw new Error('getPageInsights requires at least one metric');
  }

  const payload = await graphRequestData<MetaGraphListResponse<FbInsightSeries>>({
    endpoint: `/${pageId}/insights`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: {
      metric: metrics.join(','),
      period,
      since: options?.since,
      until: options?.until,
    },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getPageInsights',
  });

  return payload.data;
}

// ---------------------------------------------------------------------------
// Rate-limit-aware variants
// ---------------------------------------------------------------------------

/**
 * Same as `getPageProfile` but returns the full envelope (status + rateLimit)
 * so callers can pause polling when `rateLimit.nearLimit` is true. Use this
 * in cron/poller code where back-pressure matters.
 */
export async function getPageProfileWithMeta(
  pageId: string,
  config: FbCallConfig,
  options?: { fields?: string }
): Promise<MetaGraphResponse<FbPage>> {
  return graphRequest<FbPage>({
    endpoint: `/${pageId}`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: { fields: options?.fields || DEFAULT_PROFILE_FIELDS },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getPageProfileWithMeta',
  });
}
