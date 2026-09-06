export const dynamic = 'force-dynamic';

/**
 * GET /api/social/instagram/accounts
 *
 * Lists ig_accounts with their latest metric snapshot, institution /
 * department names, and last-post timestamp — the shape the
 * /admission/social/instagram page consumes via services/instagram-service.ts
 * (IgAccountListResponse).
 *
 * This route was referenced by the 2026-05-30 IG sprint's service + hook
 * ("Depends on /api/social/instagram/accounts (Agent γ)") but never built —
 * the admin page could never list accounts. Added 2026-06-10.
 *
 * Query params (all optional): status, institution_id, account_type, search.
 *
 * Auth: any authenticated user; row visibility is enforced by the
 * ig_accounts RLS SELECT policy (institution match OR super_admin), so the
 * user-session client is used deliberately — no service-role reads here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

interface IgAccountRow {
  id: string;
  institution_id: string;
  department_id: string | null;
  ig_user_id: string;
  username: string;
  account_type: string;
  status: string;
  last_polled_at: string | null;
  connected_at: string;
  created_at: string;
  updated_at: string;
  institutions: { name: string } | null;
  departments: { department_name: string } | null;
}

/** DB status → service IgAccountStatus ('orphaned' has no UI equivalent). */
function mapStatus(dbStatus: string): string {
  return dbStatus === 'orphaned' ? 'error' : dbStatus;
}

export async function GET(request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const institutionId = searchParams.get('institution_id');
    const accountType = searchParams.get('account_type');
    const search = searchParams.get('search');

    let query = supabase
      .from('ig_accounts')
      .select(
        'id, institution_id, department_id, ig_user_id, username, account_type, status, last_polled_at, connected_at, created_at, updated_at, institutions(name), departments(department_name)'
      )
      .order('username', { ascending: true });

    if (status && status !== 'all') {
      query = query.eq('status', status === 'error' ? 'orphaned' : status);
    }
    if (institutionId) query = query.eq('institution_id', institutionId);
    if (accountType && accountType !== 'all') query = query.eq('account_type', accountType);
    if (search?.trim()) query = query.ilike('username', `%${search.trim()}%`);

    const { data: rows, error } = await query;
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const accounts = (rows ?? []) as unknown as IgAccountRow[];
    const accountIds = accounts.map((a) => a.id);

    // Latest metric snapshot per account (single batched query, newest first,
    // first-seen-wins dedupe). Best-effort — list renders without metrics.
    const latestMetrics = new Map<
      string,
      { followers: number; follows: number; media_count: number }
    >();
    // Latest post timestamp per account (same batched pattern).
    const lastPostAt = new Map<string, string>();
    // Latest monthly-audit health score per account (same batched pattern;
    // newest audit_month first, first-seen-wins). Best-effort — accounts
    // without an audit row yet fall back to 0.
    const latestHealthScore = new Map<string, number>();

    if (accountIds.length > 0) {
      const [{ data: metricRows }, { data: postRows }, { data: auditRows }] = await Promise.all([
        supabase
          .from('ig_account_metrics')
          .select('account_id, followers, follows, media_count, snapshot_at')
          .in('account_id', accountIds)
          .order('snapshot_at', { ascending: false }),
        supabase
          .from('ig_posts')
          .select('account_id, posted_at')
          .in('account_id', accountIds)
          .order('posted_at', { ascending: false }),
        supabase
          .from('ig_monthly_audit')
          .select('ig_account_id, health_score, audit_month')
          .in('ig_account_id', accountIds)
          .order('audit_month', { ascending: false }),
      ]);

      for (const m of metricRows ?? []) {
        if (!latestMetrics.has(m.account_id)) {
          latestMetrics.set(m.account_id, {
            followers: m.followers ?? 0,
            follows: m.follows ?? 0,
            media_count: m.media_count ?? 0,
          });
        }
      }
      for (const p of postRows ?? []) {
        if (!lastPostAt.has(p.account_id)) {
          lastPostAt.set(p.account_id, p.posted_at);
        }
      }
      for (const r of auditRows ?? []) {
        if (!latestHealthScore.has(r.ig_account_id)) {
          // health_score is NUMERIC(6,2) — coerce defensively to number.
          const n = Number(r.health_score);
          latestHealthScore.set(r.ig_account_id, isNaN(n) ? 0 : n);
        }
      }
    }

    const shaped = accounts.map((a) => {
      const metrics = latestMetrics.get(a.id);
      return {
        id: a.id,
        username: a.username,
        instagram_user_id: a.ig_user_id,
        institution_id: a.institution_id,
        institution_name: a.institutions?.name ?? '',
        department_id: a.department_id,
        department_name: a.departments?.department_name ?? null,
        account_type: a.account_type,
        display_name: null,
        bio: null,
        profile_picture_url: null,
        followers_count: metrics?.followers ?? 0,
        following_count: metrics?.follows ?? 0,
        media_count: metrics?.media_count ?? 0,
        // Latest ig_monthly_audit health score (computed by the monthly
        // audit cron); 0 until the first audit row lands for this account.
        health_score: latestHealthScore.get(a.id) ?? 0,
        status: mapStatus(a.status),
        last_post_at: lastPostAt.get(a.id) ?? null,
        last_polled_at: a.last_polled_at,
        is_active: a.status === 'active',
        created_at: a.created_at,
        updated_at: a.updated_at,
      };
    });

    return NextResponse.json({ accounts: shaped, total: shaped.length });
  } catch (error) {
    console.error('[ig-accounts-list] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'List failed' },
      { status: 500 }
    );
  }
}
