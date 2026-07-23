export const dynamic = 'force-dynamic';

// /api/cron/meta-facebook-poll
// Phase 1B: Runs hourly (or per fb.pages.poll_interval_minutes policy).
// For each pollable fb_page (active OR dormant):
//   1. Fetch page profile + page-level insights → write fb_page_metrics row
//   2. Fetch recent posts since last_polled_at (capped by post_lookback_days)
//      → upsert fb_posts
//   3. Fetch per-post insights → write fb_post_metrics rows
//   4. Update fb_pages.last_polled_at (and last_post_at if new posts)
//   5. Classify dormancy (bidirectional) from last_post_at vs
//      fb.pages.dormancy_threshold_days (default 30)
//
// Failure isolation (2026-06-10): the profile fetch is the only REQUIRED
// step. Insights / posts / per-post writes are each isolated — they log to
// social_facebook_logs and continue — and last_polled_at is updated at loop
// end whenever the profile step succeeded. Previously a single failing step
// (e.g. Meta deprecating a post field or insights metric) aborted the page
// before the last_polled_at update, freezing "Last Polled" and leaving
// first-tick pages permanently "Never synced".
//
// Gap-fill (2026-06-10, v2): uncertain/deprecation-listed metrics are now
// PROBED per tick instead of hard-skipped — page_fan_adds, page_fan_removes,
// page_views_total, page_follows at page level and the full 7-metric set at
// post level. Dead metrics store NULL (failure logged); live ones fill their
// columns. fb_post_metrics gets a snapshot row per post per tick regardless.
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
import type {
  FbInsightSeries,
  FbPage,
  FbPost,
  FbPostInsightEntry,
  FbPostMetric,
} from '@/lib/facebook/types';

const DORMANCY_THRESHOLD_DAYS_FALLBACK = 30;
const GRAPH_VERSION = 'v25.0';

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
  status: string | null;
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

// ──────────────────────────────────────────────────────────────────────
// Discovery: when fb_pages is empty, seed it from the Meta /me/accounts
// endpoint. Uses MESSENGER_PAGE_ACCESS_TOKEN (canonical for this app —
// bound to JKKN Institutions App 437028995095541) and falls back to the
// legacy META_PAGE_ACCESS_TOKEN name used elsewhere in the codebase.
//
// Each /me/accounts row already carries a long-lived per-page token, so
// we insert it directly into fb_pages.access_token — no second call.
//
// institution_id resolution:
//   1. exact ILIKE match on institutions.name (Page name → institution name)
//   2. heuristic substring match (e.g. "JKKN Dental" → "JKKN College of Dental")
//   3. fallback to first JKKN institution (alphabetical) — Director can re-link
//      via the admin UI; the cron MUST seed *something* because institution_id
//      is NOT NULL on fb_pages and we don't want pages_discovered:0 again.
// ──────────────────────────────────────────────────────────────────────
interface MeAccountsPage {
  id: string;
  name?: string;
  access_token?: string;
  category?: string;
  instagram_business_account?: { id: string; username?: string };
}

interface MeAccountsResponse {
  data?: MeAccountsPage[];
  error?: { message?: string; code?: number; type?: string };
}

