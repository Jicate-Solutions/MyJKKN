export const dynamic = 'force-dynamic';

// /api/cron/instagram-metrics-poller
// Phase 2B: Runs hourly (or per ig.poll_interval_hours policy).
// Discovery: when ig_accounts is empty, seeds it from Meta /me/accounts
// (instagram_business_account edge), resolving institution_id via fb_pages.
// For each active ig_account:
//   1. Fetch account profile + account-level insights → write ig_account_metrics row
//      (real columns: reach, impressions, profile_views, website_clicks,
//       accounts_engaged, total_interactions [metric_type=total_value],
//       online_followers hourly map, follower_demographics [once per UTC day])
//   2. Fetch recent media since last_polled_at → upsert ig_posts
//   3. Fetch per-post insights → write ig_post_metrics rows
//      (real columns incl. likes for all media; plays / avg_watch_time_ms /
//       total_watch_time_ms for reels, with v22+ plays→views fallback)
//   3.5 Re-poll recent posts' metrics (ContentStudio parity, added 2026-06-11):
//      media older than last_polled_at never re-enter steps 2-3, so their
//      metrics froze at discovery time. Append fresh ig_post_metrics snapshots
//      for posts within ig.post_repoll_window_days (default 7), capped at
//      ig.post_repoll_limit per account (default 10), skipping media already
//      snapshotted in the current tick.
//   4. Update ig_accounts.last_polled_at (and last_post_at if new posts)
//   5. Mark accounts dormant if no post in ig.dormancy_threshold_days
//
// Auth: Bearer CRON_SECRET (Vercel-provided in production).
// Logs every Meta API call to social_instagram_logs.
//
// Uses the real Graph client at lib/instagram/api-client.ts (merged PR #1147);
// route-local adapters below translate the client's series/envelope shapes
// into the flat shapes the poll loop and ig_* tables expect.

import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import {
  getAccountInsights,
  getAccountProfile,
  getMedia,
  getMediaInsights,
} from '@/lib/instagram/api-client';
import type { IgCallConfig } from '@/lib/instagram/api-client';
// READ-ONLY shared imports: the IG client can't pass metric_type=total_value
// (accounts_engaged / total_interactions / follower_demographics) nor request
// metrics outside its IgAccountMetric/IgMediaMetric unions (online_followers,
// ig_reels_* watch-time, views). Route-local helpers below call the base Graph
// client directly for those.
import { graphRequestData } from '@/lib/meta/graph-api-client';
import { MetaGraphError } from '@/lib/meta/types';
import type {
  IgAccountMetric,
  IgMedia as IgApiMedia,
  IgMediaInsightEntry,
  IgMediaMetric,
} from '@/lib/instagram/types';

const GRAPH_VERSION = 'v25.0';

// ---------------------------------------------------------------------------
// Route-local flat shapes (what the poll loop + ig_* tables consume)
// ---------------------------------------------------------------------------

interface IgAccountInsights {
  followers_count: number;
  follows_count: number;
  media_count: number;
  reach?: number;
  impressions?: number;
  profile_views?: number;
  website_clicks?: number;
  email_contacts?: number;
  /** Requires metric_type=total_value — fetched via route-local helper. */
  accounts_engaged?: number;
  /** Requires metric_type=total_value — fetched via route-local helper. */
  total_interactions?: number;
  /** Hourly audience-online map {"0":n..."23":n} from the lifetime metric. */
  online_followers?: Record<string, number> | null;
  raw: Record<string, unknown>;
}

interface IgMedia {
  id: string;
  caption?: string;
  /** Normalized to the ig_posts CHECK set: IMAGE|VIDEO|CAROUSEL_ALBUM|REEL|STORY */
  media_type: string;
  media_product_type?: string;
  media_url?: string;
  permalink: string;
  thumbnail_url?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}

interface IgPostInsights {
  ig_media_id: string;
  like_count?: number;
  comments_count?: number;
  saved?: number;
  reach?: number;
  impressions?: number;
  engagement?: number;
  plays?: number;
  shares?: number;
  /** Reels only — ig_reels_avg_watch_time (milliseconds). */
  avg_watch_time_ms?: number;
  /** Reels only — ig_reels_video_view_total_time (milliseconds). */
  total_watch_time_ms?: number;
  raw: Record<string, unknown>;
}

// Extract a numeric scalar from a Meta insight value. Handles the common
// `values:[{value:N}]` shape and the breakdown-object shape (returns the
// sum of the values). Mirrors meta-facebook-poll's flattenInsightValue.
function flattenInsightValue(
  value: number | Record<string, number> | undefined
): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    return Object.values(value).reduce(
      (s, v) => s + (typeof v === 'number' ? v : 0),
      0
    );
  }
  return 0;
}

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function logApiCall(
  supabase: SupabaseClient,
  args: {
    account_id: string | null;
    event_type: string;
    status: 'success' | 'error';
    payload: Record<string, unknown>;
    error_message?: string | null;
  }
): Promise<void> {
  await supabase.from('social_instagram_logs').insert({
    account_id: args.account_id,
    event_type: args.event_type,
    status: args.status,
    payload: args.payload,
    error_message: args.error_message ?? null,
    occurred_at: new Date().toISOString(),
  });
}

async function getPollIntervalHours(supabase: SupabaseClient): Promise<number> {
  // Read from platform_policies if row exists; fall back to 1 hour
  const { data } = await supabase
    .from('platform_policies')
    .select('value')
    .eq('policy_key', 'ig.poll_interval_hours')
    .eq('scope_type', 'global')
    .maybeSingle();
  if (data?.value !== undefined && data?.value !== null) {
    const n = Number(data.value);
    if (!isNaN(n) && n > 0) return n;
  }
  return 1;
}

async function getDormancyThresholdDays(
  supabase: SupabaseClient
): Promise<number> {
  const { data } = await supabase
    .from('platform_policies')
    .select('value')
    .eq('policy_key', 'ig.dormancy_threshold_days')
    .eq('scope_type', 'global')
    .maybeSingle();
  if (data?.value !== undefined && data?.value !== null) {
    const n = Number(data.value);
    if (!isNaN(n) && n > 0) return n;
  }
  return 30;
}

/** Policy: how far back (days) re-polled posts are eligible. Default 7. */
async function getRepollWindowDays(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from('platform_policies')
    .select('value')
    .eq('policy_key', 'ig.post_repoll_window_days')
    .eq('scope_type', 'global')
    .maybeSingle();
  if (data?.value !== undefined && data?.value !== null) {
    const n = Number(data.value);
    if (!isNaN(n) && n > 0) return n;
  }
  return 7;
}

/** Policy: max posts re-polled per account per tick (bounds Graph calls). Default 10. */
async function getRepollLimit(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from('platform_policies')
    .select('value')
    .eq('policy_key', 'ig.post_repoll_limit')
    .eq('scope_type', 'global')
    .maybeSingle();
  if (data?.value !== undefined && data?.value !== null) {
    const n = Number(data.value);
    if (!isNaN(n) && n > 0) return n;
  }
  return 10;
}

