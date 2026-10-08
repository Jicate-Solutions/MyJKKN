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
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { fetchLatestPostMetrics } from '@/lib/services/social/ig-post-lookup';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
        'id, institution_id, department_id, ig_user_id, username, account_type, status, last_polled_at, connected_at, connected_by, created_at, updated_at, institutions(name), departments(department_name)'
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
    // Read per post: one .in() read over ~627 snapshots a post overflows the
    // 1,000-row cap and silently drops posts.
    if (postIds.length > 0) {
      const { latest } = await fetchLatestPostMetrics<{
        post_id: string;
        reach: number | null;
        impressions: number | null;
        engagement: number | null;
        comments: number | null;
        likes: number | null;
      }>(supabase, postIds, 'post_id, reach, impressions, engagement, comments, likes, snapshot_at');
      for (const pm of latest.values()) {
        latestPostMetrics.set(pm.post_id, {
          reach: pm.reach ?? 0,
          impressions: pm.impressions ?? 0,
          engagement: pm.engagement ?? 0,
          comments: pm.comments ?? 0,
          likes: pm.likes ?? null,
        });
      }
      // Newest snapshot had likes NULL — backfill from the newest older
      // snapshot that recorded likes (one more single-row read per such post).
      const missingLikes = [...latestPostMetrics.entries()].filter(([, m]) => m.likes === null);
      await Promise.all(
        missingLikes.map(async ([postId, m]) => {
          const { data } = await supabase
            .from('ig_post_metrics')
            .select('likes')
            .eq('post_id', postId)
            .not('likes', 'is', null)
            .order('snapshot_at', { ascending: false, nullsFirst: false })
            .limit(1);
          const likes = (data ?? [])[0]?.likes;
          if (likes !== null && likes !== undefined) m.likes = likes;
        })
      );
    }

    const latest = (snapshots ?? [])[0];

    // Name of the team member who runs this account (best-effort).
    let runnerName: string | null = null;
    if (account.connected_by) {
      const { data: runner } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', account.connected_by)
        .maybeSingle();
      runnerName = runner ? runner.full_name || runner.email || null : null;
    }

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
      connected_by: account.connected_by,
      connected_by_name: runnerName,
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

/**
 * Can this team member work for this institution? Mirrors
 * role_has_institution_access() — which only answers for auth.uid(), so it
 * cannot vouch for the person being NAMED — by reading the same sources for
 * the named profile: own institution, super admin, a role with Institution
 * Scope 'all' (multi-role or the legacy profiles.role), or an active
 * user_institution_access grant.
 */
async function personCanWorkFor(
  svc: ReturnType<typeof createServiceRoleClient>,
  person: { id: string; institution_id: string | null; is_super_admin: boolean | null; role: string | null },
  institutionId: string | null
): Promise<boolean | null> {
  // null = a lookup failed; the caller answers 500, never a misleading refusal.
  if (!institutionId) return true; // account tied to no institution
  if (person.institution_id === institutionId) return true;
  if (person.is_super_admin) return true;

  const [roleRes, legacyRes, grantRes] = await Promise.all([
    svc
      .from('user_roles')
      .select('role_id, custom_roles!inner(institution_scope)')
      .eq('user_id', person.id)
      .eq('custom_roles.institution_scope', 'all')
      .limit(1),
    person.role
      ? svc
          .from('custom_roles')
          .select('id')
          .eq('role_key', person.role)
          .eq('institution_scope', 'all')
          .limit(1)
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
    svc
      .from('user_institution_access')
      .select('id')
      .eq('user_id', person.id)
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .limit(1),
  ]);

  if (roleRes.error || legacyRes.error || grantRes.error) return null;
  return (
    (roleRes.data ?? []).length > 0 || (legacyRes.data ?? []).length > 0 || (grantRes.data ?? []).length > 0
  );
}

/**
 * PATCH /api/social/instagram/accounts/[id]
 *
 * Names (or clears) the team member who RUNS this Instagram account — the
 * person who posts a learner's work from it and invites the learner as
 * collaborator (Director's ruling 2026-10-07). Stored in the existing
 * ig_accounts.connected_by column, which lib/instagram/silence-detect.ts
 * already treats as "the person responsible for this account" when it
 * raises a went-silent alert. Nothing else writes that column: the sync
 * upsert, the Instagram-login connect callback and the discovery crons all
 * leave it alone, so a name set here is not overwritten.
 *
 * Body: { connected_by: <profiles.id> | null }   (null = nobody named)
 *
 * Auth: social.instagram.manage (the same key the discover / sync routes use)
 * AND access to the account's institution. ig_accounts has no UPDATE policy
 * for signed-in users, so the write goes through the service-role client —
 * strictly after both checks pass.
 */
