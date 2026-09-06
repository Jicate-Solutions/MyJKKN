export const dynamic = 'force-dynamic';

// /api/cron/instagram-monthly-audit
// Phase 2B: Runs on day 1 of each month at 06:00 UTC (0 6 1 * *).
// For each active ig_account:
//   1. Aggregate last 30 days of ig_post_metrics + ig_account_metrics
//   2. Compute health score using ig.health_score_weights policy
//   3. Write an ig_monthly_audit row (idempotent on month + account)
//   4. Trigger dormant-account alerts if ig.alert_dormant_after_days exceeded
//
// Auth: Bearer CRON_SECRET (Vercel-provided in production).
// Logs each run outcome to social_instagram_logs.
//
// NOTE: Depends on ig_* tables (migration 20260530140000). The ig_monthly_audit
// sink table is NOT yet provisioned by any migration — until it ships, the
// per-account upsert fails and is captured by the per-account error isolation
// (logged to social_instagram_logs + Sentry); the cron itself still returns 200.

import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

const LOOKBACK_DAYS = 30;

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function firstDayOfCurrentMonthUTC(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

async function logAuditRun(
  supabase: SupabaseClient,
  args: {
    account_id: string;
    error_message?: string | null;
    duration_ms?: number;
    meta: Record<string, unknown>;
  }
): Promise<void> {
  // social_instagram_logs schema (20260530140000): account_id / event_type /
  // payload / status('success'|'error') / error_message / occurred_at(default).
  await supabase.from('social_instagram_logs').insert({
    account_id: args.account_id,
    event_type: 'monthly_audit',
    status: args.error_message ? 'error' : 'success',
    error_message: args.error_message ?? null,
    payload: { ...args.meta, duration_ms: args.duration_ms ?? null },
  });
}

// Health score weights — read from platform_policies; safe defaults provided
interface HealthWeights {
  reach_weight: number;
  engagement_weight: number;
  post_frequency_weight: number;
  follower_growth_weight: number;
}

async function getHealthScoreWeights(
  supabase: SupabaseClient
): Promise<HealthWeights> {
  const { data } = await supabase
    .from('platform_policies')
    .select('key, value')
    .in('key', [
      'ig.health_score_weights.reach',
      'ig.health_score_weights.engagement',
      'ig.health_score_weights.post_frequency',
      'ig.health_score_weights.follower_growth',
    ]);

  const map: Record<string, number> = {};
  for (const row of data ?? []) {
    const n = Number(row.value);
    if (!isNaN(n)) map[row.key as string] = n;
  }

  return {
    reach_weight: map['ig.health_score_weights.reach'] ?? 0.3,
    engagement_weight: map['ig.health_score_weights.engagement'] ?? 0.4,
    post_frequency_weight: map['ig.health_score_weights.post_frequency'] ?? 0.2,
    follower_growth_weight: map['ig.health_score_weights.follower_growth'] ?? 0.1,
  };
}

async function getAlertDormantAfterDays(
  supabase: SupabaseClient
): Promise<number> {
  const { data } = await supabase
    .from('platform_policies')
    .select('value')
    .eq('key', 'ig.alert_dormant_after_days')
    .maybeSingle();
  if (data?.value) {
    const n = Number(data.value);
    if (!isNaN(n) && n > 0) return n;
  }
  return 14;
}

interface AuditMetrics {
  total_posts: number;
  total_reach: number;
  total_impressions: number;
  total_comments: number;
  total_saves: number;
  total_shares: number;
  avg_engagement_rate: number;
  latest_follower_count: number | null;
  earliest_follower_count: number | null;
  last_post_at: string | null;
}

interface PostMetricRow {
  post_id: string;
  snapshot_at: string;
  reach: number;
  impressions: number;
  engagement: number;
  saves: number;
  shares: number;
  comments: number;
}

async function aggregateMetrics(
  supabase: SupabaseClient,
  igAccountId: string,
  cutoff: string
): Promise<AuditMetrics> {
  // Post-level metrics for the period.
  // ig_post_metrics has NO account_id column — scope via the ig_posts FK
  // (!inner + filter on the embedded table is intentional here: we WANT to
  // exclude metric rows whose post belongs to another account).
  const { data: postMetrics } = await supabase
    .from('ig_post_metrics')
    .select(
      'post_id, snapshot_at, reach, impressions, engagement, saves, shares, comments, ig_posts!inner(account_id)'
    )
    .eq('ig_posts.account_id', igAccountId)
    .gte('snapshot_at', cutoff);

  // Most recent and oldest account-level metrics for follower delta
  const { data: latestAcct } = await supabase
    .from('ig_account_metrics')
    .select('followers, snapshot_at')
    .eq('account_id', igAccountId)
    .gte('snapshot_at', cutoff)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: earliestAcct } = await supabase
    .from('ig_account_metrics')
    .select('followers')
    .eq('account_id', igAccountId)
    .gte('snapshot_at', cutoff)
    .order('snapshot_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  // Last post timestamp
  const { data: lastPost } = await supabase
    .from('ig_posts')
    .select('posted_at')
    .eq('account_id', igAccountId)
    .order('posted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // ig_post_metrics is a snapshot table (many rows per post over the period).
  // Keep only the LATEST snapshot per post so totals count each post once.
  const latestByPost = new Map<string, PostMetricRow>();
  for (const raw of (postMetrics ?? []) as unknown as PostMetricRow[]) {
    const existing = latestByPost.get(raw.post_id);
    if (!existing || raw.snapshot_at > existing.snapshot_at) {
      latestByPost.set(raw.post_id, raw);
    }
  }

  let totalReach = 0;
  let totalImpressions = 0;
  let totalComments = 0;
  let totalSaves = 0;
  let totalShares = 0;
  let totalEngagement = 0;

  for (const r of latestByPost.values()) {
    totalReach += r.reach ?? 0;
    totalImpressions += r.impressions ?? 0;
    totalComments += r.comments ?? 0;
    totalSaves += r.saves ?? 0;
    totalShares += r.shares ?? 0;
    totalEngagement += r.engagement ?? 0;
  }

  const postCount = latestByPost.size;
  const avgEngagementRate = postCount > 0 ? totalEngagement / postCount : 0;

  return {
    total_posts: postCount,
    total_reach: totalReach,
    total_impressions: totalImpressions,
    total_comments: totalComments,
    total_saves: totalSaves,
    total_shares: totalShares,
    avg_engagement_rate: avgEngagementRate,
    latest_follower_count: (latestAcct as { followers: number } | null)?.followers ?? null,
    earliest_follower_count: (earliestAcct as { followers: number } | null)?.followers ?? null,
    last_post_at: (lastPost as { posted_at: string } | null)?.posted_at ?? null,
  };
}

/**
 * Compute a 0–100 health score.
 * Each dimension is normalized to a 0–1 proxy, then weighted.
 * These thresholds are illustrative; tune via platform_policies weights.
 */
function computeHealthScore(
  metrics: AuditMetrics,
  weights: HealthWeights
): number {
  // Reach proxy: >10k reach = 1.0
  const reachScore = Math.min(metrics.total_reach / 10_000, 1.0);

  // Engagement proxy: avg rate >5% = 1.0
  const engagementScore = Math.min(metrics.avg_engagement_rate / 5, 1.0);

  // Post frequency proxy: >4 posts in 30 days = 1.0
  const postFreqScore = Math.min(metrics.total_posts / 4, 1.0);

  // Follower growth proxy: >2% growth = 1.0
  let followerGrowthScore = 0;
  if (
    metrics.earliest_follower_count != null &&
    metrics.latest_follower_count != null &&
    metrics.earliest_follower_count > 0
  ) {
    const growthPct =
      ((metrics.latest_follower_count - metrics.earliest_follower_count) /
        metrics.earliest_follower_count) *
      100;
    followerGrowthScore = Math.min(Math.max(growthPct / 2, 0), 1.0);
  }

  const rawScore =
    reachScore * weights.reach_weight +
    engagementScore * weights.engagement_weight +
    postFreqScore * weights.post_frequency_weight +
    followerGrowthScore * weights.follower_growth_weight;

  return Math.round(rawScore * 100);
}

interface AuditAccount {
  id: string;
  ig_user_id: string;
  username: string | null;
  status: string;
  last_post_at: string | null;
}

export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const supabase = getServiceClient();
  const auditMonth = firstDayOfCurrentMonthUTC();
  const cutoff = new Date(
    Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  let accountsProcessed = 0;
  let errorsCount = 0;
  const perAccountErrors: Array<{ id: string; error: string }> = [];

  try {
    const [weights, alertDormantAfterDays] = await Promise.all([
      getHealthScoreWeights(supabase),
      getAlertDormantAfterDays(supabase),
    ]);

    // Audit covers both active and dormant accounts
    const { data: accounts, error: acctErr } = await supabase
      .from('ig_accounts')
      .select('id, ig_user_id, username, status, last_post_at')
      .in('status', ['active', 'dormant']);

    if (acctErr) throw acctErr;

    const accountList: AuditAccount[] = (accounts ?? []) as AuditAccount[];

    for (const account of accountList) {
      const acctStart = Date.now();
      try {
        // 1. Aggregate metrics for the period
        const metrics = await aggregateMetrics(supabase, account.id, cutoff);

        // 2. Compute health score
        const healthScore = computeHealthScore(metrics, weights);

        // 3. Dormant alert check
        const alertCutoff = new Date(
          Date.now() - alertDormantAfterDays * 24 * 60 * 60 * 1000
        ).toISOString();
        const isDormantAlert =
          !metrics.last_post_at || metrics.last_post_at < alertCutoff;

        if (isDormantAlert) {
          Sentry.captureMessage('Instagram account dormant alert', {
            level: 'warning',
            tags: {
              feature: 'instagram',
              event: 'monthly_audit_dormant_alert',
            },
            extra: {
              ig_account_id: account.id,
              ig_user_id: account.ig_user_id,
              username: account.username,
              last_post_at: metrics.last_post_at,
              alert_dormant_after_days: alertDormantAfterDays,
              audit_month: auditMonth,
            },
          });
        }

        // 4. Write audit summary row (idempotent on audit_month + ig_account_id)
        const { error: upsertErr } = await supabase
          .from('ig_monthly_audit')
          .upsert(
            {
              audit_month: auditMonth,
              ig_account_id: account.id,
              total_posts: metrics.total_posts,
              total_reach: metrics.total_reach,
              total_impressions: metrics.total_impressions,
              total_comments: metrics.total_comments,
              total_saves: metrics.total_saves,
              total_shares: metrics.total_shares,
              avg_engagement_rate: metrics.avg_engagement_rate,
              follower_count_start: metrics.earliest_follower_count,
              follower_count_end: metrics.latest_follower_count,
              health_score: healthScore,
              is_dormant_alert: isDormantAlert,
              last_post_at: metrics.last_post_at,
              health_weights_snapshot: weights,
              created_at: new Date().toISOString(),
            },
            { onConflict: 'audit_month,ig_account_id' }
          );
        if (upsertErr) throw upsertErr;

        // Log this audit run to social_instagram_logs
        await logAuditRun(supabase, {
          account_id: account.id,
          duration_ms: Date.now() - acctStart,
          meta: {
            audit_month: auditMonth,
            health_score: healthScore,
            total_posts: metrics.total_posts,
            is_dormant_alert: isDormantAlert,
          },
        });

        accountsProcessed++;
      } catch (e) {
        errorsCount++;
        // PostgrestError is a plain object (not an Error instance) — read its
        // message too, or per-account failures all surface as 'unknown'.
        const msg =
          e instanceof Error
            ? e.message
            : e && typeof e === 'object' && 'message' in e
              ? String((e as { message: unknown }).message)
              : 'unknown';
        perAccountErrors.push({ id: account.id, error: msg });

        await logAuditRun(supabase, {
          account_id: account.id,
          error_message: msg,
          duration_ms: Date.now() - acctStart,
          meta: { audit_month: auditMonth },
        }).catch(() => {
          // best-effort; don't mask the original error
        });

        Sentry.captureException(e, {
          tags: {
            feature: 'instagram',
            event: 'monthly_audit_account_failure',
          },
          extra: {
            ig_account_id: account.id,
            audit_month: auditMonth,
          },
        });
      }
    }

    const durationMs = Date.now() - start;

    Sentry.captureMessage('Instagram monthly audit complete', {
      level: 'info',
      tags: { feature: 'instagram', event: 'monthly_audit_complete' },
      extra: {
        accounts_processed: accountsProcessed,
        accounts_total: accountList.length,
        errors_count: errorsCount,
        audit_month: auditMonth,
        duration_ms: durationMs,
      },
    });

    return NextResponse.json({
      success: true,
      accounts_polled: accountsProcessed,
      errors_count: errorsCount,
      duration_ms: durationMs,
      audit_month: auditMonth,
      errors: perAccountErrors,
    });
  } catch (e) {
    Sentry.captureException(e, {
      tags: { feature: 'instagram', event: 'monthly_audit_fatal' },
      extra: { audit_month: auditMonth },
    });
    return NextResponse.json(
      {
        success: false,
        accounts_polled: accountsProcessed,
        errors_count: errorsCount + 1,
        duration_ms: Date.now() - start,
        audit_month: auditMonth,
        error: e instanceof Error ? e.message : 'unknown',
      },
      { status: 500 }
    );
  }
}
