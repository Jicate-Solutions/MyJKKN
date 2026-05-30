export const dynamic = 'force-dynamic';

// /api/cron/instagram-metrics-poller
// Phase 2B: Runs hourly (or per ig.poll_interval_hours policy).
// For each active ig_account:
//   1. Fetch account-level insights from Meta Graph API → write ig_account_metrics row
//   2. Fetch recent media since last_polled_at → upsert ig_posts
//   3. Fetch per-post insights → write ig_post_metrics rows
//   4. Update ig_accounts.last_polled_at
//   5. Mark accounts dormant if no post in ig.dormancy_threshold_days
//
// Auth: Bearer CRON_SECRET (Vercel-provided in production).
// Logs every Meta API call to social_instagram_logs.
//
// NOTE: Depends on ig_* tables (Agent β) and lib/instagram/api-client.ts (Agent α).
// If those aren't merged yet, runtime errors are expected and acceptable;
// the interface is stubbed below.

import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

// ---------------------------------------------------------------------------
// Agent α stub — replace with real import once lib/instagram/api-client.ts merges
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
  raw: Record<string, unknown>;
}

interface IgMedia {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  permalink: string;
  thumbnail_url?: string;
  timestamp: string;
  is_shared_to_feed?: boolean;
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
  raw: Record<string, unknown>;
}

// The real client from Agent α will be at lib/instagram/api-client.ts.
// This stub matches the expected interface so the route type-checks independently.
async function fetchAccountInsights(
  _accessToken: string,
  _igUserId: string
): Promise<IgAccountInsights> {
  throw new Error(
    'lib/instagram/api-client stub — replace with real import once Agent α merges'
  );
}

async function fetchRecentMedia(
  _accessToken: string,
  _igUserId: string,
  _since: string | null
): Promise<IgMedia[]> {
  throw new Error(
    'lib/instagram/api-client stub — replace with real import once Agent α merges'
  );
}

async function fetchPostInsights(
  _accessToken: string,
  _igMediaId: string,
  _mediaType: string
): Promise<IgPostInsights> {
  throw new Error(
    'lib/instagram/api-client stub — replace with real import once Agent α merges'
  );
}
// ---------------------------------------------------------------------------
// END Agent α stub
// ---------------------------------------------------------------------------

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
    ig_account_id: string;
    endpoint: string;
    http_status?: number | null;
    error_message?: string | null;
    duration_ms?: number;
    meta: Record<string, unknown>;
  }
): Promise<void> {
  await supabase.from('social_instagram_logs').insert({
    ig_account_id: args.ig_account_id,
    endpoint: args.endpoint,
    http_status: args.http_status ?? null,
    error_message: args.error_message ?? null,
    duration_ms: args.duration_ms ?? null,
    payload: args.meta,
    created_at: new Date().toISOString(),
  });
}