// ---------------------------------------------------------------------------
// Route-local Graph helpers for metrics the shared IG client cannot express
// (metric_type=total_value, online_followers, follower_demographics, reels
// watch-time / views). All go through graphRequestData (read-only shared
// import) with the explicit v25.0 version pin.
// ---------------------------------------------------------------------------

interface IgInsightEnvelopeEntry {
  name: string;
  period?: string;
  values?: Array<{
    value: number | Record<string, number>;
    end_time?: string;
  }>;
  total_value?: { value?: number; breakdowns?: unknown };
  title?: string;
  description?: string;
  id?: string;
}

interface IgInsightsEnvelope {
  data?: IgInsightEnvelopeEntry[];
}

/**
 * GET /{ig-user-id}/insights with metric_type=total_value (period=day).
 * Returns a name→value map; metrics whose total_value is missing are omitted.
 */
async function fetchTotalValueMetrics(
  accessToken: string,
  igUserId: string,
  metrics: string[]
): Promise<Record<string, number>> {
  const payload = await graphRequestData<IgInsightsEnvelope>({
    endpoint: `/${igUserId}/insights`,
    accessToken,
    apiVersion: GRAPH_VERSION,
    query: {
      metric: metrics.join(','),
      period: 'day',
      metric_type: 'total_value',
    },
    sentryOp: 'meta.instagram',
    sentrySpanName: 'getAccountInsightsTotalValue',
  });
  const out: Record<string, number> = {};
  for (const entry of payload.data ?? []) {
    if (typeof entry.total_value?.value === 'number') {
      out[entry.name] = entry.total_value.value;
    }
  }
  return out;
}

// All three are total_value-only. `views` (the v22+ replacement for the
// removed account-level `impressions`) rides the same grouped call.
const ENGAGEMENT_TOTAL_VALUE_METRICS = [
  'accounts_engaged',
  'total_interactions',
  'views',
];

/**
 * accounts_engaged + total_interactions + views (all total_value-only).
 * Grouped call first; on failure retries per metric so one unsupported
 * metric can't drop the others. Failures are logged and tolerated.
 */
async function fetchEngagementTotals(
  supabase: SupabaseClient,
  accountId: string,
  accessToken: string,
  igUserId: string
): Promise<Record<string, number>> {
  try {
    return await fetchTotalValueMetrics(
      accessToken,
      igUserId,
      ENGAGEMENT_TOTAL_VALUE_METRICS
    );
  } catch {
    const out: Record<string, number> = {};
    for (const metric of ENGAGEMENT_TOTAL_VALUE_METRICS) {
      try {
        Object.assign(
          out,
          await fetchTotalValueMetrics(accessToken, igUserId, [metric])
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'unknown';
        await logApiCall(supabase, {
          account_id: accountId,
          event_type: 'account_insight_metric',
          status: 'error',
          payload: { ig_user_id: igUserId, metric, metric_type: 'total_value' },
          error_message: msg,
        });
      }
    }
    return out;
  }
}

/**
 * online_followers (period=lifetime) — hourly map of when the audience is
 * online. Meta returns a values series; take the latest entry's value object
 * ({"0":n..."23":n}). Failures are logged and return null.
 */
async function fetchOnlineFollowers(
  supabase: SupabaseClient,
  accountId: string,
  accessToken: string,
  igUserId: string
): Promise<Record<string, number> | null> {
  try {
    const payload = await graphRequestData<IgInsightsEnvelope>({
      endpoint: `/${igUserId}/insights`,
      accessToken,
      apiVersion: GRAPH_VERSION,
      query: { metric: 'online_followers', period: 'lifetime' },
      sentryOp: 'meta.instagram',
      sentrySpanName: 'getOnlineFollowers',
    });
    const values = payload.data?.[0]?.values ?? [];
    const latest = values[values.length - 1]?.value;
    if (latest && typeof latest === 'object') {
      return latest as Record<string, number>;
    }
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    await logApiCall(supabase, {
      account_id: accountId,
      event_type: 'account_insight_metric',
      status: 'error',
      payload: { ig_user_id: igUserId, metric: 'online_followers' },
      error_message: msg,
    });
    return null;
  }
}

/**
 * True when a snapshot taken today (UTC) for this account already carries a
 * non-null follower_demographics — demographics are fetched at most once per
 * UTC day per account (readers take the latest non-null).
 */
async function hasDemographicsSnapshotToday(
  supabase: SupabaseClient,
  accountId: string
): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { data } = await supabase
    .from('ig_account_metrics')
    .select('id')
    .eq('account_id', accountId)
    .gte('snapshot_at', todayStart.toISOString())
    .not('follower_demographics', 'is', null)
    .limit(1);
  return Boolean(data && data.length > 0);
}

const DEMOGRAPHIC_BREAKDOWNS: Array<{ key: string; breakdown: string }> = [
  { key: 'age_gender', breakdown: 'age,gender' },
  { key: 'city', breakdown: 'city' },
];

/**
 * follower_demographics — requires metric_type=total_value + a breakdown
 * (period=lifetime, timeframe=this_week). Two isolated calls (age,gender then
 * city) stored combined as { age_gender, city }. Accounts under 100 followers
 * 400 on this metric: store NULL, log ONE error row per attempt, continue.
 */
async function fetchFollowerDemographics(
  supabase: SupabaseClient,
  accountId: string,
  accessToken: string,
  igUserId: string
): Promise<Record<string, unknown> | null> {
  const combined: Record<string, unknown> = {};
  const failures: string[] = [];

  for (const { key, breakdown } of DEMOGRAPHIC_BREAKDOWNS) {
    try {
      const payload = await graphRequestData<IgInsightsEnvelope>({
        endpoint: `/${igUserId}/insights`,
        accessToken,
        apiVersion: GRAPH_VERSION,
        query: {
          metric: 'follower_demographics',
          period: 'lifetime',
          timeframe: 'this_week',
          metric_type: 'total_value',
          breakdown,
        },
        sentryOp: 'meta.instagram',
        sentrySpanName: 'getFollowerDemographics',
      });
      const entry = payload.data?.[0];
      if (entry) combined[key] = entry;
    } catch (e) {
      failures.push(
        `${breakdown}: ${e instanceof Error ? e.message : 'unknown'}`
      );
    }
  }

  if (failures.length > 0) {
    await logApiCall(supabase, {
      account_id: accountId,
      event_type: 'follower_demographics',
      status: 'error',
      payload: { ig_user_id: igUserId, failed_breakdowns: failures.length },
      error_message: failures.join(' | ').slice(0, 500),
    });
  }

  return Object.keys(combined).length > 0 ? combined : null;
}

