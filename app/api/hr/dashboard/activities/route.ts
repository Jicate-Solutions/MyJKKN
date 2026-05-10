export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/dashboard/activities — recent activity feed (T3.3).
 *
 * Mirrors the scoping rules of /api/hr/dashboard:
 *   - super_admin                     → all activities (no filter)
 *   - HR Officer / Director           → entries where hr_organization_id matches
 *
 * Query params:
 *   hours_back=<int>     (default 24, max 168/7 days)
 *   limit=<int>          (default 20, max 50)
 *
 * Reads from hr_dashboard_access_log (724+ rows in production as of 2026-05-09).
 * Same `hr.dashboard.view` permission gate as the parent dashboard.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { HRDashboardService } from '@/lib/services/hr/dashboard-service';

export const GET = withAuth(async (request, auth) => {
  await connection();
  try {
    const supabase = auth.supabase;
    const userId = auth.user.id;

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin, institution_id')
      .eq('id', userId)
      .maybeSingle();
    const isSuperAdmin = !!profile?.is_super_admin;

    let hrOrgId: string | null = null;
    if (!isSuperAdmin) {
      const { data: access } = await supabase
        .from('user_hr_access')
        .select('hr_organization_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      hrOrgId = (access?.hr_organization_id as string | null) ?? null;
    }

    const url = new URL(request.url);
    const hoursBack = Math.min(
      parseInt(url.searchParams.get('hours_back') ?? '24', 10) || 24,
      168
    );
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 50);

    const payload = await HRDashboardService.getRecentActivities(supabase, {
      hoursBack,
      limit,
      hr_organization_id: hrOrgId,
      institution_id: (profile?.institution_id as string | null) ?? null,
    });

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err) {
    console.error('[hr/dashboard/activities] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}, { allowApiKey: false, requirePermission: 'hr.dashboard.view' });
