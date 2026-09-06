export const dynamic = 'force-dynamic';

/**
 * GET /api/social/facebook/page-health
 *
 * Returns a health summary across all fb_pages for an institution (or all
 * institutions for super_admin). Computes active/dormant/disconnected counts
 * and last-poll-age stats without calling the Graph API — derived entirely
 * from the fb_pages table so it's cheap and fast.
 *
 * Query params:
 *   institution_id?: string  — required for institution_admin; optional for super_admin
 *
 * Auth: super_admin OR institution_admin scoped to institution_id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

const DORMANT_THRESHOLD_DAYS = 7;   // no sync for 7+ days → dormant
const STALE_THRESHOLD_DAYS = 30;    // no sync for 30+ days → effectively disconnected

async function writeLog(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: {
    page_id: string | null;
    event_type: string;
    status: 'success' | 'error';
    payload: Record<string, unknown>;
    error_message: string | null;
  }
) {
  // Best-effort log write — never let a logging failure break the response.
  // (PostgrestBuilder is a PromiseLike without .catch; await in try/catch.)
  try {
    const { error } = await supabase.from('social_facebook_logs').insert({
      page_id: params.page_id,
      event_type: params.event_type,
      status: params.status,
      payload: params.payload,
      error_message: params.error_message,
    });
    if (error) console.warn('[fb-health] Log write failed:', error.message);
  } catch (err) {
    console.warn('[fb-health] Log write failed:', err);
  }
}

interface PageHealth {
  /** Internal fb_pages.id (UUID) — lets consumers cross-link to fb_posts /
   *  fb_page_metrics / social_facebook_logs rows, which key on this UUID
   *  rather than the Meta-side fb_page_id. */
  id: string;
  fb_page_id: string;
  name: string;
  status: string;
  last_polled_at: string | null;
  last_post_at: string | null;
  poll_age_hours: number | null;
  health_status: 'healthy' | 'dormant' | 'disconnected' | 'never_synced';
  fan_count: number | null;
  followers_count: number | null;
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
  pages: PageHealth[];
}

export async function GET(request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

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
    // social.facebook.view via Role Management pass too (scoped to their
    // own institution below, same as institution_admin).
    let hasViewPerm = false;
    if (!isSuperAdmin && !isInstitutionAdmin) {
      const { data: perm } = await supabase.rpc('user_has_permission', {
        permission_name: 'social.facebook.view',
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
      ? institutionId // super_admin can query any or all
      : profile?.institution_id;

    const serviceClient = createServiceRoleClient();

    let query = serviceClient
      .from('fb_pages')
      .select(
        'id, fb_page_id, name, status, last_polled_at, last_post_at, fan_count, followers_count, institution_id'
      );

    if (effectiveInstitutionId) {
      query = query.eq('institution_id', effectiveInstitutionId);
    }

    const { data: pages, error: fetchError } = await query;

    if (fetchError) {
      console.error('[fb-health] Failed to fetch fb_pages:', fetchError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch page data' },
        { status: 500 }
      );
    }

    if (!pages || pages.length === 0) {
      const empty: HealthSummary = {
        total: 0,
        healthy: 0,
        dormant: 0,
        disconnected: 0,
        never_synced: 0,
        avg_poll_age_hours: null,
        oldest_poll_age_hours: null,
        pages: [],
      };

      await writeLog(serviceClient, {
        page_id: null,
        event_type: 'health',
        status: 'success',
        payload: { institution_id: institutionId, total: 0 },
        error_message: null,
      });

      return NextResponse.json({ success: true, data: empty });
    }

    const now = Date.now();
    const pollAges: number[] = [];

    const pageHealthList: PageHealth[] = (
      pages as Array<{
        id: string;
        fb_page_id: string;
        name: string;
        status: string;
        last_polled_at: string | null;
        last_post_at: string | null;
        fan_count: number | null;
        followers_count: number | null;
        institution_id: string;
      }>
    ).map((pg) => {
      let pollAgeHours: number | null = null;
      let healthStatus: PageHealth['health_status'] = 'never_synced';

      if (pg.last_polled_at) {
        const syncedAt = new Date(pg.last_polled_at).getTime();
        pollAgeHours = (now - syncedAt) / (1000 * 60 * 60);
        pollAges.push(pollAgeHours);

        const ageDays = pollAgeHours / 24;
        if (ageDays >= STALE_THRESHOLD_DAYS) {
          healthStatus = 'disconnected';
        } else if (ageDays >= DORMANT_THRESHOLD_DAYS) {
          healthStatus = 'dormant';
        } else if (pg.status === 'active') {
          healthStatus = 'healthy';
        } else {
          healthStatus = 'dormant';
        }
      }

      return {
        id: pg.id,
        fb_page_id: pg.fb_page_id,
        name: pg.name,
        status: pg.status,
        last_polled_at: pg.last_polled_at,
        last_post_at: pg.last_post_at,
        poll_age_hours: pollAgeHours !== null ? Math.round(pollAgeHours * 10) / 10 : null,
        health_status: healthStatus,
        fan_count: pg.fan_count,
        followers_count: pg.followers_count,
        institution_id: pg.institution_id,
      };
    });

    const summary: HealthSummary = {
      total: pageHealthList.length,
      healthy: pageHealthList.filter((a) => a.health_status === 'healthy').length,
      dormant: pageHealthList.filter((a) => a.health_status === 'dormant').length,
      disconnected: pageHealthList.filter((a) => a.health_status === 'disconnected').length,
      never_synced: pageHealthList.filter((a) => a.health_status === 'never_synced').length,
      avg_poll_age_hours:
        pollAges.length > 0
          ? Math.round((pollAges.reduce((a, b) => a + b, 0) / pollAges.length) * 10) / 10
          : null,
      oldest_poll_age_hours:
        pollAges.length > 0 ? Math.round(Math.max(...pollAges) * 10) / 10 : null,
      pages: pageHealthList,
    };

    await writeLog(serviceClient, {
      page_id: null,
      event_type: 'health',
      status: 'success',
      payload: {
        institution_id: institutionId,
        total: summary.total,
        healthy: summary.healthy,
        dormant: summary.dormant,
        disconnected: summary.disconnected,
      },
      error_message: null,
    });

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    console.error('[fb-health] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Health check failed',
      },
      { status: 500 }
    );
  }
}
