export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/ig-login-insights-poll
 *
 * Full-insights poller for accounts connected via **Instagram Business
 * Login** (metrics_source='instagram_login'). These are Page-less
 * department accounts the Facebook-Login pipeline structurally cannot
 * read (#100 subcode 33) — but the per-account OAuth token from
 * ig_account_connections reads everything on graph.instagram.com:
 * reach, profile views, accounts engaged, total interactions, follower
 * demographics, plus per-post reach/saves/shares.
 *
 * Per active connection:
 *   1. /me → follower/media counters (also late-links ig_accounts by
 *      username when the callback couldn't)
 *   2. /me/insights metric_type=total_value (grouped, then per-metric
 *      fallback so one unsupported metric can't drop the rest)
 *   3. follower_demographics (age_gender + city) once per UTC day —
 *      same { age_gender, city } JSONB shape the full poller writes,
 *      so the dashboard demographics section renders both identically
 *   4. append ig_account_metrics; upsert ig_posts + append
 *      ig_post_metrics (insights for the newest few, counters for all)
 *   5. token errors (OAuthException 190) flip the connection to 'error'
 *      → departments page shows Reconnect
 *
 * Until Meta App Review approves instagram_business_manage_insights
 * (advanced access), insights return data only for accounts added as
 * app testers — the cron itself is safe to run regardless.
 *
 * Auth: Bearer CRON_SECRET (Vercel-provided in production).
 */

import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  IgLoginError,
  fetchIgMe,
  igGraphGet,
  igLoginConfigured,
} from '@/lib/instagram/login-client';

const RECENT_MEDIA_LIMIT = 25;
/** Per-media insight calls are capped to the newest N to bound call volume. */
const MEDIA_INSIGHTS_LIMIT = 10;

/** Account metrics that require metric_type=total_value (v22+). */
const TOTAL_VALUE_METRICS = [
  'reach',
  'profile_views',
  'website_clicks',
  'accounts_engaged',
  'total_interactions',
  'views',
];

const VALID_MEDIA_TYPES = new Set(['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM', 'REEL', 'STORY']);

interface InsightEntry {
  name: string;
  period?: string;
  values?: Array<{ value: number | Record<string, number>; end_time?: string }>;
  total_value?: { value?: number; breakdowns?: unknown };
}

interface InsightsEnvelope {
  data?: InsightEntry[];
}

interface MediaItem {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
}

interface ConnectionRow {
  id: string;
  ig_account_id: string | null;
  ig_user_id: string;
  username: string;
  access_token: string;
  last_polled_at: string | null;
}

function svc(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function entryValue(entry: InsightEntry | undefined): number | undefined {
  if (!entry) return undefined;
  const v = entry.total_value?.value ?? entry.values?.[entry.values.length - 1]?.value;
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object') {
    return Object.values(v).reduce((s, n) => s + (typeof n === 'number' ? n : 0), 0);
  }
  return undefined;
}

/** Grouped total_value call with per-metric fallback. */
async function fetchAccountTotals(
  token: string
): Promise<{ totals: Record<string, number>; failures: string[] }> {
  const totals: Record<string, number> = {};
  const failures: string[] = [];
  const parse = (payload: InsightsEnvelope) => {
    for (const entry of payload.data ?? []) {
      const v = entryValue(entry);
      if (typeof v === 'number') totals[entry.name] = v;
    }
  };
  try {
    parse(
      await igGraphGet<InsightsEnvelope>('/me/insights', token, {
        metric: TOTAL_VALUE_METRICS.join(','),
        period: 'day',
        metric_type: 'total_value',
      })
    );
  } catch {
    for (const metric of TOTAL_VALUE_METRICS) {
      try {
        parse(
          await igGraphGet<InsightsEnvelope>('/me/insights', token, {
            metric,
            period: 'day',
            metric_type: 'total_value',
          })
        );
      } catch (e) {
        failures.push(`${metric}: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }
  }
  return { totals, failures };
}

/** Demographics fetched at most once per UTC day (readers take latest non-null). */
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

/** Same combined { age_gender, city } shape the full poller stores. */
async function fetchFollowerDemographics(
  token: string
): Promise<Record<string, unknown> | null> {
  const combined: Record<string, unknown> = {};
  for (const { key, breakdown } of [
    { key: 'age_gender', breakdown: 'age,gender' },
    { key: 'city', breakdown: 'city' },
  ]) {
    try {
      const payload = await igGraphGet<InsightsEnvelope>('/me/insights', token, {
        metric: 'follower_demographics',
        period: 'lifetime',
        timeframe: 'this_week',
        metric_type: 'total_value',
        breakdown,
      });
      const entry = payload.data?.[0];
      if (entry) combined[key] = entry;
    } catch {
      // <100 followers (or pre-App-Review) 400s here — tolerated, stays null
    }
  }
  return Object.keys(combined).length > 0 ? combined : null;
}

function normalizeMediaType(m: MediaItem): string {
  if (m.media_product_type === 'REELS') return 'REEL';
  if (m.media_product_type === 'STORY') return 'STORY';
  if (m.media_type && VALID_MEDIA_TYPES.has(m.media_type)) return m.media_type;
  return 'IMAGE';
}

export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!igLoginConfigured()) {
    return NextResponse.json({
      success: true,
      data: { skipped: 'Instagram Login not configured' },
    });
  }

  const supabase = svc();
  const start = Date.now();
  const nowIso = new Date().toISOString();

  const { data: connRows, error: connErr } = await supabase
    .from('ig_account_connections')
    .select('id, ig_account_id, ig_user_id, username, access_token, last_polled_at')
    .eq('status', 'active')
    .gt('expires_at', nowIso);
  if (connErr) {
    return NextResponse.json({ success: false, error: connErr.message }, { status: 500 });
  }

  let polled = 0;
  let metricsWritten = 0;
  let postsWritten = 0;
  let unlinked = 0;
  let failed = 0;
  const errors: Array<{ username: string; error: string }> = [];

  for (const conn of (connRows ?? []) as ConnectionRow[]) {
    try {
      // 1. counters (+ proves the token still works)
      const me = await fetchIgMe(conn.access_token);

      // late-link: the callback may have stored the connection before an
      // ig_accounts row existed for this handle (e.g. business_discovery
      // seeds it on a later tick). ig_accounts.username is NOT unique —
      // limit(1) with deterministic order, never a single-row helper.
      let igAccountId = conn.ig_account_id;
      if (!igAccountId) {
        const { data: acctRows } = await supabase
          .from('ig_accounts')
          .select('id')
          .or(`ig_user_id.eq.${conn.ig_user_id},username.ilike.${conn.username}`)
          .order('created_at', { ascending: true })
          .limit(1);
        const acct = acctRows?.[0];
        if (acct?.id) {
          igAccountId = acct.id;
          await supabase
            .from('ig_account_connections')
            .update({ ig_account_id: acct.id, updated_at: nowIso })
            .eq('id', conn.id);
          await supabase
            .from('ig_accounts')
            .update({ metrics_source: 'instagram_login', updated_at: nowIso })
            .eq('id', acct.id);
        }
      }
      if (!igAccountId) {
        unlinked++;
        await supabase
          .from('ig_account_connections')
          .update({ last_polled_at: nowIso, updated_at: nowIso })
          .eq('id', conn.id);
        continue;
      }

      // 2. account insights
      const { totals, failures } = await fetchAccountTotals(conn.access_token);

      // 3. demographics once per UTC day
      let demographics: Record<string, unknown> | null = null;
      if (!(await hasDemographicsSnapshotToday(supabase, igAccountId))) {
        demographics = await fetchFollowerDemographics(conn.access_token);
      }

      // 4. account metrics snapshot
      const { error: amErr } = await supabase.from('ig_account_metrics').insert({
        account_id: igAccountId,
        snapshot_at: new Date().toISOString(),
        followers: me.followers_count ?? 0,
        follows: me.follows_count ?? 0,
        media_count: me.media_count ?? 0,
        reach: totals.reach ?? null,
        impressions: null, // deprecated v22+ on Instagram-Login accounts
        profile_views: totals.profile_views ?? null,
        website_clicks: totals.website_clicks ?? null,
        accounts_engaged: totals.accounts_engaged ?? null,
        total_interactions: totals.total_interactions ?? null,
        follower_demographics: demographics,
        raw: {
          source: 'instagram_login',
          totals,
          views: totals.views ?? null,
          failed_metrics: failures.length > 0 ? failures : undefined,
        },
      });
      if (amErr) throw new Error(amErr.message);
      metricsWritten++;

      // 5. recent media → ig_posts + ig_post_metrics
      let newestPostAt: string | null = null;
      try {
        const mediaPayload = await igGraphGet<{ data?: MediaItem[] }>(
          '/me/media',
          conn.access_token,
          {
            fields:
              'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count',
            limit: String(RECENT_MEDIA_LIMIT),
          }
        );
        const mediaList = mediaPayload.data ?? [];
        for (let i = 0; i < mediaList.length; i++) {
          const m = mediaList[i];
          if (!m.id || !m.timestamp) continue;
          if (!newestPostAt || m.timestamp > newestPostAt) newestPostAt = m.timestamp;

          const { data: post, error: postErr } = await supabase
            .from('ig_posts')
            .upsert(
              {
                account_id: igAccountId,
                ig_media_id: m.id,
                posted_at: m.timestamp,
                media_type: normalizeMediaType(m),
                caption: m.caption ?? null,
                permalink: m.permalink ?? null,
              },
              { onConflict: 'ig_media_id', ignoreDuplicates: false }
            )
            .select('id')
            .maybeSingle();
          if (postErr || !post?.id) continue;

          // per-media insights only for the newest few (call-volume bound)
          let postTotals: Record<string, number> = {};
          if (i < MEDIA_INSIGHTS_LIMIT) {
            try {
              const ins = await igGraphGet<InsightsEnvelope>(
                `/${m.id}/insights`,
                conn.access_token,
                { metric: 'reach,saved,shares,views' }
              );
              postTotals = Object.fromEntries(
                (ins.data ?? [])
                  .map((e) => [e.name, entryValue(e)])
                  .filter(([, v]) => typeof v === 'number')
              ) as Record<string, number>;
            } catch {
              // pre-App-Review / unsupported media — counters still land
            }
          }

          const likes = m.like_count ?? 0;
          const comments = m.comments_count ?? 0;
          const { error: pmErr } = await supabase.from('ig_post_metrics').insert({
            post_id: post.id,
            snapshot_at: new Date().toISOString(),
            reach: postTotals.reach ?? 0,
            impressions: 0,
            engagement:
              likes + comments + (postTotals.saved ?? 0) + (postTotals.shares ?? 0),
            saves: postTotals.saved ?? 0,
            shares: postTotals.shares ?? 0,
            comments,
            likes,
            plays: postTotals.views ?? null,
            raw: { source: 'instagram_login', insights: postTotals },
          });
          if (!pmErr) postsWritten++;
        }
      } catch (e) {
        errors.push({
          username: conn.username,
          error: `media: ${e instanceof Error ? e.message : 'unknown'}`,
        });
      }

      // 6. bookkeeping
      await supabase
        .from('ig_account_connections')
        .update({ last_polled_at: nowIso, last_error: null, updated_at: nowIso })
        .eq('id', conn.id);
      const acctUpdate: Record<string, unknown> = {
        last_polled_at: nowIso,
        updated_at: nowIso,
      };
      if (newestPostAt) acctUpdate.last_post_at = newestPostAt;
      await supabase.from('ig_accounts').update(acctUpdate).eq('id', igAccountId);

      polled++;
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : 'unknown';
      errors.push({ username: conn.username, error: msg });
      await supabase
        .from('ig_account_connections')
        .update({
          // 190 = token invalidated → surface Reconnect on the admin page
          ...(e instanceof IgLoginError && e.isTokenError ? { status: 'error' } : {}),
          last_error: msg.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq('id', conn.id);
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      connections: connRows?.length ?? 0,
      polled,
      account_metrics: metricsWritten,
      post_metrics: postsWritten,
      unlinked,
      failed,
      errors,
      duration_ms: Date.now() - start,
    },
  });
}
