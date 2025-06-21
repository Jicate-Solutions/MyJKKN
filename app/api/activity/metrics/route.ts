import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ActivityService } from '@/lib/services/activity-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile with role information
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Only allow administrators and super admins to view metrics
    if (!['super_admin', 'administrator'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Extract date range from query parameters
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || 'week';

    // Calculate date range based on period
    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case 'day':
        startDate.setDate(endDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(endDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 7);
    }

    // Allow custom date range
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    const dateRange = {
      from: dateFrom || startDate.toISOString(),
      to: dateTo || endDate.toISOString()
    };

    const metrics = await ActivityService.getDashboardMetrics(dateRange);

    return NextResponse.json(metrics);
  } catch (error) {
    console.error('Error fetching activity metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activity metrics' },
      { status: 500 }
    );
  }
}
