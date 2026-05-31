export const dynamic = 'force-dynamic';

// /api/cron/meta-facebook-poll
// Phase 1B: Runs hourly (or per fb.pages.poll_interval_minutes policy).
// For each active fb_page:
//   1. Fetch page profile + page-level insights → write fb_page_metrics row
//   2. Fetch recent posts since last_polled_at (capped by post_lookback_days)
//      → upsert fb_posts
//   3. Fetch per-post insights → write fb_post_metrics rows
//   4. Update fb_pages.last_polled_at (and last_post_at if new posts)
//   5. Mark page dormant if no post within fb.pages.dormancy_threshold_days (default 30)
//
// Auth: Bearer CRON_SECRET (Vercel-provided in production).
// Logs every Meta API call to social_facebook_logs.
//
// Master toggle: fb.pages.is_enabled (default false). When false the cron
// returns early without making Graph API calls.

import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import {
  getPageInsights,
  getPagePosts,
  getPostInsights,
  getPageProfile,
} from '@/lib/facebook/api-client';
import type { FbPageMetric } from '@/lib/facebook/types';

const DORMANCY_THRESHOLD_DAYS_FALLBACK = 30;

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
    page_id: string | null;
    event_type: string;
    status: 'success' | 'error';
    payload: Record<string, unknown>;
    error_message?: string | null;
  }
): Promise<void> {
  await supabase.from('social_facebook_logs').insert({
    page_id: args.page_id,
    event_type: args.event_type,
    status: args.status,
    payload: args.payload,
    error_message: args.error_message ?? null,
    occurred_at: new Date().toISOString(),
  });
}

async function getPolicyNumber(
  supabase: SupabaseClient,
  key: string,
  fallback: number
): Promise<number> {
  const { data } = await supabase
    .from('platform_policies')
    .select('value')
    .eq('policy_key', key)
    .eq('scope_type', 'global')
    .maybeSingle();
  if (data?.value !== undefined && data?.value !== null) {
    const n = Number(data.value);
    if (!isNaN(n) && n > 0) return n;
  }
  return fallback;
}

async function getPolicyBool(
  supabase: SupabaseClient,
  key: string,
  fallback: boolean
): Promise<boolean> {
  const { data } = await supabase
    .from('platform_policies')
    .select('value')
    .eq('policy_key', key)
    .eq('scope_type', 'global')
    .maybeSingle();
  if (data?.value !== undefined && data?.value !== null) {
    if (typeof data.value === 'boolean') return data.value;
    if (typeof data.value === 'string') return data.value === 'true';
  }
  return fallback;
}

interface PollPage {
  id: string;
  fb_page_id: string;
  access_token: string | null;
  last_polled_at: string | null;
  last_post_at: string | null;
}

// Extract a numeric scalar from a Meta insight series. Handles the common
// `values:[{value:N}]` shape and the breakdown-object shape (returns the
// sum of the values).
function flattenInsightValue(value: number | Record<string, number> | undefined): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    return Object.values(value).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
  }
  return 0;
}

const PAGE_METRICS_DAY: FbPageMetric[] = [
  'page_impressions',
  'page_impressions_unique',
  'page_post_engagements',
  'page_fan_adds',
  'page_fan_removes',
  'page_views_total',
];

