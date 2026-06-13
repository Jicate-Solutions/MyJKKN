// lib/instagram/stories-client.ts
// Instagram Stories Graph API client — Phase 1B (Agent ι, 2026-05-30).
//
// Sibling to `lib/instagram/api-client.ts`. Same conventions:
//   - Uses `graphRequest` / `graphRequestData` from lib/meta/graph-api-client.
//   - SENTRY_OP='meta.instagram' so transactions group with the rest of IG.
//   - Read-only; no publishing flows here.
//
// Scope:
//   - getStories(igUserId, config)          — list active stories for an account
//   - getStoryInsights(storyId, config)     — read insights for one story
//
// Reference:
//   https://developers.facebook.com/docs/instagram-platform/reference/instagram-user/stories
//   https://developers.facebook.com/docs/instagram-platform/insights#stories

import {
  graphRequestData,
} from '@/lib/meta/graph-api-client';
import type {
  MetaGraphListResponse,
} from '@/lib/meta/types';
import type { IgCallConfig } from '@/lib/instagram/api-client';
import type {
  IgStory,
  IgStoryInsight,
  IgStoryMetric,
} from '@/lib/instagram/stories-types';

const SENTRY_OP = 'meta.instagram';

// Default story fields. `media_url` is short-lived; callers that persist URLs
// should re-fetch before display or fall back to permalink.
const DEFAULT_STORY_FIELDS = [
  'id',
  'media_type',
  'media_url',
  'thumbnail_url',
  'permalink',
  'timestamp',
  'username',
].join(',');

// All stories support the same lifetime metric set. The Phase 1B Stories
// monitoring surface reads all six on every poll.
const DEFAULT_STORY_METRICS: IgStoryMetric[] = [
  'impressions',
  'reach',
  'exits',
  'replies',
  'taps_forward',
  'taps_back',
];

// ---------------------------------------------------------------------------
// 1. getStories(igUserId)
// ---------------------------------------------------------------------------

/**
 * List active stories for an IG Business / Creator account.
 *
 * Endpoint: `GET /{ig-user-id}/stories`
 *
 * Returns ALL currently live stories (≤24h since posting). Stories that have
 * expired are NOT returned — Meta drops them from the edge. The poller is
 * expected to re-fetch every `ig.stories.poll_interval_minutes` (default 120m).
 *
 * Token: needs `instagram_basic` scope.
 */
export async function getStories(
  igUserId: string,
  config: IgCallConfig,
  options?: { fields?: string }
): Promise<IgStory[]> {
  const payload = await graphRequestData<MetaGraphListResponse<IgStory>>({
    endpoint: `/${igUserId}/stories`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: { fields: options?.fields || DEFAULT_STORY_FIELDS },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getStories',
  });

  return payload.data;
}

// ---------------------------------------------------------------------------
// 2. getStoryInsights(storyId, metrics?)
// ---------------------------------------------------------------------------

/**
 * Read insights for one story. Story insights are LIFETIME — Meta returns a
 * single value per metric. Callers should snapshot insights shortly before
 * the 24h expiry; once expired, insights are read-only but values won't change.
 *
 * Endpoint: `GET /{story-id}/insights`
 *
 * Token: needs `instagram_manage_insights` scope.
 *
 * NOTE: If a story has zero impressions Meta will return a 400 with code
 * 100 / subcode 2108006. Callers should treat that as "no data yet", not as
 * a hard failure.
 */
export async function getStoryInsights(
  storyId: string,
  config: IgCallConfig,
  options?: { metrics?: IgStoryMetric[] }
): Promise<IgStoryInsight[]> {
  const metrics = options?.metrics ?? DEFAULT_STORY_METRICS;

  if (metrics.length === 0) {
    throw new Error('getStoryInsights requires at least one metric');
  }

  const payload = await graphRequestData<MetaGraphListResponse<IgStoryInsight>>({
    endpoint: `/${storyId}/insights`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: { metric: metrics.join(',') },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getStoryInsights',
  });

  return payload.data;
}
