import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { StaffService } from '@/lib/services/staff/staff-service';
import { StaffDashboardFilters } from '@/types/staff';

/**
 * Helper to authenticate and get institution scoping for staff dashboard.
 * Returns the filters with institution_id applied based on user's profile.
 * Super admins bypass institution filtering.
 */
async function getAuthenticatedFilters(
  baseFilters: StaffDashboardFilters = {}
): Promise<{ filters: StaffDashboardFilters; error?: NextResponse }> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      filters: baseFilters,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, institution_id, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return {
      filters: baseFilters,
      error: NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    };
  }

  const isSuperAdmin = profile.is_super_admin || profile.role === 'super_admin';

  // Super admins see all data; others are scoped to their institution
  const filters = { ...baseFilters };
  if (!isSuperAdmin && profile.institution_id) {
    // Only override if not already set by the request
    if (!filters.institutionId) {
      filters.institutionId = profile.institution_id;
    }
  }

  return { filters };
}

export async function POST(request: NextRequest) {
  try {
    const body: StaffDashboardFilters = await request.json();
    const { filters, error } = await getAuthenticatedFilters(body);

    if (error) return error;

    const stats = await StaffService.getDashboardStats(filters);
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching staff dashboard stats:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch dashboard statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const { filters, error } = await getAuthenticatedFilters();

    if (error) return error;

    const stats = await StaffService.getDashboardStats(filters);
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching staff dashboard stats:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch dashboard statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
