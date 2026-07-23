// lib/facebook/types.ts
// Facebook Pages Graph API types — built on top of the shared Meta Graph types in
// lib/meta/types.ts. Covers the Facebook Page surface:
// page discovery, profile, posts (feed), post-level insights, page-level insights.
//
// Reference:
//   https://developers.facebook.com/docs/graph-api/reference/page/
//   https://developers.facebook.com/docs/graph-api/reference/post/
//   https://developers.facebook.com/docs/graph-api/reference/v21.0/insights

// ---------------------------------------------------------------------------
// Page discovery
// ---------------------------------------------------------------------------

/**
 * Returned by the `/{business-id}/owned_pages` endpoint. Minimal summary —
 * caller fans out to `getPageProfile` for the full record. Each owned page
 * carries a per-page access_token used by all downstream Page-scoped calls.
 */
export interface FbPageSummary {
  /** Facebook Page id (numeric, exposed as string). */
  id: string;
  /** Page display name. */
  name?: string;
  /** Page access token. Only present when the requesting token is a
   *  System User token with `pages_show_list` + `business_management`. */
  access_token?: string;
  /** Optional category, e.g. `Education`. */
  category?: string;
}

/**
 * Full Facebook Page profile fields we currently read. Extend as new
 * monitoring surfaces need them. Page-scoped fields require the per-page
 * `access_token` from the discovery step.
 */
export interface FbPage {
  id: string;
  name: string;
  username?: string;
  about?: string;
  category?: string;
  category_list?: Array<{ id: string; name: string }>;
  link?: string;
  picture?: {
    data?: {
      url?: string;
      height?: number;
      width?: number;
    };
  };
  fan_count?: number;
  followers_count?: number;
  /** Number of posts published on the Page. Read-only. */
  posts_count?: number;
  verification_status?: string;
  is_published?: boolean;
}

// ---------------------------------------------------------------------------
// Posts (feed)
// ---------------------------------------------------------------------------

export type FbPostType =
  | 'status'
  | 'link'
  | 'photo'
  | 'video'
  | 'event'
  | 'offer';

export interface FbPost {
  /** Page-scoped post id, format `<pageId>_<postId>`. */
  id: string;
  /** Post body / status text. */
  message?: string;
  /** Story-style auto-generated message (e.g. "Page X added a photo."). */
  story?: string;
  /** When the post was created on Facebook (ISO 8601). */
  created_time?: string;
  /** When the post was last edited (ISO 8601). */
  updated_time?: string;
  /** Permalink to the post on facebook.com. */
  permalink_url?: string;
  /** Coarse post classification — deprecated by Meta but still returned for
   *  pages on older Graph versions. Newer pages return `attachments` instead. */
  type?: FbPostType;
  /** Optional creative attachment summary. */
  attachments?: {
    data?: Array<{
      media_type?: string;
      type?: string;
      title?: string;
      url?: string;
    }>;
  };
  /** Top-level reaction count summary (when `reactions.summary(true)` requested). */
  reactions?: {
    summary?: { total_count?: number };
  };
  comments?: {
    summary?: { total_count?: number };
  };
  shares?: {
    count?: number;
  };
}

// ---------------------------------------------------------------------------
// Page-level insights
// ---------------------------------------------------------------------------

/**
 * Page-level metric names supported by Facebook Page Insights. NOT exhaustive —
 * these are the ones we plan to read.
 *
 * Reference: https://developers.facebook.com/docs/graph-api/reference/v21.0/insights
 * Note metric availability differs by `period` and by Page age. Many
 * historical metrics were deprecated in v19/v20; these are the ones still
 * supported in v21.0 as of 2026-05-30.
 */
export type FbPageMetric =
  | 'page_impressions'
  | 'page_impressions_unique'
  | 'page_post_engagements'
  | 'page_fan_adds'
  | 'page_fan_removes'
  | 'page_views_total'
  | 'page_actions_post_reactions_total'
  | 'page_video_views'
  | 'page_daily_follows'
  | 'page_daily_unfollows';

/**
 * Period the metric is bucketed over. Mirror of IG insight period; not all
 * metrics support all periods. Mixed-period requests will 400.
 */
export type FbInsightPeriod = 'day' | 'week' | 'days_28' | 'lifetime';

/**
 * Single insight series returned for one metric. Each `values` entry is a
 * point in time (or a single lifetime entry).
 */
export interface FbInsightSeries {
  name: FbPageMetric | FbPostMetric;
  period: FbInsightPeriod;
  title?: string;
  description?: string;
  id?: string;
  values: Array<{
    value: number | Record<string, number>;
    end_time?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Post-level insights
// ---------------------------------------------------------------------------

/**
 * Post-level metric names. Like the page metrics, NOT exhaustive — these are
 * what we read. Available metrics depend on the post media type.
 *
 * Reference: https://developers.facebook.com/docs/graph-api/reference/v21.0/insights
 */
export type FbPostMetric =
  | 'post_impressions'
  | 'post_impressions_unique'
  | 'post_engaged_users'
  | 'post_clicks'
  | 'post_reactions_by_type_total'
  | 'post_video_views'
  | 'post_video_avg_time_watched';

/**
 * Single insight result for one post metric. Post insights return a flat
 * `values: [{ value }]` shape (no time-series) — `lifetime` period only.
 */
export interface FbPostInsightEntry {
  name: FbPostMetric;
  period: 'lifetime';
  values: Array<{ value: number | Record<string, number> }>;
  title?: string;
  description?: string;
  id?: string;
}