/** Single-metric media insights call (string metric — covers names outside
 *  the shared IgMediaMetric union: views, ig_reels_* watch-time). */
async function fetchMediaInsightEntry(
  accessToken: string,
  mediaId: string,
  metric: string
): Promise<IgInsightEnvelopeEntry | undefined> {
  const payload = await graphRequestData<IgInsightsEnvelope>({
    endpoint: `/${mediaId}/insights`,
    accessToken,
    apiVersion: GRAPH_VERSION,
    query: { metric },
    sentryOp: 'meta.instagram',
    sentrySpanName: 'getReelInsights',
  });
  return payload.data?.[0];
}

/** Flatten a media insight entry to a scalar (values[0].value preferred,
 *  total_value.value as fallback; breakdown objects sum their values). */
function entryValue(
  entry: IgInsightEnvelopeEntry | undefined
): number | undefined {
  if (!entry) return undefined;
  const v = entry.values?.[0]?.value ?? entry.total_value?.value;
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object') return flattenInsightValue(v);
  return undefined;
}

// ---------------------------------------------------------------------------
// Adapters over lib/instagram/api-client — translate series/envelope shapes
// into the flat shapes above. Per-metric failures are logged and tolerated
// (one bad metric must not kill the whole account poll).
// ---------------------------------------------------------------------------

// v22+ pruned the account-insights catalog: `impressions` and `email_contacts`
// are no longer valid metric names (confirmed live 2026-06-12 — every request
// logged "(#100) metric[0] must be one of the following values: …" per tick).
// `impressions` is replaced by `views` (total_value-only — rides the grouped
// engagement call below and is surfaced on the impressions column);
// `email_contacts` had no consumer (raw-only) and is dropped outright.
const ACCOUNT_INSIGHT_METRICS: IgAccountMetric[] = [
  'reach',
  'profile_views',
  'website_clicks',
];

async function fetchAccountInsights(
  supabase: SupabaseClient,
  accountId: string,
  accessToken: string,
  igUserId: string
): Promise<IgAccountInsights> {
  const config: IgCallConfig = { accessToken, apiVersion: GRAPH_VERSION };

  // Profile carries the counter fields; a failure here is fatal for the account.
  const profile = await getAccountProfile(igUserId, config);

  const raw: Record<string, unknown> = { profile };
  const flat: Partial<Record<IgAccountMetric, number>> = {};

  // Per-metric calls: some metrics 400 for certain periods/account states
  // (e.g. `impressions` deprecated on newer accounts). Log and continue.
  for (const metric of ACCOUNT_INSIGHT_METRICS) {
    try {
      const series = await getAccountInsights(igUserId, [metric], 'day', config);
      const values = series[0]?.values ?? [];
      flat[metric] = flattenInsightValue(values[values.length - 1]?.value);
      raw[metric] = series;
    } catch (e) {
      // v22+ moved several interaction metrics (profile_views, website_clicks)
      // to metric_type=total_value-only — the plain time-series call 400s with
      // (#100). Retry once via total_value before logging the failure.
      if (
        e instanceof MetaGraphError &&
        e.code === 100 &&
        (metric === 'profile_views' || metric === 'website_clicks')
      ) {
        try {
          const tv = await fetchTotalValueMetrics(accessToken, igUserId, [metric]);
          if (typeof tv[metric] === 'number') {
            flat[metric] = tv[metric];
            raw[`${metric}_total_value`] = tv[metric];
            continue;
          }
        } catch {
          // fall through to the error log below
        }
      }
      const msg = e instanceof Error ? e.message : 'unknown';
      await logApiCall(supabase, {
        account_id: accountId,
        event_type: 'account_insight_metric',
        status: 'error',
        payload: { ig_user_id: igUserId, metric },
        error_message: msg,
      });
    }
  }

  // accounts_engaged + total_interactions require metric_type=total_value —
  // the shared client can't pass it, so these go through the route-local
  // helper. Failures are logged inside and tolerated.
  const engagement = await fetchEngagementTotals(
    supabase,
    accountId,
    accessToken,
    igUserId
  );
  if (typeof engagement.accounts_engaged === 'number') {
    raw.accounts_engaged = engagement.accounts_engaged;
  }
  if (typeof engagement.total_interactions === 'number') {
    raw.total_interactions = engagement.total_interactions;
  }
  // v22+ removed account-level `impressions`; `views` is its designated
  // replacement — surface it on the impressions column so the series keeps
  // flowing (same precedent as the media-level plays→views mapping).
  if (typeof engagement.views === 'number') {
    flat.impressions = engagement.views;
    raw.views = engagement.views;
  }

  // Hourly when-is-my-audience-online map (lifetime metric, latest entry).
  const onlineFollowers = await fetchOnlineFollowers(
    supabase,
    accountId,
    accessToken,
    igUserId
  );

  return {
    followers_count: profile.followers_count ?? 0,
    follows_count: profile.follows_count ?? 0,
    media_count: profile.media_count ?? 0,
    reach: flat.reach,
    impressions: flat.impressions,
    profile_views: flat.profile_views,
    website_clicks: flat.website_clicks,
    email_contacts: flat.email_contacts,
    accounts_engaged: engagement.accounts_engaged,
    total_interactions: engagement.total_interactions,
    online_followers: onlineFollowers,
    raw,
  };
}

function normalizeMediaType(media: IgApiMedia): string {
  if (media.media_product_type === 'REELS') return 'REEL';
  if (media.media_product_type === 'STORY') return 'STORY';
  return media.media_type ?? 'IMAGE';
}

async function fetchRecentMedia(
  accessToken: string,
  igUserId: string,
  since: string | null
): Promise<IgMedia[]> {
  const envelope = await getMedia(
    igUserId,
    { accessToken, apiVersion: GRAPH_VERSION },
    { since: since ?? undefined, limit: 25 }
  );
  return (envelope.data ?? [])
    .filter((m) => Boolean(m.id && m.timestamp))
    .map((m) => ({
      id: m.id,
      caption: m.caption,
      media_type: normalizeMediaType(m),
      media_product_type: m.media_product_type,
      media_url: m.media_url,
      permalink: m.permalink ?? '',
      thumbnail_url: m.thumbnail_url,
      timestamp: m.timestamp as string,
      like_count: m.like_count,
      comments_count: m.comments_count,
    }));
}

// REELS media are handled route-locally (see REEL_METRICS) because their
// metric names are volatile across Graph versions and several fall outside
// the shared IgMediaMetric union.
//
// v25 hygiene (2026-06-12): `engagement` was removed from media insights —
// its allowed-list replacement `total_interactions` feeds the same
// ig_post_metrics.engagement column via fetchPostInsights' existing
// `flat.engagement ?? flat.total_interactions` fallback. `impressions` is
// deprecated for v22+ media and is fetched separately with a `views`
// fallback (fetchImpressionsWithViewsFallback) so the grouped call never
// carries a known-deprecated metric.
function metricsForProductType(productType?: string): IgMediaMetric[] {
  if (productType === 'STORY') {
    return ['reach', 'replies'];
  }
  // FEED (IMAGE / VIDEO / CAROUSEL_ALBUM) + unknown product types.
  // 'likes' added 2026-06-10 so ig_post_metrics.likes populates for all media.
  return ['reach', 'saved', 'likes', 'total_interactions'];
}

