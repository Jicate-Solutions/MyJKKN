export const dynamic = 'force-dynamic';

/**
 * GET /api/social/instagram/accounts/[id]
 *
 * Single ig_account with metric history, recent posts (+ latest post
 * metrics), and audit-log entries — the IgAccountDetail shape the
 * /admin/social/instagram/[id] drilldown consumes via
 * services/instagram-service.ts fetchIgAccountDetail().
 *
 * Like the list route, this was referenced by the 2026-05-30 sprint's
 * service/hook but never built. Added 2026-06-10.
 *
 * Auth: any authenticated user; RLS SELECT policies scope rows
 * (institution match OR super_admin) — user-session client deliberately.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const SNAPSHOT_LIMIT = 30;
const POSTS_LIMIT = 10;
const LOGS_LIMIT = 20;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();

  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: account, error: acctErr } = await supabase
      .from('ig_accounts')
      .select(
        'id, institution_id, department_id, ig_user_id, username, account_type, status, last_polled_at, connected_at, created_at, updated_at, institutions(name), departments(department_name)'
      )
      .eq('id', id)
      .maybeSingle();

    if (acctErr) {
      return NextResponse.json({ success: false, error: acctErr.message }, { status: 500 });
    }
    if (!account) {
      // Not found OR not visible under RLS — same answer either way.
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    const [{ data: snapshots }, { data: posts }, { data: logs }, { data: auditRows }] = await Promise.all([
      supabase
        .from('ig_account_metrics')
        .select('id, account_id, snapshot_at, followers, follows, media_count')
        .eq('account_id', id)
        .order('snapshot_at', { ascending: false })
        .limit(SNAPSHOT_LIMIT),
      supabase
        .from('ig_posts')
        .select('id, account_id, ig_media_id, posted_at, media_type, caption, permalink')
        .eq('account_id', id)
        .order('posted_at', { ascending: false })
        .limit(POSTS_LIMIT),
      supabase
        .from('social_instagram_logs')
        .select('id, account_id, event_type, payload, status, error_message, occurred_at')
        .eq('account_id', id)
        .order('occurred_at', { ascending: false })
        .limit(LOGS_LIMIT),
      supabase
        .from('ig_monthly_audit')
        .select('health_score, audit_month')
        .eq('ig_account_id', id)
        .order('audit_month', { ascending: false })
        .limit(1),
    ]);

    // Latest post-metric snapshot per post (batched, newest-first dedupe).
    // Posts can have MANY snapshots since the 2026-06-11 hourly re-poll
    // feature; pre-fix snapshots carry likes NULL, so likes falls back to
    // the newest NON-NULL value when the latest snapshot lacks it.
    const postIds = (posts ?? []).map((p) => p.id);
    const latestPostMetrics = new Map<
      string,
      { reach: number; impressions: number; engagement: number; comments: number; likes: number | null }
    >();
    if (postIds.length > 0) {
      const { data: pmRows } = await supabase
        .from('ig_post_metrics')
        .select('post_id, reach, impressions, engagement, comments, likes, snapshot_at')
        .in('post_id', postIds)
        .order('snapshot_at', { ascending: false });
      for (const pm of pmRows ?? []) {
        const existing = latestPostMetrics.get(pm.post_id);
        if (!existing) {
          latestPostMetrics.set(pm.post_id, {
            reach: pm.reach ?? 0,
            impressions: pm.impressions ?? 0,
            engagement: pm.engagement ?? 0,
            comments: pm.comments ?? 0,
            likes: pm.likes ?? null,
          });
        } else if (existing.likes === null && pm.likes !== null && pm.likes !== undefined) {
          // Newest snapshot had likes NULL — backfill from the newest
          // older snapshot that recorded likes.
          existing.likes = pm.likes;
        }
      }
    }

    const latest = (snapshots ?? [])[0];

    // Latest ig_monthly_audit health score (computed by the monthly audit
    // cron); NUMERIC(6,2) — coerce defensively. 0 until first audit row.
    const auditScore = Number((auditRows ?? [])[0]?.health_score);
    const healthScore = isNaN(auditScore) ? 0 : auditScore;

    const detail = {
      id: account.id,
      username: account.username,
      instagram_user_id: account.ig_user_id,
      institution_id: account.institution_id,
      institution_name:
        (account.institutions as unknown as { name: string } | null)?.name ?? '',
      department_id: account.department_id,
      department_name:
        (account.departments as unknown as { department_name: string } | null)?.department_name ?? null,
      account_type: account.account_type,
      display_name: null,
      bio: null,
      profile_picture_url: null,
      followers_count: latest?.followers ?? 0,
      following_count: latest?.follows ?? 0,
      media_count: latest?.media_count ?? 0,
      health_score: healthScore,
      status: account.status === 'orphaned' ? 'error' : account.status,
      last_post_at: (posts ?? [])[0]?.posted_at ?? null,
      last_polled_at: account.last_polled_at,
      is_active: account.status === 'active',
      created_at: account.created_at,
      updated_at: account.updated_at,
      metric_snapshots: (snapshots ?? []).map((s) => ({
        id: s.id,
        account_id: s.account_id,
        captured_at: s.snapshot_at,
        followers_count: s.followers ?? 0,
        following_count: s.follows ?? 0,
        media_count: s.media_count ?? 0,
        reach: null,
        impressions: null,
        profile_views: null,
      })),
      recent_posts: (posts ?? []).map((p) => {
        const pm = latestPostMetrics.get(p.id);
        return {
          id: p.id,
          account_id: p.account_id,
          instagram_media_id: p.ig_media_id,
          media_type: p.media_type,
          caption: p.caption,
          media_url: null,
          permalink: p.permalink ?? '',
          like_count: pm?.likes ?? 0,
          comments_count: pm?.comments ?? 0,
          reach: pm?.reach ?? null,
          impressions: pm?.impressions ?? null,
          engagement_rate:
            pm && pm.reach > 0
              ? Math.round((pm.engagement / pm.reach) * 10000) / 100
              : null,
          published_at: p.posted_at,
        };
      }),
      audit_logs: (logs ?? []).map((l) => ({
        id: l.id,
        account_id: l.account_id,
        event_type: l.event_type,
        details: {
          status: l.status,
          error_message: l.error_message,
          ...(typeof l.payload === 'object' && l.payload !== null ? l.payload : {}),
        },
        created_at: l.occurred_at,
      })),
    };

    return NextResponse.json(detail);
  } catch (error) {
    console.error('[ig-account-detail] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Detail failed' },
      { status: 500 }
    );
  }
}
