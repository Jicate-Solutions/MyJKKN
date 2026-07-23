export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/analytics — cross-institution HR analytics.
 *
 * Query params:
 *   institution_id=<uuid>   (optional; super admin can omit for all)
 *   period=12m|6m|3m        (optional; default 12m)
 *
 * Permission: hr.dashboard.view (same gate as the main HR dashboard).
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { HRAnalyticsService } from '@/lib/services/hr/analytics-service';
import type { HRAnalyticsFilters } from '@/types/hr-analytics';

export const GET = withAuth(async (request, auth) => {
  await connection();
  try {
    const supabase = auth.supabase;
    const url = new URL(request.url);

    const filters: HRAnalyticsFilters = {};
    const institutionId = url.searchParams.get('institution_id');
    const period = url.searchParams.get('period');

    if (institutionId) filters.institution_id = institutionId;
    if (period === '3m' || period === '6m' || period === '12m') {
      filters.period = period;
    }

    const payload = await HRAnalyticsService.getAnalytics(supabase, filters);

    return NextResponse.json(payload);
  } catch (err: any) {
    console.error('[HR Analytics] Error:', err);
    return NextResponse.json(
      { error: err.message ?? 'Failed to load analytics' },
      { status: 500 }
    );
  }
}, { requiredPermission: 'read' });