// Reels metric catalog. Each is requested INDIVIDUALLY-ISOLATED: names are
// volatile across Graph versions (v22+ replaced `plays` with `views`; the
// ig_reels_* watch-time metrics 400 on some media) — one bad metric must not
// drop the rest. (#100) on `plays` retries `views` and maps it → plays.
const REEL_METRICS = [
  'plays',
  'reach',
  'likes',
  'comments',
  'shares',
  'saved',
  'total_interactions',
  'ig_reels_avg_watch_time',
  'ig_reels_video_view_total_time',
];

async function fetchReelInsights(
  supabase: SupabaseClient,
  accountId: string,
  accessToken: string,
  mediaId: string
): Promise<{ flat: Record<string, number>; raw: Record<string, unknown> }> {
  const flat: Record<string, number> = {};
  const raw: Record<string, unknown> = {};

  for (const metric of REEL_METRICS) {
    try {
      const entry = await fetchMediaInsightEntry(accessToken, mediaId, metric);
      const value = entryValue(entry);
      if (value !== undefined) flat[metric] = value;
      if (entry) raw[metric] = entry;
      continue;
    } catch (e) {
      // v22+ renamed `plays` → `views`: retry once and map onto plays.
      if (metric === 'plays' && e instanceof MetaGraphError && e.code === 100) {
        try {
          const entry = await fetchMediaInsightEntry(accessToken, mediaId, 'views');
          const value = entryValue(entry);
          if (value !== undefined) flat.plays = value;
          if (entry) raw.views = entry;
          continue;
        } catch (e2) {
          const msg2 = e2 instanceof Error ? e2.message : 'unknown';
          await logApiCall(supabase, {
            account_id: accountId,
            event_type: 'post_insight_metric',
            status: 'error',
            payload: { ig_media_id: mediaId, metric: 'views' },
            error_message: msg2,
          });
          continue;
        }
      }
      const msg = e instanceof Error ? e.message : 'unknown';
      await logApiCall(supabase, {
        account_id: accountId,
        event_type: 'post_insight_metric',
        status: 'error',
        payload: { ig_media_id: mediaId, metric },
        error_message: msg,
      });
    }
  }

  return { flat, raw };
}

/**
 * impressions for non-reel media. v22+ removed `impressions` for newer media
 * ("(#100) Starting from version v22.0 and above, the impressions metric is
 * no longer supported for the queried media") — on that failure retry
 * `views`, its v22+ replacement, and surface it as impressions (same
 * precedent as the REEL plays→views fallback). Isolated from the grouped
 * insights call so a deprecated metric can never 400 the whole request, and
 * the known deprecation never logs recurring (#100) noise. Real failures
 * are still logged and tolerated.
 */
async function fetchImpressionsWithViewsFallback(
  supabase: SupabaseClient,
  accountId: string,
  accessToken: string,
  mediaId: string
): Promise<{ value: number | undefined; raw: Record<string, unknown> }> {
  const raw: Record<string, unknown> = {};
  try {
    const entry = await fetchMediaInsightEntry(accessToken, mediaId, 'impressions');
    if (entry) raw.impressions = entry;
    return { value: entryValue(entry), raw };
  } catch (e) {
    if (e instanceof MetaGraphError && e.code === 100) {
      try {
        const entry = await fetchMediaInsightEntry(accessToken, mediaId, 'views');
        if (entry) raw.views = entry;
        return { value: entryValue(entry), raw };
      } catch (e2) {
        const msg2 = e2 instanceof Error ? e2.message : 'unknown';
        await logApiCall(supabase, {
          account_id: accountId,
          event_type: 'post_insight_metric',
          status: 'error',
          payload: { ig_media_id: mediaId, metric: 'views' },
          error_message: msg2,
        });
        return { value: undefined, raw };
      }
    }
    const msg = e instanceof Error ? e.message : 'unknown';
    await logApiCall(supabase, {
      account_id: accountId,
      event_type: 'post_insight_metric',
      status: 'error',
      payload: { ig_media_id: mediaId, metric: 'impressions' },
      error_message: msg,
    });
    return { value: undefined, raw };
  }
}

async function fetchPostInsights(
  supabase: SupabaseClient,
  accountId: string,
  accessToken: string,
  media: IgMedia
): Promise<IgPostInsights> {
  const config: IgCallConfig = { accessToken, apiVersion: GRAPH_VERSION };
  const isReel =
    media.media_product_type === 'REELS' || media.media_type === 'REEL';

  let flat: Record<string, number> = {};
  let raw: Record<string, unknown> = {};

  if (isReel) {
    const reel = await fetchReelInsights(supabase, accountId, accessToken, media.id);
    flat = reel.flat;
    raw = reel.raw;
  } else {
    const metrics = metricsForProductType(media.media_product_type);

    let entries: IgMediaInsightEntry[] = [];
    try {
      entries = await getMediaInsights(media.id, metrics, config);
    } catch {
      // Grouped call failed — one unsupported metric 400s the whole request.
      // Retry per metric so the supported ones still land; log the failures.
      for (const metric of metrics) {
        try {
          entries.push(...(await getMediaInsights(media.id, [metric], config)));
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'unknown';
          await logApiCall(supabase, {
            account_id: accountId,
            event_type: 'post_insight_metric',
            status: 'error',
            payload: { ig_media_id: media.id, metric },
            error_message: msg,
          });
        }
      }
    }

    for (const entry of entries) {
      flat[entry.name] = flattenInsightValue(entry.values?.[0]?.value);
      raw[entry.name] = entry;
    }

    // impressions: deprecated for v22+ media — isolated request with a
    // `views` fallback so the deprecation never logs recurring (#100) noise.
    const impressions = await fetchImpressionsWithViewsFallback(
      supabase,
      accountId,
      accessToken,
      media.id
    );
    if (impressions.value !== undefined) flat.impressions = impressions.value;
    Object.assign(raw, impressions.raw);
  }

  return {
    ig_media_id: media.id,
    like_count: flat.likes ?? media.like_count,
    comments_count: flat.comments ?? media.comments_count,
    saved: flat.saved,
    reach: flat.reach,
    impressions: flat.impressions,
    engagement: flat.engagement ?? flat.total_interactions,
    plays: flat.plays,
    shares: flat.shares,
    avg_watch_time_ms:
      flat.ig_reels_avg_watch_time !== undefined
        ? Math.round(flat.ig_reels_avg_watch_time)
        : undefined,
    total_watch_time_ms:
      flat.ig_reels_video_view_total_time !== undefined
        ? Math.round(flat.ig_reels_video_view_total_time)
        : undefined,
    raw,
  };
}

