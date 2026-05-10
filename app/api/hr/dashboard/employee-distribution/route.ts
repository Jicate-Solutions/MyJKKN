export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/dashboard/employee-distribution — donut chart data (T3.5).
 *
 * Aggregates active staff grouped by employment_categories.category_name.
 * Top 5 categories rendered as discrete slices; remainder rolled into 'Others'.
 *
 * Scope:
 *   - super_admin → all institutions
 *   - others      → restricted to their profiles.institution_id
 *
 * Same `hr.dashboard.view` permission gate as the parent dashboard.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { HRDashboardService } from '@/lib/services/hr/dashboard-service';

export const GET = withAuth(async (_request, auth) => {
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
    const institutionId = isSuperAdmin
      ? null
      : (profile?.institution_id as string | null) ?? null;

    const payload = await HRDashboardService.getEmployeeDistribution(supabase, {
      institution_id: institutionId,
    });

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err) {
    console.error('[hr/dashboard/employee-distribution] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}, { allowApiKey: false, requirePermission: 'hr.dashboard.view' });