export async function PATCH(
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

    // 1. Manage permission. A check that could not run is a 500, never a
    //    misleading "not allowed".
    const { data: canManage, error: permErr } = await supabase.rpc('user_has_permission', {
      permission_name: 'social.instagram.manage',
    });
    if (permErr) {
      return NextResponse.json(
        { success: false, error: `Permission check failed: ${permErr.message}` },
        { status: 500 }
      );
    }
    if (!canManage) {
      return NextResponse.json(
        {
          success: false,
          error:
            'You need the "Manage Instagram Accounts" permission to name who runs an account. Ask an administrator.',
        },
        { status: 403 }
      );
    }

    // 2. Body.
    const body = (await request.json().catch(() => null)) as { connected_by?: unknown } | null;
    if (!body || typeof body !== 'object' || !('connected_by' in body)) {
      return NextResponse.json(
        { success: false, error: 'connected_by is required (a team member id, or null to clear)' },
        { status: 400 }
      );
    }
    const personId = body.connected_by;
    if (personId !== null && (typeof personId !== 'string' || !UUID_RE.test(personId))) {
      return NextResponse.json(
        { success: false, error: 'connected_by must be a team member id or null' },
        { status: 400 }
      );
    }

    // The same answer for "no such account" and "not an account you can
    // manage", so a caller cannot probe which account ids exist elsewhere.
    const notYours = () =>
      NextResponse.json(
        { success: false, error: "Account not found, or it belongs to an institution you can't manage." },
        { status: 404 }
      );
    if (!UUID_RE.test(id)) return notYours();

    const svc = createServiceRoleClient();

    // 3. The account, and the caller's access to its institution.
    const { data: account, error: acctErr } = await svc
      .from('ig_accounts')
      .select('id, institution_id')
      .eq('id', id)
      .maybeSingle();
    if (acctErr) {
      return NextResponse.json({ success: false, error: acctErr.message }, { status: 500 });
    }
    if (!account) return notYours();

    if (account.institution_id) {
      const { data: hasAccess, error: scopeErr } = await supabase.rpc('role_has_institution_access', {
        check_institution_id: account.institution_id,
      });
      if (scopeErr) {
        return NextResponse.json(
          { success: false, error: `Institution check failed: ${scopeErr.message}` },
          { status: 500 }
        );
      }
      if (!hasAccess) return notYours();
    }

    // 4. The person being named: must exist, be a team member (not a
    //    learner), be active, and be able to work for this institution.
    let runnerName: string | null = null;
    if (personId !== null) {
      const { data: person, error: personErr } = await svc
        .from('profiles')
        .select('id, full_name, email, learner_id, institution_id, is_active, is_super_admin, role')
        .eq('id', personId)
        .maybeSingle();
      if (personErr) {
        return NextResponse.json({ success: false, error: personErr.message }, { status: 500 });
      }
      if (!person) {
        return NextResponse.json(
          { success: false, error: 'No team member found with that id' },
          { status: 400 }
        );
      }
      if (person.learner_id) {
        return NextResponse.json(
          { success: false, error: 'A learner cannot run an institution account. Pick a team member.' },
          { status: 400 }
        );
      }
      if (person.is_active === false) {
        return NextResponse.json(
          { success: false, error: 'That team member is no longer active. Pick someone else.' },
          { status: 400 }
        );
      }
      const canWork = await personCanWorkFor(svc, person, account.institution_id);
      if (canWork === null) {
        return NextResponse.json(
          { success: false, error: "Could not check that team member's institution access just now. Try again." },
          { status: 500 }
        );
      }
      if (!canWork) {
        return NextResponse.json(
          {
            success: false,
            error: "That team member doesn't belong to, or have access to, this account's institution.",
          },
          { status: 400 }
        );
      }
      runnerName = person.full_name || person.email || null;
    }

    // 5. Write.
    const { data: updated, error: updErr } = await svc
      .from('ig_accounts')
      .update({ connected_by: personId, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, connected_by')
      .maybeSingle();
    if (updErr) {
      return NextResponse.json({ success: false, error: updErr.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: { id: updated.id, connected_by: updated.connected_by, connected_by_name: runnerName },
    });
  } catch (error) {
    console.error('[ig-account-runner] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 }
    );
  }
}
