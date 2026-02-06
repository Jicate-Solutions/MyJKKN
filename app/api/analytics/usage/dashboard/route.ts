import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { LifecycleDashboardService } from '@/lib/services/analytics/lifecycle-dashboard-service';

/**
 * GET /api/analytics/usage/dashboard
 * Returns KPIs + overview chart data for the lifecycle dashboard
 *
 * Query params:
 * - date_from: ISO date string (required)
 * - date_to: ISO date string (required)
 * - institution_id: Optional UUID filter
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const allowedRoles = ['principal', 'hod', 'admin', 'accounts'];
    if (!profile.is_super_admin && !allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: 'Forbidden - insufficient permissions' },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: 'date_from and date_to are required' },
        { status: 400 }
      );
    }

    const data = await LifecycleDashboardService.getDashboard(
      {
        date_from: dateFrom,
        date_to: dateTo,
        institution_id: searchParams.get('institution_id') || undefined,
        department_id: searchParams.get('department_id') || undefined,
      },
      user.id
    );

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[analytics/usage/dashboard] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