// ---------------------------------------------------------------------------
// Re-poll pass (ContentStudio parity, 2026-06-11): the since-gated media fetch
// (step 2) never revisits media older than last_polled_at, so post metrics
// froze as discovery-time snapshots (96/97 graph posts had exactly one
// ig_post_metrics row ever). The helpers below append FRESH snapshots for
// recent ig_posts rows so likes/plays/watch-time keep moving after discovery.
// ---------------------------------------------------------------------------

interface RepollPostRow {
  id: string;
  ig_media_id: string;
  media_type: string | null;
  posted_at: string | null;
}

/**
 * Lightweight media-node counters for re-polled posts. The new-media path gets
 * like_count/comments_count from getMedia's field list; re-polled posts need a
 * per-node fetch so fetchPostInsights' fallback chain (`flat.likes ??
 * media.like_count`, `flat.comments ?? media.comments_count`) stays intact —
 * FEED insight requests carry no `comments` metric, so without this the
 * re-poll snapshot would regress comments to 0. Failures return {} (insights'
 * own values still apply where present).
 */
async function fetchMediaCounters(
  accessToken: string,
  mediaId: string
): Promise<{ like_count?: number; comments_count?: number }> {
  try {
    const node = await graphRequestData<{
      like_count?: number;
      comments_count?: number;
    }>({
      endpoint: `/${mediaId}`,
      accessToken,
      apiVersion: GRAPH_VERSION,
      query: { fields: 'like_count,comments_count' },
      sentryOp: 'meta.instagram',
      sentrySpanName: 'getMediaCounters',
    });
    return {
      like_count:
        typeof node.like_count === 'number' ? node.like_count : undefined,
      comments_count:
        typeof node.comments_count === 'number' ? node.comments_count : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Append fresh ig_post_metrics snapshots for the account's recent posts.
 * Selects up to `limit` ig_posts rows with posted_at inside `windowDays`
 * (newest first), skips media already snapshotted in the current tick
 * (`skipMediaIds`) and STORY rows (insights vanish when the story expires
 * after 24h — re-polling them is guaranteed-failure noise), then re-fetches
 * per-post insights via the SAME fetchPostInsights path the new-media loop
 * uses. One bad post must not kill the account poll: every failure is logged
 * (event_type 'post_repoll') and counted, never thrown.
 */
async function repollRecentPostMetrics(
  supabase: SupabaseClient,
  account: PollAccount,
  windowDays: number,
  limit: number,
  skipMediaIds: Set<string>
): Promise<{ repolled: number; errors: number }> {
  let repolled = 0;
  let errors = 0;

  const windowStart = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: posts, error: postsErr } = await supabase
    .from('ig_posts')
    .select('id, ig_media_id, media_type, posted_at')
    .eq('account_id', account.id)
    .gte('posted_at', windowStart)
    .neq('media_type', 'STORY')
    .order('posted_at', { ascending: false })
    .limit(limit);

  if (postsErr) {
    await logApiCall(supabase, {
      account_id: account.id,
      event_type: 'post_repoll',
      status: 'error',
      payload: { ig_user_id: account.ig_user_id, stage: 'select_posts' },
      error_message: postsErr.message,
    });
    return { repolled: 0, errors: 1 };
  }

  const candidates = ((posts ?? []) as RepollPostRow[]).filter(
    (p) => Boolean(p.ig_media_id) && !skipMediaIds.has(p.ig_media_id)
  );

  for (const post of candidates) {
    try {
      const mediaType = post.media_type ?? 'IMAGE';
      const counters = await fetchMediaCounters(
        account.access_token,
        post.ig_media_id
      );

      // Reconstruct the minimal IgMedia shape fetchPostInsights consumes
      // (id + type for the REEL/FEED branch + node counters as fallbacks).
      const postInsights = await fetchPostInsights(
        supabase,
        account.id,
        account.access_token,
        {
          id: post.ig_media_id,
          media_type: mediaType,
          media_product_type: mediaType === 'REEL' ? 'REELS' : undefined,
          permalink: '',
          timestamp: post.posted_at ?? '',
          like_count: counters.like_count,
          comments_count: counters.comments_count,
        }
      );

      // Same column shape as the new-media insert; raw.source tags the
      // snapshot as a re-poll so analysts can tell refreshes from discovery.
      const { error: insertErr } = await supabase.from('ig_post_metrics').insert({
        post_id: post.id,
        reach: postInsights.reach ?? 0,
        impressions: postInsights.impressions ?? 0,
        engagement: postInsights.engagement ?? 0,
        saves: postInsights.saved ?? 0,
        shares: postInsights.shares ?? 0,
        comments: postInsights.comments_count ?? 0,
        likes: postInsights.like_count ?? null,
        plays: postInsights.plays ?? null,
        avg_watch_time_ms: postInsights.avg_watch_time_ms ?? null,
        total_watch_time_ms: postInsights.total_watch_time_ms ?? null,
        raw: {
          ...postInsights.raw,
          source: 'repoll',
          like_count: postInsights.like_count ?? null,
          plays: postInsights.plays ?? null,
        },
        snapshot_at: new Date().toISOString(),
      });
      if (insertErr) throw insertErr;
      repolled++;
    } catch (e) {
      errors++;
      const msg = e instanceof Error ? e.message : 'unknown';
      await logApiCall(supabase, {
        account_id: account.id,
        event_type: 'post_repoll',
        status: 'error',
        payload: { ig_media_id: post.ig_media_id },
        error_message: msg,
      });
    }
  }

  await logApiCall(supabase, {
    account_id: account.id,
    event_type: 'post_repoll',
    status: 'success',
    payload: {
      ig_user_id: account.ig_user_id,
      window_days: windowDays,
      repoll_limit: limit,
      candidates: candidates.length,
      repolled,
      errors,
    },
  });

  return { repolled, errors };
}

// ---------------------------------------------------------------------------
// Discovery: when ig_accounts is empty, seed it from Meta /me/accounts.
// Mirrors discoverAndSeedFbPages in app/api/cron/meta-facebook-poll/route.ts.
// Every /me/accounts row carrying an `instagram_business_account` edge becomes
// an ig_accounts row; institution_id resolves via the already-seeded fb_pages
// (fb_page_id → institution_id), then the name heuristic, then the first JKKN
// institution (institution_id is NOT NULL — Director can re-link in admin UI).
// ---------------------------------------------------------------------------

interface MeAccountsPage {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id: string; username?: string };
}

interface MeAccountsResponse {
  data?: MeAccountsPage[];
  error?: { message?: string; code?: number; type?: string };
}

async function resolveInstitutionIdByName(
  supabase: SupabaseClient,
  pageName: string | null | undefined,
  fallbackInstitutionId: string | null
): Promise<string | null> {
  if (pageName && pageName.trim()) {
    // 1. exact-ish match: page name contained in institution name
    const { data: exact } = await supabase
      .from('institutions')
      .select('id, name')
      .ilike('name', `%${pageName.trim()}%`)
      .limit(1);
    if (exact && exact.length > 0) return exact[0].id as string;

    // 2. token-based heuristic: strip "JKKN ", "College", "of" and look for
    //    a distinctive keyword (Dental, Pharmacy, Engineering, …)
    const tokens = pageName
      .toLowerCase()
      .replace(/jkkn|college|of|the|institute|institution|&|and/g, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 4);
    for (const tok of tokens) {
      const { data: heur } = await supabase
        .from('institutions')
        .select('id, name')
        .ilike('name', `%${tok}%`)
        .limit(1);
      if (heur && heur.length > 0) return heur[0].id as string;
    }
  }

  return fallbackInstitutionId;
}

async function seedIgAccounts(supabase: SupabaseClient): Promise<{
  discovered: number;
  inserted: number;
  errors: Array<{ ig_user_id?: string; name?: string; error: string }>;
}> {
  const errors: Array<{ ig_user_id?: string; name?: string; error: string }> = [];
  const token =
    process.env.META_IG_SYSTEM_USER_TOKEN ||
    process.env.MESSENGER_PAGE_ACCESS_TOKEN ||
    process.env.META_PAGE_ACCESS_TOKEN ||
    '';
  if (!token) {
    return {
      discovered: 0,
      inserted: 0,
      errors: [
        {
          error:
            'no token (META_IG_SYSTEM_USER_TOKEN / MESSENGER_PAGE_ACCESS_TOKEN / META_PAGE_ACCESS_TOKEN)',
        },
      ],
    };
  }

  let pages: MeAccountsPage[] = [];
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts` +
    `?fields=id,name,access_token,instagram_business_account{id,username}` +
    `&limit=100&access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const json = (await res.json()) as MeAccountsResponse;
    if (!res.ok || json.error) {
      const msg =
        json.error?.message ?? `Meta /me/accounts returned HTTP ${res.status}`;
      await logApiCall(supabase, {
        account_id: null,
        event_type: 'discover',
        status: 'error',
        payload: { endpoint: '/me/accounts' },
        error_message: msg,
      });
      return { discovered: 0, inserted: 0, errors: [{ error: msg }] };
    }
    pages = json.data ?? [];
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    await logApiCall(supabase, {
      account_id: null,
      event_type: 'discover',
      status: 'error',
      payload: { endpoint: '/me/accounts' },
      error_message: msg,
    });
    return { discovered: 0, inserted: 0, errors: [{ error: msg }] };
  }

  const igPages = pages.filter((p) => p.instagram_business_account?.id);

  if (igPages.length === 0) {
    await logApiCall(supabase, {
      account_id: null,
      event_type: 'discover',
      status: 'success',
      payload: {
        endpoint: '/me/accounts',
        pages_returned: pages.length,
        ig_accounts_found: 0,
      },
    });
    return { discovered: 0, inserted: 0, errors: [] };
  }

  // Fallback institution to satisfy ig_accounts.institution_id NOT NULL.
  let fallbackInstitutionId: string | null = null;
  const { data: fallbackRow } = await supabase
    .from('institutions')
    .select('id')
    .ilike('name', 'JKKN%')
    .order('name', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (fallbackRow?.id) fallbackInstitutionId = fallbackRow.id as string;

  let inserted = 0;
  for (const p of igPages) {
    const iga = p.instagram_business_account as { id: string; username?: string };
    try {
      // 1. fb_pages already carries the correct institution mapping (PR #1246
      //    seeded all 9 Pages) — join on the parent Page id first.
      let institutionId: string | null = null;
      const { data: fbRow } = await supabase
        .from('fb_pages')
        .select('institution_id')
        .eq('fb_page_id', p.id)
        .maybeSingle();
      if (fbRow?.institution_id) {
        institutionId = fbRow.institution_id as string;
      } else {
        institutionId = await resolveInstitutionIdByName(
          supabase,
          p.name ?? null,
          fallbackInstitutionId
        );
      }
      if (!institutionId) {
        errors.push({
          ig_user_id: iga.id,
          name: p.name,
          error: 'no institution found and no JKKN fallback available',
        });
        continue;
      }

      const { error: insErr } = await supabase.from('ig_accounts').upsert(
        {
          institution_id: institutionId,
          ig_user_id: iga.id,
          username: iga.username ?? p.name ?? iga.id,
          account_type: 'BUSINESS',
          status: 'active',
          access_token: p.access_token ?? null,
        },
        { onConflict: 'ig_user_id', ignoreDuplicates: true }
      );
      if (insErr) {
        errors.push({ ig_user_id: iga.id, name: p.name, error: insErr.message });
        continue;
      }
      inserted++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      errors.push({ ig_user_id: iga.id, name: p.name, error: msg });
    }
  }

  await logApiCall(supabase, {
    account_id: null,
    event_type: 'discover',
    status: 'success',
    payload: {
      endpoint: '/me/accounts',
      pages_returned: pages.length,
      ig_accounts_found: igPages.length,
      ig_accounts_inserted: inserted,
      errors_count: errors.length,
    },
  });

  return { discovered: igPages.length, inserted, errors };
}

interface PollAccount {
  id: string;
  ig_user_id: string;
  access_token: string;
  last_polled_at: string | null;
  last_post_at: string | null;
  status: string | null;
}

interface PollAccountRow {
  id: string;
  ig_user_id: string;
  access_token: string | null;
  last_polled_at: string | null;
  last_post_at: string | null;
  status: string | null;
}

export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  let accountsPolled = 0;
  let accountsDiscovered = 0;
  let accountsSeeded = 0;
  let postsRepolled = 0;
  let errorsCount = 0;
  const perAccountErrors: Array<{ id: string; error: string }> = [];
  const discoveryErrors: Array<{ ig_user_id?: string; name?: string; error: string }> = [];
  let supabase: SupabaseClient;
  try {
    supabase = getServiceClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'supabase credential init failed';
    Sentry.captureException(e, {
      tags: { feature: 'instagram', event: 'metrics_poller_init_failure' },
    });
    return NextResponse.json(
      {
        success: false,
        accounts_polled: 0,
        errors_count: 1,
        duration_ms: Date.now() - start,
        error: msg,
      },
      { status: 500 }
    );
  }

  try {
    const [
      pollIntervalHours,
      dormancyThresholdDays,
      repollWindowDays,
      repollLimit,
    ] = await Promise.all([
      getPollIntervalHours(supabase),
      getDormancyThresholdDays(supabase),
      getRepollWindowDays(supabase),
      getRepollLimit(supabase),
    ]);

    // ----------------------------------------------------------------
    // Discovery step: when ig_accounts is empty, seed it from Meta.
    // Fixes the silent accounts_polled:0 case where the cron has nothing
    // to iterate because no IG account has been connected yet.
    // ----------------------------------------------------------------
    const { count: existingCount } = await supabase
      .from('ig_accounts')
      .select('id', { count: 'exact', head: true });
    if (existingCount === 0) {
      const result = await seedIgAccounts(supabase);
      accountsDiscovered = result.discovered;
      accountsSeeded = result.inserted;
      if (result.errors.length > 0) {
        errorsCount += result.errors.length;
        discoveryErrors.push(...result.errors);
      }
    }

    // Only poll accounts whose last_polled_at is older than pollIntervalHours,
    // minus a 5-minute grace margin. Without the margin the cadence halves:
    // each poll stamps last_polled_at SECONDS after the hour, while the next
    // hourly cron computes its cutoff AT :00:0x — the stamp is a few seconds
    // "too new", the account is skipped, and effective cadence becomes
    // 2-hourly (verified against prod snapshots 2026-06-11: hours 06, 08, 11,
    // 13, 16, 18 had zero writes; the only consecutive-hour writes happened
    // when the cron itself started late).
    const pollCutoff = new Date(
      Date.now() - (pollIntervalHours * 60 - 5) * 60 * 1000
    ).toISOString();

    const { data: accounts, error: acctErr } = await supabase
      .from('ig_accounts')
      .select('id, ig_user_id, access_token, last_polled_at, last_post_at, status')
      // Dormant accounts stay in the poll set: 'dormant' is a posting-activity
      // LABEL, not an off-switch — account-level metrics (followers, reach,
      // demographics) must keep flowing for accounts that simply haven't
      // posted lately, and a new post must reactivate them (step 4). The old
      // .eq('status','active') filter was a one-way trap door: 8 of the 9
      // college accounts were marked dormant on 2026-06-10 and never polled
      // again (verified in prod — their metrics stopped at 04:00 that day).
      .in('status', ['active', 'dormant'])
      // Skip business_discovery accounts (no Facebook Page → full insights
      // 33-error here). They are handled by ig-business-discovery-poll.
      .eq('metrics_source', 'graph')
      .or(`last_polled_at.is.null,last_polled_at.lt.${pollCutoff}`);

    if (acctErr) throw acctErr;

    // Per-account token (stored at seed time) preferred; env system-user /
    // page token as fallback for rows seeded before the access_token column.
    const systemToken =
      process.env.META_IG_SYSTEM_USER_TOKEN ||
      process.env.MESSENGER_PAGE_ACCESS_TOKEN ||
      process.env.META_PAGE_ACCESS_TOKEN ||
      '';

    const accountList: PollAccount[] = ((accounts ?? []) as PollAccountRow[]).map(
      (a) => ({
        id: a.id,
        ig_user_id: a.ig_user_id,
        access_token: a.access_token || systemToken,
        last_polled_at: a.last_polled_at,
        last_post_at: a.last_post_at,
        status: a.status,
      })
    );

    for (const account of accountList) {
      const acctStart = Date.now();
      try {
        // ----------------------------------------------------------------
        // 1. Fetch account profile + account-level insights
        // ----------------------------------------------------------------
        let insights: IgAccountInsights;
        try {
          insights = await fetchAccountInsights(
            supabase,
            account.id,
            account.access_token,
            account.ig_user_id
          );
          await logApiCall(supabase, {
            account_id: account.id,
            event_type: 'account_metrics',
            status: 'success',
            payload: {
              ig_user_id: account.ig_user_id,
              followers_count: insights.followers_count,
            },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'unknown';
          await logApiCall(supabase, {
            account_id: account.id,
            event_type: 'account_metrics',
            status: 'error',
            payload: { ig_user_id: account.ig_user_id },
            error_message: msg,
          });
          throw e;
        }

        // Follower demographics — heavyweight + slow-changing: fetch at most
        // once per UTC day per account. The first snapshot of the day carries
        // it; later snapshots store NULL and readers take the latest non-null.
        // Failures (e.g. <100-follower accounts always 400) store NULL and are
        // logged once inside the helper.
        let demographics: Record<string, unknown> | null = null;
        const alreadyHasDemographics = await hasDemographicsSnapshotToday(
          supabase,
          account.id
        );
        if (!alreadyHasDemographics) {
          demographics = await fetchFollowerDemographics(
            supabase,
            account.id,
            account.access_token,
            account.ig_user_id
          );
        }

        // Write ig_account_metrics row. Counter columns + the real insight
        // columns (substrate 2026-06-10); raw keeps the full series payloads.
        const { error: metricErr } = await supabase
          .from('ig_account_metrics')
          .insert({
            account_id: account.id,
            followers: insights.followers_count,
            follows: insights.follows_count,
            media_count: insights.media_count,
            reach: insights.reach ?? null,
            impressions: insights.impressions ?? null,
            profile_views: insights.profile_views ?? null,
            website_clicks: insights.website_clicks ?? null,
            accounts_engaged: insights.accounts_engaged ?? null,
            total_interactions: insights.total_interactions ?? null,
            online_followers: insights.online_followers ?? null,
            follower_demographics: demographics,
            raw: {
              ...insights.raw,
              reach: insights.reach ?? null,
              impressions: insights.impressions ?? null,
              profile_views: insights.profile_views ?? null,
              website_clicks: insights.website_clicks ?? null,
              email_contacts: insights.email_contacts ?? null,
            },
            snapshot_at: new Date().toISOString(),
          });
        if (metricErr) throw metricErr;

        // ----------------------------------------------------------------
        // 2. Fetch recent media since last poll
        // ----------------------------------------------------------------
        let mediaList: IgMedia[] = [];
        try {
          mediaList = await fetchRecentMedia(
            account.access_token,
            account.ig_user_id,
            account.last_polled_at
          );
          await logApiCall(supabase, {
            account_id: account.id,
            event_type: 'media_fetch',
            status: 'success',
            payload: {
              ig_user_id: account.ig_user_id,
              media_fetched: mediaList.length,
            },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'unknown';
          await logApiCall(supabase, {
            account_id: account.id,
            event_type: 'media_fetch',
            status: 'error',
            payload: { ig_user_id: account.ig_user_id },
            error_message: msg,
          });
          throw e;
        }

        // Upsert each media item into ig_posts
        let latestPostAt: string | null = account.last_post_at;
        for (const media of mediaList) {
          const { data: postRow, error: postErr } = await supabase
            .from('ig_posts')
            .upsert(
              {
                account_id: account.id,
                ig_media_id: media.id,
                caption: media.caption ?? null,
                media_type: media.media_type,
                permalink: media.permalink || null,
                posted_at: media.timestamp,
              },
              { onConflict: 'ig_media_id' }
            )
            .select('id')
            .single();
          if (postErr) throw postErr;

          // Track most recent post timestamp
          if (
            !latestPostAt ||
            new Date(media.timestamp) > new Date(latestPostAt)
          ) {
            latestPostAt = media.timestamp;
          }

          // ----------------------------------------------------------------
          // 3. Fetch per-post insights (non-fatal: a post whose insights
          //    fail must not abort the rest of the account's media)
          // ----------------------------------------------------------------
          try {
            const postInsights = await fetchPostInsights(
              supabase,
              account.id,
              account.access_token,
              media
            );

            // Write ig_post_metrics row (FK is the ig_posts UUID, not the
            // Meta media id; counter columns are NOT NULL DEFAULT 0; the new
            // substrate columns likes/plays/watch-time are nullable).
            const { error: postMetricErr } = await supabase
              .from('ig_post_metrics')
              .insert({
                post_id: postRow.id,
                reach: postInsights.reach ?? 0,
                impressions: postInsights.impressions ?? 0,
                engagement: postInsights.engagement ?? 0,
                saves: postInsights.saved ?? 0,
                shares: postInsights.shares ?? 0,
                comments: postInsights.comments_count ?? 0,
                likes: postInsights.like_count ?? null,
                plays: postInsights.plays ?? null,
                avg_watch_time_ms: postInsights.avg_watch_time_ms ?? null,
                total_watch_time_ms: postInsights.total_watch_time_ms ?? null,
                raw: {
                  ...postInsights.raw,
                  like_count: postInsights.like_count ?? null,
                  plays: postInsights.plays ?? null,
                },
                snapshot_at: new Date().toISOString(),
              });
            if (postMetricErr) throw postMetricErr;
          } catch (e) {
            errorsCount++;
            const msg = e instanceof Error ? e.message : 'unknown';
            await logApiCall(supabase, {
              account_id: account.id,
              event_type: 'post_insights',
              status: 'error',
              payload: { ig_media_id: media.id },
              error_message: msg,
            });
          }
        }

        // ----------------------------------------------------------------
        // 3.5 Re-poll recent posts' metrics (ContentStudio parity): media
        //     older than last_polled_at never re-enter steps 2-3, so their
        //     metrics froze at discovery time. Append fresh snapshots for
        //     posts inside the policy window, skipping media just processed
        //     in this tick (avoids double rows for brand-new media).
        //     Internally error-tolerant — never throws.
        // ----------------------------------------------------------------
        const processedMediaIds = new Set(mediaList.map((m) => m.id));
        const repollResult = await repollRecentPostMetrics(
          supabase,
          account,
          repollWindowDays,
          repollLimit,
          processedMediaIds
        );
        postsRepolled += repollResult.repolled;
        errorsCount += repollResult.errors;

        // ----------------------------------------------------------------
        // 4. Update last_polled_at (and last_post_at if new posts found)
        // ----------------------------------------------------------------
        const accountUpdate: Record<string, unknown> = {
          last_polled_at: new Date().toISOString(),
        };
        if (latestPostAt && latestPostAt !== account.last_post_at) {
          accountUpdate.last_post_at = latestPostAt;
        }

        // ----------------------------------------------------------------
        // 5. Mark dormant if no post within threshold
        // ----------------------------------------------------------------
        const dormancyCutoff = new Date(
          Date.now() - dormancyThresholdDays * 24 * 60 * 60 * 1000
        ).toISOString();
        const effectiveLastPost = latestPostAt ?? account.last_post_at;
        if (!effectiveLastPost || effectiveLastPost < dormancyCutoff) {
          accountUpdate.status = 'dormant';
          Sentry.captureMessage('Instagram account marked dormant', {
            level: 'warning',
            tags: { feature: 'instagram', event: 'account_dormant' },
            extra: {
              ig_account_id: account.id,
              ig_user_id: account.ig_user_id,
              last_post_at: effectiveLastPost,
              dormancy_threshold_days: dormancyThresholdDays,
            },
          });
        } else if (account.status === 'dormant') {
          // Reactivation path: a post inside the threshold flips the label
          // back — dormancy must never be a permanent state.
          accountUpdate.status = 'active';
        }

        const { error: updateErr } = await supabase
          .from('ig_accounts')
          .update(accountUpdate)
          .eq('id', account.id);
        if (updateErr) throw updateErr;

        accountsPolled++;
      } catch (e) {
        errorsCount++;
        const msg = e instanceof Error ? e.message : 'unknown';
        perAccountErrors.push({ id: account.id, error: msg });
        Sentry.captureException(e, {
          tags: { feature: 'instagram', event: 'metrics_poller_account_failure' },
          extra: {
            ig_account_id: account.id,
            duration_ms: Date.now() - acctStart,
          },
        });
      }
    }

    const durationMs = Date.now() - start;

    Sentry.captureMessage('Instagram metrics poll complete', {
      level: 'info',
      tags: { feature: 'instagram', event: 'metrics_poller_complete' },
      extra: {
        accounts_polled: accountsPolled,
        accounts_total: accountList.length,
        accounts_discovered: accountsDiscovered,
        accounts_seeded: accountsSeeded,
        posts_repolled: postsRepolled,
        errors_count: errorsCount,
        duration_ms: durationMs,
      },
    });

    return NextResponse.json({
      success: true,
      accounts_polled: accountsPolled,
      accounts_discovered: accountsDiscovered,
      accounts_seeded: accountsSeeded,
      posts_repolled: postsRepolled,
      errors_count: errorsCount,
      duration_ms: durationMs,
      errors: perAccountErrors,
      discovery_errors: discoveryErrors,
    });
  } catch (e) {
    Sentry.captureException(e, {
      tags: { feature: 'instagram', event: 'metrics_poller_fatal' },
    });
    // Surface real diagnostics — never "unknown". Handles Error instances,
    // PostgREST error objects ({message,details,hint,code}), and unknown shapes.
    let errMessage = 'unknown';
    let errName: string | undefined;
    let errStack: string | undefined;
    if (e instanceof Error) {
      errMessage = e.message;
      errName = e.name;
      errStack = e.stack?.slice(0, 500);
    } else if (typeof e === 'object' && e !== null) {
      const obj = e as Record<string, unknown>;
      const parts: string[] = [];
      if (typeof obj.message === 'string') parts.push(obj.message);
      if (typeof obj.details === 'string') parts.push(`details=${obj.details}`);
      if (typeof obj.hint === 'string') parts.push(`hint=${obj.hint}`);
      if (typeof obj.code === 'string') parts.push(`code=${obj.code}`);
      errMessage = parts.length > 0 ? parts.join(' | ') : JSON.stringify(obj).slice(0, 500);
    } else if (typeof e === 'string') {
      errMessage = e;
    }
    return NextResponse.json(
      {
        success: false,
        accounts_polled: accountsPolled,
        errors_count: errorsCount + 1,
        duration_ms: Date.now() - start,
        error: errMessage,
        error_name: errName,
        error_stack: errStack,
      },
      { status: 500 }
    );
  }
}