async function getPollIntervalHours(supabase: SupabaseClient): Promise<number> {
  // Read from platform_policies if row exists; fall back to 1 hour
  const { data } = await supabase
    .from('platform_policies')
    .select('value')
    .eq('key', 'ig.poll_interval_hours')
    .maybeSingle();
  if (data?.value) {
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
    .eq('key', 'ig.dormancy_threshold_days')
    .maybeSingle();
  if (data?.value) {
    const n = Number(data.value);
    if (!isNaN(n) && n > 0) return n;
  }
  return 30;
}

interface PollAccount {
  id: string;
  ig_user_id: string;
  access_token: string;
  last_polled_at: string | null;
  last_post_at: string | null;
}

export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const supabase = getServiceClient();

  let accountsPolled = 0;
  let errorsCount = 0;
  const perAccountErrors: Array<{ id: string; error: string }> = [];

  try {
    const [pollIntervalHours, dormancyThresholdDays] = await Promise.all([
      getPollIntervalHours(supabase),
      getDormancyThresholdDays(supabase),
    ]);

    // Only poll accounts whose last_polled_at is older than pollIntervalHours
    const pollCutoff = new Date(
      Date.now() - pollIntervalHours * 60 * 60 * 1000
    ).toISOString();

    const { data: accounts, error: acctErr } = await supabase
      .from('ig_accounts')
      .select('id, ig_user_id, access_token, last_polled_at, last_post_at')
      .eq('status', 'active')
      .or(`last_polled_at.is.null,last_polled_at.lt.${pollCutoff}`);

    if (acctErr) throw acctErr;

    const accountList: PollAccount[] = (accounts ?? []) as PollAccount[];

    for (const account of accountList) {
      const acctStart = Date.now();
      try {
        // ----------------------------------------------------------------
        // 1. Fetch account-level insights
        // ----------------------------------------------------------------
        let insights: IgAccountInsights;
        const insightsCallStart = Date.now();
        try {
          insights = await fetchAccountInsights(
            account.access_token,
            account.ig_user_id
          );
          await logApiCall(supabase, {
            ig_account_id: account.id,
            endpoint: `/${account.ig_user_id}?fields=followers_count,...`,
            http_status: 200,
            duration_ms: Date.now() - insightsCallStart,
            meta: { ig_user_id: account.ig_user_id },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'unknown';
          await logApiCall(supabase, {
            ig_account_id: account.id,
            endpoint: `/${account.ig_user_id}?fields=followers_count,...`,
            http_status: null,
            error_message: msg,
            duration_ms: Date.now() - insightsCallStart,
            meta: { ig_user_id: account.ig_user_id },
          });
          throw e;
        }

        // Write ig_account_metrics row
        const { error: metricErr } = await supabase
          .from('ig_account_metrics')
          .insert({
            ig_account_id: account.id,
            followers_count: insights.followers_count,
            follows_count: insights.follows_count,
            media_count: insights.media_count,
            reach: insights.reach ?? null,
            impressions: insights.impressions ?? null,
            profile_views: insights.profile_views ?? null,
            website_clicks: insights.website_clicks ?? null,
            email_contacts: insights.email_contacts ?? null,
            raw: insights.raw,
            snapshotted_at: new Date().toISOString(),
          });
        if (metricErr) throw metricErr;

        // ----------------------------------------------------------------
        // 2. Fetch recent media since last poll
        // ----------------------------------------------------------------
        const mediaCallStart = Date.now();
        let mediaList: IgMedia[] = [];
        try {
          mediaList = await fetchRecentMedia(
            account.access_token,
            account.ig_user_id,
            account.last_polled_at
          );
          await logApiCall(supabase, {
            ig_account_id: account.id,
            endpoint: `/${account.ig_user_id}/media`,
            http_status: 200,
            duration_ms: Date.now() - mediaCallStart,
            meta: { media_fetched: mediaList.length },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'unknown';
          await logApiCall(supabase, {
            ig_account_id: account.id,
            endpoint: `/${account.ig_user_id}/media`,
            http_status: null,
            error_message: msg,
            duration_ms: Date.now() - mediaCallStart,
            meta: {},
          });
          throw e;
        }

        // Upsert each media item into ig_posts
        let latestPostAt: string | null = account.last_post_at;
        for (const media of mediaList) {
          const { error: postErr } = await supabase
            .from('ig_posts')
            .upsert(
              {
                ig_account_id: account.id,
                ig_media_id: media.id,
                caption: media.caption ?? null,
                media_type: media.media_type,
                media_url: media.media_url ?? null,
                permalink: media.permalink,
                thumbnail_url: media.thumbnail_url ?? null,
                posted_at: media.timestamp,
                is_shared_to_feed: media.is_shared_to_feed ?? null,
              },
              { onConflict: 'ig_media_id' }
            );
          if (postErr) throw postErr;

          // Track most recent post timestamp
          if (
            !latestPostAt ||
            new Date(media.timestamp) > new Date(latestPostAt)
          ) {
            latestPostAt = media.timestamp;
          }

          // ----------------------------------------------------------------
          // 3. Fetch per-post insights
          // ----------------------------------------------------------------
          const postInsightsCallStart = Date.now();
          let postInsights: IgPostInsights;
          try {
            postInsights = await fetchPostInsights(
              account.access_token,
              media.id,
              media.media_type
            );
            await logApiCall(supabase, {
              ig_account_id: account.id,
              endpoint: `/${media.id}/insights`,
              http_status: 200,
              duration_ms: Date.now() - postInsightsCallStart,
              meta: { ig_media_id: media.id },
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'unknown';
            await logApiCall(supabase, {
              ig_account_id: account.id,
              endpoint: `/${media.id}/insights`,
              http_status: null,
              error_message: msg,
              duration_ms: Date.now() - postInsightsCallStart,
              meta: { ig_media_id: media.id },
            });
            throw e;
          }

          // Write ig_post_metrics row
          const { error: postMetricErr } = await supabase
            .from('ig_post_metrics')
            .insert({
              ig_account_id: account.id,
              ig_media_id: media.id,
              like_count: postInsights.like_count ?? null,
              comments_count: postInsights.comments_count ?? null,
              saved: postInsights.saved ?? null,
              reach: postInsights.reach ?? null,
              impressions: postInsights.impressions ?? null,
              engagement: postInsights.engagement ?? null,
              plays: postInsights.plays ?? null,
              shares: postInsights.shares ?? null,
              raw: postInsights.raw,
              snapshotted_at: new Date().toISOString(),
            });
          if (postMetricErr) throw postMetricErr;
        }

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
        errors_count: errorsCount,
        duration_ms: durationMs,
      },
    });

    return NextResponse.json({
      success: true,
      accounts_polled: accountsPolled,
      errors_count: errorsCount,
      duration_ms: durationMs,
      errors: perAccountErrors,
    });
  } catch (e) {
    Sentry.captureException(e, {
      tags: { feature: 'instagram', event: 'metrics_poller_fatal' },
    });
    return NextResponse.json(
      {
        success: false,
        accounts_polled: accountsPolled,
        errors_count: errorsCount + 1,
        duration_ms: Date.now() - start,
        error: e instanceof Error ? e.message : 'unknown',
      },
      { status: 500 }
    );
  }
}