async function resolveInstitutionId(
  supabase: SupabaseClient,
  pageName: string | null | undefined,
  fallbackInstitutionId: string | null
): Promise<string | null> {
  if (pageName && pageName.trim()) {
    // 1. exact-ish match: page name contained in institution name, or vice versa
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

async function discoverAndSeedFbPages(
  supabase: SupabaseClient
): Promise<{
  discovered: number;
  inserted: number;
  errors: Array<{ fb_page_id?: string; name?: string; error: string }>;
}> {
  const errors: Array<{ fb_page_id?: string; name?: string; error: string }> = [];
  const token =
    process.env.MESSENGER_PAGE_ACCESS_TOKEN ||
    process.env.META_PAGE_ACCESS_TOKEN ||
    '';
  if (!token) {
    return {
      discovered: 0,
      inserted: 0,
      errors: [{ error: 'no token (MESSENGER_PAGE_ACCESS_TOKEN / META_PAGE_ACCESS_TOKEN)' }],
    };
  }

  // Fetch the Pages list from Meta. Includes the per-Page access_token
  // (long-lived when the source token is a System User token) plus the
  // linked Instagram business account id when present.
  let pages: MeAccountsPage[] = [];
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts` +
    `?fields=id,name,access_token,category,instagram_business_account{id,username}` +
    `&limit=100&access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const json = (await res.json()) as MeAccountsResponse;
    if (!res.ok || json.error) {
      const msg =
        json.error?.message ?? `Meta /me/accounts returned HTTP ${res.status}`;
      await logApiCall(supabase, {
        page_id: null,
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
      page_id: null,
      event_type: 'discover',
      status: 'error',
      payload: { endpoint: '/me/accounts' },
      error_message: msg,
    });
    return { discovered: 0, inserted: 0, errors: [{ error: msg }] };
  }

  if (pages.length === 0) {
    await logApiCall(supabase, {
      page_id: null,
      event_type: 'discover',
      status: 'success',
      payload: { endpoint: '/me/accounts', pages_returned: 0 },
    });
    return { discovered: 0, inserted: 0, errors: [] };
  }

  // Pre-fetch a fallback institution_id so we can satisfy the NOT NULL
  // constraint even when no name match is found. We pick the first JKKN
  // institution alphabetically — Director can move pages to the correct
  // owner via the admin UI once discovered.
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
  for (const p of pages) {
    if (!p.id) continue;
    try {
      const institutionId = await resolveInstitutionId(
        supabase,
        p.name ?? null,
        fallbackInstitutionId
      );
      if (!institutionId) {
        errors.push({
          fb_page_id: p.id,
          name: p.name,
          error: 'no institution found and no JKKN fallback available',
        });
        continue;
      }

      const { error: insErr } = await supabase
        .from('fb_pages')
        .upsert(
          {
            institution_id: institutionId,
            fb_page_id: p.id,
            name: p.name ?? p.id,
            category: p.category ?? null,
            access_token: p.access_token ?? null,
            status: 'active',
          },
          { onConflict: 'fb_page_id', ignoreDuplicates: true }
        );
      if (insErr) {
        errors.push({
          fb_page_id: p.id,
          name: p.name,
          error: insErr.message,
        });
        continue;
      }
      inserted++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      errors.push({ fb_page_id: p.id, name: p.name, error: msg });
    }
  }

  await logApiCall(supabase, {
    page_id: null,
    event_type: 'discover',
    status: 'success',
    payload: {
      endpoint: '/me/accounts',
      pages_returned: pages.length,
      pages_inserted: inserted,
      errors_count: errors.length,
    },
  });

  return { discovered: pages.length, inserted, errors };
}

// Conservative v25-valid page metric set. Meta's Nov-2024 Page Insights
// deprecation removed page_fan_adds / page_fan_removes / page_views_total —
// requesting ANY removed metric fails the WHOLE batch with "(#100) The value
// must be a valid insights metric" (live evidence in social_facebook_logs on
// every tick). Metrics are fetched ONE PER CALL below so a future deprecation
// degrades that single metric instead of killing the insights write again.
const PAGE_METRICS_DAY = [
  'page_impressions',
  'page_impressions_unique',
  'page_post_engagements',
  'page_fans',
] as const;

// Gap-fill PROBE set (2026-06-10). The Nov-2024 deprecation notice listed
// these as removed, but live status varies by Page / Graph version, so each
// is probed isolated per tick: success → value lands in its fb_page_metrics
// column; (#100) → that column stays NULL, the failure is logged to
// social_facebook_logs, and nothing else is affected.
//   page_fan_adds    → fb_page_metrics.fan_adds
//   page_fan_removes → fb_page_metrics.fan_removes
//   page_views_total → fb_page_metrics.page_views
//   page_follows     → fb_page_metrics.followers_count (total follows; falls
//                      back to the profile followers_count, which works today)
const PAGE_METRICS_PROBE = [
  'page_fan_adds',
  'page_fan_removes',
  'page_views_total',
  'page_follows',
] as const;

// Per-post insight probe set. post_engaged_users / post_clicks were removed
// by the Nov-2024 deprecation (live (#100) evidence); parts of the
// post_impressions* family were deprecated for NEWER posts in the 2024-25
// purges, so their status varies per post. Probed ONE PER CALL: dead metrics
// store NULL, live ones store their value — and the fb_post_metrics snapshot
// row is written either way (reactions/comments/shares from the posts fetch
// always anchor it).
const POST_METRICS_PROBE: ReadonlyArray<FbPostMetric> = [
  'post_impressions',
  'post_impressions_unique',
  'post_engaged_users',
  'post_clicks',
  'post_reactions_by_type_total',
  'post_video_views',
  'post_video_avg_time_watched',
] as const;

export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const supabase = getServiceClient();

  let pagesPolled = 0;
  let pagesDiscovered = 0;
  let pagesSeeded = 0;
  let errorsCount = 0;
  const perPageErrors: Array<{ id: string; error: string }> = [];
  const discoveryErrors: Array<{ fb_page_id?: string; name?: string; error: string }> = [];

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

    // ----------------------------------------------------------------
    // Discovery step: when fb_pages is empty, seed it from Meta.
    // This fixes the silent pages_polled:0 case where the cron has
    // nothing to iterate over because no Page has been connected yet.
    // ----------------------------------------------------------------
    const { count: existingCount } = await supabase
      .from('fb_pages')
      .select('id', { count: 'exact', head: true });
    if (existingCount === 0) {
      const result = await discoverAndSeedFbPages(supabase);
      pagesDiscovered = result.discovered;
      pagesSeeded = result.inserted;
      if (result.errors.length > 0) {
        errorsCount += result.errors.length;
        discoveryErrors.push(...result.errors);
      }
    }

    // Only poll pages whose last_polled_at is older than pollIntervalMinutes
    const pollCutoff = new Date(
      Date.now() - pollIntervalMinutes * 60 * 1000
    ).toISOString();

    // Poll dormant pages too: dormancy is a CLASSIFICATION, not a stop-list.
    // The previous `.eq('status','active')` filter froze dormant pages
    // forever (they were never re-polled, so a new post could never
    // reactivate them). Disconnected/orphaned pages stay excluded.
    const { data: pages, error: pageErr } = await supabase
      .from('fb_pages')
      .select('id, fb_page_id, access_token, status, last_polled_at, last_post_at')
      .in('status', ['active', 'dormant'])
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

      const cfg = { accessToken: pg.access_token, apiVersion: GRAPH_VERSION };

      // ----------------------------------------------------------------
      // 1a. Page profile — the only REQUIRED step. If it fails, skip the
      //     page WITHOUT touching last_polled_at so it retries next tick.
      //     Every later step is isolated (log + continue): one failing
      //     step must never freeze last_polled_at again ("Never synced").
      // ----------------------------------------------------------------
      const profileStart = Date.now();
      let profile: FbPage;
      try {
        profile = await getPageProfile(pg.fb_page_id, cfg);
        await logApiCall(supabase, {
          page_id: pg.id,
          event_type: 'page_profile',
          status: 'success',
          payload: {
            fb_page_id: pg.fb_page_id,
            duration_ms: Date.now() - profileStart,
          },
        });
      } catch (e) {
        errorsCount++;
        const msg = e instanceof Error ? e.message : 'unknown';
        perPageErrors.push({ id: pg.id, error: `page_profile: ${msg}` });
        await logApiCall(supabase, {
          page_id: pg.id,
          event_type: 'page_profile',
          status: 'error',
          payload: {
            fb_page_id: pg.fb_page_id,
            duration_ms: Date.now() - profileStart,
          },
          error_message: msg,
        });
        Sentry.captureException(e, {
          tags: { feature: 'facebook', event: 'pages_poller_page_failure' },
          extra: {
            fb_page_internal_id: pg.id,
            step: 'page_profile',
            duration_ms: Date.now() - pgStart,
          },
        });
        continue;
      }

      // ----------------------------------------------------------------
      // 1b. Page-level insights — ONE call per metric so a single invalid
      //     or newly-deprecated metric can never kill the whole insights
      //     write again (the "(#100) valid insights metric" trap). The
      //     PROBE metrics ride the same loop: dead ones log + store NULL.
      // ----------------------------------------------------------------
      const allPageMetrics = [...PAGE_METRICS_DAY, ...PAGE_METRICS_PROBE];
      const pageInsightsStart = Date.now();
      const pageInsights: FbInsightSeries[] = [];
      const failedMetrics: string[] = [];
      for (const metric of allPageMetrics) {
        try {
          const series = await getPageInsights(pg.fb_page_id, [metric], 'day', cfg);
          pageInsights.push(...series);
        } catch (e) {
          failedMetrics.push(metric);
          const msg = e instanceof Error ? e.message : 'unknown';
          await logApiCall(supabase, {
            page_id: pg.id,
            event_type: 'page_insights',
            status: 'error',
            payload: { fb_page_id: pg.fb_page_id, metric },
            error_message: msg,
          });
        }
      }
      if (failedMetrics.length < allPageMetrics.length) {
        await logApiCall(supabase, {
          page_id: pg.id,
          event_type: 'page_insights',
          status: 'success',
          payload: {
            fb_page_id: pg.fb_page_id,
            metrics_count: pageInsights.length,
            failed_metrics: failedMetrics,
            duration_ms: Date.now() - pageInsightsStart,
          },
        });
      }

      // Collapse the time series to a single scalar per metric (latest value).
      const insightMap = new Map<string, number>();
      for (const series of pageInsights) {
        const lastVal = series.values[series.values.length - 1]?.value;
        insightMap.set(series.name, flattenInsightValue(lastVal));
      }

      // page_follows (when it works) is the total-follows insight metric —
      // prefer it for the snapshot followers_count; guard against the
      // empty-values→0 flatten so a hollow series can never clobber a real
      // follower count with 0. Falls back to the profile field (works today).
      const pageFollows = insightMap.get('page_follows');

      // Write fb_page_metrics row — isolated: a DB failure here must not
      // block posts polling or the last_polled_at update. Probe metrics
      // (fan_adds / fan_removes / page_views) store NULL when Meta rejects
      // them with (#100) — see PAGE_METRICS_PROBE above.
      const { error: metricErr } = await supabase.from('fb_page_metrics').insert({
        page_id: pg.id,
        fan_count: profile.fan_count ?? 0,
        followers_count:
          pageFollows && pageFollows > 0
            ? pageFollows
            : profile.followers_count ?? 0,
        impressions: insightMap.get('page_impressions') ?? null,
        impressions_unique: insightMap.get('page_impressions_unique') ?? null,
        post_engagements: insightMap.get('page_post_engagements') ?? null,
        page_views: insightMap.get('page_views_total') ?? null,
        fan_adds: insightMap.get('page_fan_adds') ?? null,
        fan_removes: insightMap.get('page_fan_removes') ?? null,
        raw: { profile, insights: pageInsights, failed_metrics: failedMetrics },
        snapshot_at: new Date().toISOString(),
      });
      if (metricErr) {
        errorsCount++;
        perPageErrors.push({
          id: pg.id,
          error: `fb_page_metrics insert: ${metricErr.message}`,
        });
        await logApiCall(supabase, {
          page_id: pg.id,
          event_type: 'page_metrics_write',
          status: 'error',
          payload: { fb_page_id: pg.fb_page_id },
          error_message: metricErr.message,
        });
      }

      // ----------------------------------------------------------------
      // 2. Fetch recent posts since last poll (lower-bounded by lookback
      //    policy) — isolated. The old code re-threw here, which froze
      //    last_polled_at on every tick while the posts field set was
      //    deprecated (#12) and left first-tick pages "Never synced".
      // ----------------------------------------------------------------
      const sinceCandidate = pg.last_polled_at
        ? new Date(pg.last_polled_at).getTime()
        : Date.now() - postLookbackDays * 24 * 60 * 60 * 1000;
      const lookbackFloor = Date.now() - postLookbackDays * 24 * 60 * 60 * 1000;
      const since = Math.max(sinceCandidate, lookbackFloor);
      const sinceUnix = Math.floor(since / 1000);

      const postsStart = Date.now();
      let posts: FbPost[] = [];
      try {
        const postsPage = await getPagePosts(pg.fb_page_id, cfg, {
          since: sinceUnix,
          limit: 25,
        });
        posts = postsPage.data ?? [];
        await logApiCall(supabase, {
          page_id: pg.id,
          event_type: 'page_posts',
          status: 'success',
          payload: {
            fb_page_id: pg.fb_page_id,
            posts_fetched: posts.length,
            duration_ms: Date.now() - postsStart,
          },
        });
      } catch (e) {
        errorsCount++;
        const msg = e instanceof Error ? e.message : 'unknown';
        perPageErrors.push({ id: pg.id, error: `page_posts: ${msg}` });
        await logApiCall(supabase, {
          page_id: pg.id,
          event_type: 'page_posts',
          status: 'error',
          payload: { fb_page_id: pg.fb_page_id, duration_ms: Date.now() - postsStart },
          error_message: msg,
        });
      }

      let latestPostAt: string | null = pg.last_post_at;

      // Upsert posts + fetch insights for each — isolated PER POST so one
      // bad post never blocks the rest (or the last_polled_at update).
      for (const post of posts) {
        if (!post.created_time) continue;
        try {
          // The Graph `type` field is deprecated (v3.3+) and no longer
          // requested — derive a coarse type from the first attachment's
          // media_type; plain text posts carry no attachments → 'status'.
          const postType = post.attachments?.data?.[0]?.media_type ?? 'status';

          // Upsert into fb_posts
          const { data: postRow, error: postErr } = await supabase
            .from('fb_posts')
            .upsert(
              {
                page_id: pg.id,
                fb_post_id: post.id,
                posted_at: post.created_time,
                updated_at_meta: post.updated_time ?? null,
                post_type: postType,
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

          // ------------------------------------------------------------
          // 3. Per-post insights — ONE call per metric (mirrors the page
          //    loop). Parts of the post_impressions* family are dead for
          //    newer posts and post_engaged_users / post_clicks are dead
          //    everywhere: a (#100)/(#12) on one metric stores NULL for
          //    that column only and never aborts the post loop. The
          //    fb_post_metrics snapshot row is written EVEN IF every
          //    insight metric failed — reactions/comments/shares from the
          //    posts fetch still anchor the per-tick time series.
          // ------------------------------------------------------------
          const postInsightsStart = Date.now();
          const postInsights: FbPostInsightEntry[] = [];
          const failedPostMetrics: string[] = [];
          let lastPostInsightError: string | null = null;
          for (const metric of POST_METRICS_PROBE) {
            try {
              const entries = await getPostInsights(post.id, cfg, [metric]);
              postInsights.push(...entries);
            } catch (e) {
              failedPostMetrics.push(metric);
              lastPostInsightError = e instanceof Error ? e.message : 'unknown';
            }
          }
          const allPostMetricsFailed =
            failedPostMetrics.length === POST_METRICS_PROBE.length;
          await logApiCall(supabase, {
            page_id: pg.id,
            event_type: 'post_insights',
            status: allPostMetricsFailed ? 'error' : 'success',
            payload: {
              fb_post_id: post.id,
              metrics_count: postInsights.length,
              failed_metrics: failedPostMetrics,
              duration_ms: Date.now() - postInsightsStart,
            },
            error_message: allPostMetricsFailed ? lastPostInsightError : null,
          });

          const postInsightMap = new Map<string, number>();
          for (const entry of postInsights) {
            const lastVal = entry.values[entry.values.length - 1]?.value;
            postInsightMap.set(entry.name, flattenInsightValue(lastVal));
          }

          // Write fb_post_metrics row — always one snapshot per post per
          // tick. reactions_total falls back to the posts-fetch summary
          // count when the insight metric is unavailable.
          const { error: postMetricErr } = await supabase
            .from('fb_post_metrics')
            .insert({
              post_id: postRow.id,
              impressions: postInsightMap.get('post_impressions') ?? null,
              impressions_unique: postInsightMap.get('post_impressions_unique') ?? null,
              engaged_users: postInsightMap.get('post_engaged_users') ?? null,
              clicks: postInsightMap.get('post_clicks') ?? null,
              reactions_total:
                postInsightMap.get('post_reactions_by_type_total') ??
                post.reactions?.summary?.total_count ??
                null,
              video_views: postInsightMap.get('post_video_views') ?? null,
              video_avg_time_watched_ms:
                postInsightMap.get('post_video_avg_time_watched') ?? null,
              raw: { insights: postInsights, failed_metrics: failedPostMetrics },
              snapshot_at: new Date().toISOString(),
            });
          if (postMetricErr) throw postMetricErr;
        } catch (e) {
          errorsCount++;
          const msg = e instanceof Error ? e.message : 'unknown';
          await logApiCall(supabase, {
            page_id: pg.id,
            event_type: 'post_write',
            status: 'error',
            payload: { fb_post_id: post.id },
            error_message: msg,
          });
          // Continue with the next post
        }
      }

      // ----------------------------------------------------------------
      // 4. Update last_polled_at — ALWAYS runs once the profile step has
      //    succeeded, even when insights/posts steps failed above. This
      //    keeps "Last Polled" honest and cures "Never synced" pages.
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
      // 5. Dormancy classification — BIDIRECTIONAL. A page with a post
      //    inside the threshold flips (back) to 'active'; without one it
      //    is (re)marked 'dormant'. Statuses self-normalize within 1-2
      //    ticks once posts flow again.
      // ----------------------------------------------------------------
      const dormancyCutoff = new Date(
        Date.now() - dormancyThresholdDays * 24 * 60 * 60 * 1000
      ).toISOString();
      const effectiveLastPost = latestPostAt ?? pg.last_post_at;
      if (!effectiveLastPost || effectiveLastPost < dormancyCutoff) {
        pageUpdate.status = 'dormant';
        if (pg.status !== 'dormant') {
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
      } else {
        pageUpdate.status = 'active';
      }

      const { error: updateErr } = await supabase
        .from('fb_pages')
        .update(pageUpdate)
        .eq('id', pg.id);
      if (updateErr) {
        errorsCount++;
        perPageErrors.push({ id: pg.id, error: `fb_pages update: ${updateErr.message}` });
        Sentry.captureException(updateErr, {
          tags: { feature: 'facebook', event: 'pages_poller_page_failure' },
          extra: {
            fb_page_internal_id: pg.id,
            step: 'fb_pages_update',
            duration_ms: Date.now() - pgStart,
          },
        });
      }

      pagesPolled++;
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
      pages_discovered: pagesDiscovered,
      pages_seeded: pagesSeeded,
      errors_count: errorsCount,
      duration_ms: durationMs,
      errors: perPageErrors,
      discovery_errors: discoveryErrors,
    });
  } catch (e) {
    Sentry.captureException(e, {
      tags: { feature: 'facebook', event: 'pages_poller_fatal' },
    });
    return NextResponse.json(
      {
        success: false,
        pages_polled: pagesPolled,
        pages_discovered: pagesDiscovered,
        pages_seeded: pagesSeeded,
        errors_count: errorsCount + 1,
        duration_ms: Date.now() - start,
        error: e instanceof Error ? e.message : 'unknown',
        discovery_errors: discoveryErrors,
      },
      { status: 500 }
    );
  }
}
