export const dynamic = 'force-dynamic';

/**
 * GET /api/social/instagram/account-health
 *
 * Returns a health summary across all ig_accounts for an institution (or all
 * institutions for super_admin). Computes active/dormant/disconnected counts
 * and last-poll-age stats without calling the Graph API — derived entirely
 * from the ig_accounts table so it's cheap and fast.
 *
 * Query params:
 *   institution_id?: string  — required for institution_admin; optional for super_admin
 *
 * Auth: super_admin OR institution_admin scoped to institution_id.
 *
 * ig_accounts table (Agent β): uses columns is_active, last_synced_at, username,
 * ig_user_id, followers_count, media_count.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

const DORMANT_THRESHOLD_DAYS = 7;   // no sync for 7+ days → dormant
const STALE_THRESHOLD_DAYS = 30;    // no sync for 30+ days → effectively disconnected

async function writeLog(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: {
    institution_id: string | null;
    endpoint: string;
    method: string;
    request_payload: Record<string, unknown>;
    response_status: number;
    response_body: Record<string, unknown>;
    error_message: string | null;
  }
) {
  await supabase.from('social_instagram_logs').insert({
    institution_id: params.institution_id,
    endpoint: params.endpoint,
    method: params.method,
    request_payload: params.request_payload,
    response_status: params.response_status,
    response_body: params.response_body,
    error_message: params.error_message,
  }).then(() => {}).catch((err: unknown) => {
    console.warn('[ig-health] Log write failed (table may not exist yet):', err);
  });
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

    if (!isSuperAdmin && !isInstitutionAdmin) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    // institution_admin must have matching institution
    if (isInstitutionAdmin && institutionId && profile?.institution_id !== institutionId) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    // Resolve effective institution scope
    const effectiveInstitutionId = isSuperAdmin
      ? institutionId  // super_admin can query any or all
      : profile?.institution_id;

    const serviceClient = createServiceRoleClient();

    let query = serviceClient
      .from('ig_accounts')
      .select('ig_user_id, username, is_active, last_synced_at, followers_count, media_count, institution_id');

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
        institution_id: institutionId,
        endpoint: '/api/social/instagram/account-health',
        method: 'GET',
        request_payload: { institution_id: institutionId },
        response_status: 200,
        response_body: { total: 0 },
        error_message: null,
      });

      return NextResponse.json({ success: true, data: empty });
    }

    const now = Date.now();
    const pollAges: number[] = [];

    const accountHealthList: AccountHealth[] = (accounts as {
      ig_user_id: string;
      username: string;
      is_active: boolean;
      last_synced_at: string | null;
      followers_count: number | null;
      media_count: number | null;
      institution_id: string;
    }[]).map((acct) => {
      let pollAgeHours: number | null = null;
      let healthStatus: AccountHealth['health_status'] = 'never_synced';

      if (acct.last_synced_at) {
        const syncedAt = new Date(acct.last_synced_at).getTime();
        pollAgeHours = (now - syncedAt) / (1000 * 60 * 60);
        pollAges.push(pollAgeHours);

        const ageDays = pollAgeHours / 24;
        if (ageDays >= STALE_THRESHOLD_DAYS) {
          healthStatus = 'disconnected';
        } else if (ageDays >= DORMANT_THRESHOLD_DAYS) {
          healthStatus = 'dormant';
        } else if (acct.is_active) {
          healthStatus = 'healthy';
        } else {
          healthStatus = 'dormant';
        }
      }

      return {
        ig_user_id: acct.ig_user_id,
        username: acct.username,
        is_active: acct.is_active,
        last_synced_at: acct.last_synced_at,
        poll_age_hours: pollAgeHours !== null ? Math.round(pollAgeHours * 10) / 10 : null,
        health_status: healthStatus,
        followers_count: acct.followers_count,
        media_count: acct.media_count,
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
      institution_id: institutionId,
      endpoint: '/api/social/instagram/account-health',
      method: 'GET',
      request_payload: { institution_id: institutionId },
      response_status: 200,
      response_body: {
        total: summary.total,
        healthy: summary.healthy,
        dormant: summary.dormant,
        disconnected: summary.disconnected,
      },
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
