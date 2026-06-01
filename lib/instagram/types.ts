// lib/instagram/types.ts
// Instagram Graph API types — built on top of the shared Meta Graph types in
// lib/meta/types.ts. Covers the Instagram Business / Creator account surface:
// account discovery, profile, media, insights.
//
// Reference:
//   https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference

// ---------------------------------------------------------------------------
// Account discovery
// ---------------------------------------------------------------------------

/**
 * Returned by the `/{business-id}/owned_instagram_accounts` endpoint and by
 * the `instagram_business_account` edge of a Facebook Page. Minimal fields —
 * caller fans out to `getAccountProfile` for the full record.
 */
export interface IgAccountSummary {
  /** Instagram Graph user id (NOT the IG handle). */
  id: string;
  /** Public IG handle, e.g. `jkkn.institutions`. */
  username?: string;
}

/**
 * Full Instagram Business / Creator profile. Subset of fields we currently
 * read; extend as new monitoring surfaces need them.
 */
export interface IgAccountProfile {
  id: string;
  username: string;
  name?: string;
  biography?: string;
  website?: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  /** 'BUSINESS' | 'CREATOR' | 'PERSONAL' — only BUSINESS/CREATOR are queryable. */
  account_type?: 'BUSINESS' | 'CREATOR' | 'PERSONAL';
}

// ---------------------------------------------------------------------------
// Insights (account-level)
// ---------------------------------------------------------------------------

/**
 * Account-level metric names supported by Instagram Insights. NOT exhaustive —
 * these are the ones we plan to read in Phase 2A.
 *
 * See https://developers.facebook.com/docs/instagram-platform/insights for
 * the full catalog. Note metric availability differs by `period` and by
 * account type (BUSINESS vs CREATOR).
 */
export type IgAccountMetric =
  | 'impressions'
  | 'reach'
  | 'profile_views'
  | 'follower_count'
  | 'website_clicks'
  | 'email_contacts'
  | 'phone_call_clicks'
  | 'text_message_clicks'
  | 'get_directions_clicks'
  | 'online_store_clicks';

/**
 * Period the metric is bucketed over. Different metrics support different
 * periods; the Graph API will 400 if you pass an incompatible combo.
 */
export type IgInsightPeriod = 'day' | 'week' | 'days_28' | 'lifetime';

/**
 * Single insight series returned for one metric. Each `values` entry is a
 * point in time (or a single lifetime entry).
 */
export interface IgInsightSeries {
  name: IgAccountMetric;
  period: IgInsightPeriod;
  title?: string;
  description?: string;
  id?: string;
  values: Array<{
    value: number | Record<string, number>;
    end_time?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export type IgMediaType = 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
export type IgMediaProductType = 'AD' | 'FEED' | 'STORY' | 'REELS';

export interface IgMedia {
  id: string;
  caption?: string;
  media_type?: IgMediaType;
  media_product_type?: IgMediaProductType;
  media_url?: string;
  permalink?: string;
  thumbnail_url?: string;
  timestamp?: string;
  username?: string;
  /** Top-level engagement on the media. Available for IMAGE/CAROUSEL; not all VIDEO. */
  like_count?: number;
  comments_count?: number;
}

// ---------------------------------------------------------------------------
// Media-level insights
// ---------------------------------------------------------------------------

/**
 * Media-level metric names. Like the account metrics, NOT exhaustive — these
 * are what we read in Phase 2A. Available metrics depend on `media_product_type`.
 *
 *   IMAGE / CAROUSEL_ALBUM (FEED):
 *     impressions, reach, engagement, saved, video_views (carousel video only)
 *   VIDEO (FEED):
 *     impressions, reach, engagement, saved, video_views
 *   STORY:
 *     impressions, reach, exits, replies, taps_forward, taps_back
 *   REELS:
 *     plays, reach, likes, comments, shares, saved, total_interactions
 */
export type IgMediaMetric =
  | 'impressions'
  | 'reach'
  | 'engagement'
  | 'saved'
  | 'video_views'
  | 'plays'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'total_interactions'
  | 'exits'
  | 'replies'
  | 'taps_forward'
  | 'taps_back';

/**
 * Single insight result for one media metric. Media insights return a flat
 * `values: [{ value }]` shape (no time-series) for FEED; STORY metrics return
 * a single entry per metric.
 */
export interface IgMediaInsightEntry {
  name: IgMediaMetric;
  period: 'lifetime';
  values: Array<{ value: number }>;
  title?: string;
  description?: string;
  id?: string;
}
