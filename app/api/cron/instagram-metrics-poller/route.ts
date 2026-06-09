export const dynamic = 'force-dynamic';

// /api/cron/instagram-metrics-poller
// Phase 2B: Runs hourly (or per ig.poll_interval_hours policy).
// Discovery: when ig_accounts is empty, seeds it from Meta /me/accounts
// (instagram_business_account edge), resolving institution_id via fb_pages.
// For each active ig_account:
//   1. Fetch account profile + account-level insights → write ig_account_metrics row
//   2. Fetch recent media since last_polled_at → upsert ig_posts
//   3. Fetch per-post insights → write ig_post_metrics rows
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

// ---------------------------------------------------------------------------
// Adapters over lib/instagram/api-client — translate series/envelope shapes
// into the flat shapes above. Per-metric failures are logged and tolerated
// (one bad metric must not kill the whole account poll).
// ---------------------------------------------------------------------------

const ACCOUNT_INSIGHT_METRICS: IgAccountMetric[] = [
  'reach',
  'impressions',
  'profile_views',
  'website_clicks',
  'email_contacts',
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

  return {
    followers_count: profile.followers_count ?? 0,
    follows_count: profile.follows_count ?? 0,
    media_count: profile.media_count ?? 0,
    reach: flat.reach,
    impressions: flat.impressions,
    profile_views: flat.profile_views,
    website_clicks: flat.website_clicks,
    email_contacts: flat.email_contacts,
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

function metricsForProductType(productType?: string): IgMediaMetric[] {
  if (productType === 'REELS') {
    return ['plays', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions'];
  }
  if (productType === 'STORY') {
    return ['impressions', 'reach', 'replies'];
  }
  // FEED (IMAGE / VIDEO / CAROUSEL_ALBUM) + unknown product types
  return ['impressions', 'reach', 'engagement', 'saved'];
}

async function fetchPostInsights(
  supabase: SupabaseClient,
  accountId: string,
  accessToken: string,
  media: IgMedia
): Promise<IgPostInsights> {
  const config: IgCallConfig = { accessToken, apiVersion: GRAPH_VERSION };
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

  const flat: Partial<Record<IgMediaMetric, number>> = {};
  const raw: Record<string, unknown> = {};
  for (const entry of entries) {
    flat[entry.name] = flattenInsightValue(entry.values?.[0]?.value);
    raw[entry.name] = entry;
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
    raw,
  };
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
}

interface PollAccountRow {
  id: string;
  ig_user_id: string;
  access_token: string | null;
  last_polled_at: string | null;
  last_post_at: string | null;
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
    const [pollIntervalHours, dormancyThresholdDays] = await Promise.all([
      getPollIntervalHours(supabase),
      getDormancyThresholdDays(supabase),
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

        // Write ig_account_metrics row. The table carries the counter columns;
        // the day-bucketed insight scalars travel in raw alongside the series.
        const { error: metricErr } = await supabase
          .from('ig_account_metrics')
          .insert({
            account_id: account.id,
            followers: insights.followers_count,
            follows: insights.follows_count,
            media_count: insights.media_count,
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
            // Meta media id; counter columns are NOT NULL DEFAULT 0).
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
        accounts_discovered: accountsDiscovered,
        accounts_seeded: accountsSeeded,
        errors_count: errorsCount,
        duration_ms: durationMs,
      },
    });

    return NextResponse.json({
      success: true,
      accounts_polled: accountsPolled,
      accounts_discovered: accountsDiscovered,
      accounts_seeded: accountsSeeded,
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
