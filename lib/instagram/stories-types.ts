// lib/instagram/stories-types.ts
// Instagram Stories types — Phase 1B (Agent ι, 2026-05-30).
//
// Stories live ~24h on IG; we snapshot the active stories and capture their
// final insight values shortly before expiry. Schema is intentionally narrow:
// only the fields we surface in /admission/inbox/instagram and the Stories
// monitoring dashboard.
//
// Companion runtime tables:
//   - ig_stories          (one row per story, expires_at drives cron eviction)
//   - ig_story_insights   (metric snapshots — one row per (story, metric))
//
// Reference: https://developers.facebook.com/docs/instagram-platform/reference/instagram-user/stories

import type { IgMediaType } from '@/lib/instagram/types';

// ---------------------------------------------------------------------------
// Active story (Graph API `/{ig-user-id}/stories` edge)
// ---------------------------------------------------------------------------

/**
 * A single Instagram Story as returned by the `/{ig-user-id}/stories` edge.
 *
 * Stories are ephemeral — they live for ~24h. `expires_at` is computed by us
 * (timestamp + 24h) and is NOT a Graph API field. Callers should treat
 * `expires_at` as a best-effort target for the final-snapshot cron, not as
 * authoritative.
 */
export interface IgStory {
  /** Graph API story id. NOT the parent media id. */
  id: string;
  /** Media type — IG Stories can be IMAGE or VIDEO (never CAROUSEL). */
  media_type?: Extract<IgMediaType, 'IMAGE' | 'VIDEO'>;
  /** Public link to the story (only valid while the story is live). */
  permalink?: string;
  /** Direct CDN URL — short-lived; do NOT cache long-term. */
  media_url?: string;
  /** Story thumbnail (still frame for VIDEO; same as media_url for IMAGE). */
  thumbnail_url?: string;
  /** ISO-8601 timestamp story was posted. */
  timestamp?: string;
  /** Posting account handle. */
  username?: string;
}

// ---------------------------------------------------------------------------
// Story insights (Graph API `/{story-id}/insights` edge)
// ---------------------------------------------------------------------------

/**
 * Story-level insight metric names. Stories support a different metric set
 * than feed media — see https://developers.facebook.com/docs/instagram-platform/insights
 *
 * Note: Story insights are LIFETIME — Meta returns a single value per metric.
 * Once a story expires (~24h), insights become read-only.
 */
export type IgStoryMetric =
  | 'impressions'
  | 'reach'
  | 'exits'
  | 'replies'
  | 'taps_forward'
  | 'taps_back';

/**
 * A single insight value for a story metric. The shape parallels the existing
 * IgMediaInsightEntry but is narrowed to story-only metrics so misuse
 * (e.g. asking for 'plays' on a story) fails at compile time.
 */
export interface IgStoryInsight {
  name: IgStoryMetric;
  /** Stories only support lifetime period. */
  period: 'lifetime';
  values: Array<{ value: number }>;
  title?: string;
  description?: string;
  id?: string;
}