export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const supabase = getServiceClient();

  let pagesPolled = 0;
  let errorsCount = 0;
  const perPageErrors: Array<{ id: string; error: string }> = [];

  try {
    // ----------------------------------------------------------------
    // Master toggle: fb.pages.is_enabled (default false)
    // ----------------------------------------------------------------
    const isEnabled = await getPolicyBool(supabase, 'fb.pages.is_enabled', false);
    if (!isEnabled) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'fb.pages.is_enabled is false',
        duration_ms: Date.now() - start,
      });
    }

    const pollIntervalMinutes = await getPolicyNumber(
      supabase,
      'fb.pages.poll_interval_minutes',
      60
    );
    const postLookbackDays = await getPolicyNumber(
      supabase,
      'fb.pages.post_lookback_days',
      7
    );
    const dormancyThresholdDays = await getPolicyNumber(
      supabase,
      'fb.pages.dormancy_threshold_days',
      DORMANCY_THRESHOLD_DAYS_FALLBACK
    );

    // Only poll pages whose last_polled_at is older than pollIntervalMinutes
    const pollCutoff = new Date(
      Date.now() - pollIntervalMinutes * 60 * 1000
    ).toISOString();

    const { data: pages, error: pageErr } = await supabase
      .from('fb_pages')
      .select('id, fb_page_id, access_token, last_polled_at, last_post_at')
      .eq('status', 'active')
      .or(`last_polled_at.is.null,last_polled_at.lt.${pollCutoff}`);

    if (pageErr) throw pageErr;

    const pageList: PollPage[] = (pages ?? []) as PollPage[];

    for (const pg of pageList) {
      const pgStart = Date.now();
      if (!pg.access_token) {
        errorsCount++;
        perPageErrors.push({ id: pg.id, error: 'no access_token on fb_pages row' });
        await logApiCall(supabase, {
          page_id: pg.id,
          event_type: 'poll',
          status: 'error',
          payload: { fb_page_id: pg.fb_page_id },
          error_message: 'no access_token on fb_pages row',
        });
        continue;
      }

      const cfg = { accessToken: pg.access_token };

      try {
        // ----------------------------------------------------------------
        // 1a. Fetch page profile (counts that the insights API doesn't return)
        // ----------------------------------------------------------------
        const profileStart = Date.now();
        const profile = await getPageProfile(pg.fb_page_id, cfg);
        await logApiCall(supabase, {
          page_id: pg.id,
          event_type: 'page_profile',
          status: 'success',
          payload: {
            fb_page_id: pg.fb_page_id,
            duration_ms: Date.now() - profileStart,
          },
        });

        // ----------------------------------------------------------------
        // 1b. Fetch page-level insights (daily series)
        // ----------------------------------------------------------------
        const pageInsightsStart = Date.now();
        let pageInsights;
        try {
          pageInsights = await getPageInsights(pg.fb_page_id, PAGE_METRICS_DAY, 'day', cfg);
          await logApiCall(supabase, {
            page_id: pg.id,
            event_type: 'page_insights',
            status: 'success',
            payload: {
              fb_page_id: pg.fb_page_id,
              metrics_count: pageInsights.length,
              duration_ms: Date.now() - pageInsightsStart,
            },
          });
        } catch (e) {
          // Non-fatal: page insights may fail on brand-new pages; we still record
          // fan/follower counts below from the profile call.
          const msg = e instanceof Error ? e.message : 'unknown';
          await logApiCall(supabase, {
            page_id: pg.id,
            event_type: 'page_insights',
            status: 'error',
            payload: { fb_page_id: pg.fb_page_id, duration_ms: Date.now() - pageInsightsStart },
            error_message: msg,
          });
          pageInsights = [];
        }

        // Collapse the time series to a single scalar per metric (latest value).
        const insightMap = new Map<string, number>();
        for (const series of pageInsights) {
          const lastVal = series.values[series.values.length - 1]?.value;
          insightMap.set(series.name, flattenInsightValue(lastVal));
        }

        // Write fb_page_metrics row
        const { error: metricErr } = await supabase.from('fb_page_metrics').insert({
          page_id: pg.id,
          fan_count: profile.fan_count ?? 0,
          followers_count: profile.followers_count ?? 0,
          impressions: insightMap.get('page_impressions') ?? null,
          impressions_unique: insightMap.get('page_impressions_unique') ?? null,
          post_engagements: insightMap.get('page_post_engagements') ?? null,
          page_views: insightMap.get('page_views_total') ?? null,
          fan_adds: insightMap.get('page_fan_adds') ?? null,
          fan_removes: insightMap.get('page_fan_removes') ?? null,
          raw: { profile, insights: pageInsights },
          snapshot_at: new Date().toISOString(),
        });
        if (metricErr) throw metricErr;

        // ----------------------------------------------------------------
        // 2. Fetch recent posts since last poll (lower-bounded by lookback policy)
        // ----------------------------------------------------------------
        const sinceCandidate = pg.last_polled_at
          ? new Date(pg.last_polled_at).getTime()
          : Date.now() - postLookbackDays * 24 * 60 * 60 * 1000;
        const lookbackFloor = Date.now() - postLookbackDays * 24 * 60 * 60 * 1000;
        const since = Math.max(sinceCandidate, lookbackFloor);
        const sinceUnix = Math.floor(since / 1000);

        const postsStart = Date.now();
        let postsPage;
        try {
          postsPage = await getPagePosts(pg.fb_page_id, cfg, {
            since: sinceUnix,
            limit: 25,
          });
          await logApiCall(supabase, {
            page_id: pg.id,
            event_type: 'page_posts',
            status: 'success',
            payload: {
              fb_page_id: pg.fb_page_id,
              posts_fetched: postsPage.data?.length ?? 0,
              duration_ms: Date.now() - postsStart,
            },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'unknown';
          await logApiCall(supabase, {
            page_id: pg.id,
            event_type: 'page_posts',
            status: 'error',
            payload: { fb_page_id: pg.fb_page_id, duration_ms: Date.now() - postsStart },
            error_message: msg,
          });
          throw e;
        }

        const posts = postsPage.data ?? [];
        let latestPostAt: string | null = pg.last_post_at;

        // Upsert posts + fetch insights for each
        for (const post of posts) {
          if (!post.created_time) continue;

          // Upsert into fb_posts
          const { data: postRow, error: postErr } = await supabase
            .from('fb_posts')
            .upsert(
              {
                page_id: pg.id,
                fb_post_id: post.id,
                posted_at: post.created_time,
                updated_at_meta: post.updated_time ?? null,
                post_type: post.type ?? null,
                message: post.message ?? null,
                story: post.story ?? null,
                permalink_url: post.permalink_url ?? null,
                attachments: post.attachments ?? null,
                reactions_count: post.reactions?.summary?.total_count ?? null,
                comments_count: post.comments?.summary?.total_count ?? null,
                shares_count: post.shares?.count ?? null,
              },
              { onConflict: 'fb_post_id' }
            )
            .select('id')
            .single();
          if (postErr) throw postErr;

          // Track most recent post timestamp
          if (
            !latestPostAt ||
            new Date(post.created_time) > new Date(latestPostAt)
          ) {
            latestPostAt = post.created_time;
          }

          // ----------------------------------------------------------------
          // 3. Fetch per-post insights
          // ----------------------------------------------------------------
          const postInsightsStart = Date.now();
          let postInsights;
          try {
            postInsights = await getPostInsights(post.id, cfg);
            await logApiCall(supabase, {
              page_id: pg.id,
              event_type: 'post_insights',
              status: 'success',
              payload: {
                fb_post_id: post.id,
                duration_ms: Date.now() - postInsightsStart,
              },
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'unknown';
            await logApiCall(supabase, {
              page_id: pg.id,
              event_type: 'post_insights',
              status: 'error',
              payload: { fb_post_id: post.id, duration_ms: Date.now() - postInsightsStart },
              error_message: msg,
            });
            // Skip writing metrics for this post; continue with next
            continue;
          }

          const postInsightMap = new Map<string, number>();
          for (const entry of postInsights) {
            const lastVal = entry.values[entry.values.length - 1]?.value;
            postInsightMap.set(entry.name, flattenInsightValue(lastVal));
          }

          // Write fb_post_metrics row
          const { error: postMetricErr } = await supabase
            .from('fb_post_metrics')
            .insert({
              post_id: postRow.id,
              impressions: postInsightMap.get('post_impressions') ?? null,
              impressions_unique: postInsightMap.get('post_impressions_unique') ?? null,
              engaged_users: postInsightMap.get('post_engaged_users') ?? null,
              clicks: postInsightMap.get('post_clicks') ?? null,
              reactions_total: postInsightMap.get('post_reactions_by_type_total') ?? null,
              video_views: postInsightMap.get('post_video_views') ?? null,
              video_avg_time_watched_ms:
                postInsightMap.get('post_video_avg_time_watched') ?? null,
              raw: postInsights,
              snapshot_at: new Date().toISOString(),
            });
          if (postMetricErr) throw postMetricErr;
        }

        // ----------------------------------------------------------------
        // 4. Update last_polled_at (and last_post_at if new posts found)
        // ----------------------------------------------------------------
        const pageUpdate: Record<string, unknown> = {
          last_polled_at: new Date().toISOString(),
        };
        if (latestPostAt && latestPostAt !== pg.last_post_at) {
          pageUpdate.last_post_at = latestPostAt;
        }
        // Refresh follower/fan counts on the page row too
        if (typeof profile.fan_count === 'number') {
          pageUpdate.fan_count = profile.fan_count;
        }
        if (typeof profile.followers_count === 'number') {
          pageUpdate.followers_count = profile.followers_count;
        }

        // ----------------------------------------------------------------
        // 5. Mark dormant if no post within threshold
        // ----------------------------------------------------------------
        const dormancyCutoff = new Date(
          Date.now() - dormancyThresholdDays * 24 * 60 * 60 * 1000
        ).toISOString();
        const effectiveLastPost = latestPostAt ?? pg.last_post_at;
        if (!effectiveLastPost || effectiveLastPost < dormancyCutoff) {
          pageUpdate.status = 'dormant';
          Sentry.captureMessage('Facebook Page marked dormant', {
            level: 'warning',
            tags: { feature: 'facebook', event: 'page_dormant' },
            extra: {
              fb_page_internal_id: pg.id,
              fb_page_id: pg.fb_page_id,
              last_post_at: effectiveLastPost,
              dormancy_threshold_days: dormancyThresholdDays,
            },
          });
        }

        const { error: updateErr } = await supabase
          .from('fb_pages')
          .update(pageUpdate)
          .eq('id', pg.id);
        if (updateErr) throw updateErr;

        pagesPolled++;
      } catch (e) {
        errorsCount++;
        const msg = e instanceof Error ? e.message : 'unknown';
        perPageErrors.push({ id: pg.id, error: msg });
        Sentry.captureException(e, {
          tags: { feature: 'facebook', event: 'pages_poller_page_failure' },
          extra: {
            fb_page_internal_id: pg.id,
            duration_ms: Date.now() - pgStart,
          },
        });
      }
    }

    const durationMs = Date.now() - start;

    Sentry.captureMessage('Facebook Pages poll complete', {
      level: 'info',
      tags: { feature: 'facebook', event: 'pages_poller_complete' },
      extra: {
        pages_polled: pagesPolled,
        pages_total: pageList.length,
        errors_count: errorsCount,
        duration_ms: durationMs,
      },
    });

    return NextResponse.json({
      success: true,
      pages_polled: pagesPolled,
      errors_count: errorsCount,
      duration_ms: durationMs,
      errors: perPageErrors,
    });
  } catch (e) {
    Sentry.captureException(e, {
      tags: { feature: 'facebook', event: 'pages_poller_fatal' },
    });
    return NextResponse.json(
      {
        success: false,
        pages_polled: pagesPolled,
        errors_count: errorsCount + 1,
        duration_ms: Date.now() - start,
        error: e instanceof Error ? e.message : 'unknown',
      },
      { status: 500 }
    );
  }
}
