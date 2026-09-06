export const dynamic = 'force-dynamic';

/**
 * GET /api/social/instagram/account-health
 *
 * Returns a health summary across all ig_accounts for an institution (or all
 * institutions for super_admin). Computes active/dormant/disconnected counts
 * and last-poll-age stats without calling the Graph API — derived entirely
 * from the ig_accounts table (+ latest ig_account_metrics snapshot for
 * follower/media counts) so it's cheap and fast.
 *
 * Query params:
 *   institution_id?: string  — required for institution_admin; optional for super_admin
 *
 * Auth: super_admin OR institution_admin scoped to institution_id.
 *
 * Schema note (2026-06-10 fix): ig_accounts has `status` (not `is_active`) and
 * `last_polled_at` (not `last_synced_at`); follower/media counts live in
 * ig_account_metrics snapshots, not on the account row. The response shape is
 * unchanged — `is_active` is derived from status === 'active' and
 * `last_synced_at` maps to last_polled_at.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

const DORMANT_THRESHOLD_DAYS = 7;   // no sync for 7+ days → dormant
const STALE_THRESHOLD_DAYS = 30;    // no sync for 30+ days → effectively disconnected

async function writeLog(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: {
    account_id: string | null;
    event_type: string;
    payload: Record<string, unknown>;
    status: 'success' | 'error';
    error_message: string | null;
  }
) {
  try {
    await supabase.from('social_instagram_logs').insert({
      account_id: params.account_id,
      event_type: params.event_type,
      payload: params.payload,
      status: params.status,
      error_message: params.error_message,
      occurred_at: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.warn('[ig-health] Log write failed:', err);
  }
}

interface AccountHealth {
  ig_user_id: string;
  username: string;
  is_active: boolean;
  last_synced_at: string | null;
  poll_age_hours: number | null;
  health_status: 'healthy' | 'dormant' | 'disconnected' | 'never_synced';
  followers_count: number | null;
  media_count: number | null;
  institution_id: string;
}

interface HealthSummary {
  total: number;
  healthy: number;
  dormant: number;
  disconnected: number;
  never_synced: number;
  avg_poll_age_hours: number | null;
  oldest_poll_age_hours: number | null;
  accounts: AccountHealth[];
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
    const institutionId = searchParams.get('institution_id');

    // Auth gate
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();

    const isSuperAdmin = profile?.role === 'super_admin';
    const isInstitutionAdmin = profile?.role === 'institution_admin';

    // 2026-06-11 granular-permission retrofit: roles granted
    // social.instagram.view via Role Management pass too (scoped to their
    // own institution below, same as institution_admin).
    let hasViewPerm = false;
    if (!isSuperAdmin && !isInstitutionAdmin) {
      const { data: perm } = await supabase.rpc('user_has_permission', {
        permission_name: 'social.instagram.view',
      });
      hasViewPerm = !!perm;
    }

    if (!isSuperAdmin && !isInstitutionAdmin && !hasViewPerm) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    // non-super-admins must have matching institution when one is requested
    if (!isSuperAdmin && institutionId && profile?.institution_id !== institutionId) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    // Resolve effective institution scope
    const effectiveInstitutionId = isSuperAdmin
      ? institutionId  // super_admin can query any or all
      : profile?.institution_id;

    const serviceClient = createServiceRoleClient();

    let query = serviceClient
      .from('ig_accounts')
      .select('id, ig_user_id, username, status, last_polled_at, institution_id');

    if (effectiveInstitutionId) {
      query = query.eq('institution_id', effectiveInstitutionId);
    }

    const { data: accounts, error: fetchError } = await query;

    if (fetchError) {
      console.error('[ig-health] Failed to fetch ig_accounts:', fetchError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch account data' },
        { status: 500 }
      );
    }

    if (!accounts || accounts.length === 0) {
      const empty: HealthSummary = {
        total: 0,
        healthy: 0,
        dormant: 0,
        disconnected: 0,
        never_synced: 0,
        avg_poll_age_hours: null,
        oldest_poll_age_hours: null,
        accounts: [],
      };

      await writeLog(serviceClient, {
        account_id: null,
        event_type: 'account_health',
        payload: { institution_id: institutionId, total: 0 },
        status: 'success',
        error_message: null,
      });

      return NextResponse.json({ success: true, data: empty });
    }

    type IgAccountRow = {
      id: string;
      ig_user_id: string;
      username: string;
      status: string;
      last_polled_at: string | null;
      institution_id: string;
    };
    const accountRows = accounts as IgAccountRow[];

    // Latest follower/media counts come from ig_account_metrics snapshots
    // (the account row itself carries no counts). Best-effort: a metrics
    // fetch failure must not break the health summary.
    const latestMetrics = new Map<string, { followers: number; media_count: number }>();
    const { data: metricRows, error: metricsError } = await serviceClient
      .from('ig_account_metrics')
      .select('account_id, followers, media_count, snapshot_at')
      .in('account_id', accountRows.map((a) => a.id))
      .order('snapshot_at', { ascending: false });

    if (metricsError) {
      console.warn('[ig-health] Failed to fetch ig_account_metrics (counts will be null):', metricsError);
    } else {
      for (const row of (metricRows ?? []) as {
        account_id: string;
        followers: number;
        media_count: number;
        snapshot_at: string;
      }[]) {
        if (!latestMetrics.has(row.account_id)) {
          latestMetrics.set(row.account_id, {
            followers: row.followers,
            media_count: row.media_count,
          });
        }
      }
    }

    const now = Date.now();
    const pollAges: number[] = [];

    const accountHealthList: AccountHealth[] = accountRows.map((acct) => {
      const isActive = acct.status === 'active';
      let pollAgeHours: number | null = null;
      let healthStatus: AccountHealth['health_status'] = 'never_synced';

      if (acct.last_polled_at) {
        const syncedAt = new Date(acct.last_polled_at).getTime();
        pollAgeHours = (now - syncedAt) / (1000 * 60 * 60);
        pollAges.push(pollAgeHours);

        const ageDays = pollAgeHours / 24;
        if (ageDays >= STALE_THRESHOLD_DAYS) {
          healthStatus = 'disconnected';
        } else if (ageDays >= DORMANT_THRESHOLD_DAYS) {
          healthStatus = 'dormant';
        } else if (isActive) {
          healthStatus = 'healthy';
        } else {
          healthStatus = 'dormant';
        }
      }

      const metrics = latestMetrics.get(acct.id) ?? null;

      return {
        ig_user_id: acct.ig_user_id,
        username: acct.username,
        is_active: isActive,
        last_synced_at: acct.last_polled_at,
        poll_age_hours: pollAgeHours !== null ? Math.round(pollAgeHours * 10) / 10 : null,
        health_status: healthStatus,
        followers_count: metrics ? metrics.followers : null,
        media_count: metrics ? metrics.media_count : null,
        institution_id: acct.institution_id,
      };
    });

    const summary: HealthSummary = {
      total: accountHealthList.length,
      healthy: accountHealthList.filter((a) => a.health_status === 'healthy').length,
      dormant: accountHealthList.filter((a) => a.health_status === 'dormant').length,
      disconnected: accountHealthList.filter((a) => a.health_status === 'disconnected').length,
      never_synced: accountHealthList.filter((a) => a.health_status === 'never_synced').length,
      avg_poll_age_hours:
        pollAges.length > 0
          ? Math.round((pollAges.reduce((a, b) => a + b, 0) / pollAges.length) * 10) / 10
          : null,
      oldest_poll_age_hours:
        pollAges.length > 0 ? Math.round(Math.max(...pollAges) * 10) / 10 : null,
      accounts: accountHealthList,
    };

    await writeLog(serviceClient, {
      account_id: null,
      event_type: 'account_health',
      payload: {
        institution_id: institutionId,
        total: summary.total,
        healthy: summary.healthy,
        dormant: summary.dormant,
        disconnected: summary.disconnected,
      },
      status: 'success',
      error_message: null,
    });

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    console.error('[ig-health] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Health check failed' },
      { status: 500 }
    );
  }
}
